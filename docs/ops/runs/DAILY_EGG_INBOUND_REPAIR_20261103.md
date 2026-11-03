# 日产蛋日报重复入库 —— 生产修复执行记录（2026-11-03）

执行人通道：GitHub Actions 受控工作流（全部 run 可审计）。

## 执行链

| 步骤 | Workflow / Run | 结果 |
|---|---|---|
| 背景对账 inspect | `production-background-reconciliation` #41577318846 | `INSPECTED`：滞留 `FENCED`，owner=`41554413680-1`，gen=10，target=`85ab429a1`，holdReason=`DEPLOY_SESSION_FAILED`，floor=`13e3858b7` == 运行 API revision，无在途 transaction |
| 背景对账 reconcile | 同上 #41577458614 | `CLEARED`（先落盘完整 record+manifest 证据再删除） |
| 修复 preflight | `daily-egg-inbound-repair` #41577633316 | `REPAIR_ELIGIBLE`，9 组候选（CSJS-001 ×3、HOUSE_MS_01 ×6，全部 COMP-LAO-AGRI，2026-10-08） |
| 修复 apply（第一次） | #41577750467 | `varchar(32)` 溢出 → 事务回滚，**零写入**（fail-stop 生效） |
| 修复 apply（修正后） | #41578117767 | `UPDATE 10 / INSERT 0 10 / COMMIT` |
| 修复 verify | #41578231972 | `VERIFY=GO` |

## 修复前后统计（生产 phoenix_erp）

| 指标 | 修复前 | 修复后 |
|---|---|---|
| TEMP_PRODUCTION 重复来源组 | 9（19 批） | **0** |
| 超日报分级入库组 | 9 | **0** |
| 退役批次（保留行，qty=0 + 标记） | 0 | 10（10× `TEMP_PRODUCTION_REVERSAL` 冲销流水，ref_no 保留原 source_no） |
| 未触及批次 ledger↔batch 平衡差异 | 0 | 0 |
| 历史 `FARM_IN` 日报流水行 | 54（1,650,405 枚） | 54（与 TEMP_PRODUCTION 同舍同日重叠 = 0，仅追溯保留） |
| TEMP_PRODUCTION 批次总数 | 349 | 349（行保留，其中 10 行 qty 归零） |

## 保留 / 归零规则

- 每组保留 `created_at` 最新行；实测保留行数量与当日日报分级完全一致（两舍 9 档逐一吻合）。
- 旧行 `qty=qty_available=0`、`source_no=NULL`、`legacy_source='DAILY_EGG_DUPLICATE_RETIRED'`（27 字符，适配 varchar(32)），不删除任何行。
- 冲销流水 `TEMP_PRODUCTION_REVERSAL` 以 `(batch_no, change_type)` 幂等去重；原始 `TEMP_PRODUCTION_INBOUND` 流水保留。
- 前置断言：被退役行必须 unconsumed（`qty_available=qty`）、`AVAILABLE`、`HOUSE-%` 引用、legacy_source 为空（或已是本标记）；保留行不得超日报；否则整事务中止。
- 重跑语义：无重复且已有退役标记 → 显式 no-op；无重复且无标记 → `DAILY_EGG_REPAIR_NO_DUPLICATES` 拒绝。

## 部署与迁移

- 迁移 `1792000000000-EnforceTempProductionSourceIdentity` 随 full 部署执行，建出
  `uq_inv_batches_temp_production_source_identity` 部分唯一索引（重复存在时迁移主动停止，已由修复解除）。
- 部署记录见下节（部署 run 与部署后核验数字）。

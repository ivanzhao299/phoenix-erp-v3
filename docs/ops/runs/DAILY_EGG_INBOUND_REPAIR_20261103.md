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

## 部署闭环实录（同日 04:13–09:26 UTC）

按序执行，每步失败都定位到具体根因后修复再前进，未盲目重跑：

1. **背景对账 inspect/reconcile**（#41577318846 / #41577458614）：清除滞留 FENCED（owner=41554413680-1）。
2. **修复 preflight/apply/verify**（#41577633316 / #41578117767 / #41578231972）：apply 首次被 varchar(32) 溢出回滚（零写入），修正标记后 UPDATE 10 / INSERT 0 10 / COMMIT，verify=GO。
3. **full 部署尝试**（#41578346166）：死于 FLOOR_CONTRACT_CHANGED —— floor(13e3858b7)→target 有 7 个 criticalFiles 差异，必须走 api-only floor 重锚定协议。
4. **重锚定 #1**（#41579888764）：死于 PARTICIPANT_FENCE_NOT_OBSERVED —— 清除记录使 fence 代数归 1，容器内存水位=10 拒绝 REPLAY。→ 实现 revive-participant（受控重启 API，水位归零）+ 高水位持久化。
5. **重锚定 #2**（#41582834413）：fence 通过，死于 `guardProduction is not defined`（promote 漏 import，10/31 以来所有重锚定的真凶）。→ 修复 + contract test。
6. **重锚定 #3**（#41593610259）：promotion PREPARED_HOLD 后 body 死于 ADMISSION_SCHEMA_RECEIPT_REQUIRED（deployment-state 仍用 admission-only 回执规则）。→ 回执泛化 + 受控迁移应用工作流；用 abort-prepared-promotion 还原 floor。
7. **受控迁移应用**（#41590377899 inspect / #41590587941 apply）：`deploy-schema-first.sh` 一次性容器应用 1792000000000（索引建成、migrations 记录），回执登记 COMMITTED（#41593253786）。
8. **重锚定 #4**（#41595462900）：body 全部成功（API 已切 ac9481e88），仅 OPEN 死于 DEPLOY_SUCCESS_BINDING（verifier 仍要求空 migrationPaths）。→ verifier 接受带回执迁移；complete-background-open 补发 OPEN。
9. **重锚定 #5**（#41601516361）：**全程自走 BACKGROUND_DEPLOYMENT=SUCCESS**（floor→ae2523d2c）。
10. **full 部署**（#41603777102）：死于 compose 包装对 up api 的 fence 证明要求（full 模式从不 fence —— 背景控制上线后的设计断层），回滚同因失败，遗留死事务。→ rollback-dead-transaction 显式闭账（证明 runtime 未动）。
11. **web 部署**（#41608876230）：**SUCCESS**（web→b861c9d14）。
12. **终验**：API=ae2523d2c(floor) healthy、Web=b861c9d14 healthy、readiness OK、审计 VERIFY=GO。

遗留（见交付报告）：full 模式 up-api 的 fence 语义断层的正式设计；API 镜像落后 main 数个纯脚本提交（下个 floor 周期收敛）。

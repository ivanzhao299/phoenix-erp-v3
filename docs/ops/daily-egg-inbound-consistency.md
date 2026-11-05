# 日产蛋日报与库存入库一致性闭环

## 权威链路

`brd_daily_logs` 保存日报事实和 `eggs_by_grade` 分级明细；库存只由
`ProductionInboundService` 生成 `TEMP_PRODUCTION` 批次和
`TEMP_PRODUCTION_INBOUND` 流水。日报服务在存在有效分级时不再写旧的 `FARM_IN`。

日报页与日产蛋入库页共享同一个 `DAILY-<date>-<house>-<hash>` 幂等键。接口在同一事务内：

1. 锁定幂等来源并检查已有批次；
2. 从日报分级汇总计算可入库额度；
3. 扣除已入库批次，拒绝超过剩余额度的请求；
4. 合并同一日报中跨班次的同档位数量；
5. 写入批次和流水。

数据库迁移 `1792000000000-EnforceTempProductionSourceIdentity` 通过部分唯一索引再次保护
`TEMP_PRODUCTION` 来源身份。迁移遇到历史重复来源会主动停止，不会自动删除业务库存。

## 上线前审计

```bash
node scripts/ops/audit-daily-egg-inbound.mjs \
  --output-dir docs/ops/runs \
  --report docs/ops/runs/DAILY_EGG_INBOUND_AUDIT.md
```

审计只读，检查：

- `TEMP_PRODUCTION` 重复来源组；
- 入库数量超过日报分级额度的组；
- 历史日报 `FARM_IN` 行和数量。

出现 `HOLD` 时先保存审计 JSON，逐组确认来源和批次，再使用单独审批的历史数据修复脚本；
不得为了让唯一索引通过而直接删除或合并库存批次。

## 生产发布边界

日报业务修复和生产部署恢复必须分开验收。生产 runtime pin 对账脚本现在输出有限的
`RUNTIME_PIN_STAGE` 和带阶段的 HOLD 原因，只用于定位 `verifyContext`、状态绑定、运行时读取、
原子写入或写后守护中的具体阻断；它不绕过 `mutation.lock`、配置 floor 或 evidence 门禁。

## 受控修复与发布顺序（2026-11-03 收口）

修复迁移 `1792000000000-EnforceTempProductionSourceIdentity` 会在存在重复来源时主动
停止，因此生产必须先修复历史数据、再跑带迁移的部署。固定顺序：

1. **背景对账 inspect**（只读）：`Production Background Control Reconciliation`
   workflow，phase=`inspect`。若部署被 `BACKGROUND_HOLD=UNFINISHED_BACKGROUND
   _TRANSACTION` 卡住，先用它确认滞留记录的 phase/owner/target 与运行时 pin。
2. **背景对账 reconcile**（受控清除）：同一 workflow，phase=`reconcile` + 口令。
   只清除"已断定的滞留 FENCED/CODE_HOLD"（或从未发布公投影的 PUBLISHING_FENCE），
   目标等于现行 floor、运行时漂移、或有部署事务在途时一律 HOLD。
3. **修复 preflight**（只读）：`Daily Egg Inbound Duplicate Repair` workflow，
   phase=`preflight`。列出拟退役组；台账不平衡时拒绝。
4. **修复 apply**：phase=`apply`。执行 `scripts/ops/repair-daily-egg-inbound-duplicates.sql`
   （单事务、前置断言、保留原始行、冲销流水幂等、可重跑为 no-op）。
5. **修复 verify**（只读）：phase=`verify`。审计必须 `GO`（重复 0、超日报 0、生产
   台账平衡 0 差异）。历史 `FARM_IN` 行数仅作追溯统计，不阻断。
6. **full 部署**：`CI/CD — Build & Deploy`（手动批准，auto→full，含迁移）。
   迁移此时可成功建出 `uq_inv_batches_temp_production_source_identity`。
7. **部署后复核**：API/Web 容器 revision == main HEAD、健康检查、迁移表末条 ==
   `EnforceTempProductionSourceIdentity1792000000000`、审计保持 `GO`。

修复保留规则：每组保留 `created_at` 最新行（与日报分级一致的那条），旧行 `qty/qty_available`
归零、`source_no` 置空、`legacy_source` 标记 `DAILY_EGG_DUPLICATE_RETIRED`，并写
`TEMP_PRODUCTION_REVERSAL` 冲销流水 —— 行与流水都保留，可完整追溯。被消耗
（`qty_available <> qty`）、非 AVAILABLE、或保留行仍超日报的组一律中止不修。

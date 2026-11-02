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

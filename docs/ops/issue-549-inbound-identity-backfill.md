# Issue 549 入库明细身份治理

基线：`origin/main@778a2ba63e72bd906f922bad2aa3ec11e007e8fb`

## 迁移

`1794800000000-AddWmsInboundItemIdentity.ts` 只做 additive schema 变更，为 `wms_inbound_items` 增加：

- `item_type`
- `material_code`
- `sku_code`
- `material_type`
- `unit`
- `identity_snapshot`

迁移不回填业务数据、不添加会阻塞历史行的 `NOT NULL` 或 CHECK，包含可执行的 `down()`。

## 回填脚本

`scripts/ops/issue549-inbound-identity-backfill.mjs` 默认只读 dry-run：

```bash
node scripts/ops/issue549-inbound-identity-backfill.mjs \\
  --report /tmp/issue549-inbound-identity-report.json
```

脚本只使用 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` 连接数据库，不打印密码。它会：

- 唯一匹配 ACTIVE MATERIAL/SKU 时生成 canonical identity；
- 对同码、缺失、停用、字段冲突记录审计状态；
- 不修改 `product_code`；
- dry-run 不执行写入。

确认 dry-run 报告后才允许 apply：

```bash
ISSUE549_BACKFILL_CONFIRM=YES \\
node scripts/ops/issue549-inbound-identity-backfill.mjs \\
  --apply --report /tmp/issue549-inbound-identity-apply.json
```

`--apply` 使用单事务；失败时回滚。生产环境执行前必须走受控数据库变更流程，并保留 dry-run 报告、apply 报告和迁移 receipt。

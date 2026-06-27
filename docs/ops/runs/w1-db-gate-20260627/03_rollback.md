# W1 DB Gate · 回滚程序

触发条件：02_verify 任一绿灯不达标，或部署后 5 主体冒烟出现"该看的看不到/接口大面积 403"。

## 路径 1（首选）— TypeORM down()
```bash
# 逐条 revert（LIFO，先退 1782052418112 再退 1782047418112）
docker compose exec -T api ./node_modules/.bin/typeorm migration:revert -d dist/database/data-source.js
docker compose exec -T api ./node_modules/.bin/typeorm migration:revert -d dist/database/data-source.js
```
两条迁移均实现了 down()（g195-P5 CI 门禁保证）。revert 后用 00_preflight 复核回到基线。

## 路径 2（兜底）— 从备份恢复两表
```bash
# 用 01 步备份的 rbac_tables_before.sql 恢复
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "TRUNCATE sys_role_menu_permission;"   # 仅在确认备份完整时
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < /opt/phoenix-erp-backups/w1-db-gate-<TS>/rbac_tables_before.sql
```
> ⚠️ TRUNCATE+restore 风险高于 down()；仅当 down() 失败时用，且须先确认备份行数与基线一致。

## 路径 3（最坏）— 全库 dump 恢复
用 `full_<TS>.dump`（pg_restore），影响面最大，需停机窗口。

## 回滚后
- 通知受影响用户重登（perms_version 变化）。
- 在 `docs/ops/runtime-memory/DECISION_LOG.md` 记录回滚原因与证据路径。

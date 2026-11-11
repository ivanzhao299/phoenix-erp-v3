# 生产管理免疫与用药 MVP 阶段 F 发布报告

日期：2026-11-11

范围：部署准备、迁移演练、发布验证、回滚方案和 UAT 操作步骤。候选已通过 PR #531 合并到 `main`（merge commit `b2c08a9cc74ad9444390bdad77c63d80d424b953`），未连接生产数据库，未执行生产迁移、生产写入或正式切流。

## 结论

**正式发布：NO-GO。** 先完成 disposable PostgreSQL migration up/down 演练，并处理历史 `brd_medication_issue_lines.medication_record_id` 为空的记录。当前迁移在已有非空旧 issue-lines 表时会直接 `SET NOT NULL`，没有回填该列，可能在部署中途失败。合并后的 CI/CD push run `43052207701` 在 `Install system tools (psql + jq)` 处失败，部署 job 被跳过。

冻结边界和安全回归门禁在当前工作区失败。失败来自 A-E 及其他并行改动命中冻结路径和动态 DDL 检查，需由发布审查人确认后以受控的 `ALLOW_FREEZE_TOUCH=true`、`ALLOW_SECURITY_TOUCH=true` 重跑。

## 已执行验证

| 检查 | 结果 | 证据 |
|---|---|---|
| API TypeScript | PASS | `pnpm typecheck:api`，退出码 0 |
| Web TypeScript | PASS | `pnpm typecheck:web`，退出码 0 |
| API 关键 Jest | PASS | 免疫、用药、药品服务测试通过，3 suites / 20 tests；修复模块注册后追加 2 suites / 14 tests 通过 |
| Web Vitest | PASS | 全套 115 files / 644 tests，含生产管理合同测试 |
| nullable unique | PASS | 0 违规，1 白名单项 |
| constraint drift | PASS | 0 new drift |
| migration down 静态门禁 | PASS | 89 条迁移全部含 `down()` |
| migration data-DML 门禁 | PASS | 89 条通过，生产管理迁移使用文件级豁免说明 |
| W5 closeout | BLOCKED | freeze boundary、security regression 各失败 1 项 |
| 本地 migration up/down | BLOCKED | `scripts/local-migration-check.sh` 在 `createdb` 缺失处停止，未执行数据库 DDL |
| 本地 health/smoke | NOT RUN | 缺少可确认的本地数据库和运行时配置，避免误连外部数据库 |

## 阶段 E 收口修正

- `farm.cron` 已统一读取 `brd_medication_records`。
- `MedicationRecordService` 已增加鸡群、场站和农场归属校验。
- 免疫库存按仓库场站和公司过滤，不再把 `vaccine_batch_no` 当作库存批次。
- BFF 停药预警已改读 `brd_medication_records` 并按站点 scope 过滤。
- `ImmuneController` 所需的 `ImmuneService` 已注册到 `FarmModule` 的 controller、provider 和 export，API 类型检查及相关测试已复验通过。

## 迁移演练审查

目标迁移为 `apps/api/src/database/migrations/1789600400000-AddProductionManagementMvpSchema.ts`。

- `up()` 含历史数据回填、约束、索引和外键，文件头已声明 `@allow-data-dml`。
- `brd_medication_issue_lines` 在已有历史行时只回填 `inventory_batch_no`、`medication_code`、`qty`、`unit_code`，随后将 `medication_record_id` 设为 `NOT NULL`。历史空值会使迁移失败。
- `down()` 会删除 issue-lines 表，并从既有核心表删除新增列和约束。该回滚是破坏性 schema 回退，只能在已验证备份可恢复的条件下使用，不能当作无损回滚。

## 发布前清单

1. 在隔离 PostgreSQL 18 测试库重建冻结基线，执行迁移 `up()`，验证重复执行幂等。
2. 准备含旧 issue-lines 行、空 `medication_record_id` 和重复历史批次的 fixture，确认迁移明确回填、隔离或 fail-closed。
3. 执行 `down()`，确认 disposable fixture 可回退，再重新 `up()`。
4. 对候选提交单独运行冻结边界和安全回归门禁，记录审查批准及环境变量使用范围。
5. 通过 API/Web typecheck、关键 Jest/Vitest、nullable/constraint/down 门禁。
6. 部署环境先执行备份校验和 ledger preflight，再运行 `MIG_MODE=prod MIG_DIR=apps/api bash scripts/db-migrate.sh`。
7. 只有迁移和 `migration:show` 成功后，才切换 API 镜像，再做 Web 根路径和核心接口 smoke。
8. 完成库存、用药记录、issue lines、`inv_ledger` 对账后，才开放免疫执行和用药创建权限。

## 回滚方案

- **迁移失败**：保持旧 API/旧 Web，不切换候选镜像，保留部署前 `pg_dump` 和迁移日志，人工修复迁移或恢复备份。
- **应用切换后 health 失败**：按 `.github/workflows/deploy.yml` 的 rollback trap 回到上一 API/Web 镜像，确认 `/api/health` 和 Web 根路径恢复。
- **数据语义异常**：停止免疫执行和用药创建，保留已写入流水，使用备份和审计日志评估，不直接运行破坏性 `down()`。
- **数据库恢复**：仅在批准的恢复窗口使用部署前备份恢复，并重新执行 ledger、库存和业务记录对账。

## UAT 操作步骤

1. 创建计划免疫，确认站点、鸡群、疫苗 code、批号和有效期保存。
2. 将计划置为逾期后执行，确认状态为 `EXECUTED`、实际头数和 JWT 操作人写入，重复点击只扣一次库存。
3. 用两个库存批次创建用药记录，确认按 FEFO 分配，库存、issue lines 和 `inv_ledger` 同事务变化。
4. 创建超过可用库存的用药记录，确认返回 409，记录、库存和流水全部回滚。
5. 验证 `withdraw_until` 当日禁止鸡蛋销售，次日允许销售，首页停药预警与列表一致。
6. 使用跨站点账号执行 GET/创建/取消，确认返回 403 或空结果，不能读取或修改其他站点数据。
7. 取消已执行用药，确认通过撤销接口产生反向流水，原始记录保持可追溯。
8. 核对普通库存调整不能绕过用药记录直接形成治疗用药出库。

## 未解决项与依赖

- 需要本地或 CI 提供 PostgreSQL 18 客户端或容器，以完成真实 up/down fixture。
- 需要修复或显式隔离历史 issue-lines 的 `medication_record_id` 空值。
- 需要发布审查人批准冻结边界和安全回归门禁的受控豁免，并重新运行门禁。
- 生产迁移、生产 health 和正式切流均未执行。代码已合并到 `main`，但未形成生产部署成功证据。


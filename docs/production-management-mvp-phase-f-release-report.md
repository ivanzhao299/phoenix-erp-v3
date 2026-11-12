# 生产管理免疫与用药 MVP 阶段 F 发布报告

日期：2026-11-12

范围：部署准备、迁移演练、发布验证、回滚方案和 UAT 操作步骤。候选已通过 PR #531 合并到 `main`（merge commit `b2c08a9cc74ad9444390bdad77c63d80d424b953`），未连接生产数据库，未执行生产迁移、生产写入或正式切流。

## 结论

**正式发布：待后置迁移回执与部署链完成。** 本发布分支基于已包含 MVP 的 `origin/main`，并修复历史 issue-lines 约束风险。隔离 PostgreSQL 18 fixture 已验证迁移 `up()`、重复 `up()` 和 `down()`。首次 full 部署因旧迁移源回执不匹配而被受控门禁拒绝，未切流。后置迁移回执和重新部署仍待完成。

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
| W5 closeout | PENDING | 以本发布分支 CI 结果为准，未复用旧工作树失败结论 |
| 隔离 PostgreSQL 18 migration up/down | PASS | Docker disposable fixture 验证历史空/孤儿 issue-lines quarantine、约束、重复 up 和 down |
| 生产 health/smoke | PENDING | 等待受控部署工作流完成后核验 |

## 阶段 E 收口修正

- `farm.cron` 已统一读取 `brd_medication_records`。
- `MedicationRecordService` 已增加鸡群、场站和农场归属校验。
- 免疫库存按仓库场站和公司过滤，不再把 `vaccine_batch_no` 当作库存批次。
- BFF 停药预警已改读 `brd_medication_records` 并按站点 scope 过滤。
- `ImmuneController` 所需的 `ImmuneService` 已注册到 `FarmModule` 的 controller、provider 和 export，API 类型检查及相关测试已复验通过。

## 迁移演练审查

已发布基线迁移为 `apps/api/src/database/migrations/1789600400000-AddProductionManagementMvpSchema.ts`，历史回执保持不变。新增修复迁移为 `apps/api/src/database/migrations/1794401000000-QuarantineLegacyMedicationIssueLines.ts`。

- `up()` 含历史数据回填、约束、索引和外键，文件头已声明 `@allow-data-dml`。
- 已发布的 1789600400000 迁移源文件保持不变，以便复用既有受控回执。1794401000000 后置迁移将缺失或孤儿的用药记录、库存批次、库存流水行写入 `brd_medication_issue_lines_quarantine`，再删除原行并重新确认 `NOT NULL` 与外键。隔离行保留原始字段和原因，便于审计复核。
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
- 需要完成后置迁移 PR 的 CI/CD，并记录合并提交、受控 migration apply 回执、部署 workflow/run、health 和 smoke。
- 后置迁移、生产 health 和正式切流在部署链完成前仍未形成成功证据。


## 部署尝试记录

- main 合并提交：`e9530f0974e1b87f2a03972ed2f378613634f502`。
- 首次 full 部署：workflow run `43213082897`，在旧迁移源与历史回执不一致处受控 HOLD，未执行服务切换。
- 重试 full 部署：workflow run `43218155456`，同一回执门禁再次 HOLD，未执行生产迁移或切流。
- 受控 inspect：workflow run `43217675497`，只读审计为 GO，ledger digest 为 `c74163b510d97a803c7137e8dcda621f8215aad00501719970957ae18b3a05a3`，旧迁移已在生产 ledger 中，未有 pending migration。
- 后置迁移 PR 使用新时间戳，待合并后单独执行 inspect/apply，再重新触发 full 部署。

## Receipt source binding

- Restored `1789600400000-AddProductionManagementMvpSchema.ts` from published `0334ddfc7` exactly. The source blob is `4f3cd954e15e11624108d875e95a310aa1053c32`.
- Quarantine behavior is carried only by `1794401000000-QuarantineLegacyMedicationIssueLines.ts`, so the existing production receipt remains immutable and the new behavior has its own migration identity.

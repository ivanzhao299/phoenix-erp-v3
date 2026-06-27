# A5 Data Readiness Contract

## Task ID

`STORE-PAYMENT-A5-HOLD-CLEARANCE-A5`

## Request ID

`REQ-STORE-PAYMENT-A5-HOLD-CLEARANCE-001`

## Assigned Agent

`A5-Data-Readiness`

## Goal

Perform read-only Store Payment pilot data readiness evidence collection and decide whether the previous A5 `HOLD` can become `GO WITH CONDITIONS`, remain `HOLD`, or become `FAIL`.

## Required Output

`docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md`

## Required Report Sections

1. 执行环境
2. 只读核查命令清单
3. 试点门店核查
4. 公司 / 组织映射核查
5. 公司收款账户 readiness
6. Store Payment 表结构 readiness
7. Store Payment account / record 数据 readiness
8. 用户角色与门店范围 readiness
9. 菜单码与角色授权 readiness
10. 附件 proof / QR 关联 readiness
11. 阻断项
12. 条件项
13. 可后置项
14. 是否建议解除 A5 HOLD
15. 是否建议进入 A3 Backend Gate
16. 是否建议进入 A4 Frontend Gate
17. 结论：GO / GO WITH CONDITIONS / HOLD / FAIL

## Allowed Actions

1. Read files.
2. Run read-only shell checks.
3. Run read-only SQL only if a local DB connection is available.
4. Use explicit read-only transaction/session settings where supported.
5. Write the required `docs/ops/**` report.

## Forbidden Actions

1. No `insert`, `update`, `delete`, `truncate`, `merge`, seed, reset, cleanup.
2. No migration run.
3. No DB write.
4. No deploy.
5. No push.
6. No business-code modification.
7. No `apps/api/**` modification.
8. No `apps/web/**` modification.
9. No schema/entity/table/column modification.
10. No A3/A4 implementation.

## Required Checks

Inspect, with read-only evidence where possible:

1. `STORE-VTE-001`, 万象直营店, Vientiane pilot store, and existing store candidates.
2. `mst_stores`, `sys_organizations`, user/role/menu/data-scope related tables if DB is accessible.
3. `store_payment_accounts`, `store_payment_records` existence and field readiness if DB is accessible.
4. Static migration/entity/service evidence if DB is not accessible.
5. Store Payment menu code readiness and role grant gaps.
6. User store scope feasibility for cashier/store manager/finance/admin.
7. Attachment proof and QR reference readiness.

## Stop Rules

Stop and report `HOLD` if read-only evidence is unavailable and static evidence cannot establish a safe readiness path. Never fabricate DB evidence.


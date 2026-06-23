# Store Payment Read-only DB Evidence Report

Request ID: `STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_RUN`

Date: 2026-06-23

Scope: Store Payment pilot readiness evidence for A5 HOLD clearance.

## Executive Summary

Conclusion: `HOLD`

The read-only database evidence run successfully connected to the local `phoenix_erp` database and executed only `SELECT` / catalog queries inside `BEGIN READ ONLY` transactions. No database write, migration, seed, cleanup, deploy, push, or business code change was performed.

The target database proves that `STORE-VTE-001 / 万象直营店` exists and maps to `COMP-LAO-AGRI`, and that `fin_cash_accounts` contains active company cash/bank account candidates for `COMP-LAO-AGRI`. However, the target database does not contain `store_payment_accounts` or `store_payment_records`, and it does not contain Store Payment menu codes or role grants. Therefore the A5 HOLD cannot be cleared yet.

## Safety Boundary

| Item | Result |
| --- | --- |
| Business code changed | No |
| `apps/api/**` changed | No |
| `apps/web/**` changed | No |
| Migration created or executed | No |
| Schema/entity/table/column changed | No |
| Database write executed | No |
| Deployment executed | No |
| Push executed | No |
| Secrets printed | No |

## DB Connection Evidence

Real DB connection: `available`

Sanitized connection facts:

| Field | Evidence |
| --- | --- |
| Database | `phoenix_erp` |
| DB user | `mac` |
| Host | `127.0.0.1` |
| Port | `5432` |
| Password output | None |

Connection attempts:

| Attempt | Result |
| --- | --- |
| TCP `127.0.0.1:5432`, user `mac`, database `phoenix_erp` | PASS |
| Unix socket default, database `phoenix_erp` | PASS |
| TCP `127.0.0.1:5432`, user `phoenix_v3`, database `phoenix_erp` | FAIL: role does not exist |

## Read-only Query Boundary

All evidence queries were read-only:

```sql
BEGIN READ ONLY;
SELECT ...;
COMMIT;
```

No `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `CREATE`, `ALTER`, `DROP`, migration command, seed command, reset, cleanup, or deploy command was executed.

## Table Existence Evidence

Read-only catalog result:

| Object | Target DB existence |
| --- | --- |
| `mst_stores` | Exists |
| `sys_organizations` | Exists |
| `fin_cash_accounts` | Exists |
| `sys_user_orgs` | Exists |
| `store_payment_accounts` | Missing |
| `store_payment_records` | Missing |
| `sys_menu` | Exists |
| `sys_role` | Exists |
| `sys_role_menu_permission` | Exists |
| `sys_user` | Exists |
| `sys_user_role` | Exists |
| Attachment/upload table candidates | None found by `%attach%`, `%upload%`, `%file%`, `%media%`, `%document%` scan |

`store_payment_accounts` and `store_payment_records` are present in the approved TypeORM migration file but are not present in the target DB. This means migration/code artifact readiness exists, but DB readiness for these tables is not proven and is currently negative in this database.

## Pilot Store Evidence

Read-only DB result from `mst_stores`:

| store_code | store_name | company_code | status |
| --- | --- | --- | --- |
| `STORE-VTE-001` | `万象直营店` | `COMP-LAO-AGRI` | `ACTIVE` |
| `STORE-VTE-WH-001` | `万象仓储中心店` | `COMP-LAO-AGRI` | `ACTIVE` |

Conclusion: the pilot candidate `STORE-VTE-001 / 万象直营店` is proven in the target DB and is active.

## Company / Organization Mapping Evidence

Read-only DB result from `sys_organizations` includes:

| org_code | org_name | org_type | parent_code | status |
| --- | --- | --- | --- | --- |
| `STORE-VTE-001` | `万象直营店` | `STORE` | `COMP-LAO-AGRI` | `ACTIVE` |
| `STORE-VTE-WH-001` | `万象仓储中心店` | `STORE` | `COMP-LAO-AGRI` | `ACTIVE` |
| `SITE-VTE-BROILER` | `万象肉鸡养殖场` | `SITE` | `COMP-LAO-FOOD` | `ACTIVE` |
| `SITE-VTE-SLAUGHTER` | `万象屠宰加工厂` | `SITE` | `COMP-LAO-FOOD` | `ACTIVE` |

Conclusion: `STORE-VTE-001` maps to `COMP-LAO-AGRI` in both `mst_stores` and `sys_organizations`. The store-level mapping is clear for the pilot candidate.

## Company Collection Account Readiness

Read-only DB result from `fin_cash_accounts` found active `COMP-LAO-AGRI` account candidates, including:

| account_code | account_name | company_code | currency_code | account_type | status |
| --- | --- | --- | --- | --- | --- |
| `FH-10202` | `BCEL老挝公户-老挝币` | `COMP-LAO-AGRI` | `LAK` | `BANK` | `ACTIVE` |
| `FH-10203` | `BCEL老挝公户-人民币户` | `COMP-LAO-AGRI` | `CNY` | `BANK` | `ACTIVE` |
| `FH-10205` | `BCEL老挝公户-美元` | `COMP-LAO-AGRI` | `USD` | `BANK` | `ACTIVE` |
| `FH-10209` | `LDB老挝公司户老挝币卡` | `COMP-LAO-AGRI` | `LAK` | `BANK` | `ACTIVE` |
| `FH-10210` | `LDB老挝公司户-美元户` | `COMP-LAO-AGRI` | `USD` | `BANK` | `ACTIVE` |

Conclusion: finance account source data exists, but Store Payment account readiness is still not satisfied because `store_payment_accounts` does not exist in the target DB and no pilot-specific Store Payment account rows can be queried.

## Store Payment Table Structure Readiness

Target DB result:

| Object | Result |
| --- | --- |
| `store_payment_accounts` | Missing |
| `store_payment_records` | Missing |
| Store Payment table columns | None in target DB |
| Store Payment constraints/indexes | None in target DB |

Static artifact result:

| Artifact | Result |
| --- | --- |
| `apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts` | Creates `store_payment_accounts` and `store_payment_records`; includes unique constraints, checks, indexes, and `down()` |
| `apps/api/src/modules/store-payment/entities/*` | Entity definitions exist and align with the S1 migration design |

Conclusion: schema artifact readiness exists, but target DB readiness is `HOLD` because migration has not been executed and the tables are absent.

## Store Payment Account / Record Data Readiness

Target DB result:

| Data check | Result |
| --- | --- |
| Store Payment account rows | Not queryable because table is missing |
| Active pilot Store Payment account for `STORE-VTE-001` | Not proven |
| Store Payment record status distribution | Not queryable because table is missing |
| `proof_attachment_id` population | Not queryable because table is missing |

Conclusion: Store Payment account/record data readiness is not available yet.

## User Role and Store Scope Readiness

Read-only DB result from `sys_user` / `sys_user_role`:

| username | real_name | store_code | status | role_code | role_name_zh |
| --- | --- | --- | --- | --- | --- |
| `test_cashier` | `收银员测试` | `ST-VTE-001` | `1` | `ROLE_CASHIER` | `前台收银员` |
| `test_store_mgr` | `门店经理测试` | `ST-VTE-001` | `1` | `ROLE_STORE_MGR` | `直营店店长` |
| `pilot_cashier` | `陈 丽 (试运行收银)` | `STORE-MS-01` | `0` | `ROLE_CASHIER` | `前台收银员` |

Read-only DB result from `sys_user_orgs` / `sys_organizations` found one Vientiane-related org scope row:

| username | real_name | user_store_code | org_code | org_name | data_scope_level | is_primary | is_manager |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ajian` | `阿坚` | `SITE-VTE-SLAUGHTER` | `SITE-VTE-SLAUGHTER` | `万象屠宰加工厂` | `SITE` | `true` | `false` |

Conclusion: user/role data exists, but pilot user store scope readiness is not satisfied. The known namespace mismatch remains: test users use `ST-VTE-001`, while the pilot store is `STORE-VTE-001`. This prevents proving the Store Payment rules for cashier/store manager scope.

## Menu Code / Role Authorization Readiness

Read-only DB result from `sys_menu` and `sys_role_menu_permission`:

| Check | Result |
| --- | --- |
| `MENU_STORE_PAYMENT_ACCOUNT` | Missing |
| `MENU_STORE_PAYMENT` | Missing |
| `MENU_STORE_PAYMENT_CONFIRM` | Missing |
| `MENU_STORE_PAYMENT_VOID` | Missing |
| `MENU_STORE_PAYMENT_EXPORT` | Missing |
| Role grants for Store Payment menu codes | Missing |

Static code result:

| Endpoint area | Static decorator / module code |
| --- | --- |
| Account list | `MENU_STORE_PAYMENT_ACCOUNT:V` |
| Account create/update | `MENU_STORE_PAYMENT_ACCOUNT:E` |
| Record list/detail | `MENU_STORE_PAYMENT:V` |
| Record create | `MENU_STORE_PAYMENT:C` |
| Confirm/reject | `MENU_STORE_PAYMENT_CONFIRM:A` |
| Void | `MENU_STORE_PAYMENT_VOID:A` |

Conclusion: controller/menu-code design exists, but DB menu and role authorization readiness is not satisfied.

## Attachment Proof / QR Readiness

Target DB result:

| Check | Result |
| --- | --- |
| Attachment/upload table candidates by name | None found |
| `store_payment_accounts.qr_attachment_id` | Not queryable because table is missing |
| `store_payment_records.proof_attachment_id` | Not queryable because table is missing |
| Protected preview/download DB proof | Not proven |

Static artifact result: Store Payment schema design includes `qr_attachment_id` and required `proof_attachment_id`, but protected attachment preview/download remains a required A3/A2 condition before UI preview is enabled.

Conclusion: attachment readiness is `HOLD` for pilot execution.

## A5 HOLD Clearance Decision

A5 HOLD status: `not cleared`

Reasons:

1. Target DB does not contain `store_payment_accounts` or `store_payment_records`.
2. Target DB does not contain Store Payment menu codes or Store Payment role grants.
3. Pilot Store Payment account rows cannot exist until the account table exists.
4. Pilot user/store scope remains mismatched or unproven for `STORE-VTE-001`.
5. Protected proof/QR attachment preview/download readiness remains unproven.

## Gate Decision

| Gate | Decision | Reason |
| --- | --- | --- |
| A3 Backend Gate | HOLD | Backend implementation may be planned, but cannot be opened as implementation gate until schema DB state/menu grants/account readiness decisions are approved. |
| A4 Frontend Gate | HOLD | UI can remain in planning, but pilot UI implementation depends on A3 endpoint/menu/attachment readiness and A5 data readiness. |
| Migration Gate | HOLD | Migration exists as code artifact, but execution remains forbidden in this task and requires separate approval. |

## Conditions That Are Now Proven

1. Local target DB connection is available.
2. `STORE-VTE-001 / 万象直营店` exists and is active.
3. Store-level organization mapping for `STORE-VTE-001` exists and points to `COMP-LAO-AGRI`.
4. `COMP-LAO-AGRI` has active finance cash/bank account candidates.

## Remaining Blockers

1. Store Payment tables absent in target DB.
2. Store Payment menu codes absent in target DB.
3. Store Payment role grants absent in target DB.
4. Store Payment pilot account rows absent/unqueryable.
5. Pilot user/store scope does not yet prove cashier/store-manager readiness for `STORE-VTE-001`.
6. Attachment protected access path is not proven.

## Next Recommendation

Current conclusion remains `HOLD`.

Recommended next user decision:

1. Approve or reject a dedicated DB Migration Gate for `1782041418112-CreateStorePaymentTables.ts`.
2. Approve a menu/role seed design gate for Store Payment menu codes and role grants, without production execution until separately approved.
3. Decide whether pilot users should use `STORE-VTE-001` instead of `ST-VTE-001`, or provide the correct live pilot user and scope mapping.
4. Keep A3/A4 business implementation Gate closed until A5 readiness reaches `GO WITH CONDITIONS` or better.

## A2 / A1 Follow-up

Status: queued for automatic A2 read-only security review and A1 validation after this evidence report.


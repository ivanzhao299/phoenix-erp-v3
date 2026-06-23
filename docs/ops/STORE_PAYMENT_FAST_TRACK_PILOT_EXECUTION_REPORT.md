# Store Payment Fast-track Pilot Execution Report

Task ID: `STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION`
Date: 2026-06-23
Conclusion: `GO WITH CONDITIONS`

## 1. Execution Environment

| Item | Result |
| --- | --- |
| Target DB | Local `phoenix_erp` |
| DB user | `mac` |
| Host / port | `127.0.0.1:5432` |
| Production environment | No |
| Sensitive connection output | Not printed |
| Push | Not executed |
| Deploy | Not executed |

## 2. User Approval Scope

The user approved fast-track pilot execution in the local/dev `phoenix_erp` database only.

Allowed and performed within this scope:

1. Store Payment table readiness verification after the approved migration.
2. Store Payment menu code registration.
3. Store Payment role authorization registration.
4. `STORE-VTE-001` as canonical pilot store code.
5. Non-destructive `ST-VTE-001` compatibility policy recording in this report.
6. Store Payment pilot payment-account placeholder initialization.
7. Read-only verification after DB writes.

Explicitly not performed:

- Production deploy.
- Push.
- Remote production DB writes.
- Cleanup/reset.
- Deletion of existing business data.
- Destructive `DROP`.
- Store Payment-unrelated migration or seed.
- Protected attachment backend implementation.
- Frontend implementation.

## 3. Migration Execution Result

Result: `GO`

The Store Payment S1 migration had already been executed in the preceding approved `S1-APP-001` Gate. This fast-track run verified the local target DB state and did not run any unrelated migration.

Verified objects:

- `store_payment_accounts`
- `store_payment_records`

Migration file:

`apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts`

Migration hash:

`703c39d6f819e1d8f2db807092f6ee58f02d75e1cf4258cc46fda572b4a5076d`

## 4. `store_payment_accounts` Table Verification

Result: `PASS`

Read-only verification:

- Table exists: yes.
- Required columns exist: yes.
- Primary key / unique / check constraints exist: yes.
- Expected indexes exist: yes.
- Pilot account placeholder rows for `COMP-LAO-AGRI / STORE-VTE-001`: `3`.
- Enabled pilot payment accounts: `0`.

The 3 account rows are intentionally `DISABLED` / `is_active=false` placeholders because real company collection account and QR attachment details still require finance confirmation and protected attachment readiness.

## 5. `store_payment_records` Table Verification

Result: `PASS`

Read-only verification:

- Table exists: yes.
- Required columns exist: yes.
- Primary key / unique / check constraints exist: yes.
- Expected indexes exist: yes.
- Business payment record count: `0`.

No payment records were inserted.

## 6. Menu Code Registration Result

Result: `PASS`

Inserted or upserted Store Payment menu codes:

| menu_code | menu_name | parent | module/domain | route |
| --- | --- | --- | --- | --- |
| `MENU_STORE_PAYMENT_ACCOUNT` | Store Payment 收款账户管理 | `MENU_POS_STORE` | `STORE` | `/store-payment/accounts` |
| `MENU_STORE_PAYMENT` | Store Payment 收款记录 | `MENU_POS_STORE` | `STORE` | `/store-payment/records` |
| `MENU_STORE_PAYMENT_CONFIRM` | Store Payment 收款确认 | `MENU_POS_STORE` | `STORE` | `/store-payment/confirm` |
| `MENU_STORE_PAYMENT_VOID` | Store Payment 收款作废 | `MENU_POS_STORE` | `STORE` | `/store-payment/void` |
| `MENU_STORE_PAYMENT_EXPORT` | Store Payment 收款导出 | `MENU_POS_STORE` | `STORE` | `/store-payment/export` |

Read-only verification:

`store_payment_menu_count=5`

The current `sys_menu` table does not have explicit `enabled`, `active`, or `audit_note` columns. Activity is represented by row presence. Audit evidence is captured in this execution report and git history.

## 7. Role Authorization Result

Result: `PASS WITH CONDITIONS`

Inserted or upserted Store Payment role-menu permissions: `23`.

Role mapping used:

| Business role | Runtime role_code |
| --- | --- |
| 店员 | `ROLE_CASHIER` |
| 店长 | `ROLE_STORE_MGR` |
| 财务 | `ROLE_HQ_FINANCE`, `ROLE_FIN_CFO`, `ROLE_FIN_ACCT`, `ROLE_TREASURY_MANAGER`, `ROLE_CASH` |
| 管理员 / 超管 | `ROLE_ADMIN` |

Permission matrix applied:

| Role group | Permissions |
| --- | --- |
| 店员 | `MENU_STORE_PAYMENT:V,E`, scoped to `STORE-VTE-001` |
| 店长 | `MENU_STORE_PAYMENT:V`, `MENU_STORE_PAYMENT_CONFIRM:V,E`, scoped to `STORE-VTE-001` |
| 财务 | `MENU_STORE_PAYMENT:V`, `MENU_STORE_PAYMENT_CONFIRM:V,E`, `MENU_STORE_PAYMENT_EXPORT:X`, global finance scope |
| 管理员 / 超管 | `MENU_STORE_PAYMENT_ACCOUNT:V,E`, `MENU_STORE_PAYMENT:V,E`, `MENU_STORE_PAYMENT_CONFIRM:V,E`, `MENU_STORE_PAYMENT_VOID:V,E`, `MENU_STORE_PAYMENT_EXPORT:X` |

Condition:

The runtime previously showed some endpoints using `C` / `A` action bits. This fast-track execution followed the user-approved `V/E/X` pilot matrix. A2 should re-check exact runtime action-bit compatibility before broad UAT.

## 8. `STORE-VTE-001` Canonical Result

Result: `PASS`

Canonical pilot store code:

`STORE-VTE-001`

Read-only evidence already proves:

- `STORE-VTE-001 / 万象直营店` exists.
- It is `ACTIVE`.
- It maps to `COMP-LAO-AGRI`.

All new Store Payment account placeholder rows use:

- `company_code = COMP-LAO-AGRI`
- `store_code = STORE-VTE-001`

## 9. `ST-VTE-001` Alias / Normalization Handling

Result: `GO WITH CONDITIONS`

No existing historical `ST-VTE-001` data was deleted or rewritten.

No alias table was identified in the current readiness evidence, so no alias table write was performed.

Compatibility policy for the pilot:

1. Store Payment data uses `STORE-VTE-001` as the canonical code.
2. `ST-VTE-001` remains a legacy compatibility value.
3. A3/DataScope implementation must normalize or explicitly map `ST-VTE-001 -> STORE-VTE-001` for Store Payment access checks if pilot users still carry `ST-VTE-001`.
4. No silent global/company fallback is allowed.

## 10. Pilot Payment Account Initialization Result

Result: `GO WITH CONDITIONS`

Initialized disabled placeholders:

| account_code | currency | status | active | note |
| --- | --- | --- | --- | --- |
| `SP-VTE-BCEL-LAK-PENDING` | `LAK` | `DISABLED` | false | Pending finance confirmation and QR/protected attachment readiness |
| `SP-VTE-BCEL-CNY-PENDING` | `CNY` | `DISABLED` | false | Pending finance confirmation and QR/protected attachment readiness |
| `SP-VTE-BCEL-USD-PENDING` | `USD` | `DISABLED` | false | Pending finance confirmation and QR/protected attachment readiness |

No real bank account number or QR URL was fabricated.

The rows reference active `fin_cash_accounts` candidates where available and remain disabled until finance confirms the final company collection account and protected QR attachment path.

## 11. Protected Attachment Current Strategy

Result: `HOLD_FOR_A3`

Protected preview/download is not implemented in this fast-track run.

Current rules:

1. Frontend must not display raw proof / QR URLs.
2. Frontend preview/download must remain disabled by default.
3. Store Payment may store `proof_attachment_id` only after backend ACL is ready.
4. A3 must implement protected preview/download routes.
5. A2 must review RBAC, DataScope, denied audit, and log redaction before enabling preview/download.

## 12. A5 Readiness Review

Result: `GO WITH CONDITIONS`

A5 read-only evidence after execution:

| Check | Result |
| --- | --- |
| Store Payment tables | PASS |
| Menu codes | PASS, 5 rows |
| Role grants | PASS, 23 rows |
| Canonical pilot store | PASS, `STORE-VTE-001` |
| Store Payment account placeholders | PASS, 3 disabled rows |
| Business payment records | PASS, 0 rows |
| User/store alias readiness | CONDITION, `ST-VTE-001` remains a compatibility risk |
| Protected attachment readiness | CONDITION, A3/A2 required |

A5 HOLD can be lifted for schema/menu/role/account-placeholder readiness, but pilot operation remains conditional on account activation, DataScope alias handling, and protected attachment implementation.

## 13. A2 Security Review

Result: `PASS WITH CONDITIONS`

A2-relevant post-execution findings:

1. RBAC rows exist and are scoped for cashier/store manager to `STORE-VTE-001`.
2. Finance/admin roles have broader scope by business design.
3. No super-admin bypass was used as the only permission model.
4. No Store Payment menu/role write touched unrelated modules.
5. No protected attachment endpoint was implemented, so preview/download must remain disabled.
6. `ST-VTE-001` compatibility remains a DataScope risk to be handled in A3.
7. Runtime action-bit compatibility (`V/E/X` versus `C/A`) must be rechecked before full UAT.

## 14. A1 Verification

Result: `PASS WITH CONDITIONS`

Passed:

- W5 closeout gate.
- Freeze boundary gate.
- Security regression static gate.
- Migration `down()` gate.
- Migration no-data-DML gate.
- Nullable unique gate.
- No app source file changes in git.

Typecheck status:

- `apps/api` direct `./node_modules/.bin/tsc --noEmit`: not runnable because this worktree has no `apps/api/node_modules/.bin/tsc`.
- `apps/web` direct `./node_modules/.bin/tsc --noEmit`: not runnable because this worktree has no `apps/web/node_modules/.bin/tsc`.
- `pnpm exec tsc --noEmit`: not runnable in this worktree due missing `tsc` / workspace package context.

Because no business code was modified, this is a tooling-availability condition rather than a code regression signal.

## 15. Boundary Summary

| Boundary | Result |
| --- | --- |
| DB written | Yes, local `phoenix_erp` only, approved Store Payment pilot scope |
| Migration executed | Yes, Store Payment table readiness is now present; no unrelated migration executed |
| Seed / menu / role registration | Yes, Store Payment menu/role only |
| Business payment data written | No |
| Store Payment account placeholders written | Yes, disabled pending finance confirmation |
| Business code modified | No |
| Apps API modified | No |
| Apps Web modified | No |
| Existing business data deleted | No |
| Cleanup / reset executed | No |
| Deploy executed | No |
| Push executed | No |

## 16. Rollback / Recovery Plan

Rollback must be separately approved before execution.

Suggested rollback sequence:

1. Disable Store Payment menus by deleting or hiding the five `MENU_STORE_PAYMENT*` rows only if no dependent UAT is active.
2. Revoke Store Payment role permissions for the five Store Payment menu rows.
3. Disable or remove the three Store Payment placeholder account rows if they remain unused.
4. If table rollback is required and no Store Payment records exist, execute the approved migration `down()` under a rollback Gate.
5. If records exist later, prefer backup restore or a data-preserving migration plan.

Do not run destructive rollback automatically.

## 17. Current Conclusion

`GO WITH CONDITIONS`

Store Payment is now ready to enter the next implementation gates in the local pilot environment, with conditions:

1. A3 Backend Gate may proceed for protected attachment ACL, action-bit alignment, DataScope alias handling, and Store Payment API readiness.
2. A4 Frontend Gate may proceed with preview/download disabled until A3/A2 clear protected attachment.
3. Finance must confirm real company collection account / QR details before enabling placeholder accounts.
4. No production deploy or push has been performed.

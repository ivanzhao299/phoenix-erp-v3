# Store Payment Pilot Gate S1 Package

Task ID: `STORE_PAYMENT_PILOT_GATE_S1`

Date: 2026-06-23

Status: `READY_FOR_APPROVAL`

This package converts the current Store Payment A5 HOLD into an explicit Migration / Menu / Role / Data Readiness Gate. It is a review and approval package only. It does not execute migration, seed, database writes, deployment, or business implementation.

## 1. Current HOLD Reasons

The Store Payment pilot remains blocked because the read-only DB evidence and follow-up reviews confirmed:

1. `store_payment_accounts` and `store_payment_records` are missing in the target DB.
2. `MENU_STORE_PAYMENT*` menu codes are missing.
3. Store Payment role grants are missing.
4. Store Payment pilot account rows are absent or unqueryable because the table is missing.
5. Pilot user/store scope is not proven for `STORE-VTE-001`.
6. Existing test users use `ST-VTE-001`, while the proven pilot store is `STORE-VTE-001`.
7. Protected proof / QR preview-download access is not proven.
8. A5 remains `HOLD`.
9. A2 remains `HOLD` from a security perspective.
10. A1 is `PASS WITH CONDITIONS`; static gates pass, but readiness blockers remain.

## 2. Confirmed DB Evidence

| Evidence | Result |
| --- | --- |
| DB connection | Available, local `phoenix_erp` |
| Query boundary | Read-only `SELECT` / catalog queries in `BEGIN READ ONLY` |
| Pilot store | `STORE-VTE-001 / 万象直营店` exists |
| Pilot store status | `ACTIVE` |
| Store company mapping | `STORE-VTE-001` maps to `COMP-LAO-AGRI` |
| Finance account candidates | Active `COMP-LAO-AGRI` cash/bank account candidates exist in `fin_cash_accounts` |
| Store Payment tables | Missing |
| Store Payment menu codes | Missing |
| Store Payment role grants | Missing |

Source: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md`

## 3. Not-ready Checklist

| Area | Not-ready item | Blocking impact |
| --- | --- | --- |
| Migration | Store Payment tables absent | A5 HOLD; A3/A4 closed |
| Menu | `MENU_STORE_PAYMENT*` absent | RBAC cannot protect UI/API |
| Role grants | No grants for Store Payment menus | Pilot roles cannot be authorized |
| Pilot account data | No Store Payment account rows | Store payment record creation cannot be proven |
| User/store scope | Pilot cashier/manager scope not proven for canonical store | DataScope risk |
| Store code namespace | `ST-VTE-001` and `STORE-VTE-001` conflict | Data leakage/denial risk |
| Attachment access | Protected preview/download not proven | Proof/QR exposure risk |

## 4. Migration Status Judgment

The approved Store Payment S1 migration file already exists:

`apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts`

It creates:

- `store_payment_accounts`
- `store_payment_records`

It includes `down()`, checks, unique constraints, and indexes. The target DB has not executed this migration. This package does not authorize or run the migration.

## 5. Target DB Missing Tables

Read-only evidence shows these required tables are missing:

- `store_payment_accounts`
- `store_payment_records`

## 6. Missing Menu Codes

Read-only evidence shows these menu codes are missing:

- `MENU_STORE_PAYMENT_ACCOUNT`
- `MENU_STORE_PAYMENT`
- `MENU_STORE_PAYMENT_CONFIRM`
- `MENU_STORE_PAYMENT_VOID`
- `MENU_STORE_PAYMENT_EXPORT`

## 7. Missing Role Authorization

No role grants exist for Store Payment menu codes because the menu rows are absent.

Required pilot role set:

- 店员
- 店长
- 财务
- 管理员
- 超管

## 8. User Store Scope Gap

The target DB shows:

- `test_cashier` and `test_store_mgr` use `ST-VTE-001`.
- The proven pilot store is `STORE-VTE-001`.
- A Vientiane org-scope row exists for `SITE-VTE-SLAUGHTER`, not the pilot retail store.

This cannot yet prove:

- 店员本人/本店 Store Payment access.
- 店长本店 confirmation access.
- 财务 all-store visibility.
- 管理员 account maintenance and all-store visibility.

## 9. Store Code Namespace Risk

`STORE-VTE-001` should be treated as canonical for Store Payment pilot because it is proven in both `mst_stores` and `sys_organizations` as `万象直营店`, `ACTIVE`, mapped to `COMP-LAO-AGRI`.

`ST-VTE-001` appears in test users and existing POS/UAT references. It must not silently substitute for `STORE-VTE-001` in Store Payment records without an explicit alias or normalization decision.

## 10. Protected Attachment Gap

The S1 schema design uses:

- `store_payment_accounts.qr_attachment_id`
- `store_payment_records.proof_attachment_id`

The DB evidence did not prove an attachment table or protected preview/download path. Until A3/A2 approve and validate protected access, UI preview/download must remain disabled or route through a protected endpoint that enforces Store Payment RBAC and store scope.

## 11. Gate Execution Sequence

| Step | Gate | Purpose | Risk | User approval required | Output evidence |
| --- | --- | --- | --- | --- | --- |
| S1-0 | Final approval review | Confirm target environment and scope | Medium | Yes | Approved S1 package |
| S1-1 | Migration precheck | Validate migration file/hash/down/no DML/no destructive change | High | Yes | A1/A2 migration precheck report |
| S1-2 | Migration execution gate | Execute `1782041418112-CreateStorePaymentTables.ts` in approved environment | High | Yes | Execution log and read-only table verification |
| S1-3 | Menu registration gate | Register Store Payment menu codes | High | Yes | Read-only DB menu proof |
| S1-4 | Role grant gate | Grant Store Payment permissions to approved roles | High | Yes | Read-only DB grant proof |
| S1-5 | Store-code normalization gate | Align pilot users/scope with canonical `STORE-VTE-001` or approved alias | High | Yes | A5 read-only scope proof |
| S1-6 | Pilot account data gate | Create or map active Store Payment account rows | High | Yes | A5 account readiness proof |
| S1-7 | Protected attachment design gate | Approve protected preview/download implementation boundary | High | Yes | A2 design PASS WITH CONDITIONS or better |
| S1-8 | Post-gate readiness validation | Re-run A5/A2/A1 evidence | Medium | Yes | GO / GO WITH CONDITIONS / HOLD decision |

## 12. Step Preconditions, Validation, and Rollback

| Step | Preconditions | Validation command or evidence | Rollback plan |
| --- | --- | --- | --- |
| S1-1 | User selects environment; backup confirmed; migration file frozen | `node scripts/ci/check-migration-down.mjs`; static DML gate; file hash check | No DB change yet |
| S1-2 | S1-1 PASS; A2/A1 approve; DB backup exists | Read-only catalog check for tables, columns, constraints, indexes | Run approved `down()` only under rollback gate; restore backup if needed |
| S1-3 | Tables exist or menu seed can run independently | Read-only `sys_menu` query for all menu codes | Remove inserted menu rows only under rollback gate |
| S1-4 | Menu rows exist; role matrix approved | Read-only `sys_role_menu_permission` query | Revoke Store Payment grants under rollback gate |
| S1-5 | Canonical store code approved | Read-only user/org/scope query showing aligned store code or alias | Restore previous user/scope rows from backup under rollback gate |
| S1-6 | Store Payment account model approved | Read-only `store_payment_accounts` proof for pilot active account rows | Disable pilot account rows under rollback gate; do not delete without approval |
| S1-7 | A3/A2 protected attachment design approved | Static A2 review plus endpoint smoke after implementation | Disable preview/download feature flag or menu route |
| S1-8 | S1-2 through S1-7 complete | A5 read-only GO WITH CONDITIONS or better; A2/A1 pass | HOLD A3/A4 and revert to approved previous state |

## 13. A2 Security Review Points

A2 must review:

1. Migration safety and absence of destructive or data DML behavior.
2. Store Payment menu/role matrix and least-privilege assignments.
3. DataScope behavior for 店员 / 店长 / 财务 / 管理员 / 超管.
4. Store-code normalization and alias risk.
5. Proof/QR attachment ACL and denied access audit.
6. Log redaction for `qr_attachment_id`, `proof_attachment_id`, account fields, and resolved URLs.
7. Whether A3/A4 gates may open after S1 evidence.

## 14. A1 Validation Points

A1 must validate:

1. Gate package docs exist.
2. W5 closeout static gate passes.
3. Migration down gate passes before execution.
4. Migration data-DML gate passes before execution.
5. Freeze boundary checks remain clean for this package.
6. After approved execution, read-only DB verification proves table/menu/grant readiness.
7. No business code, deploy, push, or DB write occurs outside approved gates.

## 15. Conditions To Open A3/A4

A3 Backend Gate may open only after:

1. Store Payment tables exist in the target DB.
2. Store Payment menu codes exist.
3. Role grants exist or are explicitly approved for implementation sequencing.
4. Canonical store-code policy is approved.
5. Pilot user/store scope evidence is available or approved as a precondition.
6. Protected attachment boundary is approved.
7. A2 returns at least `PASS WITH CONDITIONS`.
8. A1 returns at least `PASS WITH CONDITIONS`.

A4 Frontend Gate may open only after:

1. A3 endpoint and protected attachment boundary are approved or stubbed by frozen contract.
2. Store Payment menu visibility rules are available.
3. A2 accepts the RBAC/DataScope/attachment risk posture.
4. A5 reaches `GO WITH CONDITIONS` or better.

Until then, A3/A4 remain blocked for implementation.


# A5 Store Payment Pilot Readiness Evidence Report

Request ID: `REQ-STORE-PAYMENT-A5-HOLD-CLEARANCE-001`  
Task ID: `STORE-PAYMENT-A5-HOLD-CLEARANCE-A5`  
Agent: `A5-Data-Readiness`  
Generated: `2026-06-23 08:29:42 CST`

## 1. 执行环境

| Item | Evidence |
| --- | --- |
| Worktree | `/Users/mac/phoenix-erp-worktrees/a5-data-readiness` |
| Branch | `w5-a5-data-readiness` |
| HEAD | `72a17c78 docs(ops): record baseline lifecycle report` |
| Initial worktree status | clean |
| Scope | Read-only static checks, attempted read-only DB checks, docs/ops report only |

Execution guard passed:

```text
pwd -> /Users/mac/phoenix-erp-worktrees/a5-data-readiness
git branch --show-current -> w5-a5-data-readiness
git status --short -> clean
git log --oneline --decorate -8 -> HEAD 72a17c78
```

No migration, seed, deploy, DB write, business-code edit, push, or A3/A4 implementation was performed.

## 2. 只读核查命令清单

Environment:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
git rev-parse --short HEAD
date '+%Y-%m-%d %H:%M:%S %Z'
```

Static inspection:

```bash
rg -n "store_payment|Store Payment|STORE_PAYMENT|MENU_STORE_PAYMENT|store payment" .
rg -n "STORE-VTE-001|万象直营店|Vientiane|mst_stores|sys_organizations|allowedSiteCodes|store scope|store_code" docs apps/api/src apps/web/src scripts
rg --files | rg "(store|payment|A5|A2|A1|ops|menu|role|permission|scope)"
sed -n '1,220p' apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts
sed -n '1,220p' apps/api/src/modules/store-payment/entities/store-payment-account.entity.ts
sed -n '1,260p' apps/api/src/modules/store-payment/entities/store-payment-record.entity.ts
sed -n '1,220p' apps/api/src/modules/store-payment/store-payment.controller.ts
sed -n '1,760p' apps/api/src/modules/store-payment/store-payment.service.ts
sed -n '1,260p' apps/api/src/modules/store-payment/dto/store-payment.dto.ts
sed -n '1,180p' apps/api/src/modules/store-payment/store-payment.module.ts
sed -n '1,160p' apps/api/src/app.module.ts
sed -n '100,130p' scripts/init-master-data-m2.sql
sed -n '1,220p' data/master-data-m2/stores-init.csv
sed -n '1,140p' scripts/seed-uat-users.sh
sed -n '1,180p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_PERMISSION_MATRIX.md
sed -n '80,130p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_IMPLEMENTATION_S1_REPORT.md
```

Attempted DB read-only evidence:

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -U mac -d phoenix_erp \
  -v ON_ERROR_STOP=1 -P pager=off \
  -c "BEGIN READ ONLY; SELECT current_database() AS db, current_user AS db_user, inet_server_addr() AS server_addr, current_setting('transaction_read_only') AS read_only; COMMIT;"

/Applications/Postgres.app/Contents/Versions/latest/bin/psql -h 127.0.0.1 -p 5432 -U mac -d phoenix_erp \
  -v ON_ERROR_STOP=1 -P pager=off \
  -c "BEGIN READ ONLY; SELECT current_database() AS db, current_user AS db_user, current_setting('transaction_read_only') AS read_only; COMMIT;"
```

Result:

```text
socket /tmp/.s.PGSQL.5432 -> Operation not permitted
TCP 127.0.0.1:5432 -> Operation not permitted
```

DB evidence unavailable. Current conclusion is based on static inference only. Missing connection/query evidence is required before entering A3/A4 implementation or live pilot enablement.

## 3. 试点门店核查

Static evidence supports `STORE-VTE-001 / 万象直营店 / Vientiane pilot store` as the intended candidate:

| Source | Evidence |
| --- | --- |
| `scripts/init-master-data-m2.sql` | inserts `('STORE-VTE-001', '万象直营店', '万象市 / COMP-LAO-FOOD', 'ACTIVE')` into `mst_stores` |
| `data/master-data-m2/stores-init.csv` | row `STORE-VTE-001,万象直营店,COMP-LAO-FOOD,万象市,ACTIVE` |
| `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md` | names pilot store as `STORE-VTE-001`, pending DB confirmation |

Readiness: **STATIC PASS / DB UNKNOWN**.

Blocker: actual `mst_stores` and `sys_organizations` rows were not query-proven in the target DB.

## 4. 公司 / 组织映射核查

Static mapping points to `COMP-LAO-FOOD` for `STORE-VTE-001`, but this is not live DB proof. Existing design docs also warn that store/site/company mappings have changed across governance phases and must be read from the target DB, not assumed from seed files.

Required read-only DB proof:

```sql
BEGIN READ ONLY;
SELECT store_code, store_name, company_code, region, status
FROM mst_stores
WHERE store_code='STORE-VTE-001' OR store_name ILIKE '%万象%';

SELECT org_code, org_name, org_type, parent_code, company_code, site_code, status
FROM sys_organizations
WHERE org_code IN ('STORE-VTE-001','SITE-VTE-STORE') OR org_name ILIKE '%万象%';
COMMIT;
```

Readiness: **DB UNKNOWN**.

## 5. 公司收款账户 readiness

Static schema supports a Store Payment collection account table:

| Table | Required readiness surface |
| --- | --- |
| `store_payment_accounts` | `account_code`, `account_name`, `company_code`, `store_code`, optional `fin_cash_account_id`, `currency`, `payment_method`, optional `qr_attachment_id`, `status`, `is_active`, audit fields |
| `fin_cash_accounts` | referenced only by optional `fin_cash_account_id`; target DB must prove the referenced cash account exists, belongs to the same company/currency, and is active |

The S1 implementation report explicitly states no seed is included. Therefore A5 cannot prove any active pilot collection account/code exists.

Required DB proof:

```sql
BEGIN READ ONLY;
SELECT a.*
FROM store_payment_accounts a
WHERE a.store_code='STORE-VTE-001'
  AND a.company_code='COMP-LAO-FOOD'
  AND a.status='ACTIVE'
  AND a.is_active=true
  AND a.deleted_at IS NULL;

SELECT id, account_code, account_name, company_code, currency_code, status
FROM fin_cash_accounts
WHERE company_code='COMP-LAO-FOOD' AND status='ACTIVE';
COMMIT;
```

Readiness: **HOLD** until at least one active store payment account/code is proven.

## 6. Store Payment 表结构 readiness

Static evidence:

| Artifact | Finding |
| --- | --- |
| `1782041418112-CreateStorePaymentTables.ts` | creates `store_payment_accounts` and `store_payment_records`; includes unique constraints, checks, indexes, and `down()` |
| `StorePaymentAccountEntity` | entity fields align with the migration columns |
| `StorePaymentRecordEntity` | entity fields align with the migration columns |
| S1 report | confirms no menu seed, dict seed, business data seed, finance posting, POS link, or protected attachment controller in S1 |

Table-readiness static result: **PASS WITH CONDITIONS**.

DB table existence result: **UNKNOWN / BLOCKER** because catalog queries could not run.

## 7. Store Payment account / record 数据 readiness

Static service checks are present:

| Area | Static evidence |
| --- | --- |
| Account active state | `createRecord` requires account exists, not deleted, `status='ACTIVE'`, `isActive=true` |
| Account/store/company consistency | `createRecord` rejects mismatch between record `companyCode`/`storeCode` and account |
| Currency/method consistency | `createRecord` rejects mismatch between account and record |
| Record status | schema and DTO allow `PENDING`, `CONFIRMED`, `REJECTED`, `VOIDED` |
| Audit fields | migration/entities contain `created_by`, `updated_by`, timestamps; service writes operation logs |
| Proof | `proof_attachment_id` is required on records |

Data-readiness result: **DB UNKNOWN / HOLD**.

Missing proof:

1. Count and sample rows in `store_payment_accounts`.
2. Count and status distribution in `store_payment_records`.
3. Orphan check: records whose `payment_account_id` does not point to an active account.
4. Consistency check: record company/store/currency/method equals linked account.
5. Null/blank proof check for `proof_attachment_id`.

## 8. 用户角色与门店范围 readiness

Static role model in service:

| Runtime role group | Static role codes |
| --- | --- |
| Admin | `ROLE_ADMIN` or wildcard permission |
| Finance | `ROLE_FIN_ACCT`, `ROLE_FIN_CFO`, `ROLE_GROUP_FINANCE`, `ROLE_HQ_FINANCE` |
| Store manager | `ROLE_STORE_MGR` |
| Cashier | `ROLE_CASHIER` |

Scope implementation:

1. `StorePaymentService.allowedStoreCodes()` combines `user.storeCode` and `DataScopeContext.allowedSiteCodes`.
2. `DataScopeService` populates `allowedSiteCodes` from SITE org bindings or `site_code`.
3. Non-admin/non-finance users are denied if no matching store code exists.

Static blocker:

`scripts/seed-uat-users.sh` assigns `test_cashier` and `test_store_mgr` to `ST-VTE-001`, while the pilot store candidate is `STORE-VTE-001`. This is a namespace mismatch until DB proves actual pilot users carry the same code as `store_payment_accounts.store_code`.

Readiness: **HOLD** until user-role-store scope is query-proven.

## 9. 菜单码与角色授权 readiness

Controller menu requirements:

| Endpoint area | Required menu |
| --- | --- |
| Account list | `MENU_STORE_PAYMENT_ACCOUNT:V` |
| Account create/update | `MENU_STORE_PAYMENT_ACCOUNT:E` |
| Record list/detail | `MENU_STORE_PAYMENT:V` |
| Record create | `MENU_STORE_PAYMENT:C` |
| Confirm/reject | `MENU_STORE_PAYMENT_CONFIRM:A` |
| Void | `MENU_STORE_PAYMENT_VOID:A` |
| Export | Not implemented; `MENU_STORE_PAYMENT_EXPORT` remains reserved/deferred |

Static evidence is good, but target DB menu registration and role grants are not proven. S1 explicitly contains no menu seed.

Required DB proof:

```sql
BEGIN READ ONLY;
SELECT menu_code, menu_name, status
FROM sys_menu
WHERE menu_code IN (
  'MENU_STORE_PAYMENT_ACCOUNT',
  'MENU_STORE_PAYMENT',
  'MENU_STORE_PAYMENT_CONFIRM',
  'MENU_STORE_PAYMENT_VOID',
  'MENU_STORE_PAYMENT_EXPORT'
)
ORDER BY menu_code;

SELECT r.role_code, m.menu_code, p.permissions
FROM sys_role_menu_permission p
JOIN sys_role r ON r.role_id=p.role_id
JOIN sys_menu m ON m.menu_id=p.menu_id
WHERE m.menu_code LIKE 'MENU_STORE_PAYMENT%'
ORDER BY r.role_code, m.menu_code;
COMMIT;
```

Readiness: **HOLD**.

## 10. 附件 proof / QR 关联 readiness

Static evidence:

1. `store_payment_accounts.qr_attachment_id` exists and is optional.
2. `store_payment_records.proof_attachment_id` exists and is required.
3. Service rejects raw `/uploads/...`, `uploads/...`, `http://...`, and `https://...` attachment references.
4. Responses redact raw attachment IDs and expose `qrAttachmentBound` / `proofAttachmentBound`.

Known condition from A2 reports: protected Store Payment proof/QR preview/download endpoint is not proven. If preview is needed during pilot, it must enforce `MENU_STORE_PAYMENT:V` or `MENU_STORE_PAYMENT_ACCOUNT:V` plus the same store/finance/admin scope. If deferred, UI must keep proof/QR preview disabled.

Readiness: **PASS WITH CONDITIONS** for storage reference, **HOLD** for preview/download proof.

## 11. 阻断项

1. DB evidence unavailable: both socket and TCP `psql` attempts failed with `Operation not permitted`.
2. Target DB table existence for `store_payment_accounts` and `store_payment_records` is not proven.
3. `STORE-VTE-001 / 万象直营店` target DB row and company mapping are not proven.
4. Active pilot collection account/code is not proven.
5. Store Payment menu registration and role grants are not proven.
6. Cashier/store manager scope has a static namespace risk: `ST-VTE-001` in UAT seed versus `STORE-VTE-001` in store master data.
7. Protected proof/QR preview/download ACL is not proven.

## 12. 条件项

1. If DB proof later confirms tables, pilot store, account, roles, menus, and scopes, A5 can move from `HOLD` to `GO WITH CONDITIONS`.
2. `MENU_STORE_PAYMENT_EXPORT` can remain deferred because export endpoint is not implemented.
3. Proof/QR preview can remain deferred only if the UI/API do not expose raw attachment URLs or raw attachment IDs.
4. Finance all-store access for `ROLE_FIN_ACCT`, `ROLE_FIN_CFO`, `ROLE_GROUP_FINANCE`, and `ROLE_HQ_FINANCE` needs explicit user approval or DB role-policy evidence.

## 13. 可后置项

1. Export endpoint and `MENU_STORE_PAYMENT_EXPORT:X`.
2. Formal finance posting integration.
3. POS sale linkage beyond optional `sale_no`.
4. Dedicated store-scope model if `allowedSiteCodes` is accepted only as pilot transition scope.
5. Full protected attachment preview/download endpoint if pilot can operate without image preview.

## 14. 是否建议解除 A5 HOLD

**不建议解除。**

Reason: A5 cannot clear a data-readiness HOLD without live read-only DB evidence. Static artifacts establish an implementation path, but not actual pilot readiness.

## 15. 是否建议进入 A3 Backend Gate

**不建议进入 A3 implementation gate。**

Allowed next step: A3 may prepare a read-only plan or DB-query checklist only. Backend implementation should not start until DB evidence proves the current schema/data/RBAC baseline or a separate approved data-prep task exists.

## 16. 是否建议进入 A4 Frontend Gate

**不建议进入 A4 implementation gate。**

Allowed next step: A4 may prepare a UI/UAT plan only. Frontend pilot work depends on proven account selector data, menu grants, store scope, and attachment-preview policy.

## 17. 结论：GO / GO WITH CONDITIONS / HOLD / FAIL

**Conclusion: HOLD**

Static readiness is **PASS WITH CONDITIONS**, but the A5 HOLD blocker is **not cleared** because real DB evidence is unavailable and several runtime data requirements remain unproven.

Minimum evidence needed to move to `GO WITH CONDITIONS`:

1. Read-only DB proof that Store Payment tables exist.
2. Read-only DB proof that `STORE-VTE-001 / 万象直营店` exists and maps to the approved company.
3. At least one active `store_payment_accounts` row for pilot company/store/currency/payment method.
4. Pilot cashier, store manager, finance, admin/super admin users with matching roles and same store-code namespace.
5. Store Payment menu rows and role grants for required codes.
6. Attachment proof/QR strategy: protected preview/download implemented or explicitly disabled for pilot.

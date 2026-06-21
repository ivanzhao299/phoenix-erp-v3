# A5 Data Readiness Report: Store Payment 001

> Request: `REQ-STORE-PAYMENT-UNIFIED-CODE-001`
> Scope: MVP-1 read-only data readiness check for direct-store unified company collection code records.
> Pilot candidate checked from code/docs: `万象直营店`.
> Result: report-only. No application code, schema, migration, database write, deployment, or cross-agent work was performed.

## 1. Execution Environment

| Item | Value |
| --- | --- |
| pwd | `/Users/mac/phoenix-erp-worktrees/a5-data-readiness` |
| branch | `w5-a5-data-readiness` |
| HEAD | `48bba29 docs(ops): freeze unified store payment MVP spec` |
| working tree before audit | clean |
| AGENTS.md tracked | yes |

## 2. Read Documents

1. `AGENTS.md`
2. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md`
3. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_AGENT_CONTRACTS.md`
4. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md`
5. `docs/ops/AI_DELIVERY_PHASE3_1_SPEC_FREEZE_REVIEW.md`
6. `docs/ops/AGENT_TASK_BOARD.md`

## 3. Read-Only Check Commands

Environment gate:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -5
git ls-files AGENTS.md
```

Read-only source/document inspection:

```bash
sed -n '1,220p' AGENTS.md
sed -n '1,260p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md
sed -n '1,260p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_AGENT_CONTRACTS.md
sed -n '1,260p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md
sed -n '1,260p' docs/ops/AI_DELIVERY_PHASE3_1_SPEC_FREEZE_REVIEW.md
sed -n '1,260p' docs/ops/AGENT_TASK_BOARD.md
rg --files
rg -n "mst_stores|sys_store|store_code|StoreSelector|直营店|万象|孟赛|琅勃拉邦|farm_code|company_code|organization|org" apps/api apps/web docs migrations -S
rg -n "DataScope|sys_role|sys_menu|MENU_|ROLE_" apps/api apps/web docs -S
rg -n "fin_cash_accounts|payment_method|收款|二维码|qr|currency_code|SYS_CURRENCY|bank_account|account_code" apps/api apps/web docs migrations -S
sed -n '1,260p' apps/api/src/modules/org/entities/sys-organization.entity.ts
sed -n '1,260p' apps/api/src/modules/org/entities/sys-data-scope.entity.ts
sed -n '1,260p' apps/api/src/modules/org/services/data-scope.service.ts
sed -n '1,240p' apps/api/src/modules/org/guards/data-scope.guard.ts
sed -n '1,260p' apps/api/src/modules/finance-v2/entities/fin-cash-account.entity.ts
sed -n '1,240p' apps/api/src/modules/finance-v2/dto/cash-account.dto.ts
sed -n '1,320p' apps/api/src/modules/finance-v2/services/cash-accounts.service.ts
sed -n '1,220p' apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts
sed -n '1,240p' apps/api/src/modules/finance-v2/entities/fin-ar-receipt.entity.ts
sed -n '1,220p' apps/api/src/modules/finance-v2/dto/ar-receipt.dto.ts
sed -n '1,260p' apps/api/src/modules/upload/upload.controller.ts
sed -n '1,260p' apps/web/src/components/design-system/forms/AttachmentUploader.tsx
sed -n '1,260p' apps/api/src/modules/sales-v2/entities/sal-sales-order.entity.ts
sed -n '1,320p' apps/api/src/modules/store-pos/controllers/store-pos.controller.ts
sed -n '1,360p' apps/api/src/modules/store-pos/services/store-pos.service.ts
sed -n '1,260p' apps/api/src/common/entities/sys-operation-log.entity.ts
sed -n '180,330p' apps/api/src/common/interceptors/operation-log.interceptor.ts
sed -n '1,260p' apps/api/src/modules/master-data/master-data-audit.service.ts
sed -n '1,120p' apps/api/migrations/20260610_g81_stores_into_org_tree.sql
sed -n '1,150p' apps/api/migrations/20260614_g113_stores_governance.sql
```

Package scripts reviewed:

```bash
sed -n '1,220p' package.json
sed -n '1,220p' apps/api/package.json
sed -n '1,240p' apps/web/package.json
```

## 4. Store / Organization Current State

Findings:

1. Store master data exists through `mst_stores`.
   - Generic CRUD can create the compatibility table with `store_code`, `store_name`, `address`, `phone`, `status`, timestamps.
   - Later migrations add `company_code`, `manager`, `effective_date`, `expire_date`, `remark`, `mapped_site_code`, `operation_type`, `contact`, and `region`.
2. Organization tree exists through `sys_organizations`.
   - `org_type` supports `STORE`, `SITE`, `COMPANY`, `PROJECT`, `WAREHOUSE`, and other levels.
   - `sys_organizations` has `company_code`, `project_code`, `warehouse_code`, `site_code`, `manager_user_id`, `manager_name`, and parent fields.
3. Store nodes are intended to be present in `sys_organizations`.
   - `apps/api/migrations/20260610_g81_stores_into_org_tree.sql` maps eight stores, including `STORE-VTE-001` as `万象直营店`.
   - `apps/api/migrations/20260614_g113_stores_governance.sql` is marked "本地提交·未部署·待审"; it later moves `STORE-VTE-001` from `COMP-LAO-FOOD` to `COMP-LAO-AGRI` and updates several store governance fields.
4. `store_code` remains a risk area.
   - `store_code` is used for real POS store isolation, historical site/farm compatibility, JWT fallback fields, and old `sys_store` aliases.
   - `DataScopeService` explicitly says `store_code` is no longer a company DataScope fallback, but POS paths still accept/query by `storeCode`.
   - MDM docs/migrations distinguish `mapped_site_code` and `store_code`, but existing code still uses both in different semantics.
5. `万象直营店` can be expressed in design as `STORE-VTE-001`, but current DB existence was not verified because this task did not connect to the database.
   - Treat `STORE-VTE-001 / 万象直营店` as a candidate requiring user/DB confirmation before development or seed data.

Read-only SQL suggestions for a later approved DB check:

```sql
SELECT store_code, store_name, company_code, mapped_site_code, status
FROM mst_stores
WHERE store_name ILIKE '%万象%' OR store_code IN ('STORE-VTE-001');

SELECT org_code, org_name, org_type, parent_code, company_code, status
FROM sys_organizations
WHERE org_code IN ('STORE-VTE-001') OR org_name ILIKE '%万象%';
```

Single-store gray data needed from existing structures:

1. Confirm exact pilot store row: `mst_stores.store_code` plus matching `sys_organizations.org_code`.
2. Confirm parent company after G113 decision: `COMP-LAO-FOOD` vs `COMP-LAO-AGRI`.
3. Confirm whether store-level filtering should use `mst_stores.store_code`, `sys_organizations.org_code`, or a new canonical `store_code` in the future MVP table.

## 5. User / Role / Permission / DataScope Current State

Findings:

1. RBAC is menu-code based.
   - Controllers use `@RequireMenu(menuCode, perm)` with `MenuGuard`.
   - Role permissions live in `sys_role`, `sys_menu`, and `sys_role_menu_permission`.
2. Candidate reusable roles exist:
   - Store clerk / cashier: `ROLE_CASHIER`, with `MENU_STORE_POS` `V,C,E` in role runtime migrations.
   - Store manager: `ROLE_STORE_MGR`, with `MENU_STORE_POS` `V,C,E,D,A`, `MENU_SALES2_ORDER`, and workflow permissions.
   - Finance roles: `ROLE_FIN_ACCT`, `ROLE_FIN_CFO`, `ROLE_GROUP_FINANCE`, `ROLE_HQ_FINANCE`, and related finance review roles appear in docs/migrations.
   - Admin: `ROLE_ADMIN`.
3. Existing POS menu is reusable only as a reference pattern, not as the MVP-1 permission itself.
   - `MENU_STORE_POS` controls actual POS sale completion and can write inventory, AR, and cash transactions.
   - MVP-1 needs a separate menu because it is operational payment evidence, not POS settlement or formal finance receipt.
4. DataScope supports company/project/warehouse/farm/site lists in runtime context.
   - `DataScopeContext` contains `allowedCompanyCodes`, `allowedProjectCodes`, `allowedWarehouseCodes`, `allowedFarmCodes`, and `allowedSiteCodes`.
   - `sys_data_scopes.scope_type` currently allows `SELF`, `PROJECT`, `COMPANY`, `REGION`, `GROUP`; there is no explicit `STORE` scope type.
5. Store-level enforcement is not automatic.
   - `DataScopeGuard` resolves and stores context but does not block by itself.
   - Each service must apply company/site/store filters explicitly.
   - MVP-1 must define whether "own store" means `allowedSiteCodes`, `sys_user.store_code`, `sys_user_orgs` `STORE` binding, or a new store-scope rule.
6. Attachment permission cannot automatically follow the business record today because the upload endpoint only returns a URL and has no business record ACL.

Schema Gate implications:

1. New MVP-1 menus should be reviewed by A2 before implementation.
2. Store-level DataScope rules need an approved model, likely using `store_code` plus explicit service filters.
3. Confirm action needs a distinct permission such as `MENU_STORE_PAYMENT:CONFIRM` or an approved `A/E` equivalent.

## 6. Collection Account / Collection Code Current State

Findings:

1. Finance V2 has reusable cash account runtime:
   - Entity/table: `fin_cash_accounts`.
   - API: `/api/v2/finance/cash/accounts`.
   - UI selector mentioned in `AGENTS.md`: `CashAccountSelector`.
   - Fields include `account_code`, `account_name`, `company_code`, `company_name`, `currency_code`, `account_type`, `bank_name`, `bank_account_no`, `status`, audit timestamps, `created_by`, `updated_by`.
   - Status supports `ACTIVE`, `FROZEN`, `CLOSED`; UI/API query supports status filtering.
2. Bank account center also exists in migration history as `fin_bank_accounts`.
3. Existing finance receipt model is not suitable as the MVP-1 operational record:
   - `fin_ar_receipts` is Finance V2 formal AR receipt.
   - Confirming an AR receipt can allocate to AR invoices and optionally write cash transactions.
   - MVP-1 explicitly says `PENDING_CONFIRM` is excluded from formal finance receipt scope and confirmed records do not auto-post.
4. Gaps for collection codes:
   - No store binding on `fin_cash_accounts`.
   - No QR code attachment/reference field on `fin_cash_accounts`.
   - No separate "company collection code" lifecycle distinct from cash account lifecycle.
   - No clerk-facing "enabled account/code only" collection-code selection rule.
   - No `payment_method` field on `fin_cash_accounts`; payment method currently belongs to transactions/receipts/POS dictionaries.
5. Finance/admin maintenance entry can reuse patterns from:
   - Finance cash account center: `MENU_FIN2_CASH_MASTER`.
   - Master data center entries for cash/bank accounts: `MENU_MD_CASH_ACCOUNT`, `MENU_MD_BANK_ACCOUNT`.
   - But a store-payment account/code maintenance page needs its own menu if it stores QR images and store bindings.

Schema Gate recommendation:

1. Design `store_payment_accounts` or a store-payment account mapping table rather than overloading `fin_cash_accounts`.
2. Reference `fin_cash_accounts.account_code` or `id` for the underlying financial account only if finance agrees.
3. Add QR attachment reference and optional `store_code` under Schema Gate.
4. Decide status values: `ACTIVE/DISABLED` for collection-code availability; avoid confusing `FROZEN/CLOSED` with cash-account accounting state.

## 7. Attachment System Current State

Findings:

1. Upload endpoint exists:
   - `POST /api/upload/contract`
   - Protected by JWT.
   - Stores files under `uploads/contracts`.
   - Allows `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`.
   - Maximum size is 15 MB.
   - Returns `{ code, url, originalName, size }`.
2. Frontend `AttachmentUploader` exists and supports multiple files.
   - It calls `/api/upload/contract`.
   - It displays thumbnails for images and generic file chips for non-images.
3. Persistence is currently business-table specific.
   - Examples include `attachment_url`, `attachment_urls` JSONB, and single string fields.
   - No generic attachment table with `biz_type` and `biz_id` was found.
4. Permission model is incomplete for MVP-1.
   - Upload is authenticated, but returned URLs are plain `/uploads/contracts/...`.
   - There is no evidence in the inspected files of business-record-level download/preview authorization.
   - Attachment permission "follows payment record permission" therefore needs design work.

Schema Gate recommendation:

1. For MVP-1, use a required screenshot field on `store_payment_records`, preferably `screenshot_attachment_url` or an approved attachment reference.
2. If strict record-level attachment access is required, Schema Gate should design an attachment reference table or protected file access endpoint.
3. Do not rely on bare URL access as sufficient for sensitive payment screenshots.

## 8. Order / Sales Receipt / POS Current State

Findings:

1. Sales order model exists:
   - Entity/table: `sal_sales_orders`.
   - Stable business key: `order_no`.
   - Fields include company, customer, channel, currency, amount, status, and AR bridge fields.
2. POS / store sale model exists through raw SQL service paths:
   - Runtime routes under `/api/v2/store-sales`.
   - Main business key: `sal_store_sales.sale_no`.
   - Legacy `pos_sales.sale_no` also exists in migrations and daily-close code.
3. POS payment actions are not suitable for MVP-1 reuse:
   - `completeCashSale` writes `fin_cash_transactions` with `sourceType='STORE_SALE'`.
   - POS completion also deducts inventory and may create AR invoices.
   - MVP-1 forbids automatic finance/inventory linkage.
4. Optional MVP-1 association should be soft references:
   - `order_no` referencing `sal_sales_orders.order_no`.
   - `receipt_no` or `sale_no` referencing POS/store sale number, pending final terminology.
5. If a formal sales receipt model is required, defer to MVP-2.
   - `sal_receipts` exists but appears to be delivery receipt/sign-off, not payment screenshot evidence.

Schema Gate recommendation:

1. Keep `order_no` and `receipt_no`/`sale_no` nullable text fields in MVP-1.
2. Add indexes only if query requirements include these references.
3. Do not enforce hard FK until POS/sales receipt canonical source is confirmed.

## 9. Audit Log Current State

Findings:

1. `sys_operation_logs` exists for high-sensitive operation logs.
   - Entity: `apps/api/src/common/entities/sys-operation-log.entity.ts`.
   - Migration: `apps/api/migrations/20260530_create_missing_sys_tables.sql`.
   - Captures user, role, module, action, biz type/id/no, request method/path, IP, user agent, after data, result.
2. `OperationLogInterceptor` only logs configured path patterns.
   - New store-payment routes would need explicit log rules or a separate service-level insert.
   - `module_code` is currently left blank in the interceptor.
3. Master data audit exists as `mst_audit_trail`.
   - `MasterDataAuditService` records create/update/freeze/archive/restore/merge for master data.
   - Useful pattern for account/code maintenance audit if store payment accounts become master-data-like.
4. Legacy `sys_audit_log` writes exist in terminal/auth paths, but not as the primary inspected audit model.

Schema Gate recommendation:

1. Reuse `sys_operation_logs` for payment record create/confirm/void and permission denial where possible.
2. Reuse `mst_audit_trail` only if store-payment accounts are implemented through the master-data runtime.
3. Add explicit `biz_type` values such as `STORE_PAYMENT_ACCOUNT` and `STORE_PAYMENT_RECORD`.
4. Define events for account/code create/update/enable/disable, record create, screenshot change, confirm, reject/void, and attachment access denial.
5. A separate `store_payment_audit` table is not required for MVP-1 unless record-level timeline requirements cannot be satisfied from `sys_operation_logs`.

## 10. Reusable Capability List

| Capability | Reuse Level | Notes |
| --- | --- | --- |
| Store master data | partial | `mst_stores` and `sys_organizations STORE` nodes exist, but pilot row and company mapping need DB/user confirmation. |
| Company/org master data | yes | `sys_organizations` supports company and store hierarchy. |
| User/role/menu RBAC | yes | Existing `sys_role`, `sys_menu`, `sys_role_menu_permission`, `MenuGuard`, `@RequireMenu`. |
| DataScope runtime | partial | Company/site context exists; explicit store-scope enforcement must be designed in service layer. |
| Finance cash accounts | partial | Good underlying account model; missing store binding and QR collection-code fields. |
| Currency dictionary | yes | `SYS_CURRENCY` is referenced as existing runtime dictionary. |
| Payment method dictionary | partial | `SAL_PAY_METHOD` and `FIN_RECEIPT_METHOD` exist; MVP-1 should choose or define one canonical dict. |
| Attachment upload | partial | Upload and UI component support images/PDF; no generic biz ACL. |
| Sales order reference | yes | Use `sal_sales_orders.order_no` as optional reference. |
| POS sale reference | partial | Use `sale_no` as optional reference; do not call POS completion paths. |
| Audit logs | partial | `sys_operation_logs` and `mst_audit_trail` can be reused with new rules/events. |

## 11. Gap List

1. No existing operational store payment record table matching MVP-1 lifecycle.
2. No existing collection-account/code table with store binding, QR attachment, payment method, and enabled/disabled semantics.
3. `fin_ar_receipts` is formal finance AR receipt and is not safe for MVP-1 operational pending records.
4. POS payment completion writes inventory/cash/AR and is out of scope for MVP-1.
5. Attachment storage lacks generic `biz_type` / `biz_id` reference and business-record-level download authorization.
6. Store-level DataScope is not a first-class `sys_data_scopes.scope_type`; service-level filtering must be designed.
7. `store_code` remains semantically overloaded across POS store, SITE/farm compatibility, historical `sys_store`, and JWT/user fields.
8. `万象直营店` has code evidence as `STORE-VTE-001`, but actual DB state and final company mapping require confirmation.
9. Confirm/reject/void workflow for payment records does not exist.
10. Dedicated permission/menu codes for store payment and store payment account maintenance do not exist.
11. Audit event mapping for new store payment routes does not exist.
12. QR code image/account sensitive-field retention and masking rules are not defined.

## 12. Schema Gate Recommendations

Recommendation: **YES WITH CONDITIONS**.

Reasons:

1. MVP-1 cannot safely reuse `fin_ar_receipts`, POS payment completion, or daily close tables without violating the finance boundary.
2. New persistence is likely needed for operational pending records and collection-code configuration.
3. Existing `fin_cash_accounts` should be referenced, not overloaded, unless finance approves a narrow mapping design.
4. Attachment ACL and store-level DataScope require explicit design approval.

Suggested design candidates for Schema Gate:

1. `store_payment_accounts`
   - `account_code` or generated business code.
   - Optional `cash_account_id` / `cash_account_code` reference to `fin_cash_accounts`.
   - `company_code`.
   - Optional `store_code`.
   - `payment_method`.
   - `currency_code`.
   - `qr_attachment_url` or approved attachment reference.
   - `status` as `ACTIVE/DISABLED`.
   - created/updated audit fields.
2. `store_payment_records`
   - `record_no`.
   - `company_code`.
   - `store_code`.
   - `account_code`.
   - `receiver_user_id`, `receiver_username`.
   - `amount`, `currency_code`, `payment_method`, `payment_time`.
   - required screenshot reference.
   - optional `order_no`, optional `sale_no` or `receipt_no`.
   - `status`: `PENDING_CONFIRM`, `CONFIRMED`, `REJECTED` or `VOIDED` if approved.
   - confirmation/void audit fields.
3. Audit:
   - Prefer `sys_operation_logs` plus explicit `biz_type` and action code rules.
   - Add `store_payment_audit` only if an in-record timeline cannot be reconstructed.
4. Attachment:
   - Either business table URL fields for MVP-1 with restricted API proxy later, or a new attachment reference table if strict ACL is required now.
5. Indexes:
   - `record_no` unique.
   - `(store_code, payment_time)`.
   - `(receiver_username, payment_time)`.
   - `(currency_code, payment_method, payment_time)`.
   - `(status, payment_time)`.
   - Optional `order_no` / `sale_no` indexes after query needs are confirmed.
6. g197/g198 constraints:
   - Entity fields must match real DB columns.
   - Any unique constraint must avoid nullable columns or use an approved partial unique design.

## 13. Single-Store Gray Data Preparation Checklist

| Data Item | Readiness | Required User/DB Confirmation |
| --- | --- | --- |
| Pilot store | pending | Confirm `STORE-VTE-001 / 万象直营店` exists and is the approved pilot. |
| Store company | pending | Confirm final parent company after G113: `COMP-LAO-FOOD` vs `COMP-LAO-AGRI`. |
| Store manager/admin | pending | Identify user(s) and role(s), likely `ROLE_STORE_MGR`, with own-store scope. |
| Store clerk | pending | Identify cashier/clerk user(s), likely `ROLE_CASHIER`, and bind to pilot store. |
| Finance confirmer | pending | Identify finance role/user, likely `ROLE_FIN_ACCT`, `ROLE_FIN_CFO`, `ROLE_GROUP_FINANCE`, or `ROLE_HQ_FINANCE`. |
| Collection account | pending | Select or create later, after approval, from `fin_cash_accounts` or new `store_payment_accounts`. |
| Collection QR code | gap | Requires attachment/reference design and finance-maintained QR image. |
| Currency | partial | Confirm active currencies in `SYS_CURRENCY`, likely LAK/RMB/USD as required. |
| Payment method | partial | Decide whether to reuse `SAL_PAY_METHOD`, `FIN_RECEIPT_METHOD`, or create `STORE_PAYMENT_METHOD`. |
| Attachment upload permission | partial | JWT upload exists; record-level ACL not present. |
| Query permission | gap | New menu/permission needed for store payment records. |
| Audit permission | partial | `sys_operation_logs` exists; new rules/events needed. |
| Optional order link | partial | Use `sal_sales_orders.order_no`. |
| Optional POS sale link | partial | Use POS/store sale `sale_no`; defer stronger receipt binding to MVP-2. |

## 14. Questions Still Requiring User Confirmation

1. Is `万象直营店` the final MVP-1 pilot store, and is its canonical code `STORE-VTE-001`?
2. Which company should `STORE-VTE-001` belong to for this MVP: `COMP-LAO-FOOD` or `COMP-LAO-AGRI`?
3. Should MVP-1 use `store_code` from `mst_stores`, `sys_organizations.org_code`, or another canonical store identifier?
4. Which user(s) are the store clerk(s), store manager(s), and finance confirmer(s)?
5. Should collection accounts reference existing `fin_cash_accounts`, or be independent company collection-code records with optional finance-account linkage?
6. Which payment-method dictionary is canonical for MVP-1: `SAL_PAY_METHOD`, `FIN_RECEIPT_METHOD`, or a new `STORE_PAYMENT_METHOD`?
7. Is bare URL attachment storage acceptable for MVP-1, or must screenshots be served through a protected business-record endpoint from day one?
8. Should rejected records be supported in MVP-1 in addition to `PENDING_CONFIRM`, `CONFIRMED`, and `VOIDED`?
9. Should confirmed records ever be editable, or only voided/corrected through separate records?
10. Should QR code images be retained forever with the payment account/code, or should a replacement history be maintained?

## 15. Frozen Items Touched

No.

This task did not modify `apps/api/**`, `apps/web/**`, schema, migrations, entities, DTOs, controllers, services, deployment files, or database state.

## 16. Schema Gate Decision Recommendation

**YES WITH CONDITIONS**

Conditions:

1. User confirms the pilot store and company mapping.
2. A2 reviews the role/menu/attachment ACL design before implementation.
3. Schema Gate approves new table/field design and nullable unique strategy.
4. Finance confirms the boundary between operational payment records and formal AR/cash postings.
5. Attachment permission model is explicitly accepted.

## 17. A2/A3/A4/A6/A7 Start Recommendation

**NO**

Do not start A2/A3/A4/A6/A7 in this round. Wait for user review of this A5 report, pilot-store confirmation, and explicit Schema Gate approval.

## 18. Write/Deployment Statement

| Item | Result |
| --- | --- |
| Database write | No |
| INSERT/UPDATE/DELETE/ALTER/DROP/CREATE executed against DB | No |
| Migration added | No |
| Application code changed | No |
| Deployment | No |
| A1 blocker touched | No |
| A2/A3/A4/A6/A7 started | No |


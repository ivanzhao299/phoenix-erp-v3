# Schema Gate Checklist: Unified Store Payment Code 001

> Purpose: pre-checklist only. This document designs Schema Gate questions; it does not approve migration or schema changes.

## Gate Status

| Field | Value |
| --- | --- |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| MVP | MVP-1: 直营店统一公司收款码人工收款记录管理 |
| Current status | Pending user approval to enter Schema Gate |
| Migration allowed now | No |
| Entity/table/column changes allowed now | No |
| Recommended first Agent | A5-Data-Readiness read-only audit, only after user approval |

## 1. Is A New Table Truly Needed?

Questions for Schema Gate:

1. Does an existing payment/receipt table already support store-scoped operational collection records?
2. Does any existing table support `PENDING_CONFIRM` versus `CONFIRMED` without becoming formal finance receipt?
3. Can existing attachment references cover payment screenshot evidence with record-level permission?
4. Can existing POS/order fields be optional references without creating coupling?
5. Can collection account/code data be represented by existing master data or finance account tables?

No schema design may proceed until A5 read-only validation answers these.

## 2. Existing Table Reuse Review

| Area | Reuse question | Owner |
| --- | --- | --- |
| Receipt/payment | Can existing finance receipt tables be used without implying formal accounting receipt? | A5/A3 later |
| Attachment | Can current attachment system store payment screenshots with permission inheritance? | A5/A2 later |
| Store | Can existing `mst_stores` or equivalent store data support pilot scope? | A5 later |
| User/role | Can existing RBAC/DataScope represent clerk, manager, finance, admin boundaries? | A5/A2 later |
| Order/receipt | Are sales order number and POS receipt number already available as stable optional references? | A5/A3 later |

## 3. Design-Only Entity Candidates

These names are design candidates only:

1. `store_payment_accounts`
2. `store_payment_records`
3. `store_payment_audit` or reuse `sys_audit_log`
4. attachment reference through existing attachment subsystem

## 4. Field Draft: `store_payment_accounts`

| Field | Notes |
| --- | --- |
| id | Surrogate key if local convention requires. |
| account_code | Unique business code; NOT NULL if unique. |
| account_name | Display name. |
| company_code | Owning company. |
| store_code | Optional store binding; nullable only if group-level account is allowed. |
| payment_method | Dictionary-backed payment method. |
| currency_code | Dictionary/master-data-backed currency. |
| qr_attachment_id | Optional QR/payment-code image reference. |
| account_masked | Masked account identifier, never full secret if sensitive. |
| status | ACTIVE / DISABLED. |
| created_by / created_at | Audit fields. |
| updated_by / updated_at | Audit fields. |

## 5. Field Draft: `store_payment_records`

| Field | Notes |
| --- | --- |
| id | Surrogate key if local convention requires. |
| record_no | Unique business record number. |
| company_code | Company scope. |
| store_code | Store scope. |
| account_code | Selected company collection account/code. |
| receiver_user_id / receiver_username | Clerk who recorded payment. |
| payment_method | Dictionary-backed payment method. |
| currency_code | Payment currency. |
| amount | Positive numeric amount. |
| payment_time | Customer payment time. |
| screenshot_attachment_id | Required payment screenshot. |
| order_no | Optional. |
| receipt_no | Optional. |
| status | PENDING_CONFIRM / CONFIRMED / VOIDED. |
| confirmed_by / confirmed_at | Confirmation audit. |
| voided_by / voided_at / void_reason | Optional void policy. |
| remarks | Optional. |
| created_by / created_at | Audit fields. |
| updated_by / updated_at | Audit fields. |

## 6. Audit Design

Option A: reuse `sys_audit_log`.

Option B: design `store_payment_audit` only if existing audit log cannot represent record-level events.

Required events:

1. Account/code create/update/enable/disable.
2. Payment record create.
3. Screenshot attachment upload/change.
4. Payment record confirm.
5. Payment record void/correction if later allowed.
6. Permission denied for record or attachment access.

## 7. Index Draft

Design-only candidates:

1. `store_payment_accounts(account_code)` unique.
2. `store_payment_accounts(company_code, store_code, status)`.
3. `store_payment_records(record_no)` unique.
4. `store_payment_records(store_code, payment_time)`.
5. `store_payment_records(receiver_username, payment_time)`.
6. `store_payment_records(currency_code, payment_method, payment_time)`.
7. `store_payment_records(status, payment_time)`.
8. Optional `(order_no)` / `(receipt_no)` indexes only if query requirements justify them.

All unique constraints must follow nullable-in-unique rules; nullable unique columns need an approved design or non-null placeholder.

## 8. Permission Menu Draft

Design-only permission candidates:

| Permission | Purpose |
| --- | --- |
| MENU_STORE_PAYMENT:V | View authorized store payment records. |
| MENU_STORE_PAYMENT:C | Create payment records. |
| MENU_STORE_PAYMENT:E | Edit pending records, if allowed. |
| MENU_STORE_PAYMENT:CONFIRM | Confirm records. |
| MENU_STORE_PAYMENT:VOID | Void records, if later allowed. |
| MENU_STORE_PAYMENT_ACCOUNT:V | View collection accounts/codes. |
| MENU_STORE_PAYMENT_ACCOUNT:E | Maintain collection accounts/codes. |

Permission names are drafts and require A2 review before implementation.

## 9. Migration Risk

1. New tables introduce DataScope, RBAC, audit, and attachment permission requirements.
2. Payment records may later be confused with finance receipts unless naming and status are clear.
3. Nullable unique columns must follow g198 rules.
4. Entity fields must match actual DB columns; no decorative entity fields.
5. Any seed data must avoid business data in migration unless explicitly approved by migration policy.

## 10. Rollback Risk

1. Dropping tables after pilot could lose audit evidence; prefer disable/read-only rollback.
2. Confirmed records must remain traceable even if feature is disabled.
3. Attachment cleanup needs a clear retention rule before deletion.
4. Finance must validate no duplicate or missing receipt evidence after rollback.

## 11. Data Initialization Needs

1. Pilot store master data must exist.
2. Pilot users and roles must exist.
3. Company collection accounts/codes must be prepared by finance/admin.
4. Payment methods and currencies must be available.
5. Attachment storage must be available and permission-aware.

## 12. Gray Data Preparation

Before implementation:

1. User selects one pilot store.
2. Store manager and clerk test accounts are identified.
3. Finance confirmation user is identified.
4. At least one active company collection account/code is prepared for pilot.
5. Manual fallback process is documented.

## 13. User Approval Required

1. Approve starting A5 read-only audit.
2. Select pilot store.
3. Approve entering Schema Gate.
4. Approve whether new tables/fields are allowed after A5 findings.
5. Approve migration implementation in a separate task if needed.
6. Approve any permission menu additions.
7. Approve any seed/init data path.

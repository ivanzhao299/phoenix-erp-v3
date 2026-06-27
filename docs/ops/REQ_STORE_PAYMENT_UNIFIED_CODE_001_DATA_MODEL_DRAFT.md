# Data Model Draft: Unified Store Payment Code 001

> Draft only. This is not migration code and does not approve schema/entity/table/column changes.

## Model A: `store_payment_accounts`

### Add Or Reuse

Recommendation: add a new store-payment account/code table if Schema Gate is approved, with optional reference to `fin_cash_accounts`.

Do not overload `fin_cash_accounts` directly because it is a finance cash account master and lacks store QR code lifecycle, payment method, store binding, and clerk-facing enabled-code semantics.

### Relationship To `fin_cash_accounts`

| Option | Recommendation | Notes |
| --- | --- | --- |
| Directly reuse `fin_cash_accounts` only | Not recommended | Missing store binding, QR attachment, and collection-code status semantics. |
| New `store_payment_accounts` references `fin_cash_accounts.account_code` or id | Recommended with finance approval | Keeps finance account source authoritative while allowing store-code lifecycle. |
| Fully independent collection-code table | Acceptable if finance account linkage is deferred | Still needs later reconciliation design. |

### Field Draft

| Field | Draft rule |
| --- | --- |
| id | Internal primary key if local convention requires. |
| account_code | Business code, NOT NULL, unique or scoped unique by company/store. |
| account_name | Display name. |
| company_code | Required company scope. |
| store_code | Optional for group-level code, required for one-store-one-code if user chooses that model. |
| cash_account_code | Optional reference to `fin_cash_accounts.account_code`. |
| payment_method | Required dictionary value; dictionary decision pending. |
| currency_code | Required active currency. |
| qr_attachment_id / qr_attachment_url | QR/payment-code proof; final field depends on attachment ACL decision. |
| masked_account_no | Masked account/wallet identifier only. |
| status | ACTIVE / DISABLED. |
| effective_from / effective_to | Optional validity window. |
| remarks | Optional non-sensitive note. |
| created_by / created_at | Required audit fields. |
| updated_by / updated_at | Required audit fields. |

### Store Relationship

1. `store_code` must use the canonical store identifier approved by Schema Gate.
2. A group-level code may use empty string or approved nullable strategy only if unique constraints remain safe.
3. Store clerks can only select ACTIVE accounts/codes allowed for their pilot store.

### Attachment / QR Relationship

1. QR code images must not be exposed as unaudited bare URLs in restricted pages.
2. Prefer protected attachment reference if screenshots/QR code images are treated as sensitive.
3. QR replacement should be audited; replacement history can be deferred unless finance requires it.

### Status And Audit

1. ACTIVE accounts/codes can be selected.
2. DISABLED accounts/codes cannot be selected for new records but remain visible on historical records.
3. Create/update/enable/disable must be audited.

## Model B: `store_payment_records`

### Add Or Reuse

Recommendation: add a new operational record table if Schema Gate is approved.

Do not reuse `fin_ar_receipts` because MVP-1 records are not formal finance receipts and confirmed records still do not auto-post to finance.

### Field Draft

| Field | Draft rule |
| --- | --- |
| id | Internal primary key if local convention requires. |
| record_no | Business record number, NOT NULL, unique. |
| company_code | Required company scope. |
| store_code | Required pilot/store scope. |
| account_code | Required selected company collection account/code. |
| receiver_user_id | Required recorder user id if available. |
| receiver_username | Required recorder username for query/audit compatibility. |
| payment_method | Required dictionary value. |
| currency_code | Required active currency. |
| amount | Required positive amount. |
| payment_time | Required customer payment time. |
| screenshot_attachment_id / screenshot_attachment_url | Required payment screenshot reference; final design depends on attachment ACL. |
| order_no | Optional sales order reference. |
| sale_no / receipt_no | Optional POS sale or sales receipt reference; final term pending MVP-2. |
| status | PENDING / CONFIRMED / REJECTED / VOIDED, pending final naming. |
| reject_reason | Required if rejected. |
| void_reason | Required if voided. |
| confirmed_by / confirmed_at | Required for confirmed records. |
| rejected_by / rejected_at | Required for rejected records. |
| voided_by / voided_at | Required for voided records. |
| remarks | Optional; sanitize in logs. |
| created_by / created_at | Required audit fields. |
| updated_by / updated_at | Required audit fields. |

### Index Draft

1. Unique `record_no`.
2. `(store_code, payment_time)`.
3. `(receiver_username, payment_time)`.
4. `(currency_code, payment_method, payment_time)`.
5. `(status, payment_time)`.
6. Optional `(order_no)` and `(sale_no)` only if MVP-1 query needs include them.
7. Optional `(account_code, payment_time)` for account-level reconciliation.

### Status Relationship

1. Create always starts as PENDING.
2. Store manager/finance can confirm or reject.
3. Void is high risk and should require separate permission and reason.
4. Confirmed records should not be silently edited.

## Model C: Audit

### Add `store_payment_audit`?

Recommendation: do not add by default.

Prefer reusing `sys_operation_logs` because it already stores actor, role, business type/id/no, action, path, result, and after-data. Add a dedicated audit table only if review decides the UI requires a complete immutable per-record timeline that cannot be reliably reconstructed from operation logs.

### Recommended Audit Reuse

| Event | biz_type | action |
| --- | --- | --- |
| Account/code create | STORE_PAYMENT_ACCOUNT | CREATE |
| Account/code update | STORE_PAYMENT_ACCOUNT | MODIFY |
| Account/code enable | STORE_PAYMENT_ACCOUNT | ENABLE |
| Account/code disable | STORE_PAYMENT_ACCOUNT | DISABLE |
| Payment record create | STORE_PAYMENT_RECORD | CREATE |
| Proof upload | STORE_PAYMENT_ATTACHMENT | UPLOAD |
| Proof replace | STORE_PAYMENT_ATTACHMENT | REPLACE |
| Confirm | STORE_PAYMENT_RECORD | CONFIRM |
| Reject | STORE_PAYMENT_RECORD | REJECT |
| Void | STORE_PAYMENT_RECORD | VOID |
| Export | STORE_PAYMENT_RECORD | EXPORT |
| Access denied | STORE_PAYMENT_RECORD / STORE_PAYMENT_ATTACHMENT | ACCESS_DENIED |

### Audit Requirements

1. Service-level audit is preferred for confirm/reject/void.
2. Field-level masking is required before writing logs.
3. Do not log screenshot raw URLs, QR payloads, full account numbers, or full free-text remarks.

## Model D: Attachment

### Reuse Existing Attachment System

Recommendation: reuse upload mechanics but not unaudited direct URL access as the permission model.

Existing upload and `AttachmentUploader` can support image upload, but payment screenshot access must follow payment-record permission.

### ACL Design Choices

| Option | Recommendation | Notes |
| --- | --- | --- |
| Store bare URL on payment record | Not recommended unless user accepts risk | Simple but weak ACL; screenshot URLs may leak. |
| Store attachment reference on record and serve through protected endpoint | Recommended | Enforces record-level RBAC/DataScope on preview/download. |
| Add generic biz attachment table | Recommended if broader attachment ACL is desired | More reusable, but higher schema scope. |

### Bare URL Risk Controls

1. Do not render raw screenshot URL directly in list/export.
2. Do not log raw URL or storage key.
3. Attachments must be accessed through permission-checked business endpoint if screenshots are sensitive.
4. Attachment permission denial must be audited.

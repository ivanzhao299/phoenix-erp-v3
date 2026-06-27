# Requirement Spec: Unified Store Payment Code 001

> Current stage: Spec Frozen Draft / pending Schema Gate.
> This document is reviewable, but it is not implementation approval.

## Requirement Header

| Field | Value |
| --- | --- |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| MVP-1 name | 直营店统一公司收款码人工收款记录管理 |
| Current stage | Spec Frozen Draft / 待 Schema Gate |
| Risk level | L5 overall; MVP-1 may enter L4 schema-gated implementation preparation only after approval |
| Pilot strategy | 单店灰度；试点门店待用户最终指定 |
| Pilot candidates | 万象直营店 / 孟赛直营店 / 琅勃拉邦直营店 |
| Implementation approval | Not granted |
| Migration/schema approval | Not granted; all migration / schema / entity / table / column work must enter a separate Schema Gate |

## Source Requirement

> 老挝直营店现在收款码分散，很多店员用个人收款码收款，后续不好对账，也不好监管。我希望先做一个统一收款管理方案：先不一定马上自动对接银行或支付平台，第一步可以先把每个门店的公司收款码、收款账户、收款人、门店、币种、付款截图、付款时间、金额、订单或销售小票关联起来。店员上传或录入后，ERP 里能形成收款记录，管理人员能按门店、日期、收款人、币种、支付方式查询。后续再考虑和 POS、库存、财务、用友好业财对接。

## User Decisions

| Decision area | Finalized MVP-1 scope |
| --- | --- |
| Schema | May design new tables/fields, but must not implement migration until Schema Gate approval. |
| Pilot store | Single-store gray design only; exact store remains pending user selection. |
| Account/code maintenance | Finance admin or system admin maintains company collection accounts/codes. Store clerks can only select enabled accounts/codes. |
| Record confirmation | Clerk-created records start as `PENDING_CONFIRM`; store manager or finance confirms to `CONFIRMED`. |
| Finance boundary | Unconfirmed records are excluded from formal finance receipt scope. |
| Order/receipt link | Optional in MVP-1; mandatory POS/sales receipt binding is deferred to MVP-2. |
| Attachment | Payment screenshot is required; use existing attachment system or a designed attachment reference. |
| Attachment permission | Follows payment record permission. |
| Retention | Long-term business data retention for now; archive policy deferred. |
| Explicit exclusions | No third-party callback, bank auto-arrival, auto reconciliation, inventory linkage, Chanjet sync, all-store forced rollout, POS mandatory binding, or production deployment. |

## Business Background

Laos direct stores currently have scattered collection QR codes, and some clerks use personal collection codes. This weakens reconciliation, supervision, finance confirmation, and future integration with POS, inventory, and finance.

MVP-1 creates a controlled internal ERP collection record workflow. It is not a payment gateway integration and must not imply automatic finance settlement.

## Business Goal

1. Replace personal-code collection practice with selectable company collection accounts/codes.
2. Allow clerks to record customer payments with evidence.
3. Keep records in `PENDING_CONFIRM` until store manager or finance confirms.
4. Allow managers to query by store, date, receiver, currency, and payment method.
5. Build a safe foundation for later POS, finance, inventory, and Chanjet phases.

## Core Process

1. Finance/admin maintains company collection accounts and collection codes.
2. Clerk selects store, collection account, currency, and payment method, then enters amount and payment time.
3. Clerk uploads payment screenshot.
4. Clerk optionally links an order or sales receipt.
5. System creates a `PENDING_CONFIRM` payment record.
6. Store manager or finance confirms the record.
7. Managers query by store, date, receiver, currency, and payment method.
8. All key operations are written to audit logs.

## Users And Roles

| Role | MVP-1 permission boundary |
| --- | --- |
| Store clerk | Create own payment records; view own or permitted store-scope records; cannot maintain collection accounts/codes. |
| Store manager | View and confirm own-store payment records. |
| Finance | View and confirm all-store payment records according to approved finance permission. |
| Admin | Maintain collection accounts/codes and view all records. |
| Audit/operations | View reports according to RBAC and DataScope. |

All operations must be constrained by RBAC and DataScope.

## Page Requirements

1. Collection account/code maintenance page for finance/admin only.
2. Payment record list with filters: store, date range, receiver, currency, payment method, status.
3. Payment record create form for clerks.
4. Payment screenshot upload control using the existing attachment system or designed attachment reference.
5. Payment detail page showing record fields, attachment, status, confirmation info, and audit timeline.
6. Confirm action for store manager/finance only.

## API Requirements

1. Query APIs must enforce RBAC and DataScope.
2. Create API must create `PENDING_CONFIRM` records only.
3. Confirm API must be limited to store manager/finance roles.
4. Account/code maintenance APIs must be limited to finance/admin roles.
5. Attachment access must follow payment record permission.
6. Order/sales receipt association is optional and must not require POS coupling in MVP-1.
7. No third-party payment callback API in MVP-1.

## Data Requirements

### Store Payment Account / Code

Design-only pending Schema Gate:

| Field | Notes |
| --- | --- |
| account_code | Stable company collection account/code identifier. |
| account_name | Display name. |
| store_code | Optional store binding if one-store-one-code is adopted. |
| payment_method | Cash / transfer / QR / BCEL One / other, pending dictionary review. |
| currency_code | LAK / RMB / USD or active currency dictionary value. |
| qr_code_attachment_id / qr_code_url | Design pending attachment decision. |
| status | ACTIVE / DISABLED. |
| maintained_by | Finance/admin user. |
| created_at / updated_at | Audit timestamps. |

### Store Payment Record

Design-only pending Schema Gate:

| Field | Notes |
| --- | --- |
| record_no | Business record number. |
| store_code | Store where payment was received. |
| account_code | Selected company collection account/code. |
| receiver_user_id / receiver_username | Clerk who recorded payment. |
| currency_code | Payment currency. |
| payment_method | Payment method. |
| amount | Payment amount. |
| payment_time | Customer payment time. |
| screenshot_attachment_id | Required payment screenshot evidence. |
| order_no | Optional sales order reference. |
| receipt_no | Optional POS/sales receipt reference. |
| status | PENDING_CONFIRM / CONFIRMED / VOIDED. |
| confirmed_by / confirmed_at | Confirmation audit fields. |
| voided_by / voided_at / void_reason | Void audit fields if later allowed. |
| created_by / created_at / updated_by / updated_at | Standard audit fields. |

## Permission Requirements

1. Store clerks cannot create, edit, disable, or delete collection accounts/codes.
2. Store clerks can only create payment records using enabled company accounts/codes.
3. Store managers can confirm only own-store records.
4. Finance can confirm all-store records.
5. Admin can maintain accounts/codes and view all records.
6. Attachment download/preview must apply the same record-level permission.
7. Confirmed records must not be silently modified; adjustment or void policy requires separate approval.

## Audit Log Requirements

Audit events required:

1. Account/code create, update, enable, disable.
2. Payment record create.
3. Screenshot upload/change.
4. Payment record confirm.
5. Payment record void or correction, if allowed later.
6. Permission denial for record or attachment access.

Audit logs must include actor, role, store, action, timestamp, record id, before/after summary, and reason where applicable. Logs must not expose secrets, payment tokens, or full sensitive credentials.

## Finance Impact

MVP-1 produces operational payment records only.

1. `PENDING_CONFIRM` records are not formal finance receipts.
2. `CONFIRMED` records are still not automatically posted to finance unless a later MVP explicitly approves finance integration.
3. No automatic AR settlement.
4. No Chanjet / Yonyou / 好业财 sync in MVP-1.

## Master Data Impact

MVP-1 depends on:

1. Store master data.
2. User and role data.
3. Company collection account/code data.
4. Currency dictionary or existing currency master.
5. Payment method dictionary.
6. DataScope for store visibility.
7. Attachment storage/reference policy.

A5 read-only validation is recommended before Schema Gate.

## Third-Party Interface Impact

MVP-1 explicitly has no third-party callback, no bank auto-arrival, and no payment platform reconciliation. MVP-4 must separately define signature verification, token rotation, replay protection, retry, idempotency, and environment separation.

## MVP Roadmap

| MVP | Scope | Status |
| --- | --- | --- |
| MVP-1 | 直营店统一公司收款码人工收款记录管理 | Spec Frozen Draft / pending Schema Gate |
| MVP-2 | POS / sales receipt association hardening | Deferred |
| MVP-3 | Finance receipt / Chanjet integration | Deferred |
| MVP-4 | Payment callback / auto reconciliation | Deferred |

## MVP-1 Explicit Non-Goals

1. No third-party payment callback.
2. No bank automatic arrival confirmation.
3. No automatic reconciliation.
4. No inventory linkage.
5. No Yonyou/Chanjet/好业财 sync.
6. No all-store forced switch.
7. No mandatory POS binding.
8. No production deployment.
9. No migration/schema/entity/table/column implementation until Schema Gate approval.
10. No A1 blocker fix.

## Acceptance Standards

| Area | Standard |
| --- | --- |
| Frontend | Entry, list, detail, screenshot upload, confirm action, and filters are defined; no UI implies auto payment callback or auto finance settlement. |
| Backend | Lifecycle is explicit: create as pending, confirm by authorized role, query with DataScope, no auto finance posting. |
| Security | RBAC/DataScope enforced; attachment permission follows record permission; admin-only account maintenance; audit logs required. |
| Data | Schema design reviewed by Schema Gate before implementation; payment screenshot required; optional order/receipt reference. |
| Finance | Unconfirmed records excluded from formal finance scope; confirmed records do not auto-post to finance in MVP-1. |
| Deployment | Single-store gray only; pilot store must be specified before development; no production deploy in this phase. |
| Rollback | New entry can be disabled; existing records remain read-only evidence; manual process remains available. |

## Gray Launch Plan

1. User selects exactly one pilot store from 万象直营店 / 孟赛直营店 / 琅勃拉邦直营店 or another approved store.
2. Enable only approved roles for that store.
3. Keep old/manual verification process available during pilot.
4. Reconcile daily between ERP payment records and actual account receipts.
5. Expand only after finance, store manager, and operations sign-off.

## Rollback Plan

1. Disable the MVP-1 menu or feature switch.
2. Stop new payment record creation.
3. Preserve existing records as read-only evidence.
4. Return store to manual verification process.
5. Finance validates no duplicate, missing, or incorrectly confirmed receipt records.

## Remaining User Approvals

1. Final pilot store.
2. Whether to start A5-Data-Readiness read-only validation.
3. Whether to enter Schema Gate.
4. Whether Schema Gate may design new tables/fields.
5. Whether implementation may start after Schema Gate.

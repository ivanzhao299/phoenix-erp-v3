# Schema Gate Proposal: Unified Store Payment Code 001

## Schema Gate Goal

Prepare a reviewable Schema Gate proposal for `REQ-STORE-PAYMENT-UNIFIED-CODE-001` MVP-1: `直营店统一公司收款码人工收款记录管理`.

This proposal is for user decision only. It does not approve implementation, create migrations, change schema, add entities, seed menus, write data, or start A3/A4/A6/A7.

## A5 Data Readiness Summary

| Area | A5 finding |
| --- | --- |
| Store data | `mst_stores` and `sys_organizations` STORE nodes exist conceptually; `STORE-VTE-001 / 万象直营店` appears in code/docs but DB existence and company mapping need confirmation. |
| Finance account reuse | `fin_cash_accounts` is a good underlying finance account reference, but lacks store binding, QR attachment, payment method, and company collection-code lifecycle. |
| Existing receipt tables | `fin_ar_receipts` is formal finance AR receipt and is unsafe for MVP-1 pending operational records. |
| POS reuse | POS payment completion writes inventory/cash/AR and is out of MVP-1 scope. |
| Attachments | Upload component/API exist, but no generic business-record ACL was found for screenshot access. |
| DataScope | Store-level scope is not first-class; service-level store filtering must be designed. |
| Audit | `sys_operation_logs` exists and can likely be reused with explicit biz/action rules. |
| Recommendation | YES WITH CONDITIONS. |

## A2 Security Design Summary

| Area | A2 finding |
| --- | --- |
| RBAC | Dedicated `MENU_STORE_PAYMENT` and `MENU_STORE_PAYMENT_ACCOUNT` are recommended; `MENU_STORE_POS` must not be reused. |
| Permissions | Confirm/reject should use approval-style permission; export should be explicit; void should be separate or strongly gated. |
| DataScope | Clerk/manager access must not rely on company scope only; canonical `store_code` and service-level checks are required. |
| Attachments | Bare URL access is not sufficient for payment screenshots if record-level ACL is required. |
| Audit | Prefer `sys_operation_logs`, but add explicit store-payment path rules or service-level audit writes and field redaction. |
| State machine | `PENDING_CONFIRM -> CONFIRMED/REJECTED/VOIDED`; reverse confirmation is not recommended for MVP-1. |
| Recommendation | YES WITH CONDITIONS. |

## Is A New Table Required?

Recommendation: **Yes, with conditions.**

Reasons:

1. No existing operational store payment record table matches MVP-1 lifecycle.
2. `fin_ar_receipts` would incorrectly imply formal finance receipt behavior.
3. POS sale/payment paths have side effects in finance and inventory.
4. `fin_cash_accounts` can be referenced, but overloading it with store QR code lifecycle would blur finance master data and store operational code management.
5. Payment screenshots require record-level permission that is not represented by existing bare URL storage alone.

## Reuse Assessment

| Existing object | Reuse decision | Notes |
| --- | --- | --- |
| `fin_cash_accounts` | Partial reuse | Reference as optional underlying finance account; do not overload as store collection-code table unless finance approves. |
| `mst_stores` | Reuse | Use as store master source after pilot DB confirmation. |
| `sys_organizations` | Reuse | Use STORE org nodes and company hierarchy after canonical store-code decision. |
| Attachment upload / `AttachmentUploader` | Partial reuse | Upload mechanics can be reused; record-level ACL/protected access must be designed. |
| `sys_operation_logs` | Reuse preferred | Use explicit `biz_type` and action rules; service-level writes for confirm/reject/void are preferred. |
| `mst_audit_trail` | Conditional | Use only if account/code maintenance is implemented as master-data-like runtime. |
| `fin_ar_receipts` | Do not reuse | Formal finance receipt behavior conflicts with MVP-1 operational pending records. |
| POS payment completion | Do not reuse | It writes inventory/cash/AR and violates MVP-1 exclusions. |

## Recommended New Objects

| Object | Recommendation | Purpose |
| --- | --- | --- |
| `store_payment_accounts` | Add, if Schema Gate approved | Store-maintained company collection account/code configuration with optional `fin_cash_accounts` reference, QR attachment, payment method, currency, store binding, and ACTIVE/DISABLED lifecycle. |
| `store_payment_records` | Add, if Schema Gate approved | Operational manual payment record with pending/confirmed/rejected/voided lifecycle, screenshot proof, optional order/sale reference, and confirmation fields. |
| `store_payment_audit` | Do not add by default | Prefer `sys_operation_logs`; add only if timeline reconstruction cannot be satisfied. |
| Protected attachment reference | Add or design, conditionally | Required if bare URL access is rejected. Could be field-level reference plus protected proxy endpoint, or a generic biz attachment table. |

## Objects Not Recommended

1. Do not add formal finance receipt rows for MVP-1.
2. Do not add POS payment completion coupling.
3. Do not add Chanjet/Yonyou sync objects.
4. Do not add inventory linkage.
5. Do not add all-store rollout seed data.
6. Do not seed permission/menu data until user approves schema implementation and permission design.

## Migration Risk

1. New operational payment tables may later be confused with finance receipts unless naming and finance boundary are explicit.
2. Store-level DataScope is not first-class; implementation must not rely on company scope for clerk/manager access.
3. Attachment screenshots are sensitive; bare URL exposure is a security risk.
4. `store_code` semantics are overloaded and must be finalized before table design.
5. Unique constraints must comply with nullable-in-unique policy.
6. Entity fields must match DB columns; no decorative entity fields.
7. Permission/menu seeds are not allowed in this proposal and require separate approval.

## Rollback Risk

1. Dropping tables after pilot could destroy payment evidence; prefer feature-disable/read-only rollback.
2. Confirmed records must remain auditable after rollback.
3. Screenshot retention and protected access must survive feature disable.
4. Finance must validate no duplicate/missing confirmed evidence after rollback.
5. If account/code data is reused from `fin_cash_accounts`, rollback must not mutate finance account master data.

## Gray Strategy

1. Single-store gray only.
2. Pilot store remains user-selected; candidates remain 万象直营店 / 孟赛直营店 / 琅勃拉邦直营店.
3. Confirm canonical `store_code`, parent company, clerk user, manager user, and finance confirmer before implementation.
4. Enable menus only for pilot roles.
5. Keep old/manual verification path available.
6. Expand only after store manager, finance, and operations sign-off.

## Human Approval Items

1. Approve whether to enter schema implementation.
2. Select pilot store and confirm canonical `store_code`.
3. Confirm parent company mapping for pilot store.
4. Approve `store_payment_accounts` and `store_payment_records`.
5. Decide whether `store_payment_audit` is unnecessary because `sys_operation_logs` is sufficient.
6. Decide attachment ACL approach: bare URL unacceptable vs protected endpoint/reference.
7. Approve permission/menu code names and whether `MENU_STORE_PAYMENT_VOID` is separate.
8. Approve status machine, including whether `REJECTED` is MVP-1.
9. Approve payment method dictionary strategy.
10. Approve migration and seed scope in a separate implementation task.

## Forbidden In This Proposal

1. No application code changes.
2. No migration creation.
3. No schema/entity/table/column change.
4. No menu or permission seed.
5. No database write.
6. No payment platform integration.
7. No finance posting or Chanjet sync.
8. No A3/A4/A6/A7 start.
9. No deployment, merge, or push.

## Decision Recommendation

**YES WITH CONDITIONS**

Enter schema implementation only if:

1. User approves schema implementation explicitly.
2. Pilot store and canonical store identifier are confirmed.
3. Attachment ACL approach is selected.
4. Dedicated RBAC/menu matrix is approved.
5. `sys_operation_logs` reuse versus dedicated audit table is approved.
6. Finance confirms `fin_cash_accounts` reference strategy and finance-boundary wording.

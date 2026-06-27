# Frontend Draft: Unified Store Payment Code 001

> Draft only. Do not implement frontend code from this document without explicit user approval.

## Menu Entry

| Menu | Purpose | Roles |
| --- | --- | --- |
| Store Payment Records | Create/query/confirm manual store payment records. | Clerk, manager, finance, admin according to permission. |
| Store Payment Accounts | Maintain company collection accounts/codes. | Finance admin, system admin. |

## Page Structure

1. Payment account/code maintenance page.
2. Payment record list page.
3. Payment record create form.
4. Payment record detail drawer/page.
5. Protected proof preview area.
6. Optional export action if MVP-1 includes export.

## Table Fields

1. record no
2. store
3. receiver
4. currency
5. payment method
6. amount
7. payment time
8. account/code
9. status
10. order no / sale no
11. proof indicator
12. created at
13. confirmed/rejected/voided info

## Query Conditions

1. store
2. date range
3. receiver
4. currency
5. payment method
6. status
7. account/code
8. order no / sale no, optional

## Form Fields

| Field | Required | Notes |
| --- | --- | --- |
| store | yes | Derived/limited by DataScope; pilot store default for clerk. |
| account/code | yes | Select ACTIVE company account/code only. |
| payment method | yes | Existing dict preferred. |
| currency | yes | Active currency. |
| amount | yes | Positive. |
| payment time | yes | Customer payment time. |
| proof screenshot | yes | Protected attachment flow. |
| order no | no | Optional. |
| sale no | no | Optional. |
| remarks | no | Avoid sensitive text. |

## Button Permissions

| Button | Permission |
| --- | --- |
| New record | `MENU_STORE_PAYMENT:C` |
| Edit pending | `MENU_STORE_PAYMENT:E` plus owner/status check |
| Confirm | `MENU_STORE_PAYMENT_CONFIRM:A` |
| Reject | `MENU_STORE_PAYMENT_CONFIRM:A` and reason |
| Void | `MENU_STORE_PAYMENT_VOID:A` and reason |
| Export | `MENU_STORE_PAYMENT_EXPORT:X`, if MVP-1 includes export |
| Maintain accounts | `MENU_STORE_PAYMENT_ACCOUNT:E` |
| View proof | `MENU_STORE_PAYMENT:V` plus record-level scope |

## Status Display

| Status | UI treatment |
| --- | --- |
| PENDING | Waiting for confirmation. |
| CONFIRMED | Confirmed, not auto-posted to finance. |
| REJECTED | Rejected with reason. |
| VOIDED | Voided and retained for audit. |

## Attachment Display

1. Do not display raw `/uploads` URL.
2. Preview through protected record-proof endpoint.
3. Show proof existence in table, not thumbnail if permission is uncertain.
4. Denied preview should show permission message and audit backend event.

## Role Views

### Store Clerk

1. Create payment record for assigned pilot store.
2. View own records and approved own-store records.
3. Edit own PENDING records if policy approves.
4. Cannot confirm/reject/void/export or maintain accounts.

### Store Manager

1. View own-store records.
2. Confirm/reject own-store PENDING records.
3. View proof for own-store records.
4. Export disabled by default.

### Finance

1. View authorized/all-store records.
2. Confirm/reject in finance scope.
3. Export only if granted.
4. No automatic finance posting in UI.

### Admin

1. Maintain account/code records.
2. View all records.
3. High-risk actions still require explicit buttons, reasons, and audit.

## Non-Goals

1. No frontend implementation in this planning stage.
2. No payment platform callback UI.
3. No automatic finance posting UI.
4. No inventory/POS forced binding.
5. No all-store rollout controls.

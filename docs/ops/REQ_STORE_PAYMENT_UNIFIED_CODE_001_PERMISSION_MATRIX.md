# Permission Matrix: Unified Store Payment Code 001

> Draft only. No menu seed, permission seed, or code change is approved by this document.

## Proposed Menus

| Menu code | Purpose | Required now? |
| --- | --- | --- |
| MENU_STORE_PAYMENT_ACCOUNT | Maintain company collection accounts/codes. | Yes, if MVP-1 account/code maintenance is implemented. |
| MENU_STORE_PAYMENT | View/create/edit operational store payment records. | Yes. |
| MENU_STORE_PAYMENT_CONFIRM | Confirm/reject payment records. | Recommended as separate menu for traceability, or map to `MENU_STORE_PAYMENT:A` if user chooses fewer menus. |
| MENU_STORE_PAYMENT_VOID | Void confirmed records. | Recommended because void is higher risk than confirm. |
| MENU_STORE_PAYMENT_EXPORT | Export payment records. | Optional; recommended only if export is in MVP-1. |

## Role Matrix

| Role | View | New | Edit | Confirm | Reject | Void | Export | Maintain account/code |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Store clerk | Own records and approved own-store records | Yes, own/pilot store only | Own PENDING only, if approved | No | No | No | No | No |
| Store manager | Own-store records | No by default | Own-store PENDING only, if approved | Own store | Own store, reason required | No by default | No by default | No |
| Finance | Authorized/all stores | No by default | No by default | Authorized/all stores | Authorized/all stores, reason required | With high-risk permission only | With export permission only | No by default |
| Admin | All records | No by default | Controlled/admin override only | Optional, audited | Optional, audited | With explicit permission | With export permission | Yes |

## Proposed Permission Bits

| Action | Menu / bit draft | Notes |
| --- | --- | --- |
| Record list/detail | `MENU_STORE_PAYMENT:V` | Must apply DataScope. |
| Record create | `MENU_STORE_PAYMENT:C` | Clerk create only for assigned pilot store. |
| Edit pending record | `MENU_STORE_PAYMENT:E` | Must check owner/store and PENDING status. |
| Confirm | `MENU_STORE_PAYMENT_CONFIRM:A` or `MENU_STORE_PAYMENT:A` | Store manager own-store; finance authorized/all stores. |
| Reject | `MENU_STORE_PAYMENT_CONFIRM:A` or `MENU_STORE_PAYMENT:A` | Reason required. |
| Void | `MENU_STORE_PAYMENT_VOID:A` | Higher risk; reason required. |
| Export | `MENU_STORE_PAYMENT_EXPORT:X` or `MENU_STORE_PAYMENT:X` | Audit filters, row count, actor, scope. |
| Account/code view | `MENU_STORE_PAYMENT_ACCOUNT:V` | Finance/admin view; clerk may use filtered selector without menu page. |
| Account/code maintain | `MENU_STORE_PAYMENT_ACCOUNT:E` | Finance/admin only. |

## DataScope Rules

1. Clerk create: request `store_code` must be derived from authenticated user/pilot binding, not trusted from body alone.
2. Clerk view: own records; own-store records only if approved by role policy.
3. Store manager view/confirm/reject: records where `store_code IN allowedStoreCodes`.
4. Finance view/confirm/reject: approved finance scope; all-store only for explicitly approved finance roles.
5. Admin: global by role, but every sensitive action remains audited.
6. Company scope alone is insufficient for clerk/manager views.
7. Schema Gate must decide canonical `store_code`: `mst_stores.store_code`, `sys_organizations.org_code`, or an approved mapping.

## Attachment View Rules

1. Attachment preview/download must reuse the same record-level permission as payment detail.
2. Clerk cannot view screenshots outside own record/approved own-store scope.
3. Store manager can view own-store screenshots.
4. Finance can view screenshots in approved finance scope.
5. Admin can view all, audited.
6. Export should not include raw screenshot URLs by default.
7. Attachment access denied events must be audited.

## Audit Requirements

| Action | Audit required | Reason required |
| --- | --- | --- |
| Account/code create/update/enable/disable | Yes | Optional for create/update; recommended for disable. |
| Payment record create | Yes | No |
| Edit pending record | Yes | Recommended if amount/store/account changes. |
| Confirm | Yes | No, unless policy wants confirmation note. |
| Reject | Yes | Yes |
| Void | Yes | Yes |
| Proof upload/replace | Yes | Replace should require reason if record was submitted/confirmed. |
| Export | Yes | No, but filters and row count required. |
| Permission denial | Yes | No |

## Open Approval Questions

1. Should `MENU_STORE_PAYMENT_CONFIRM` be a separate menu or use `MENU_STORE_PAYMENT:A`?
2. Should `MENU_STORE_PAYMENT_EXPORT` be in MVP-1?
3. Should `MENU_STORE_PAYMENT_VOID` be in MVP-1 or deferred?
4. Are clerks allowed to view all own-store records or only records they created?
5. Which finance roles get all-store confirmation permission?

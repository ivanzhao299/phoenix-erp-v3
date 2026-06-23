# Store Payment Runtime State

Last updated: 2026-06-23

## Current Decision

GO WITH CONDITIONS.

Store Payment is ready for controlled UAT smoke, not production deployment. File Metadata / ACL foundation is now available, and Store Payment protected attachment proxy endpoints can stream only when a valid `file_metadata.file_id` exists and ownership / RBAC / DataScope pass. Frontend preview/download remains disabled until a separate A4 Gate updates the UI.

## Completed Facts

1. Store Payment migration has been executed for the approved local target.
2. `store_payment_accounts` exists.
3. `store_payment_records` exists.
4. `MENU_STORE_PAYMENT_ACCOUNT` is registered.
5. `MENU_STORE_PAYMENT` is registered.
6. `MENU_STORE_PAYMENT_CONFIRM` is registered.
7. `MENU_STORE_PAYMENT_VOID` is registered.
8. `MENU_STORE_PAYMENT_EXPORT` is registered.
9. Store Payment role grants have been written: 23 grants.
10. Canonical store code is `STORE-VTE-001`.
11. Legacy alias is `ST-VTE-001`.
12. Store name is 万象直营店.
13. Company code is `COMP-LAO-AGRI`.
14. Pilot store payment accounts have been initialized as disabled / pending placeholders: 3.
15. A3 Backend Gate completed protected attachment controlled status endpoints.
16. Backend does not return raw URL for Store Payment proof / QR attachment access.
17. Backend preview/download remains disabled.
18. DataScope alias handling is in place for `STORE-VTE-001` and `ST-VTE-001`.
19. Store Payment action-bit alignment is V/E/X.
20. A4 Frontend Gate completed `/store-payment`.
21. A3 protected attachment Gate added Store Payment attachment status / preview / download routes.
22. Attachment status verifies Store Payment ownership, RBAC, and DataScope before returning controlled state.
23. Preview/download routes verify ownership, RBAC, and DataScope, then return a denied-safe not-implemented response.
24. File Metadata / ACL Gate created `file_metadata` and added `FileAccessService`.
25. Store Payment protected status / preview / download routes now use `file_metadata.file_id`.
26. Existing upload module still returns `/uploads/contracts/...`; it must not be used as a frontend preview/download URL.
27. Current `file_metadata` row count is 0; no seed was executed.

## Frontend State

- Page entry: `/store-payment`
- Menu entry: 销售管理 / 统一收款
- Account list: implemented.
- Payment record list: implemented.
- New payment record form: implemented.
- Detail drawer: implemented.
- Confirm / reject / void actions: implemented.
- Filters: status, date range, submitted by, account, payment method.
- Status labels: `pending`, `confirmed`, `rejected`, `voided`, `disabled`, `pending_config`, `access_pending`.
- UAT smoke instructions: implemented.

## Permission State

| Menu Code | Action Bit | Status |
| --- | --- | --- |
| `MENU_STORE_PAYMENT_ACCOUNT` | V/E | Implemented in frontend |
| `MENU_STORE_PAYMENT` | V/E | Implemented in frontend |
| `MENU_STORE_PAYMENT_CONFIRM` | V/E | Implemented in frontend |
| `MENU_STORE_PAYMENT_VOID` | V/E | Implemented in frontend |
| `MENU_STORE_PAYMENT_EXPORT` | X | Reserved; real export disabled |

## Attachment Safety State

- proof preview: disabled.
- proof download: disabled.
- QR preview: disabled.
- QR download: disabled.
- Raw URL exposure: forbidden.
- `/uploads` path construction: forbidden.
- `http(s)` attachment links: forbidden.
- Store Payment attachment status endpoint: implemented.
- Store Payment attachment preview/download: backend streaming implemented with ACL; usable only when metadata exists and checks pass.
- denied access audit: structured log implemented.
- frontend preview/download: still disabled pending A4 UI Gate.

## Current Conditions

- Controlled UAT may verify page rendering, permission visibility, disabled attachment behavior, and status flow UI.
- Frontend preview/download must not be enabled before A4 updates the UI and A2 reviews that UI path.
- Staging deployment requires a separate A6 runbook Gate.
- Final GO / HOLD / ROLLBACK requires a separate A7 Gate.

## Current Non-Goals

- No production deployment.
- No push.
- No remote production DB write.
- No frontend attachment preview / download yet.
- No raw URL exposure.
- No new non-Store Payment feature.

## File Metadata / ACL Gate Result

Conclusion: GO WITH CONDITIONS.

Implemented foundation:

- `file_metadata` table.
- `FileMetadataEntity`.
- `FileAccessService`.
- MIME whitelist.
- path traversal protection.
- upload-root path confinement.
- RBAC check.
- DataScope check.
- owner/module reference check.
- structured denied access log.
- Store Payment protected status / preview / download proxy.

DB state:

- `file_metadata` table exists.
- indexes exist.
- row count: 0.
- no seed executed.
- no business data written.

A4 state:

- A4 may not enable preview/download automatically.
- Next step is a separate A4 UI Gate to wire status / preview / download buttons against the protected endpoints.

## Protected Attachment Gate Result

Conclusion: GO WITH CONDITIONS.

Implemented endpoints:

- `GET /store-payment/attachments/:attachmentId/status`
- `GET /store-payment/attachments/:attachmentId/preview`
- `GET /store-payment/attachments/:attachmentId/download`

Current behavior:

- `status` returns controlled access-pending state after Store Payment ownership, RBAC, and DataScope checks.
- `preview` and `download` perform the same checks, then reject with `STORE_PAYMENT_ATTACHMENT_STREAMING_NOT_AVAILABLE`.
- `rawUrl` remains `null`.
- `/uploads` and `http(s)` attachment IDs are rejected as unsafe.
- A4 must keep preview/download disabled.

# Store Payment Runtime State

Last updated: 2026-06-23

## Current Decision

GO WITH CONDITIONS.

Store Payment is ready for controlled attachment UAT smoke, not production deployment. File Metadata / ACL foundation is available, and Store Payment protected attachment proxy endpoints can stream when a valid `file_metadata.file_id` exists and ownership / RBAC / DataScope pass. A4 has added controlled preview/download UI wiring, and local UAT metadata now exists for one Store Payment account QR test file.

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
27. Current `file_metadata` row count is 1 after local UAT metadata setup; no seed was executed.
28. A4 protected preview/download UI draft is implemented.
29. Frontend calls only Store Payment protected attachment endpoints for status / preview / download.
30. Frontend remains fail-closed when metadata is missing, pending, disabled, denied, or rawUrl appears.
31. Local `file_metadata` UAT row `FILE-SP-UAT-001` exists.
32. `FILE-SP-UAT-001` is associated with Store Payment account `id=1`.
33. `store_payment_accounts.id=1` has `qr_attachment_id=FILE-SP-UAT-001`.
34. Protected status smoke passed for `FILE-SP-UAT-001`.
35. Protected preview smoke passed for `FILE-SP-UAT-001`.
36. Protected download smoke passed for `FILE-SP-UAT-001`.

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

- proof preview: controlled UI ready, disabled unless backend status is allowed.
- proof download: controlled UI ready, disabled unless backend status is allowed.
- QR preview: protected UAT ready for `FILE-SP-UAT-001`.
- QR download: protected UAT ready for `FILE-SP-UAT-001`.
- Raw URL exposure: forbidden.
- `/uploads` path construction: forbidden.
- `http(s)` attachment links: forbidden.
- Store Payment attachment status endpoint: implemented.
- Store Payment attachment preview/download: backend streaming implemented with ACL; usable only when metadata exists and checks pass.
- denied access audit: structured log implemented.
- frontend preview/download: protected UAT ready for the local metadata fixture; still not production-enabled.

## Current Conditions

- Controlled UAT may verify page rendering, permission visibility, disabled attachment behavior, status flow UI, and protected attachment preview/download against local metadata.
- Frontend preview/download buttons are present but fail-closed by backend status.
- Frontend preview/download must not be treated as fully available until file metadata UAT data exists and A2 reviews the UI path.
- Staging deployment requires a separate A6 runbook Gate.
- Final GO / HOLD / ROLLBACK requires a separate A7 Gate.

## Current Non-Goals

- No production deployment.
- No push.
- No remote production DB write.
- No frontend attachment preview / download yet.
- No production attachment preview / download yet.
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

- A4 protected preview/download UI draft is complete.
- Next step is Store Payment attachment metadata UAT data setup.

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

## A4 Protected Preview / Download UI Draft Result

Conclusion: GO WITH CONDITIONS.

Implemented frontend behavior:

- proof attachment status display.
- QR attachment status display.
- protected status endpoint wiring when a `file_id` is available.
- protected preview/download buttons.
- loading state.
- error state.
- disabled / access_pending / denied / missing / unsafe raw URL messages.
- no raw URL display.
- no `/uploads` link construction.
- no `http(s)` raw link opening.
- blob/object URL handling only after protected endpoint succeeds.

Current condition:

- Because `file_metadata` now has one local UAT row, controlled UAT can verify the protected QR attachment path while missing proof metadata should still show pending / missing states.
- Real preview/download remains conditional on backend status returning allowed.

## Attachment Metadata UAT Data Setup Result

Conclusion: GO WITH CONDITIONS.

Local UAT data:

- `file_id`: `FILE-SP-UAT-001`
- file: `store-payment-proof-uat.pdf`
- MIME: `application/pdf`
- module: `STORE_PAYMENT`
- owner: `STORE_PAYMENT_ACCOUNT:1`
- company: `COMP-LAO-AGRI`
- store: `STORE-VTE-001`
- status: `ACTIVE`
- visibility: `PROTECTED`

Endpoint smoke:

- status: PASS, `accessStatus=allowed`, `rawUrl=null`.
- preview: PASS, backend streamed PDF with `Content-Disposition: inline`.
- download: PASS, backend streamed PDF with `Content-Disposition: attachment`.
- no-auth access: 401.
- missing file id: 404.

Important boundary:

- The local test file is a non-sensitive UAT PDF stored under local upload roots and excluded from git.
- This is local UAT data only, not production data.

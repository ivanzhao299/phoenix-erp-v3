# Store Payment Runtime State

Last updated: 2026-06-23

## Current Decision

GO WITH CONDITIONS.

Store Payment has passed controlled protected attachment UAT smoke for both the pilot account QR file and a Store Payment record proof fixture, not production deployment. File Metadata / ACL foundation is available, Store Payment protected attachment proxy endpoints stream when a valid `file_metadata.file_id` exists and ownership / RBAC / DataScope pass, and `/store-payment` now uses protected endpoints for QR and proof preview / download paths. A6 staging deploy runbook and A7 final QA Gate are complete. The staging deploy approval package, approval matrix, and business UAT scope are complete. The approved non-main branch push completed. The staging-only workflow/env/compose skeleton is now ready. The production server connection card has been sanitized and can produce a same-host staging candidate only with explicit isolation approval. Real staging execution still waits for user approval and GitHub `staging` environment secrets.

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
37. `/store-payment` page-level QR status UAT smoke passed for `FILE-SP-UAT-001`.
38. `/store-payment` page-level QR preview UAT smoke passed through the protected endpoint.
39. `/store-payment` page-level QR download UAT smoke passed through the protected endpoint.
40. `/store-payment` did not display `rawUrl`, did not construct `/uploads`, and did not leak `storage_path`.
41. Local UAT record `SP-UAT-PROOF-001` exists in `store_payment_records`.
42. `SP-UAT-PROOF-001` references proof file `FILE-SP-PROOF-UAT-001`.
43. `FILE-SP-PROOF-UAT-001` exists in `file_metadata` as owner `STORE_PAYMENT_RECORD:1`.
44. Record proof status endpoint smoke passed.
45. Record proof preview endpoint smoke passed with backend protected PDF streaming.
46. Record proof download endpoint smoke passed with backend protected PDF streaming.
47. `/store-payment` detail drawer proof preview/download page smoke passed.

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
- QR preview: protected account QR UAT passed for `FILE-SP-UAT-001`.
- QR download: protected account QR UAT passed for `FILE-SP-UAT-001`.
- proof preview: protected record proof UAT passed for `FILE-SP-PROOF-UAT-001`.
- proof download: protected record proof UAT passed for `FILE-SP-PROOF-UAT-001`.
- Raw URL exposure: forbidden.
- `/uploads` path construction: forbidden.
- `http(s)` attachment links: forbidden.
- Store Payment attachment status endpoint: implemented.
- Store Payment attachment preview/download: backend streaming implemented with ACL; usable only when metadata exists and checks pass.
- denied access audit: structured log implemented.
- frontend preview/download: protected account QR UAT passed for the local metadata fixture; still not production-enabled.

## Protected Attachment UAT Smoke Result

Conclusion: GO WITH CONDITIONS.

Page-level UAT evidence:

- Page entry: `/store-payment`.
- Test file: `FILE-SP-UAT-001`.
- Associated object: `store_payment_accounts.id=1` via `qr_attachment_id`.
- QR status request used `/store-payment/attachments/FILE-SP-UAT-001/status`.
- QR preview request used `/store-payment/attachments/FILE-SP-UAT-001/preview`.
- QR download request used `/store-payment/attachments/FILE-SP-UAT-001/download`.
- rawUrl displayed: no.
- `/uploads` used: no.
- `storage_path` leaked: no.
- missing metadata rows still fail closed with disabled preview/download buttons.

Current stage: `STORE_PAYMENT_PROTECTED_ATTACHMENT_UAT_VERIFIED`.

## Record Proof Attachment UAT Fixture Result

Conclusion: GO WITH CONDITIONS.

Local UAT data:

- payment record: `SP-UAT-PROOF-001`
- record id: `1`
- file id: `FILE-SP-PROOF-UAT-001`
- file: `store-payment-proof-record-uat.pdf`
- MIME: `application/pdf`
- module: `STORE_PAYMENT`
- owner: `STORE_PAYMENT_RECORD:1`
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

Page-level UAT evidence:

- Record list displayed `SP-UAT-PROOF-001`.
- Detail drawer loaded proof status through `/store-payment/records/1/proof-attachment`.
- Preview used `/store-payment/attachments/FILE-SP-PROOF-UAT-001/preview`.
- Download used `/store-payment/attachments/FILE-SP-PROOF-UAT-001/download`.
- rawUrl displayed: no.
- `/uploads` used: no.
- `storage_path` leaked: no.

Current stage: `STORE_PAYMENT_RECORD_PROOF_ATTACHMENT_UAT_VERIFIED`.

## A6 Staging Deploy Runbook Result

Conclusion: GO WITH CONDITIONS.

Runbook:

- `docs/ops/A6_STORE_PAYMENT_STAGING_DEPLOY_RUNBOOK.md`

Report:

- `docs/ops/A6_STORE_PAYMENT_STAGING_DEPLOY_RUNBOOK_REPORT.md`

Result:

- A6 staging deploy runbook completed.
- staging deploy executed: no.
- push executed: no.
- remote DB write executed: no.
- production migration executed: no.
- A2 runbook review: PASS WITH CONDITIONS.
- A1 runbook validation: PASS WITH CONDITIONS.
- A5 staging data review: GO WITH CONDITIONS.
- A7 Final QA Gate is allowed as the next review Gate.

Current stage: `STORE_PAYMENT_STAGING_RUNBOOK_READY`.

## A7 Final QA Gate Result

Conclusion: GO WITH CONDITIONS.

Reports:

- `docs/ops/A7_STORE_PAYMENT_FINAL_QA_GATE_REPORT.md`
- `docs/ops/STORE_PAYMENT_CONTROLLED_PILOT_RELEASE_DECISION.md`

Result:

- A7 Final QA Gate completed.
- Missing input: none.
- A2 final review: PASS WITH CONDITIONS.
- A1 final validation: PASS WITH CONDITIONS.
- A5 final readiness: GO WITH CONDITIONS.
- Controlled pilot: allowed with conditions.
- Staging deploy application: allowed.
- Production deploy: not allowed.
- Push: not allowed.
- Remote DB write: not allowed.
- Production migration: not allowed.

Current stage: `STORE_PAYMENT_CONTROLLED_PILOT_READY`.

## Staging Deploy Approval Prep Result

Conclusion: READY_FOR_USER_APPROVAL.

Reports:

- `docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_PACKAGE.md`
- `docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_MATRIX.md`
- `docs/ops/STORE_PAYMENT_BUSINESS_UAT_SCOPE.md`
- `docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_PREP_REPORT.md`

Result:

- staging deploy approval package completed.
- approval matrix completed.
- business UAT scope completed.
- A2 review: PASS WITH CONDITIONS.
- A1 validation: PASS WITH CONDITIONS.
- A5 review: GO WITH CONDITIONS.
- deploy executed: no.
- push executed: no.
- remote DB write executed: no.
- staging migration executed: no.
- production migration executed: no.

Current stage: `STORE_PAYMENT_STAGING_APPROVAL_READY`.

## Staging Controlled Pilot Deploy Attempt

Conclusion: HOLD.

Report:

- `docs/ops/STORE_PAYMENT_STAGING_CONTROLLED_PILOT_DEPLOY_REPORT.md`

Business UAT guide:

- `docs/ops/STORE_PAYMENT_STAGING_BUSINESS_UAT_GUIDE.md`

Result:

- push to remote: PASS, non-main branch `w5-codex-orchestrator`, commit `0e71753c`.
- push to main: not executed.
- staging deploy: not executed.
- staging DB migration: not executed.
- staging menu / role sync: not executed.
- staging file storage configuration: not executed.
- protected attachment staging smoke: not executed.
- `/store-payment` staging smoke: not executed.
- production deploy: no.
- production migration: no.
- production remote DB write: no.

HOLD reason:

- No staging-only deployment target, staging DB connection, staging file storage path, or staging-specific workflow was discoverable.
- Existing GitHub deploy workflow targets production on `push main`, so main push was blocked.

Current stage: `STORE_PAYMENT_STAGING_DEPLOY_HOLD`.

## Staging Target Bootstrap Gate Result

Conclusion: READY_FOR_STAGING_TARGET_INPUTS.

Artifacts:

- `.github/workflows/staging-deploy.yml`
- `.env.staging.example`
- `docker-compose.staging.yml`
- `deploy/staging/README.md`
- `docs/ops/STORE_PAYMENT_STAGING_TARGET_REQUIRED_INPUTS.md`
- `docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_V2.md`
- `docs/ops/STORE_PAYMENT_STAGING_TARGET_BOOTSTRAP_GATE_REPORT.md`

Result:

- staging-only workflow skeleton added.
- staging env example added.
- staging compose skeleton added.
- staging required inputs documented.
- staging approval v2 documented.
- deploy executed: no.
- push main executed: no.
- remote DB write executed: no.
- staging migration executed: no.
- production migration executed: no.
- production triggered: no.

Current stage: `STORE_PAYMENT_STAGING_TARGET_BOOTSTRAP_READY`.

## Server Card Staging Target Intake

Conclusion: STAGING_TARGET_CANDIDATE_READY.

Artifacts:

- `docs/ops/SERVER_CARD_INTAKE_SANITIZED_SUMMARY.md`
- `docs/ops/STAGING_TARGET_DERIVATION_FROM_SERVER_CARD.md`
- `docs/ops/STORE_PAYMENT_GITHUB_STAGING_SECRETS_SETUP_FROM_SERVER_CARD.md`
- `docs/ops/STAGING_TARGET_USER_APPROVAL_REQUIRED.md`
- `docs/ops/SERVER_CARD_STAGING_TARGET_INTAKE_REPORT.md`

Result:

- Server connection card received and sanitized.
- The card is classified as production-oriented.
- Same-host staging can be considered only as a candidate.
- Candidate staging deploy path: `/opt/phoenix-erp-staging`.
- Candidate staging DB: `phoenix_erp_staging`.
- Candidate staging file storage: `/data/phoenix-erp-staging/files`.
- Production DB reuse as staging DB: forbidden.
- Production file storage reuse as staging file storage: forbidden.
- Production deploy path reuse as staging deploy path: forbidden.
- A2 review: PASS WITH CONDITIONS.
- A1 validation: PASS WITH CONDITIONS.
- A5 review: GO WITH CONDITIONS.
- Deploy executed: no.
- Push executed: no.
- DB write executed: no.
- Migration executed: no.
- Production triggered: no.

Current stage: `STORE_PAYMENT_STAGING_TARGET_CANDIDATE_READY`.

## Current Conditions

- Controlled UAT has verified page rendering, permission visibility, disabled attachment behavior, status flow UI, protected account QR attachment preview/download, and protected record proof preview/download against local metadata.
- Frontend preview/download buttons are present and remain controlled by backend status.
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

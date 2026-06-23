# Decision Log

## 2026-06-23 - A7 Store Payment Final QA Gate

Decision: GO WITH CONDITIONS.

Rationale:

- A7 input reports are all present.
- Store Payment backend MVP, frontend page, menu / role readiness, protected attachment ACL, account QR UAT, record proof UAT, and A6 runbook are complete with conditions.
- `rawUrl`, `/uploads`, and `storage_path` exposure remain blocked.
- no-auth attachment access returns 401.
- missing attachment access returns 404.
- A2 final review is PASS WITH CONDITIONS.
- A1 final validation is PASS WITH CONDITIONS.
- A5 final readiness is GO WITH CONDITIONS.

Conditions:

- Controlled pilot is limited to local or separately approved staging environment.
- Staging deploy requires explicit user approval.
- Push requires explicit user approval.
- Remote DB writes and production migration require explicit user approval.
- Production deploy remains HOLD.
- UAT fixtures must remain distinct from real business payment evidence.

Next actions:

1. `USER_APPROVAL_FOR_STAGING_DEPLOY`
2. `STAGING_DB_MIGRATION_AND_MENU_ROLE_SYNC_APPROVAL`
3. `CONTROLLED_PILOT_BUSINESS_UAT`

## 2026-06-23 - A6 Store Payment Staging Deploy Runbook

Decision: GO WITH CONDITIONS.

Rationale:

- Store Payment account QR attachment UAT has passed through protected endpoints.
- Store Payment record proof attachment UAT has passed through protected endpoints.
- `rawUrl`, `/uploads`, and `storage_path` remain blocked from Store Payment frontend exposure.
- A6 staging deploy runbook now defines environment prerequisites, precheck checklist, draft deployment steps, post-deployment validation, rollback plan, and A7 input conditions.
- No staging deployment, push, remote DB write, production migration, seed, cleanup, or reset was executed.

Conditions:

- Staging deploy requires explicit user approval.
- Staging DB backup, env, migration state, menu / role sync, store scope, file storage, and UAT fixture policy must be confirmed before deployment.
- A2 must review staging security evidence before final GO.
- A5 must confirm staging data prerequisites before pilot release.
- A7 Final QA Gate is the next allowed review Gate.

## 2026-06-23 - Store Payment Record Proof Attachment UAT Fixture

Decision: GO WITH CONDITIONS.

Rationale:

- Local `phoenix_erp` contains one Store Payment UAT record `SP-UAT-PROOF-001`.
- `SP-UAT-PROOF-001` references proof attachment `FILE-SP-PROOF-UAT-001`.
- Local `file_metadata` contains `FILE-SP-PROOF-UAT-001` with owner `STORE_PAYMENT_RECORD:1`.
- The proof file is a generated non-sensitive UAT PDF with no real payment, bank, or customer data.
- Protected status endpoint returned `accessStatus=allowed`, `previewAvailable=true`, `downloadAvailable=true`, and `rawUrl=null`.
- Protected preview endpoint streamed the PDF through the backend.
- Protected download endpoint streamed the PDF through the backend.
- No-auth access failed closed with 401.
- Missing file id failed closed with 404.
- `/store-payment` detail drawer used protected proof access and protected preview/download endpoints.

Conditions:

- This was a local UAT DB write only, not a remote production DB write.
- API development startup emitted existing bootstrap / seed logs; no production deployment or push was executed.
- The UAT proof PDF is non-sensitive local test data and must not be treated as production evidence.
- Staging deployment still requires A6 runbook Gate.
- Final pilot release still requires A7 final QA / GO Gate.

## 2026-06-23 - Store Payment Protected Attachment UAT Smoke

Decision: GO WITH CONDITIONS.

Rationale:

- `/store-payment` loaded the pilot Store Payment account list.
- `FILE-SP-UAT-001` was visible as the QR attachment for Store Payment account `id=1`.
- QR status UI called `/store-payment/attachments/FILE-SP-UAT-001/status`.
- QR preview UI called `/store-payment/attachments/FILE-SP-UAT-001/preview`.
- QR download UI called `/store-payment/attachments/FILE-SP-UAT-001/download`.
- Preview/download buttons were enabled only for the `ALLOWED` backend status row.
- Other accounts without metadata remained fail-closed as `MISSING`.
- The page did not display raw URL, did not construct `/uploads`, and did not leak `storage_path`.

Conditions:

- This smoke used local UAT metadata only.
- No proof record fixture was created in this Gate.
- No backend code was modified.
- No migration, DB write, deploy, or push was executed by this Gate.
- Production enablement still requires A6 staging runbook and A7 final QA / GO Gate.

## 2026-06-23 - Store Payment Attachment Metadata UAT Data Setup

Decision: GO WITH CONDITIONS.

Rationale:

- Local `phoenix_erp` now contains one non-sensitive Store Payment attachment metadata UAT row.
- `FILE-SP-UAT-001` is associated with Store Payment account `id=1` as a QR attachment reference.
- The local UAT file is a generated PDF containing only "UAT only / no real business data".
- Protected status endpoint returned `accessStatus=allowed`, `previewAvailable=true`, `downloadAvailable=true`, and `rawUrl=null`.
- Protected preview endpoint streamed the PDF through the backend.
- Protected download endpoint streamed the PDF through the backend.
- No-auth access failed closed with 401.
- Missing file id failed closed with 404.

Conditions:

- This was a local UAT DB write only, not a remote production DB write.
- API development startup emitted existing bootstrap / seed logs; no Store Payment production seed was executed by this Gate.
- The local UAT file is excluded from git and must not be treated as production evidence.
- A2 review is still required before production enablement.
- No deploy, push, migration, cleanup, reset, or destructive operation was executed.

## 2026-06-23 - A4 Protected Preview / Download UI Draft Gate

Decision: GO WITH CONDITIONS.

Rationale:

- `/store-payment` now has controlled attachment status UI for proof attachments and QR attachment status.
- Preview/download buttons are driven only by backend protected status.
- Buttons remain disabled for missing metadata, access pending, denied, disabled, unsafe raw URL, or unavailable preview/download.
- The UI calls only `/store-payment/attachments/:fileId/status|preview|download` when a controlled file id exists.
- The UI does not show raw URL, build `/uploads` links, or open naked `http(s)` links.

Conditions:

- `file_metadata` currently has 0 rows, so UAT should expect metadata missing / pending states until a separate metadata UAT data setup Gate.
- A2 review remains required before treating preview/download as UAT-passed.
- Backend, DB, migration, deploy, and push were not touched.
- Next gate: Store Payment attachment metadata UAT data setup.

## 2026-06-23 - Store Payment File Metadata / ACL Gate

Decision: GO WITH CONDITIONS.

Rationale:

- `file_metadata` table was created in local `phoenix_erp`.
- No seed was executed; current table row count is 0.
- `FileAccessService` implements controlled metadata lookup, RBAC, DataScope, ownership checks, MIME whitelist, path traversal protection, upload-root path confinement, and structured denied logs.
- Store Payment protected attachment routes now use file metadata and can stream only after metadata exists and checks pass.
- Existing upload module still returns `/uploads/contracts/...`; that path remains forbidden for frontend preview/download.

Conditions:

- A4 preview/download UI remains disabled until a separate A4 Gate and A2 review.
- A protected upload / metadata population workflow is still needed for real proof / QR files.
- No production deploy, push, or remote production DB write was performed.

## 2026-06-23 - Store Payment A3 Protected Streaming Gate

Decision: GO WITH CONDITIONS.

Rationale:

- Store Payment ownership, RBAC, and DataScope checks were added for protected attachment status / preview / download routes.
- The existing upload module only stores files under `/uploads/contracts` and returns a raw URL; it has no metadata table, ACL, owner/module reference, or protected streaming capability.
- To avoid raw URL exposure and ACL bypass, real preview/download streaming remains disabled.
- Preview/download routes now fail closed with `STORE_PAYMENT_ATTACHMENT_STREAMING_NOT_AVAILABLE` after ownership and scope checks.

Conditions:

- A4 must not enable preview/download UI yet.
- A follow-up file metadata / ACL Gate is required before streaming can be enabled.
- Denied access currently uses structured logging; DB audit can be added after metadata/ACL design is approved.

## 2026-06-23 - Store Payment Controlled UAT Ready

Decision: GO WITH CONDITIONS.

Rationale:

- Store Payment backend and frontend gates have completed with conditions.
- Store Payment page exists at `/store-payment`.
- Menu entry exists under 销售管理 / 统一收款.
- Permission buttons are aligned with `MENU_STORE_PAYMENT*` and V/E/X action bits.
- Attachment preview/download remains disabled.
- Raw URL exposure remains forbidden.
- Web typecheck passes.
- W5 closeout gate passes.

Conditions:

- Real attachment preview/download requires A3 protected streaming Gate and A2 review.
- Staging deployment requires A6 runbook Gate.
- Final production decision requires A7 final QA Gate.
- No push or production deployment has been executed.

## 2026-06-23 - Store Payment A4 Frontend Gate

Decision: GO WITH CONDITIONS.

Artifacts:

- `docs/ops/A4_STORE_PAYMENT_FRONTEND_GATE_UIUX_UAT_REPORT.md`
- `apps/web/src/app/(admin)/store-payment/page.tsx`
- `apps/web/src/app/(admin)/store-payment/store-payment.module.css`
- `apps/web/src/components/layout/Sidebar.tsx`

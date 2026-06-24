# Store Payment File Metadata / ACL Gate Report

Date: 2026-06-23

## 1. Gate Goal

Establish the Phoenix ERP common File Metadata / ACL / Protected Streaming foundation for Store Payment proof and QR attachments without exposing raw URLs, bypassing RBAC/DataScope, deploying, pushing, or writing production data.

## 2. Scope

Allowed implementation scope used in this Gate:

- `apps/api/src/modules/file/**`
- `apps/api/src/modules/store-payment/**`
- `apps/api/src/database/migrations/1782042418112-CreateFileMetadata.ts`
- `apps/api/src/app.module.ts`
- `docs/ops/**`
- `docs/ops/runs/**`
- `docs/ops/runtime-memory/**`
- `scripts/ops/**` safety gate support for this approved schema gate

Forbidden scope remained untouched:

- `apps/web/**`
- non-file / non-attachment / non-Store Payment business modules
- production deployment logic
- push
- seed / cleanup / reset
- remote production DB writes

## 3. Existing Attachment System Scan

The existing upload capability is `UploadModule` / `UploadController` with `POST /api/upload/contract`.

Observed limitations:

- It writes uploaded files under the local `uploads/contracts` path.
- It returns a raw URL shaped like `/uploads/contracts/<filename>`.
- It does not maintain file metadata ownership records.
- It does not provide module-level ACL.
- It does not prove Store Payment record/account ownership.
- It does not provide protected preview/download streaming.

Decision:

- The legacy upload URL is not safe for Store Payment proof / QR preview/download.
- Store Payment must use `file_metadata.file_id` as its external file reference.
- `file_metadata.storage_path` is backend-only and must never be returned to the frontend.

## 4. Migration

Migration file:

- `apps/api/src/database/migrations/1782042418112-CreateFileMetadata.ts`

Migration purpose:

- Create `file_metadata` for protected file metadata, ownership, module reference, company/store scope, and backend-only storage location.

Migration safety:

- `down()` exists.
- No data DML is present.
- No seed was executed.
- No business data was inserted, updated, or deleted.
- `down()` only drops objects owned by this Gate.

Local execution:

- Executed only against local `phoenix_erp`.
- TypeORM CLI `migration:run` was intentionally not used because the local metadata table state could cause unrelated historical migrations to be considered. The approved File Metadata DDL was executed directly and verified read-only afterward.

Local DB verification:

- `file_metadata` table exists.
- 19 expected columns exist.
- 7 expected indexes/constraints exist.
- Row count is `0`.

## 5. Implemented Backend Foundation

New module:

- `FileModule`
- `FileMetadataEntity`
- `FileAccessService`

Implemented checks:

- file id safety validation
- no `/uploads` or `http(s)` file id
- no path traversal
- backend-only storage path
- upload-root confinement
- stored filename match
- MIME whitelist: PDF, JPEG, PNG, WEBP
- status must be `ACTIVE`
- visibility must be `PROTECTED` or `PRIVATE`
- owner/module match
- company/store match
- RBAC menu `V` check
- DataScope check
- structured denied access log

## 6. Store Payment Endpoints

Store Payment now exposes controlled endpoints:

- `GET /store-payment/attachments/:attachmentId/status`
- `GET /store-payment/attachments/:attachmentId/preview`
- `GET /store-payment/attachments/:attachmentId/download`

Behavior:

- Resolves whether the `file_id` belongs to a Store Payment record proof or Store Payment account QR attachment.
- Verifies Store Payment ownership before file access.
- Verifies RBAC and DataScope before status / preview / download.
- Returns `rawUrl: null` for status.
- Streams through the backend for preview/download only when metadata, ownership, scope, MIME, and binary path checks all pass.
- Fails closed for missing metadata, disabled/deleted metadata, unsafe file ids, ownership mismatch, RBAC denial, DataScope denial, unsafe paths, missing binaries, and unsupported MIME.

## 7. Protected Attachment Safety Result

| Check | Result |
| --- | --- |
| Naked raw URL returned | No |
| `/uploads` exposed through protected endpoints | No |
| `http(s)` raw link exposed | No |
| RBAC required | Yes |
| DataScope required | Yes |
| Store Payment ownership required | Yes |
| path traversal blocked | Yes |
| backend streaming implemented | Yes, conditional on valid metadata and binary |
| frontend preview/download enabled | No |
| fail-closed behavior | Yes |

## 8. A2 Security Review Summary

Conclusion: PASS WITH CONDITIONS.

Security conditions:

- The existing legacy upload endpoint still returns `/uploads/contracts/...`; Store Payment frontend must not use it for preview/download.
- A4 may only enable preview/download through the protected Store Payment endpoints.
- A2 must review the A4 UI path before preview/download buttons are enabled by default.
- Denied access currently uses structured application logging, not a persistent audit table write. Persistent audit can be considered in a later audit Gate if required.

## 9. A1 Validation Summary

Conclusion: PASS WITH CONDITIONS.

Validation performed:

- API typecheck passed.
- migration `down()` gate passed.
- migration no-data-DML gate passed.
- nullable unique gate passed.
- W5 closeout gate should be run by Baseline Autopilot after commit/merge.
- static Store Payment File Metadata / ACL checks passed.

Condition:

- Because this Gate intentionally touches a new migration and backend code, safe merge must use the approved schema gate: `STORE_PAYMENT_FILE_METADATA_ACL_GATE`.

## 10. A5 Data Readiness Summary

Conclusion: GO WITH CONDITIONS.

Readiness facts:

- `file_metadata` exists in local `phoenix_erp`.
- `file_metadata` row count is `0`.
- Store Payment proof / QR file references can use `file_metadata.file_id`.
- No metadata population workflow or seed was executed in this Gate.

Condition:

- Real proof / QR upload flow still needs a future protected upload / metadata population Gate before business users can attach real files end to end.

## 11. Runtime Memory Update

Updated:

- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/STORE_PAYMENT_STATE.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`
- `docs/ops/runtime-memory/GUARDRAILS.md`

Current memory state:

- active module: Store Payment
- current stage: `FILE_METADATA_ACL_READY`
- active decision: `GO_WITH_CONDITIONS`
- next gate: `A4_ENABLE_PROTECTED_PREVIEW_DOWNLOAD_UI_DRAFT`
- frontend preview/download: still disabled

## 12. Evidence Files

- `docs/ops/runs/store-payment-file-metadata-acl-static-check.json`
- `docs/ops/runs/file-metadata-db-readiness.txt`

## 13. Explicit Non-Actions

- No frontend code was modified.
- No deployment was executed.
- No push was executed.
- No seed was executed.
- No business data was inserted, updated, or deleted.
- No production DB write was executed.
- No cleanup/reset was executed.

## 14. Next Gate Recommendation

Recommended next Gate:

- A4 enable protected preview/download UI draft Gate.

Required conditions:

- Use only protected endpoints.
- Do not expose raw URL.
- Do not build `/uploads` links.
- Keep buttons disabled unless status returns allowed and A2 accepts the UI path.
- A2 must review raw URL exposure, RBAC/DataScope display assumptions, and attachment ACL flow.
- A1 must run web/API checks and W5 gate.

## 15. Current Conclusion

GO WITH CONDITIONS.

The backend File Metadata / ACL / Protected Streaming foundation is in place and verified for local `phoenix_erp`. Frontend preview/download must remain disabled until a separate A4 Gate and A2 review approve the UI enablement path.

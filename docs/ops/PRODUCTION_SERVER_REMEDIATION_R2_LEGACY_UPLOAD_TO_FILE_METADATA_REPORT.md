# Production Server Remediation R2 - Legacy Upload To File Metadata Gate

Date: 2026-06-24

## Conclusion

GO WITH CONDITIONS.

The legacy upload controller has been changed from returning a naked `/uploads/contracts/...` path to creating a protected `file_metadata` row and returning a `fileId` plus safe metadata. Runtime deployment was not executed in this Gate, so the production-side running API has not been changed yet. Remote SSH smoke was unavailable due banner timeout and is recorded as a condition, not as a pass.

## Modified Files

- `apps/api/src/modules/upload/upload.controller.ts`
- `apps/api/src/modules/upload/upload.module.ts`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_LEGACY_UPLOAD_TO_FILE_METADATA_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md`
- `docs/ops/runtime-memory/CODEX_ORCHESTRATOR_MEMORY.md`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/STORE_PAYMENT_STATE.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`
- `docs/ops/runtime-memory/GUARDRAILS.md`
- `docs/ops/AGENT_TASK_BOARD.md`
- `docs/ops/runs/legacy-upload-to-file-metadata-gate-latest.md`
- `docs/ops/runs/legacy-upload-to-file-metadata-gate-latest.json`

## Legacy Upload Endpoint Before

| Item | Finding |
| --- | --- |
| Endpoint | `POST /api/upload/contract` |
| File location | `apps/api/src/modules/upload/upload.controller.ts` |
| Response | `{ code, url, originalName, size }` |
| Raw path returned | `/uploads/contracts/${file.filename}` |
| Save path | `${process.cwd()}/uploads/contracts` |
| Auth | JWT guard |
| Size limit | 15 MB |
| Extension filter | `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp` |
| Module / owner binding | none |
| `file_metadata` write | none |
| Likely callers | `AttachmentUploader`, `FileUploadInput`, Procurement V2 order/payment attachments, shareholder capital attachments, CRUD attachment fields, warehouse attachment fields |

## Legacy Upload Endpoint After

The endpoint still stores the binary under the existing upload directory for compatibility, but it now creates a `file_metadata` row and returns a protected reference:

```json
{
  "code": 200,
  "fileId": "FILE-LEGACY-...",
  "originalName": "example.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 123,
  "moduleCode": "LEGACY_UPLOAD",
  "ownerType": "LEGACY_PENDING",
  "ownerId": "LEGACY_PENDING",
  "companyCode": "",
  "storeCode": "",
  "visibility": "protected",
  "status": "pending",
  "rawUrl": null,
  "previewUrl": null,
  "downloadUrl": null,
  "protectedStatusEndpoint": null,
  "protectedEndpointStatus": "generic_protected_file_endpoint_not_available",
  "deprecatedLegacyPath": false,
  "url": null
}
```

Storage path remains DB-only and is not returned.

## File Metadata Write

The code path writes these fields after a successful upload:

- `file_id`
- `original_name`
- `stored_name`
- `storage_path`
- `mime_type`
- `size_bytes`
- `checksum`
- `module_code`
- `owner_type`
- `owner_id`
- `company_code`
- `store_code`
- `uploaded_by`
- `status`
- `visibility`
- `created_at`
- `updated_at`

Runtime rows written during this Gate: `0`.

Reason: deployment/restart was not approved and remote SSH was unavailable for controlled runtime smoke. The production-side running container is therefore not claimed to have executed the new code path.

## LEGACY_PENDING Strategy

If `moduleCode`, `ownerType`, and `ownerId` are not provided, the uploaded file is stored as:

- `module_code = LEGACY_UPLOAD`
- `owner_type = LEGACY_PENDING`
- `owner_id = LEGACY_PENDING`
- `status = PENDING`
- `visibility = PROTECTED`

This is fail-closed. It does not create public access and does not authorize preview/download.

If module and owner are explicitly provided, the row is marked `ACTIVE`, still with `visibility = PROTECTED`.

## Compatibility Strategy

The legacy `url` field is retained as `null`.

This intentionally breaks unsafe raw-link assumptions without returning a new naked URL. Affected frontend components still expecting `json.url` must be migrated in separate module-specific Gates.

## Protected Endpoint Status

No generic `/files/:fileId/status|preview|download` endpoint was found in the current codebase. Store Payment has protected module-specific attachment endpoints, but this Gate does not pretend those endpoints are generic.

The response therefore returns:

- `protectedStatusEndpoint: null`
- `protectedEndpointStatus: generic_protected_file_endpoint_not_available`

Recommended follow-up: a generic protected file endpoint Gate or module-specific owner assignment Gates.

## Smoke And Verification

| Check | Result |
| --- | --- |
| Upload response no longer returns `/uploads` in updated source | PASS |
| Upload response has `rawUrl: null` | PASS |
| Upload response does not include `storage_path` / `storagePath` | PASS for response; DB write still stores `storagePath` internally |
| `file_metadata` write code path exists | PASS |
| `file_metadata` runtime row count increased | NOT EXECUTED; no deploy/restart approved and remote SSH unavailable |
| Generic protected status by `fileId` | NOT AVAILABLE; no generic endpoint exists |
| Nginx `/uploads` remains 403 | UNAVAILABLE in this run; prior Gate evidence remains current, SSH timed out before fresh recheck |
| Store Payment protected endpoint regression | Source path unchanged; runtime smoke unavailable |
| API health | UNAVAILABLE in this run due SSH banner timeout |
| Web health | UNAVAILABLE in this run due SSH banner timeout |
| Historical files deleted | NO |
| Historical files moved | NO |

## Validation Commands

| Command | Result |
| --- | --- |
| `pnpm --filter phoenix-erp-v3-nest build` | FAIL: local `node_modules` missing, `nest: command not found` |
| `node scripts/ci/check-security-regression.mjs` | PASS |
| `node scripts/ci/check-freeze-boundaries.mjs` | FAIL as expected without override because this approved Gate touches `apps/api` |
| `ALLOW_FREEZE_TOUCH=true node scripts/ci/check-freeze-boundaries.mjs` | PASS with warning |
| `ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS |
| `git diff --check` | PASS |
| Remote SSH smoke | FAIL: banner timeout |

## A2 Security Review

PASS WITH CONDITIONS.

- New response does not include naked `/uploads`.
- New response sets `rawUrl: null`.
- `storage_path` is DB-only and is not returned.
- Missing owner is fail-closed as `LEGACY_PENDING` + `PENDING` + `PROTECTED`.
- Store Payment protected endpoint code was not changed.
- Condition: production runtime must be deployed/restarted in a separate approved Gate before claiming the live endpoint no longer returns legacy raw paths.
- Condition: generic protected file endpoint remains absent.

## A1 Validation

PASS WITH CONDITIONS.

- W5 closeout static gate passes with explicit approved freeze-boundary override.
- Security regression static gate passes.
- API build could not run because dependencies are missing locally.
- Remote runtime smoke could not run because SSH timed out during banner exchange.

## A5 Data Readiness Review

GO WITH CONDITIONS.

- `file_metadata` table already exists from the approved migration Gate.
- This change establishes a metadata write path for new legacy uploads.
- No remote metadata rows were inserted by this Gate.
- Historical uploads still require a separate inventory and ownership recognition Gate.

## Boundaries

| Item | Executed |
| --- | --- |
| Delete historical files | No |
| Move historical files | No |
| Reopen `/uploads` | No |
| Return raw URL | No in updated code |
| Expose `storage_path` | No |
| Migration | No |
| Deploy | No |
| Restart service | No |
| Push main | No |
| Nginx change | No |
| Production env change | No |

## Current Conditions

1. Remote SSH must become observable again before runtime evidence can be refreshed.
2. A later approved deploy/restart Gate is required before the production-side running API reflects this code.
3. Existing frontend modules that expect `json.url` need module-specific migration plans.
4. Historical uploads need inventory before any metadata backfill.
5. Generic protected file endpoints remain a separate Gate.

## Next Recommended Single Gate

`APPROVE_HISTORICAL_UPLOADS_METADATA_INVENTORY_GATE`

Goal:

1. Inventory historical `uploads/contracts` files.
2. Do not auto-write metadata.
3. Identify likely business-module ownership.
4. Generate module-by-module metadata claim plans.

Alternative if access control is more urgent:

`APPROVE_MENU_ROLE_DATASCOPE_REMOTE_AUDIT`


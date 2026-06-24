# Production Server Remediation R2 Uploads / File Security Remediation Plan

Date: 2026-06-24

## Current Status

Phase 2 has been executed with conditions by `APPROVE_UPLOADS_EXPOSURE_HARDENING_GATE`.

Result:

- Public Nginx HTTPS `/uploads/` now returns `403`.
- Active Nginx config was changed and reloaded.
- API internal static path `127.0.0.1:3100/uploads/contracts/[file]` still returns `200` and is deferred to the legacy upload-to-file-metadata Gate.
- No files were deleted or moved.
- No DB write, migration, deploy, API restart, or push occurred.

## Goal

Reduce legacy `/uploads` exposure risk while keeping Store Payment protected attachment design isolated and fail-closed. This plan is proposal-only. It does not delete files, move files, modify Nginx, write DB, deploy, restart, or push.

## Phase 1: Freeze And Isolate Risk

Objectives:

- Keep Store Payment prohibited from using legacy raw `/uploads` URLs.
- Treat `POST /api/upload/contract` as a legacy endpoint.
- Keep Store Payment protected endpoints independent.
- Keep `rawUrl` forbidden.
- Keep `storage_path` backend-only.

Recommended actions for a future approved Gate:

- Add a prominent legacy marker to upload governance docs.
- Add static checks preventing Store Payment frontend from using `/uploads`.
- Add A2 review requirement for any module enabling direct upload URLs.

Rollback:

- Docs-only or static-check changes can be reverted by commit rollback.

## Phase 2: Nginx /uploads Exposure Hardening

Objectives:

- Stop public direct access to sensitive uploaded files.
- Preserve compatibility only where explicitly needed.
- Avoid breaking legacy modules without inventory.

Options:

1. Deny all `/uploads/` public access and require protected endpoints.
2. Restrict `/uploads/` to internal network / API-only access.
3. Keep a temporary compatibility allowlist for non-sensitive legacy file categories.
4. Add response headers to reduce MIME sniffing and unintended inline execution.

Execution Gate:

`APPROVE_UPLOADS_EXPOSURE_HARDENING_GATE`

Status: completed with conditions.

Required prechecks:

- Confirm all modules currently referencing `/uploads`.
- Identify whether any production workflows depend on direct image/PDF rendering.
- Confirm rollback command and config backup.
- Confirm no directory browsing for `/uploads`.

Rollback:

- Restore previous Nginx `/uploads/` block from backup.
- Reload Nginx only after explicit approval.

## Phase 3: Legacy Upload To File Metadata

Objectives:

- Make uploads metadata-backed.
- Stop returning raw URL as the primary contract.
- Persist `module_code`, `owner_type`, `owner_id`, `company_code`, `store_code`, `visibility`, checksum, and status.

Future implementation requirements:

- Upload result should return `file_id`, status, and protected endpoint references, not `/uploads/contracts/...`.
- `visibility` defaults to `PROTECTED`.
- Existing legacy consumers need an adapter period.
- Store Payment must accept only `file_metadata.file_id`.

Recommended next execution Gate:

`APPROVE_LEGACY_UPLOAD_TO_FILE_METADATA_GATE`

Rollback:

- Keep legacy raw URL response behind compatibility flag only if explicitly approved.
- Do not delete historical files during rollback.

## Phase 4: Historical File Inventory And Metadata Backfill

Objectives:

- Identify business ownership of existing 74 files.
- Avoid blind metadata backfill.
- Avoid deleting or moving files before ownership is known.

Future approved Gate should:

- Generate a historical inventory with file hashes, extension, size, and candidate module.
- Map files to business records only after module owner confirms rules.
- Insert metadata only after dedicated DB-write approval.

Rollback:

- Metadata rows inserted by a future Gate must have a reversible audit trail.
- Physical file deletion remains prohibited unless separately approved.

## Phase 5: Store Payment Attachment Formalization

Objectives:

- Make Store Payment QR / proof files production-ready through `file_metadata`.
- Use protected status / preview / download only.
- Record denied audit or structured security logs.
- Move UAT-proven paths toward controlled production readiness.

Required conditions:

- `/uploads` exposure hardening accepted.
- Legacy upload migration strategy approved.
- Store Payment file metadata rows are created through an approved data Gate.
- A2 confirms no raw URL, `/uploads`, or `storage_path` exposure.

## Risk-Based Gate Recommendation

Next single Gate:

`APPROVE_LEGACY_UPLOAD_TO_FILE_METADATA_GATE`

Why:

- Public Nginx `/uploads` exposure has been hardened.
- Legacy upload still returns raw `/uploads/contracts/...` and does not write `file_metadata`.
- API internal static serving still exists and should be retired or gated as part of the metadata migration.

Do not bundle:

- broad historical metadata backfill.
- menu / role sync.
- deployment.
- service restart.
- production push.

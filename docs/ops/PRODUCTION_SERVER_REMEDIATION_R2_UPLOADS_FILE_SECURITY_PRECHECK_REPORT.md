# Production Server Remediation R2 Uploads / File Security Precheck Report

Date: 2026-06-24

## Conclusion

READY_FOR_UPLOADS_FILE_SECURITY_REMEDIATION_PLAN.

The approved read-only uploads / file security precheck completed. It found one confirmed P0 risk: legacy `/uploads/contracts/<file>` files are directly reachable from the API static file server and the active Nginx config intentionally proxies `/uploads/` to the API container.

No files were deleted or moved. No permissions, Nginx config, environment, DB data, migration, deployment, restart, push, or business code were changed.

## Remote Audit Directory

`/opt/phoenix-erp-backups/remediation-r2-uploads-file-security-precheck-20260624-001809`

Generated remote evidence:

- `manifest.json`
- `uploads_inventory.txt`
- `uploads_permissions_summary.txt`
- `nginx_uploads_exposure_summary.txt`
- `legacy_upload_endpoint_summary.txt`
- `file_metadata_state.txt`
- `protected_attachment_boundary_summary.txt`
- `uploads_security_risk_classification.txt`

## Uploads Inventory Summary

Remote evidence from the API container:

- Upload volume: `phoenix_uploads`
- API container uploads root: `/app/uploads`
- Total size: `63.8M`
- File count: `74`
- Directory count: `2`
- File extensions observed: `pdf` 38, `jpg` 19, `png` 17
- Large files over 50MB: none reported
- Executable files: none reported
- Store Payment filename hits: none reported by filename search

## File Permissions Summary

- `/app/uploads` permission: `755`
- Owner/group: `phoenix:phoenix`
- No executable upload files were reported by the evidence script.

## Nginx /uploads Exposure

Active Nginx config contains an explicit `/uploads/` location:

```nginx
location /uploads/ {
    proxy_pass http://127.0.0.1:3100;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

Probe summary:

- `http://127.0.0.1/uploads/`: 404
- `http://127.0.0.1/uploads/contracts/`: 404
- `http://127.0.0.1:3100/uploads/`: 404
- `http://127.0.0.1:3100/uploads/contracts/`: 404
- `http://127.0.0.1:3100/uploads/contracts/[REDACTED_BASENAME]`: 200, `application/pdf`

Directory listing was not confirmed for `/uploads/`. The raw scanner saw `autoindex on` lines in old backup / docs configs, but the active `/uploads/` block does not show `autoindex on`.

## Legacy Upload Endpoint State

The legacy upload controller is still active:

- Controller path: `POST /api/upload/contract`
- Auth guard: `AuthGuard('jwt')`
- Allowed extensions: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`
- Size limit: 15 MB
- Storage destination: `uploads/contracts`
- Response returns raw URL style path: `/uploads/contracts/${file.filename}`
- Evidence did not show `file_metadata` writes.
- Evidence did not show `module_code`, `owner_type`, or `owner_id` binding.

This endpoint is not safe for Store Payment protected preview/download and should be treated as legacy until a dedicated migration Gate replaces the raw URL contract.

## File Metadata State

Read-only DB evidence:

- DB: `phoenix_erp`
- Schema: `public`
- `file_metadata`: exists
- `file_metadata` row count: `0`
- Store Payment file metadata rows: `0`
- Indexes: `IDX_file_metadata_company_store`, `IDX_file_metadata_deleted_at`, `IDX_file_metadata_owner`, `IDX_file_metadata_status`, `IDX_file_metadata_uploaded_by`, `PK_file_metadata`, `UQ_file_metadata_file_id`

## Protected Attachment Boundary State

Store Payment protected attachment code paths are present:

- Store Payment uses `FileAccessService`.
- Protected endpoints exist for status / preview / download.
- Protected status responses keep `rawUrl: null`.
- FileAccessService rejects `uploads` and `/uploads` storage references for protected access.
- FileAccessService uses `file_metadata.file_id`, owner policy, RBAC, DataScope, and storage-root confinement before streaming.

No public proof / QR preview/download enablement was performed in this precheck.

## P0 Risks

Confirmed P0 count: 1.

1. `P0-001`: A legacy `/uploads/contracts/[file]` object is directly reachable from the API static file server with HTTP 200. Because the active Nginx config proxies `/uploads/` to the API, this is a public exposure risk for any file whose path is known.

Candidate not counted as confirmed P0:

- The scanner saw `autoindex on` in old backup / docs config files, but active `/uploads/` config did not show autoindex and directory probes returned 404.

## P1 Risks

Confirmed P1 count: 3.

1. `P1-001`: legacy upload returns `/uploads/contracts/...` raw URL style paths.
2. `P1-002`: `file_metadata` exists but has 0 rows; legacy uploads are not metadata-backed.
3. `P1-003`: legacy upload evidence does not show module / owner binding.

## P2 Risks

Confirmed P2 count: 2.

1. `P2-001`: checksum, lifecycle, archival, and retention policy for historical uploads require a separate inventory and remediation plan.
2. `P2-002`: historical file business ownership is unknown until metadata backfill mapping is approved.

## A1 Review

PASS WITH CONDITIONS.

- Manifest exists.
- Required remote evidence files exist.
- No file delete: yes.
- No file move: yes.
- No DB write: yes.
- No Nginx change: yes.
- No deploy: yes.
- No restart: yes.
- W5 gate must be run after docs update and commit.

## A2 Review

PASS WITH CONDITIONS.

- Sensitive paths were summarized without credentials.
- Raw URL risk was identified.
- `/uploads` exposure risk was identified.
- Store Payment protected endpoint remains isolated from legacy raw URL usage.
- Immediate P0 remediation should focus on hardening `/uploads` exposure without breaking dependent legacy modules.

## A5 Review

GO WITH CONDITIONS.

- `file_metadata` is now present but empty.
- Legacy uploads currently remain outside the metadata / owner model.
- Store Payment readiness can continue only if QR / proof files use `file_metadata` and protected endpoints, not legacy `/uploads` URLs.
- Menu / role / DataScope and master data remediation remain separate follow-up Gates.

## Boundary Confirmation

| Action | Executed |
| --- | --- |
| Delete files | No |
| Move files | No |
| Change permissions | No |
| Change Nginx | No |
| Change env | No |
| Write DB | No |
| Insert file_metadata | No |
| Execute migration | No |
| Deploy | No |
| Restart service | No |
| Push | No |
| Modify business code | No |

## Current Conclusion

READY_FOR_UPLOADS_FILE_SECURITY_REMEDIATION_PLAN.

Recommended single next Gate:

`APPROVE_UPLOADS_EXPOSURE_HARDENING_GATE`


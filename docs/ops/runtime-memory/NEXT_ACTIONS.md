# Next Actions

Last updated: 2026-06-23

1. `APPROVE_REMOTE_CODE_ALIGNMENT_AND_SCHEMA_REPAIR_PRECHECK`.
2. `APPROVE_STORE_PAYMENT_SCHEMA_MIGRATION_REPAIR_IF_STILL_ABSENT`.
3. `APPROVE_FILE_METADATA_MIGRATION_REPAIR`.
4. `APPROVE_INITIAL_DATA_IMPORT_REPAIR`.
5. `APPROVE_MASTER_DATA_REMEDIATION_PLAN`.
6. `APPROVE_PERMISSION_AND_MENU_REMEDIATION_PLAN`.
7. `APPROVE_UPLOADS_FILE_SECURITY_REMEDIATION`.

## Recommended Immediate Sequence

1. Approve the remote code alignment and schema repair precheck Gate.
2. Confirm whether remote `main@87b5781` should be advanced to a commit containing `1782042418112-CreateFileMetadata.ts`.
3. Confirm whether the audited DB target is the intended remediation DB before any migration execution.
4. Run initialization import, master data, RBAC/DataScope, and uploads security diagnostics as separate Gates.
5. Keep `/uploads` and raw URL exposure forbidden for Store Payment.
6. Keep local UAT fixture data out of production-side remediation unless explicitly approved.

## Do Not Auto-Start

- production `push main` deployment path.
- production deployment.
- production preview/download enablement without staging evidence.
- push to main.
- Production DB writes.
- Reusing production DB as staging DB.
- Reusing production file storage as staging file storage.
- DB writes before backup.
- migration repair before remote code alignment and schema repair precheck.
- service restart before rollback plan.
- file_metadata/schema repair before migration-state audit.

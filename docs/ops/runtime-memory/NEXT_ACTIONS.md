# Next Actions

Last updated: 2026-06-23

1. `APPROVE_MIGRATION_STATE_REPAIR_PLAN`.
2. `APPROVE_INITIAL_DATA_IMPORT_REPAIR`.
3. `APPROVE_MASTER_DATA_REMEDIATION_PLAN`.
4. `APPROVE_PERMISSION_AND_MENU_REMEDIATION_PLAN`.
5. `APPROVE_UPLOADS_FILE_SECURITY_REMEDIATION`.

## Recommended Immediate Sequence

1. Approve the dedicated migration-state audit / repair planning Gate.
2. Confirm whether missing `file_metadata` is expected or a failed/unapplied migration.
3. Run initialization import, master data, RBAC/DataScope, and uploads security diagnostics as separate Gates.
4. Keep `/uploads` and raw URL exposure forbidden for Store Payment.
5. Keep local UAT fixture data out of production-side remediation unless explicitly approved.

## Do Not Auto-Start

- production `push main` deployment path.
- production deployment.
- production preview/download enablement without staging evidence.
- push to main.
- Production DB writes.
- Reusing production DB as staging DB.
- Reusing production file storage as staging file storage.
- DB writes before backup.
- migration repair before migration-state audit.
- service restart before rollback plan.
- file_metadata/schema repair before migration-state audit.

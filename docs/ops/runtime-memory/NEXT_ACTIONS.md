# Next Actions

Last updated: 2026-06-23

1. `APPROVE_REMOTE_CODE_ALIGNMENT_EXECUTION_GATE`.
2. `APPROVE_STORE_PAYMENT_SCHEMA_DRIFT_RECONCILIATION_GATE`.
3. `APPROVE_FILE_METADATA_MIGRATION_EXECUTION_GATE`.
4. `APPROVE_STORE_PAYMENT_SCHEMA_REPAIR_EXECUTION_GATE`.
5. `APPROVE_MENU_ROLE_DATASCOPE_REMOTE_SYNC_GATE`.
6. `APPROVE_MASTER_DATA_REMEDIATION_GATE`.

## Recommended Immediate Sequence

1. Approve `REMOTE_CODE_ALIGNMENT_EXECUTION_GATE`.
2. Align remote code to the user-approved commit containing `1782042418112-CreateFileMetadata.ts`; do not execute migration in that Gate.
3. Run `STORE_PAYMENT_SCHEMA_DRIFT_RECONCILIATION_GATE` to recheck DB identity, schema/search_path, migration history, and cross-schema table presence.
4. Only then consider `FILE_METADATA_MIGRATION_EXECUTION_GATE` and Store Payment schema repair.
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
- migration repair before remote code alignment execution and Store Payment drift reconciliation.
- service restart before rollback plan.
- file_metadata/schema repair before migration-state audit.

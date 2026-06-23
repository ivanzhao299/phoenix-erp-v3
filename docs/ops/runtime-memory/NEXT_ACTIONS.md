# Next Actions

Last updated: 2026-06-23

1. `APPROVE_BACKUP_AND_SNAPSHOT`.
2. `APPROVE_DB_BACKUP`.
3. `APPROVE_MIGRATION_STATE_REPAIR_PLAN`.
4. `APPROVE_MASTER_DATA_REMEDIATION_PLAN`.
5. `APPROVE_PERMISSION_AND_MENU_REMEDIATION_PLAN`.

## Recommended Immediate Sequence

1. Approve or reject the first remediation batch in `docs/ops/PRODUCTION_SERVER_REMEDIATION_FIRST_FIX_BATCH.md`.
2. Start with backup/snapshot before any database, file, deploy, or configuration write.
3. Stabilize read-only SSH inventory so the server can be audited without manual Terminal work.
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

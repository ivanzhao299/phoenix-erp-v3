# PHOENIX ERP — PRODUCTION STORAGE STATUS BOARD

更新时间：2026-10-05（Asia/Singapore）

| Area | Status | Evidence |
|---|---|---|
| M1 repository hardening | PASS | main `017633c5fb0a090d7b8cda375125d1832668f304` |
| M2 Attempt 1 | Rolled back pre-write | forensic copy retained |
| M2 Attempt 2 | PASS | cold copy, counts, mounts and health checks passed |
| PostgreSQL | Healthy | 16.14; `/data/phoenix-erp-data/postgres` |
| Uploads | PASS | `/data/phoenix-erp-data/uploads`; 127 files verified |
| Legacy file compatibility | PASS | 15/15 files, size/checksum match; ACL negative checks 401 |
| API | Healthy | pinned M2 image; health/readiness 200 |
| Web | Healthy | pinned M2 image; `/login` 200 |
| `/data` guard | PASS | mounted ext4 with sentinel |
| Stability gate | PASS | three consecutive rounds; no unexpected restarts |
| Production checkout | PASS | `/data/phoenix-erp`, clean `main` |
| GitHub `DEPLOY_PATH` | PASS | `/data/phoenix-erp`; audit workflow succeeded |
| Legacy path | Compatibility only | `/opt/phoenix-erp -> /data/phoenix-erp` |
| Named volumes | Retained | `phoenix_pg_data`, `phoenix_uploads` |
| Backup storage | Deferred | `/opt/phoenix-erp-backups` unchanged |
| M3 | Completed | checkout relocation and path verification passed |

## Operational boundaries

- Do not delete or prune old named volumes during the observation period.
- Do not treat the old named volume as a lossless rollback after write reopen; preserve current `/data` state and use controlled recovery.
- Do not move backup storage in this track.
- Do not start a new engineering batch or proactive product audit from this migration closeout.

## Track closure

```text
LATEST_MAIN=8a56c2c5dc396d7f0eef86e6dae28ab22d167b7c
PRODUCTION_API_COMMIT=017633c5fb0a090d7b8cda375125d1832668f304
PRODUCTION_WEB_COMMIT=5425089bcb51338d4780d6f37782440bade8b90c

DB_STORAGE=/data/phoenix-erp-data/postgres
UPLOAD_STORAGE=/data/phoenix-erp-data/uploads
DEPLOY_PATH=/data/phoenix-erp

M1_REPOSITORY_HARDENING=PASS
M2_ATTEMPT_1=ROLLED_BACK_PRE_WRITE
M2_ATTEMPT_2=COMPLETED
M2_DATA_CUTOVER=PASS
M3_CHECKOUT_RELOCATION=COMPLETED
DATA_CUTOVER_STABLE=YES
POST_MIGRATION_VERIFICATION=PASS
PRODUCTION_STORAGE_MIGRATION=VERIFIED_COMPLETE
MIGRATION_COMPLETE=YES

STORAGE_MIGRATION_TRACK=CLOSED
M2_EXECUTION_MODE=OFF
M3_EXECUTION_MODE=OFF
STORAGE_MIGRATION_CHANGE_AUTHORIZATION=EXPIRED_AFTER_SUCCESSFUL_COMPLETION

OLD_DB_VOLUME_RETAINED=YES
OLD_UPLOAD_VOLUME_RETAINED=YES
ATTEMPT1_FORENSIC_COPY_RETAINED=YES
OLD_CHECKOUT_ARCHIVE_RETAINED=YES
CLEANUP=DEFERRED
BACKUP_STORAGE_RELOCATION=DEFERRED

PROJECT_MODE=PRODUCT_ACCEPTANCE_AND_FEEDBACK_DRIVEN_MAINTENANCE
PROACTIVE_ENGINEERING_AUDIT=PAUSED
AUTO_START_BATCH11=NO
ENGINEERING_ACTION=NONE
HUMAN_UAT_STATUS=PENDING
```

The accepted residual risk is the documented `nofail` mount configuration with the fail-closed data guard enabled and host reboot verification passed. Any boot-order hardening, volume cleanup, forensic-copy cleanup, backup relocation, or metadata normalization requires a separate approved maintenance track.

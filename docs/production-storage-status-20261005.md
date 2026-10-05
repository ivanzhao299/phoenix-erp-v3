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

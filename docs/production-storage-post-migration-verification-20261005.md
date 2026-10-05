# Post-Migration Production Verification Report

- Verification date: 2026-10-05 (UTC+8)
- Scope: Phoenix ERP post-migration production acceptance only.
- No schema migration, business-data repair, PostgreSQL major upgrade, volume deletion, backup deletion, forensic-copy deletion, or application redeploy was performed.

## Result

```
POST_MIGRATION_VERIFICATION=PASS
PROACTIVE_ENGINEERING_AUDIT=PAUSED
AUTO_START_BATCH11=NO
```

## Baseline and release identity

```
VERIFY_START_TIME=2026-10-05T11:46:20+08:00
VERIFY_END_TIME=2026-10-05T12:10:32+08:00
LATEST_MAIN=c33df41560efd9720a9bddeb863eae36fa25ce7a
PRODUCTION_API_COMMIT=017633c5fb0a090d7b8cda375125d1832668f304
PRODUCTION_WEB_COMMIT=5425089bcb51338d4780d6f37782440bade8b90c
```

The production checkout remains on the deployed application baseline `017633c5...`; `c33df415...` is the latest docs-only main and was not deployed.

## Storage and boot

```
DATA_MOUNT=PASS (/dev/nvme1n1 -> /data)
DATA_FILESYSTEM=ext4
DATA_SENTINEL=PASS
MOUNT_GUARD=PASS
FSTAB=UUID=834b8d17-5559-4167-b19d-daafd37a1cde /data ext4 defaults,nofail 0 2
BOOT_ORDER_STORAGE_RISK=MEDIUM
```

The data mount is ordered before `sysinit.target`, which precedes Docker startup. The `nofail` option remains a residual risk if the disk is unavailable; the production environment now enables `PHOENIX_DATA_MOUNT_GUARD=true`, and the guard was validated before and after reboot.

## Effective and actual container storage

```
DB_CONFIGURED_STORAGE=/data/phoenix-erp-data/postgres
DB_ACTUAL_STORAGE=/data/phoenix-erp-data/postgres -> /var/lib/postgresql/data
UPLOAD_CONFIGURED_STORAGE=/data/phoenix-erp-data/uploads
UPLOAD_ACTUAL_STORAGE=/data/phoenix-erp-data/uploads -> /app/uploads
ACTUAL_STORAGE_MATCHES_COMPOSE=YES
```

Production workflow audit run `37261626616` succeeded from main and used the secret-driven deploy path.

## Database

```
POSTGRES_VERSION=16.14
POSTGRES_MAJOR=16
POSTGRES_DATA_DIRECTORY=/var/lib/postgresql/data
MIGRATION_LEDGER=PASS (89 rows)
DATABASE_SANITY=PASS
```

Post-reboot read-only counts remained sane:

```
sys_user=45
sys_organizations=60
prc_purchase_orders=0
sal_sales_orders=46
inv_batches=313
fin_ar_invoices=34
fin_ap_invoices=16
mst_stores=10
file_metadata=56
migrations=89
```

## Uploads and protected attachments

```
UPLOAD_SANITY=PASS
UPLOAD_FILE_COUNT=127
UPLOAD_BYTES=100009873
LEGACY_ACTIVE_METADATA_COUNT=15
LEGACY_ATTACHMENT_COMPATIBILITY=PASS
```

The named-volume and /data upload trees matched by per-file SHA256, file count, and byte count. The deployed resolver includes the exact legacy Phoenix volume-prefix mapping and path/name safety checks. Unauthenticated status, preview, and download requests returned 401; direct static upload access returned 404.

## Runtime recovery

```
ONLINE_DB_HEALTH=PASS
ONLINE_API_HEALTH=200
ONLINE_API_READINESS=200
ONLINE_WEB=PASS
CONTAINER_RESTART_RECOVERY=PASS
HOST_REBOOT_EXECUTED=YES
POST_REBOOT_DATA_MOUNT=PASS
POST_REBOOT_STORAGE_BINDINGS=PASS
POST_REBOOT_DB=PASS
POST_REBOOT_API=PASS
POST_REBOOT_WEB=PASS
POST_REBOOT_UPLOADS=PASS
POST_REBOOT_STABILITY_ROUNDS=3/3 PASS
CRITICAL_ERRORS=NONE
```

Web, API, and DB were restarted in sequence before the host reboot. After reboot, three consecutive checks passed with no critical storage/database errors or unexpected restarts. The two DB `FATAL: terminating connection due to administrator command` lines were from the intentional controlled DB restart and were not post-reboot faults.

## Backup and retained evidence

```
ATTEMPT1_BACKUP=/opt/phoenix-erp-backups/phoenix-m2-pre-cutover-20261005T011003Z.dump
ATTEMPT1_BACKUP_SIZE=197045076
ATTEMPT1_BACKUP_TOC=2938
ATTEMPT1_BACKUP_SHA256=76fba769ff27c07de7027134a213595e61c574d3ae7937e0b0812d0961e36dfd

ATTEMPT2_BACKUP=/opt/phoenix-erp-backups/phoenix-m2-attempt2-20261005T022739Z.dump
ATTEMPT2_BACKUP_SIZE=198199285
ATTEMPT2_BACKUP_TOC=2941
ATTEMPT2_BACKUP_SHA256=7449bdb6e1b6ba6ba9f8c664c0c6aff28fc177ed551b10b7e4e05773e1808504

OLD_DB_VOLUME_RETAINED=YES
OLD_UPLOAD_VOLUME_RETAINED=YES
ATTEMPT1_FORENSIC_COPY_RETAINED=YES
OLD_CHECKOUT_ARCHIVE_RETAINED=YES
BACKUP_STORAGE_RELOCATION=DEFERRED
CLEANUP=DEFERRED
```

Both backups remained readable by `pg_restore --list`. No restore was performed.

## Deploy path

```
DEPLOY_PATH=/data/phoenix-erp
DEPLOY_HEAD=017633c5fb0a090d7b8cda375125d1832668f304
DEPLOY_BRANCH=main
DEPLOY_WORKTREE_CLEAN=YES
DEPLOY_REMOTE=git@github.com:ivanzhao299/phoenix-erp-v3.git
GITHUB_DEPLOY_PATH=PASS
LEGACY_SYMLINK=/opt/phoenix-erp -> /data/phoenix-erp
OLD_CHECKOUT_ARCHIVE=/opt/phoenix-erp.pre-m3-20261005T025402Z
```

## Capacity and guard negative tests

```
ROOT_FS_HEALTH=PASS (68% used, 12G available)
DATA_FS_HEALTH=PASS (3% used, 91G available)
MOUNT_GUARD_NEGATIVE_TEST=PASS
```

The negative fixture covered missing mount, missing sentinel, and a path outside `/data`; every case exited non-zero without unmounting production storage.


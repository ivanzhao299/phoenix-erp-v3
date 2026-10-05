# PHOENIX ERP — PRODUCTION STORAGE MIGRATION FINAL REPORT

执行日期：2026-10-05（Asia/Singapore）

## Scope and commits

```text
LATEST_MAIN=017633c5fb0a090d7b8cda375125d1832668f304
M1_REPOSITORY_HARDENING=PASS
M2_BLOCKER_PR=325
M2_ATTEMPT_1=ROLLED_BACK_PRE_WRITE
M2_ATTEMPT_2=COMPLETED
M3_CHECKOUT_RELOCATION=COMPLETED
```

本次没有 PostgreSQL major upgrade、schema migration、业务数据修复、backup storage relocation 或产品功能改动。

## M2 Attempt 2

```text
M2_ATTEMPT_2_BACKUP=/opt/phoenix-erp-backups/phoenix-m2-attempt2-20261005T022739Z.dump
BACKUP_SIZE=198199285
BACKUP_TOC=2941
BACKUP_SHA256=7449bdb6e1b6ba6ba9f8c664c0c6aff28fc177ed551b10b7e4e05773e1808504

SOURCE_DB_VOLUME=phoenix_pg_data
TARGET_DB_DIR=/data/phoenix-erp-data/postgres
SOURCE_UPLOAD_VOLUME=phoenix_uploads
TARGET_UPLOAD_DIR=/data/phoenix-erp-data/uploads

POSTGRES_VERSION=16.14
POSTGRES_MAJOR=16
DB_COLD_COPY=PASS (3504 files; 1225770077 file bytes)
UPLOAD_FINAL_SYNC=PASS (127 files; 100009873 bytes)
```

PGDATA 在 PostgreSQL clean shutdown 后通过 named-volume helper container 冷复制。Attempt 1 的目录已原子归档到：

```text
/data/phoenix-erp-migration-attempt1/postgres
/data/phoenix-erp-migration-attempt1/uploads
```

Attempt 1 副本和旧 named volumes 均未删除或 prune。

## Data consistency and runtime verification

M2 Attempt 2 pre/post 只读计数一致：

```text
sys_user              45
sys_organizations     60
prc_purchase_orders    0
sal_sales_orders      46
inv_batches          313
fin_ar_invoices       34
fin_ap_invoices       16
mst_stores             10
file_metadata         56
migrations            89
typeorm_migrations  ABSENT
```

```text
DATABASE_COUNTS_CONSISTENT=YES
MIGRATION_LEDGER_CONSISTENT=YES
```

15 条 ACTIVE legacy metadata 均通过受控 server-side evidence：

```text
LEGACY_ACTIVE_METADATA_COUNT=15
LEGACY_PHYSICAL_FILES=15/15
SIZE_MISMATCH=0
CHECKSUM_MISMATCH=0
LEGACY_ATTACHMENT_COMPATIBILITY=PASS_BY_CONTROLLED_SERVER_SIDE_EVIDENCE
ACL_NEGATIVE_HTTP=PASS (status/preview/download unauthenticated requests returned 401)
```

## Images and mounts

```text
M2_API_IMAGE=phoenix-m2-api:baseline-017633c5fb0a090d7b8cda375125d1832668f304
M2_WEB_IMAGE=phoenix-m2-web:baseline-5425089bcb51338d4780d6f37782440bade8b90c
NO_LATEST_IMAGE_USAGE=YES

DB_STORAGE=/data/phoenix-erp-data/postgres
UPLOAD_STORAGE=/data/phoenix-erp-data/uploads
```

DB、API、Web 均使用 bind mount；API `/api/health` 和 `/api/readiness` 返回 200，Web `/login` 返回 200，根路径按预期返回 307。切换后连续三轮检查均通过，未出现非预期重启或新的关键 API 错误。

## Business write reopen and stability

```text
BUSINESS_WRITES_REOPENED=YES
WRITE_REOPEN_TIMESTAMP=2026-10-05T10:43:56+08:00
DATA_CUTOVER_STABLE=YES
PRE_WRITE_ROLLBACK_READY=YES
```

从恢复写入时刻起，旧 named volumes 仅作为 stale evidence/fallback 保留，不作为无损回滚目标。

## M3 checkout relocation

```text
SOURCE_DEPLOY_PATH=/opt/phoenix-erp
TARGET_DEPLOY_PATH=/data/phoenix-erp
PRODUCTION_DEPLOY_PATH=/data/phoenix-erp
GITHUB_DEPLOY_PATH=PASS

DEPLOY_BRANCH=main
DEPLOY_HEAD=017633c5fb0a090d7b8cda375125d1832668f304
DEPLOY_WORKTREE_CLEAN=YES
DEPLOY_REMOTE=git@github.com:ivanzhao299/phoenix-erp-v3.git

LEGACY_DEPLOY_SYMLINK=/opt/phoenix-erp -> /data/phoenix-erp
OLD_CHECKOUT_ARCHIVE=/opt/phoenix-erp.pre-m3-20261005T025402Z
```

新 checkout 保留生产 `.env`，权限为 `0600`，由 `phoenix-codex-deploy` 持有；没有提交任何 secret。生产磁盘只读审计 workflow 已成功使用新的 `DEPLOY_PATH`。

## Retention and follow-up

```text
OLD_DB_VOLUME_RETAINED=YES
OLD_UPLOAD_VOLUME_RETAINED=YES
ATTEMPT_1_FORENSIC_COPY_RETAINED=YES
BACKUP_STORAGE_RELOCATION=DEFERRED
```

保留以下可恢复证据：

- `/opt/phoenix-erp-backups/` 下 Attempt 1 和 Attempt 2 backup；
- `/data/phoenix-erp-migration-attempt1/`；
- `phoenix_pg_data`、`phoenix_uploads`；
- `/opt/phoenix-erp.pre-m3-20261005T025402Z`。

```text
MIGRATION_COMPLETE=YES
M3_CHECKOUT_RELOCATION=COMPLETED
PROJECT_MODE=PRODUCT_ACCEPTANCE_AND_FEEDBACK_DRIVEN_MAINTENANCE
PROACTIVE_ENGINEERING_AUDIT=PAUSED
AUTO_START_BATCH11=NO
```

# PRODUCTION STORAGE MIGRATION PREFLIGHT

日期：2026-10-04（Asia/Singapore）

## Git / checkout

```text
ORIGIN_MAIN_HEAD=7bfe0f0fcd78f1f3bd10cdb8176410e9147b9b45
ACTUAL_DEPLOY_PATH=/opt/phoenix-erp
DEPLOY_BRANCH=main
DEPLOY_HEAD=86d18b123f823abb73a4d8cc2049cd9ef2e92402
DEPLOY_WORKTREE_CLEAN=YES
DEPLOY_REMOTE=git@github.com:ivanzhao299/phoenix-erp-v3.git
```

运行容器镜像 revision：

```text
CURRENT_PRODUCTION_API_COMMIT=86d18b123f823abb73a4d8cc2049cd9ef2e92402
CURRENT_PRODUCTION_WEB_COMMIT=5425089bcb51338d4780d6f37782440bade8b90c
```

## PostgreSQL / volumes

```text
POSTGRES_CONTAINER_IMAGE=postgres:16-alpine
POSTGRES_SERVER_VERSION=16.14
PRODUCTION_PG_MAJOR=16
POSTGRES_DATA_DIRECTORY=/var/lib/postgresql/data
CURRENT_DATABASE=phoenix_erp

DB_NAMED_VOLUME=phoenix_pg_data
DB_VOLUME_MOUNTPOINT=/var/lib/docker/volumes/phoenix_pg_data/_data
DB_VOLUME_SIZE=1.2G (root-only inspection)

UPLOADS_NAMED_VOLUME=phoenix_uploads
UPLOADS_VOLUME_MOUNTPOINT=/var/lib/docker/volumes/phoenix_uploads/_data
UPLOADS_VOLUME_SIZE=96M (root-only inspection)
```

仓库 Compose 目标也是 PostgreSQL 16；本 Track 不包含 major upgrade。

## `/data`

```text
DATA_DEVICE=/dev/nvme1n1
DATA_FILESYSTEM=ext4
DATA_MOUNTPOINT=/data
DATA_FREE_SPACE=93G
DATA_FSTAB_PRESENT=YES
DATA_FSTAB_ENTRY=UUID=834b8d17-5559-4167-b19d-daafd37a1cde /data ext4 defaults,nofail 0 2
DATA_MOUNT_CURRENTLY_PRESENT=YES
DATA_MOUNT_PERSISTENT=PARTIAL (nofail permits boot without the disk)
DATA_SENTINEL=/data/.phoenix-data-volume
DATA_SENTINEL_CURRENT=NO
```

## Backup

```text
BACKUP_PATH=/opt/phoenix-erp-backups
BACKUP_PATH_OWNER=root:root
BACKUP_PATH_MODE=0700
BACKUP_STORAGE_RELOCATION=FOLLOW_UP
```

## Gate

```text
M0_READ_ONLY=PASS
PRODUCTION_PG_MAJOR_MATCHES_COMPOSE=YES
DATA_CUTOVER_ALLOWED=NO (sentinel and target directories are not provisioned)
PRODUCTION_DATA_WRITES=0
PRODUCTION_CONTAINERS_STOPPED=NO
```

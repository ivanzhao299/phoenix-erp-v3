# Phoenix ERP 生产存储与部署路径迁移 Runbook

本 Track 只做存储位置迁移，不升级 PostgreSQL major、不移动备份目录、不修改业务代码和数据库 schema。

目标路径：

- PostgreSQL：`phoenix_pg_data` → `/data/phoenix-erp-data/postgres`
- uploads：`phoenix_uploads` → `/data/phoenix-erp-data/uploads`
- production checkout：现有目录 → `/data/phoenix-erp`
- GitHub Environment secret：`DEPLOY_PATH=/data/phoenix-erp`

## M0：只读生产预检

记录当前 production checkout、API/Web 镜像 revision、Compose working directory、PostgreSQL 实际版本和数据目录、两个 volume 的挂载点、`/data` 设备/文件系统/空闲空间、`/etc/fstab` 条目、sentinel、备份目录和工作树状态。

生产 PostgreSQL 版本必须通过容器内只读 SQL 确认：

```sql
SHOW server_version;
SHOW data_directory;
SELECT current_database();
```

本 Track 要求 source major 与目标容器 major 相同。不能以 CI 注释或目标假设替代生产实测。

## M1：仓库加固

先合并仓库改动，再进行生产数据切换：

1. Compose 通过 `PHOENIX_PG_DATA_DIR` 和 `PHOENIX_UPLOADS_DIR` 选择 bind source，未设置时继续使用现有 named volume。
2. `scripts/ops/require-phoenix-data-mount.sh` 在 `PHOENIX_DATA_MOUNT_GUARD=true` 时检查 `/data` mount、`/data/.phoenix-data-volume`、两个目标目录和它们实际的 mount target；任一检查失败即退出。
3. `deploy.yml` 在 `git pull` 且 SHA 校验后、任何 Compose 操作前调用 guard。
4. `production-disk-maintenance.yml` 使用 `DEPLOY_PATH` 和 `/data/phoenix-erp-data` 报告空间，并调用同一 guard。
5. M1 的生产 `.env` 不设置 `PHOENIX_*_DIR`，因此生产行为保持 named volume 不变。

M1 退出条件：

```text
M1_REPOSITORY_HARDENING=PASS
PRODUCTION_BEHAVIOR_UNCHANGED=YES
```

## M2：数据卷切换

M2 需要维护窗口。禁止在线复制 PostgreSQL 的 `PGDATA`。

1. 重新执行 M0，确认 `/data` 已挂载、sentinel 已核验、空间足够、PG major 匹配。
2. 生成并验证 `pg_dump --format=custom`，确认文件非空、TOC 大于零并保存 SHA-256。
3. 停止 API 和 Web，确认业务写入已停止。
4. API 停止后做 uploads 最终同步。
5. 干净停止 PostgreSQL 容器。
6. 使用 helper container 将 named volume 内容复制到 `/data`，保留 numeric UID/GID、权限、时间戳和符号链接；不在线复制 PGDATA。
7. 确认目标目录存在且 `findmnt -T` 返回 `/data`，创建并核验 `/data/.phoenix-data-volume`。
8. 在生产 `.env` 设置：

```dotenv
PHOENIX_DATA_MOUNT_GUARD=true
PHOENIX_PG_DATA_DIR=/data/phoenix-erp-data/postgres
PHOENIX_UPLOADS_DIR=/data/phoenix-erp-data/uploads
```

9. 运行 `docker compose config`，确认 effective source 是两个 `/data` 路径。
10. 只启动 DB，验证健康状态、版本、数据目录、migration ledger 和关键表只读计数。
11. 启动 API，验证 `/api/health`、`/api/readiness`、DB 连接和 uploads 读取。
12. 启动 Web，验证登录页和核心只读路径。
13. 所有检查通过后才恢复业务写入。

旧 named volume 只在重新开放写入前可作为快速回退源。写入重新开放后它立即变为 stale，不能直接 attach 回退，否则会丢失切换后的交易；后续故障必须停止写入并走当前 `/data` 状态的受控恢复流程。

## M3：部署 checkout 切换

数据切换稳定观察后再移动 checkout：

1. 在 `/data/phoenix-erp` 创建干净的 `main` checkout。
2. 复核 remote、HEAD、工作树和生产所需的非 Git 文件清单。
3. 安全复制 `.env`，保持权限；不将 `.env` 提交到 Git。
4. 在新目录执行 `docker compose config`，确认仍指向两个 `/data` 数据目录。
5. 更新 GitHub Environment secret `DEPLOY_PATH=/data/phoenix-erp`。
6. 运行只读维护/审计 workflow，确认 `cd DEPLOY_PATH`、Git 状态、Compose 配置和容器状态。
7. 只有确有旧脚本依赖时，才在旧路径处理原目录后建立兼容软链接；软链接不是长期路径来源。

`/opt/phoenix-erp-backups` 和 `/opt/phoenix` 本 Track 保持原位置。备份目录迁移作为后续独立 Track。

## M2 Attempt 1 回滚与重试前 blocker 门禁

Attempt 1 如果在恢复业务写入前回退，必须明确记录为：

```text
M2_ATTEMPT_1=ROLLED_BACK_PRE_WRITE
```

切回 named volumes 后，Attempt 1 的 `/data/phoenix-erp-data/postgres` 和
`/data/phoenix-erp-data/uploads` 只是 stale forensic snapshot。它们不得用于下一次
切换，也不得用增量复制推断数据库一致性。重试前须在 `/data` 上保留并归档这两份证据，
再创建全新的空目标目录，并重新执行 logical backup、uploads final sync 和 PostgreSQL
cold copy。不得删除原 named volumes、执行 `docker volume prune` 或改写生产 metadata。

历史 `file_metadata.storage_path` 只允许通过应用层兼容解析读取。兼容范围仅为：

```text
/var/lib/docker/volumes/phoenix_uploads/_data/<relative suffix>
```

解析器先提取 suffix，再解析到当前 `process.cwd()/uploads` 根目录；最终路径必须仍在该
根目录内，且 basename 必须等于 `stored_name`。任何 `..`、其他 Docker volume、任意宿主
机绝对路径或文件名不匹配都必须拒绝。不得把 Docker 宿主机 volume 目录挂进 API 容器，
也不得在本 Track 直接更新 `file_metadata`。

M2 的 API/Web 启动不得依赖 Compose 的 `latest` fallback。维护窗口开始前，在当前仍运行的
容器上执行：

```bash
eval "$(bash scripts/ops/capture-m2-image-baseline.sh \
  --expected-api-revision "$PRODUCTION_API_COMMIT" \
  --expected-web-revision "$PRODUCTION_WEB_COMMIT")"
```

该 helper 只读取运行容器和 OCI revision label，并创建指向当前 image ID 的本地临时 tag；
它不 pull、build、push 或重启。若 image ID、revision label 或期望 revision 无法确认，
必须 fail closed。输出的 `M2_API_IMAGE`、`M2_WEB_IMAGE` 只在本次切换 shell 会话中使用，
不得写入长期生产 `.env`。

所有 M2 API/Web Compose 操作都必须显式带上固定镜像：

```bash
API_IMAGE="$M2_API_IMAGE" WEB_IMAGE="$M2_WEB_IMAGE" docker compose config
API_IMAGE="$M2_API_IMAGE" WEB_IMAGE="$M2_WEB_IMAGE" docker compose up -d api
API_IMAGE="$M2_API_IMAGE" WEB_IMAGE="$M2_WEB_IMAGE" docker compose up -d web
```

重试前硬门禁必须记录：

```text
M2_API_IMAGE_PINNED=YES
M2_WEB_IMAGE_PINNED=YES
NO_LATEST_IMAGE_USAGE=YES
LEGACY_FILE_PATH_COMPATIBILITY=PASS
```

这些门禁通过后仍只代表 `M2_DATA_CUTOVER_READY=YES`。必须先将修复部署为合并后的
main SHA，并在 named-volume 生产环境完成健康、readiness 及授权附件 status/preview/
download 只读验证；不得因为 blocker 修复完成就自动再次停止生产服务。新的 M2 维护窗口
和数据切换授权必须另行取得。

## 停止条件

出现以下任一项立即停止：`/data` 未挂载、sentinel 缺失、PG major 不一致、备份无效、工作树异常、空间不足、PGDATA 复制不一致、DB 启动失败、关键计数不一致、uploads 缺失、readiness 失败或关键错误日志出现。

## Closeout 2026-10-05

本次生产执行已完成 M2 Attempt 2 和 M3：

- PostgreSQL 16.14 从 `phoenix_pg_data` 冷复制到 `/data/phoenix-erp-data/postgres`；uploads 从 `phoenix_uploads` 最终同步到 `/data/phoenix-erp-data/uploads`。
- API/Web 使用当前运行镜像的本地 immutable M2 tags，未使用 `latest`；这些 tags 只属于切换会话，不写入长期生产 `.env`。
- 生产 `.env` 仅增加两个 `PHOENIX_*_DIR` 变量，保持 `0600`，由部署账户持有，以便正式 Compose/部署 workflow 读取和原子更新。
- 数据切换后连续三轮健康、readiness、登录页、uploads 读取和日志检查通过，才恢复业务写入。
- `/data/phoenix-erp` 为干净 `main` checkout；`DEPLOY_PATH` 已更新。旧 `/opt/phoenix-erp` 保留归档目录并建立兼容软链接。
- `phoenix_pg_data`、`phoenix_uploads` 和 Attempt 1 forensic copy 均保留；`/opt/phoenix-erp-backups` 未迁移。

最终证据见 `docs/production-storage-migration-final-report-20261005.md` 和 `docs/production-storage-status-20261005.md`。


## Post-migration configuration floor and image-only rollback

The completed M2 storage migration is not rerun by configuration hardening. Production values stay in ignored `.env`; tracked Compose remains parameterized. Runtime evidence/backup files belong outside the checkout.

The production-config v1 contract requires the existing /data mount/sentinel guard plus actual bind/project checks, safe Chanjet pass-through and one shared host mutation lock. Known deploy, disk-maintenance and Phase1 callers use the shared admission/wrapper; legacy Phase1 target/schema execution remains HOLD pending separate review. No named-volume fallback, DB copy, ownership repair or storage migration is authorized by this addendum.

Git/config HEAD and actual API/Web image revisions are separate records. Rollback retains the validated safe checkout and exact captured application images; migration scope is computed from the running API image revision. Pre-floor API rollback is HOLD. Unfinished transactions or drift between actual images and active pins block later maintenance/deployment. Do not bypass with bare Compose commands or image prune.

See `docs/product-acceptance/production-config-hardening-implementation.md` for the tested repository contract and remaining C3/C4 authorization. A successful repository merge does not authorize recovery/deployment.

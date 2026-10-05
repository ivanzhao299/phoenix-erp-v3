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

# Phoenix ERP M2 Attempt 1 回滚报告

日期：2026-10-05（Asia/Singapore）

## 结论

```text
M2_ATTEMPT_1=ROLLED_BACK_PRE_WRITE
M2_CUTOVER_VALIDATION=FAIL
M2_DATA_CUTOVER_READY=NO
DATA_CUTOVER_STABLE=NO
M3_CHECKOUT_RELOCATION=NOT_STARTED
```

Attempt 1 在恢复业务写入前发现两个 blocker，因此恢复了原生产配置并重新启动
named-volume 栈。生产没有切换到 `/data`，本次不属于成功迁移。

## 证据

```text
BACKUP=/opt/phoenix-erp-backups/phoenix-m2-pre-cutover-20261005T011003Z.dump
BACKUP_SIZE=197045076
BACKUP_TOC=2938
BACKUP_SHA256=76fba769ff27c07de7027134a213595e61c574d3ae7937e0b0812d0961e36dfd

PGDATA_COPY_FILES=3504
PGDATA_COPY_BYTES=1222497742
UPLOAD_COPY_FILES=127
UPLOAD_COPY_BYTES=100009873
```

上传文件与数据库目录均在 PostgreSQL/API 停止后通过 helper container 完成冷复制，
源 named volume 未删除或修改。回滚后生产重新启动过 named-volume 数据库；因此 `/data`
下副本不能再代表当前一致性状态。

## Blocker A：历史附件路径

生产只读盘点发现 15 条 ACTIVE `file_metadata` 记录仍使用：

```text
LEGACY_ACTIVE_METADATA_COUNT=15
```

```text
/var/lib/docker/volumes/phoenix_uploads/_data/...
```

物理文件存在，但受保护文件服务只接受 canonical `process.cwd()/uploads` 根目录，
因此旧路径会触发 `FILE_STORAGE_PATH_UNSAFE`。本次没有更新 `file_metadata`，没有放宽
宿主机路径访问，也没有把 Docker volume 内部路径挂进 API 容器。

修复要求是仅兼容固定 `phoenix_uploads` 前缀，将相对 suffix 映射到 canonical uploads
根目录，并继续执行根目录 containment、路径穿越和 `stored_name` 校验。

## Blocker B：M2 镜像基线

生产 `.env` 没有 `API_IMAGE`/`WEB_IMAGE` 时，Compose fallback 到 `latest`；手工 M2
启动因此尝试未经授权的 GHCR pull。正常 GitHub Actions 部署会在登录 GHCR 后注入
不可变 `sha-<TARGET_SHA>` 镜像，所以这是 runbook image pin 缺口，不是 CI/CD 重新设计。

下一次 M2 必须先读取当前运行容器的 image ID 与 OCI revision，创建只在切换会话中使用的
本地固定 tag，并让每条 API/Web Compose 命令显式传入 `M2_API_IMAGE`/`M2_WEB_IMAGE`。
无法确认 image ID 或 revision 时必须停止。

## 回滚后的状态与重试规则

```text
DB_STORAGE=phoenix_pg_data
UPLOAD_STORAGE=phoenix_uploads
BUSINESS_WRITES=RESTORED_TO_NAMED_VOLUMES

ATTEMPT_1_FORENSIC_COPY=/data/phoenix-erp-data
REUSABLE_FOR_M2_ATTEMPT_2=NO
SOURCE_VOLUMES=KEEP
PRODUCTION_FILE_METADATA_WRITE=NO
```

下一次 M2 必须归档 Attempt 1 目录后重新生成 backup、uploads final sync 和 PGDATA
cold copy。不得删除 forensic evidence、旧 named volumes 或备份文件；不得自动重试，
也不得开始 M3 checkout relocation。

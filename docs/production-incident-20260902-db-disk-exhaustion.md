# 2026-09-02 生产事故报告：磁盘耗尽导致 PostgreSQL unhealthy / API 500

## 结论

- 事故根因是生产根分区耗尽（40G，100%，0 可用），不是 Docker healthcheck 误报。
- PostgreSQL 因无法写入 `pg_logical/replorigin_checkpoint.tmp` 反复 PANIC；API 随数据库不可用返回 500。
- 清理可再生 Docker 缓存并将部署前备份收敛到最新 3 份后，根分区恢复到 65%（14G 可用）。PostgreSQL WAL 自动恢复完成，无人工修改数据库数据。
- 目标业务 revision `0b888b1b` 随事故修复一并部署；生产最终 checkout/API/Web revision 为 `d30c27d8e3ff9c577175a67d137d4a70cda3c2d4`。
- TypeORM 迁移 `1788337017420 AddSalesOrderApprovalContext1788337017420` 最终已应用；生产只读审批流复验全通过，业务写入为 0。

## 时间线

时间均为 2026-09-02 UTC（新加坡时间 UTC+8）。

| UTC | 新加坡时间 | 事件 |
|---|---|---|
| 08:52 | 16:52 | full 部署 run `33611002302` 启动。迁移创建 `idx_wf_inst_trigger_codes` 时 PostgreSQL 返回 `53100 No space left on device`；事务 ROLLBACK，部署失败。迁移前备份保留。 |
| 09:04 | 17:04 | full 部署 run `33612078023` 启动。`phoenix-v3-db` unhealthy，部署自动回滚到 `99278459`；回滚 API 健康检查仍失败。 |
| 09:16 | 17:16 | 受控磁盘清理 run `33613208294` 仅释放 80M，根分区仍 100%，确认原有“超过 30 天且保留最新 5 份”策略不足。 |
| 09:18 | 17:18 | 应急恢复 run `33613338349` 按事故授权保留最新 3 份迁移备份、删除更旧部署备份并清理构建缓存。PostgreSQL 自动 recovery/checkpoint 成功并 ready；DB/API 重启。工作流后续因匿名拉取私有 API 镜像被拒而标红，但已启动的 API 容器健康。 |
| 09:18 | 17:18 | 外网 `/api/health` 恢复 200，`db.connected=true`；Web 正常 307 到 `/login`。 |
| 09:19 | 17:19 | 只读核验 run `33613467621`：根分区 65%/14G 可用，DB/API healthy、exit 0、OOM=false；迁移 `1788337017420` 尚未应用。 |
| 09:20 | 17:20 | 修复后的 full 部署 run `33613603009` 启动。 |
| 09:33 | 17:33 | run `33613603009` 全绿完成：类型检查、回归、镜像构建、备份、迁移、容器 wait、Nginx 与 smoke test 均通过。 |
| 09:34 | 17:34 | 部署后只读核验 run `33614793690`：三容器 healthy；迁移记录存在；API health 200、DB connected。 |
| 09:35 | 17:35 | 生产审批流只读复验 run `33614832311` 全通过，`PRODUCTION_BUSINESS_WRITES=0`。 |

## 诊断证据

### 主机与容器

- 事故时 `/dev/nvme0n1p3`：40G 总量、38G 已用、0 可用、100%。
- `/opt/phoenix-erp-backups` 约 12G；Docker build cache 可回收约 2.9G。
- PostgreSQL 日志持续出现：无法写入 `pg_logical/replorigin_checkpoint.tmp`，错误为 `No space left on device`，checkpointer 被 SIGABRT，随后自动恢复循环。
- 空间释放后 PostgreSQL 完成 redo 与 checkpoint，日志出现 `database system is ready to accept connections`。
- 容器无 OOM：恢复后 DB/API `exit=0`、`oom=false`、`health=healthy`。
- API 恢复后近 10 分钟日志无 `ERROR` / `FATAL` / `ECONN` / `Internal Server Error`。

### 两次失败部署

- `33611002302`：真正失败点是迁移建立索引需要扩展 PostgreSQL 文件，根分区已无空间；PostgreSQL code `53100`。TypeORM 事务回滚，因此迁移没有半途落库。
- `33612078023`：进入部署时 DB 已因同一 ENOSPC 原因 unhealthy，故 `docker compose up -d --wait db` 正确失败；自动回滚无法修复主机磁盘/数据库状态，API 健康检查继续失败。
- Docker DB healthcheck 为 `pg_isready`。它准确报告当时 PostgreSQL 未稳定接受连接，无“Running 容器被 wait 逻辑误判”的证据，因此未放宽 wait 条件。

## 恢复动作与数据安全

1. 通过 GitHub production environment 既有 SSH 通道采集 `df`、Docker usage、container inspect 与 DB/API 日志。
2. 未触碰 Docker volume、运行数据库文件或单份备份内容；仅删除第 4 份起的旧部署生成备份目录、未使用镜像与可再生 build cache，保留最新 3 份完整备份。
3. 重启 DB，等待 healthcheck 通过；重启 API，外网验证 `/api/health` 200 与 `db.connected=true`。
4. 迁移状态核查始终置于只读事务。恢复前迁移记录不存在；成功重部署后记录存在。
5. 没有手工 DDL/DML，没有恢复备份，没有生产业务数据写入。

## 永久修复

- `10857d05`：生产磁盘维护增加受控 `emergency-recover`，带路径白名单、备份保留和完整诊断留痕。
- `ff219288`：增加 `incident-verify` 只读核验，统一采集容器、日志、迁移与 health 证据。
- `d30c27d8`：部署在创建迁移备份前校验根分区至少 2GiB 可用；备份校验成功后只保留最新 3 份，阻止部署备份无界增长。

`docker compose up -d --wait db` 保持不变。事故表明该门禁阻止了在不健康数据库上继续部署，行为正确。

## 迁移与最终状态

| 项目 | 结果 |
|---|---|
| 失败部署后迁移状态 | `1788337017420` 不存在；首轮失败事务已回滚 |
| 成功部署后迁移状态 | `1788337017420 AddSalesOrderApprovalContext1788337017420` 存在 |
| 备份 | 最新 3 份：runs `33609559404`、`33611002302`、`33613603009` |
| 磁盘 | 40G 总量，25G 已用，14G 可用，65% |
| 容器 | DB/API/Web healthy；DB/API exit 0、OOM=false |
| API | `/api/health` 200，`db.connected=true` |
| 页面 | `/` 307 到 `/login`，登录入口可用 |
| 最终 revision | checkout/API/Web 均为 `d30c27d8e3ff9c577175a67d137d4a70cda3c2d4` |

## 生产只读复验

受控 run `33614832311` 执行 `sales-order-lifecycle.sql` 与对应 HTTP 清单：

- `READONLY_GUARD`: PASS
- `MIGRATED_SNAPSHOT`: PASS（26/26，单据与事件均有样本）
- `NEW_ORDER_REAL_EVENTS`: PASS（3/3）
- `APPEND_ONLY_DEFINITION`: PASS
- `RECEIVED_SALES_AR`: PASS（12，异常 0）
- `SALES_ORDER_APPROVAL_TERMINAL_CONSISTENCY`: 0 异常行
- process-log 真实订单 envelope：HTTP 200，`timeline/documents/warnings` 数组存在
- SQL 最终 ROLLBACK；`PRODUCTION_BUSINESS_WRITES=0`

## 后续监控

- 部署的 2GiB 前置门禁用于防止再次在低空间下创建备份/索引；磁盘容量告警仍应在主机监控侧设置为早于该门禁（建议 80% warning、90% critical）。
- 每次迁移部署固定保留最新 3 份经 TOC 与 SHA-256 校验的备份；长期归档应迁出根分区，不再在生产根盘无限累积。

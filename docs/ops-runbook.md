# Phoenix ERP V3 — Operations Runbook

> 运维总览：部署流水线 / 告警 / 定时任务 / 健康指标。
> 本文档**全部基于仓库真实代码**，每条事实标注来源文件:行号。未在仓库证实的内容标 `TODO`，不臆造。
> 配套文档：[ROLLBACK.md](./ROLLBACK.md) · [ops/DR_RESTORE_DRILL.md](./ops/DR_RESTORE_DRILL.md) · DR 演练脚本 `scripts/dr-rehearsal.sh`。

---

## 1. 部署流水线（Deploy Pipeline）

来源：`.github/workflows/deploy.yml`（`name: CI/CD — Build & Deploy`）。

### 1.1 触发方式（deploy.yml:22-37）
- `push` → `main`：自动 `detect-changes` 选 mode。
- `pull_request` → `main`：只跑 `test` job（`mode=test-only`），**不部署**（deploy.yml:122-131）。
- `workflow_dispatch`：手动选 `mode`（`auto` / `fast-css` / `web` / `api` / `full`），可勾 `skip_deploy`（仅构建）。

并发控制：同 ref 新流水线启动时取消旧的（`concurrency: cicd-${{ github.ref }}`，deploy.yml:46-48）。

### 1.2 五种部署 mode（deploy.yml:3-19, detect-changes job 65-182）

| mode | 触发条件（自动判定，优先级 fast-css < web < api < full） | run_test | run_mig | 构建镜像 | 时长（注释标称） |
|------|---|---|---|---|---|
| `fast-css` | 只改 `apps/web/public/runtime-design-system.css` | ❌ | ❌ | 无 | 3-10s |
| `web` | 只改 `apps/web/**`（无 deps/api/docker/workflow/nginx）；docs/scripts 改动兜底也走 web | ✅ | ❌ | web | 2-5min |
| `api` | 改 `apps/api/**` / `apps/api/src/database/migrations/**` / `scripts/db-migrate.sh` | ✅ | ✅ | api | 5-12min |
| `full` | infra（docker-compose / Dockerfile / `.github/workflows/**` / `nginx/**`）或 web_deps（`apps/web/package.json` / `pnpm-lock.yaml`），或 api+web 同改 | ✅ | ✅ | api+web | 5-12min |

判定逻辑见 `detect-changes` 的 `Decide mode` step（deploy.yml:110-182），路径过滤用 `dorny/paths-filter@v3`（deploy.yml:86-108）。

### 1.3 Job 拓扑

```
detect-changes ──► test ──► build-push (matrix api|web) ──► deploy (web/api/full)
       │                                                  └─► deploy-fast-css (mode=fast-css)
```

**Job 1 · test — Type-check & Regression**（deploy.yml:187-375，`fast-css` 跳过）
- 起一个 `postgres:16-alpine` service（deploy.yml:194-207）。
- 治理门禁（部署前硬卡）：
  - 顶级 `migrations/.allowlist` 锁定（deploy.yml:228-241）
  - `apps/api/migrations/.allowlist` 锁定（deploy.yml:243-257）
  - TS 迁移必须实现 `down()`：`scripts/check-ts-migration-down.sh`（deploy.yml:259-260）
  - TS 迁移 up() 禁业务 DML：`scripts/check-ts-migration-no-data-dml.sh`（deploy.yml:262-263）
  - nullable-in-unique 检查：`scripts/check-nullable-in-unique.js`（deploy.yml:290-291）
  - entity ↔ DB 漂移不超 baseline：`scripts/check-entity-drift-baseline.sh`（deploy.yml:303-334）
- Type-check API（`tsc --noEmit`）+ Type-check Web（`pnpm --filter web run typecheck`）（deploy.yml:284-288）。
- Build API → 跑裸 SQL DDL 迁移（`scripts/db-migrate.sh`，`MIG_MODE=ci`，deploy.yml:297-301）。
- 启 API（`node dist/main`，等 `/api/health` 就绪 60s，deploy.yml:336-351）。
- 回归测试 5 套：system / breeding / packaging / wms / finance（deploy.yml:353-367）。

**Job 2 · build-push — Build & Push 镜像**（deploy.yml:382-460）
- 仅 `push` 到 `main` 且 test 成功/跳过时跑。
- 镜像推 GHCR：`ghcr.io/<owner>/phoenix-erp-v3/{api,web}`（env `IMAGE_PREFIX`，deploy.yml:50-53）。
- **镜像 tag（关键，回滚目标）**（deploy.yml:436-447）：
  - `type=raw,value=latest`
  - `type=sha,format=long,prefix=sha-` → 每次推一个**不可变 per-commit** tag `sha-<full-commit-sha>`，作为确定回滚目标（注释 deploy.yml:444-447）。
- 按 mode 裁剪 matrix：fast-css 全跳；web/api 只构 1 个；full 构 2 个（deploy.yml:404-419）。

**Job 3a · deploy-fast-css**（deploy.yml:465-534）
- 仅 `scp` `runtime-design-system.css` → 服务器 `/opt/phoenix/static-overrides/`，无容器重启，nginx 不 reload（alias 每请求重读）。

**Job 3b · deploy — SSH 部署**（deploy.yml:539-742）
- `appleboy/ssh-action` 进生产机，`git pull --ff-only origin main`（deploy.yml:592-594）。
- 注入畅捷通环境变量到 `.env`（`CHANJET_*`，deploy.yml:612-629）。
- `docker compose pull` 按 mode 拉 api/web 镜像。
- `docker compose up -d --wait db`（所有 mode）。
- **DB 迁移（仅 api/full，`run_mig=true`）**：
  1. 裸 SQL 迁移：`MIG_MODE=prod MIG_DIR=apps/api bash scripts/db-migrate.sh`（deploy.yml:656）。
  2. Role Runtime Phase C 生产验证（deploy.yml:658-669）。
  3. **TypeORM TS 迁移在 api 容器内**（api up 之后才跑，避免旧容器跑新迁移，deploy.yml:678-682）：
     `docker compose exec -T api ./node_modules/.bin/typeorm -d dist/database/data-source.js migration:run`
- 滚动重启 api / web 容器，full mode 另刷 nginx 配（deploy.yml:674-706）。
- Smoke test：`curl http://127.0.0.1:3000/`（deploy.yml:708-712）。

> 迁移执行器细节见 `scripts/db-migrate.sh`：`schema_migrations` 记录表、首次 baseline、CI 用 psql 直连 / prod 用 `docker compose exec db`（db-migrate.sh:1-109）。生产模式下 TS 迁移**在此脚本里一律跳过**，交给 deploy.yml 在 api 重启后执行（db-migrate.sh:98-109）。

---

## 2. 告警（Alerting）

### 2.1 持久台账：`sys_alerts`

所有告警落 `sys_alerts`（append-only，不可物理删，resolved 单向 false→true）。
写入服务 `SysAlertsService.createAlert()`（`apps/api/src/modules/system-monitor/services/sys-alerts.service.ts:34-48`）。

列：`alert_type, severity, title, detail, related_path, created_at, resolved, resolved_at, resolved_by, resolved_remark`（sys-alerts.service.ts:36, 108-109）。

**Severity 取值**（`CreateAlertDto.severity`，sys-alerts.service.ts:16）：`INFO` / `WARNING` / `CRITICAL`，默认 `WARNING`（sys-alerts.service.ts:42）。

### 2.2 告警来源与类型（grep `sys_alerts` 全量）

| alert_type | severity | 触发源（文件:行） | 说明 |
|---|---|---|---|
| `API_5XX` | CRITICAL | `apps/api/src/common/filters/all-exceptions.filter.ts:163-170` | 每条 API 500 落库一条，并节流外推 webhook |
| `CRON_FAILURE` | CRITICAL | `apps/api/src/modules/system-monitor/services/cron-monitor.service.ts:51-57` | 任一 `@Cron` 经 `cronMon.fail()` 上报失败时写入，`related_path=cron:<jobName>` |
| `IOT_SYNC_DOWN` | CRITICAL | `apps/api/src/modules/iot/iot-sync.service.ts:513-517` | IoT 云端实时同步失败、设备数据 stale（仅非 `IOT_DEMO_FALLBACK` 生产模式下写） |

> 注：`SystemMonitorService`（system-monitor.service.ts:201-205）只**读** `sys_alerts`（统计未处理数），不写。`SysAlertsService.createAlert` 注释标注调用方为 `SystemMonitorService / AllExceptionsFilter`（sys-alerts.service.ts:33），实际 grep 到的写入点即上表三处。
> 另有 `mon_device_alert_event` 表（iot-sync.service.ts:466-470）属设备阈值告警事件，与系统级 `sys_alerts` 是**不同表**，本节不展开。

### 2.3 外部告警投递（webhook）

**App 内（运行时 500 告警外推）**——`all-exceptions.filter.ts`：
- 读 `process.env.ALERT_WEBHOOK_URL`（all-exceptions.filter.ts:174）：未配则只落库不外推（filter.ts:175）。
- 读 `process.env.ALERT_WEBHOOK_TYPE`（all-exceptions.filter.ts:185），取值 `feishu` / `dingtalk` / `slack`，默认 `slack`。
- 节流：同 `req.url` 60s 内不重复推（all-exceptions.filter.ts:176-179），fire-and-forget 永不抛。

**CI/CD（部署成败通知）**——`deploy.yml` 的 `Notify` / `Send deploy notification` step：
- `secrets.ALERT_WEBHOOK_URL`（deploy.yml:520, 727）；空则直接 `exit 0`（deploy.yml:527, 735）。
- `secrets.ALERT_WEBHOOK_TYPE`，默认 `slack`（deploy.yml:521, 728）；分支 `feishu` / `dingtalk` / `slack`（deploy.yml:530-534, 738-742）。

> 这是仓库中**仅有**的两处外部告警投递。env / secret 名称只有 `ALERT_WEBHOOK_URL` 与 `ALERT_WEBHOOK_TYPE`，已逐一标注来源行，未发现其它 webhook 变量。

---

## 3. 定时任务清单（Cron Jobs）

来源：grep `@Cron` over `apps/api`。每个 cron 经 `CronMonitorService`（`apps/api/src/modules/system-monitor/services/cron-monitor.service.ts`）上报心跳到 **`sys_cron_heartbeat`**（PK `job_name`，列 `last_run_at / last_status / last_detail / last_success_at / last_failure_at / success_count / fail_count`，cron-monitor.service.ts:25-35）。失败时 `fail()` 另写 `sys_alerts(CRON_FAILURE, CRITICAL)`。

| job_name（心跳键） | cron 表达式 | 频率 | 文件:行 | 上报方式 | 作用 |
|---|---|---|---|---|---|
| `farm_daily` | `EVERY_DAY_AT_MIDNIGHT` | 每天 00:00 | `farm/farm.cron.ts:17` | `ok`/`fail`（:45,:48） | 每日更新用药/停药期状态 |
| `iot_sync` | `0 */5 * * * *` | 每 5 分钟 | `iot/iot-sync.service.ts:29` | `ok`/`fail`（:40,:43） | 同步全场 IoT 实时数据 |
| `workflow_sla` | `0 */15 * * * *` | 每 15 分钟 | `workflow/workflow-sla.scheduler.ts:30` | `ok`/`fail`（:61,:64） | 工作流 SLA 超时检查 |
| `chanjet-refresh-token` | `0 0 4 */4 * *` | 每 4 天 04:00 | `chanjet/chanjet-auth.service.ts:114` | `ok`/`fail`（:121,:124） | 刷新畅捷通 openToken（有效 6 天，留 2 天缓冲） |
| `chanjet-health-check` | `EVERY_DAY_AT_8AM` | 每天 08:00 | `chanjet/chanjet-auth.service.ts:129` | `ok`/`fail`（:137,:140,:144） | 畅捷通连接健康检查（拉账套列表） |
| `g199-d-monthly-ar-reconciliation` | `0 0 3 1 * *` | 每月 1 号 03:00 | `finance-v2/services/ar-reconciliation.service.ts:377` | `runGuarded`（:379） | 上月应收三方对账，差异站内通知 |
| `credit_daily_refresh` | `0 0 2 * * *`（TZ `Asia/Vientiane`） | 每天 02:00 | `sales-v2/services/customer-credit-scheduler.service.ts:29` | `ok`/`fail`（:42,:44） | 客户授信每日刷新 |
| `egg_inventory_daily` | `0 0 1 * * *` | 每天 01:00 | `sales-v2/services/egg-inventory-scheduler.service.ts:30` | `ok`/`fail`（:51,:55） | 鸡蛋库存过期/临期扫描 |
| `notification_tick` | `0 * * * * *` | 每分钟 | `notification/notification-scheduler.service.ts:29` | `runGuarded`（:31） | 扫 SCHEDULE 通知规则并派发 |

> `CronMonitorService` 是 `@Global` 模块（`apps/api/src/modules/system-monitor/cron-monitor.module.ts`），任何 feature 模块免 import 即可注入。心跳表幂等自建（`onModuleInit`，cron-monitor.service.ts:22-37）。
> `notification-stream.controller.ts:46` 的 25s `heartbeat$` 是 SSE 保活 ping，**不是** `@Cron`，不入此表。

**监控建议**：心跳缺更（`now() - last_run_at` 超过该 job 周期）或 `last_status='FAILED'` 即应告警。`CRON_FAILURE` 已自动入 `sys_alerts`；心跳"沉默"（进程没起来根本没跑）需外部探活补足 —— 见 §4。

---

## 4. 健康 / 指标端点

来源：`apps/api/src/health.controller.ts`（`@Controller('api')`，均**无需 JWT**）。

### 4.1 `GET /api/health`（health.controller.ts:28-64）
返回 JSON：`status`（`OK` / `DEGRADED`，要求 jwt loaded 且 db connected）、`service`、`uptime`、`boot_at`、`env`、`node_version`、`jwt.{loaded,fingerprint,rotation_active,expires_in}`、`db.connected`、`security.{jwt_fallback_in_use,is_production,warning}`。
监控判据（注释 health.controller.ts:23-26）：`status != 'OK'` → 进程异常；`jwt.loaded == false` → JWT_SECRET 未配；rotation 持续 24h+ → 提醒删 `JWT_SECRET_PREV`。

### 4.2 `GET /api/metrics`（health.controller.ts:83-158）
Prometheus 文本格式（`Content-Type: text/plain; version=0.0.4`），无 client lib。暴露：
- `phoenix_up`（1/0，db 可达）
- `phoenix_uptime_seconds`
- `phoenix_jwt_loaded` / `phoenix_jwt_rotation_active`
- `phoenix_node_memory_rss_bytes` / `phoenix_node_memory_heap_used_bytes` / `phoenix_node_memory_heap_total_bytes`
- `phoenix_orders_total{status="..."}`（`ord_orders` 按状态）
- `phoenix_inv_batches_total{status="..."}`（`inv_batches` 按状态；CLAUDE.md 库存铁律监控点）
- `phoenix_pos_sales_today_total`（当日 `pos_sales` 单数）
- `phoenix_v2_residual_tables`（`_v2_archived_%` 残表数，应为 0；db down 时 -1=unknown）

DB 不可用时业务指标返 0（保持 scrape 一致性，health.controller.ts:149-155）。

### 4.3 `GET /api/readiness`（health.controller.ts:161-178）
K8s readinessProbe 用，执行 `SELECT 1`：成功 `{status:'READY', db:'connected'}`，失败 `{status:'NOT_READY', db:'disconnected', error}`。

> 部署后冒烟脚本 `scripts/smoke-test.sh`（CI deploy 链外的人工/运维冒烟）覆盖 health + 登录 + 核心 lookup + 字典 + 关键表行数（smoke-test.sh 头注释）。

---

## 5. 备份 / 灾备入口（速查）

- 备份**不在应用内执行 pg_dump**：应用只写 `sys_backup_records` PENDING（`SysBackupService.requestBackup`，sys-backup.service.ts:49-72），由运维 runner `scripts/ops/backup-runner.sh` 拾取执行并回写状态。
- 备份计划/保留：`sys_backup_config`（默认 `cron_expr='0 3 * * *'`、`retention_days=30`，sys-backup.service.ts:17）。runner 自删超 `retention_days` 的 dump（backup-runner.sh:62-66）。
- 恢复：`scripts/ops/restore-runner.sh`（默认演练校验到临时库，`CONFIRM=RESTORE` 才正式恢复，生产库另需 `ALLOW_PROD=yes`）。
- DR 演练 SOP：[ops/DR_RESTORE_DRILL.md](./ops/DR_RESTORE_DRILL.md)；本次新增的端到端演练脚本：`scripts/dr-rehearsal.sh`（DRY-RUN 默认，串联 backup→restore-drill→migrate→smoke）。
- 回滚：见 [ROLLBACK.md](./ROLLBACK.md)。

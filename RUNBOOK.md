# Phoenix ERP V3 — 运维 Runbook

> 故障速查 + 日常运维 + 应急响应。值班手册。
> 适用版本：阶段二完成态及之后。

---

## 0. 联系人 & 一线工具

| 项 | 位置 |
|---|------|
| 后端 API 日志 | `docker compose logs -f api` 或 `tail -f /tmp/api.log` |
| 数据库 | `docker compose exec db psql -U $DB_USER -d $DB_NAME` |
| 健康检查 | `curl -fsS http://API_HOST:3100/api/health` |
| Prometheus 指标 | `curl http://API_HOST:3100/api/metrics` |
| GitHub Actions | https://github.com/ivanzhao299/phoenix-erp/actions |

应急联系人：（请按业务自填）
- 后端 on-call：
- 数据库 DBA：
- 业务方对接人：

---

## 1. 标准操作（SOP）

### 1.1 启动 / 重启 API

```bash
cd /path/to/ABC
docker compose up -d api        # 启动 / 不停 db
docker compose restart api      # 单纯重启 api
docker compose down && docker compose up -d   # 完全重启 stack
```

### 1.2 滚动升级

```bash
git pull
docker compose build api
docker compose up -d api        # 替换容器，db 卷保留
```

启动后自动跑 boot migration。

### 1.3 备份数据库

**手动**：
```bash
bash scripts/backup-db.sh
# → /var/backups/phoenix/phoenix-YYYY-MM-DDTHHMMSS.dump (.dump 含压缩)
```

**自动（cron 每天 02:00）**：
```bash
crontab -e
# 加一行：
0 2 * * * cd /path/to/ABC && bash scripts/backup-db.sh >> /var/log/phoenix-backup.log 2>&1
```

保留策略：
- 每日 → 7 份
- 周日 hardlink 到 `weekly/` → 4 份
- 月初 hardlink 到 `monthly/` → 12 份

### 1.4 恢复数据库

```bash
# 完全恢复（清空当前库）
docker compose exec db psql -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
docker compose exec db psql -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
docker compose exec -T db pg_restore -U $DB_USER -d $DB_NAME < /var/backups/phoenix/phoenix-XXXX.dump

# 部分恢复（仅指定表）
docker compose exec -T db pg_restore -U $DB_USER -d $DB_NAME -t ord_orders \
  < /var/backups/phoenix/phoenix-XXXX.dump
```

### 1.5 JWT 密钥轮换（无停机）

零停机轮换流程：

```bash
# 1) 生成新密钥
NEW=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
echo $NEW

# 2) 编辑 .env：
#    JWT_SECRET_PREV=旧密钥 (从旧 JWT_SECRET 复制)
#    JWT_SECRET=新密钥
vi .env

# 3) 重启 api（旧 token 仍能用，因为 PREV 还在）
docker compose restart api

# 4) 等所有用户 token 自然过期（默认 JWT_EXPIRES_IN=8h）
sleep 8h
# 或者主动让所有用户重新登录：
docker compose exec db psql -U $DB_USER -d $DB_NAME \
  -c "UPDATE sys_user SET perms_version = perms_version + 1;"

# 5) 清空 PREV，完成轮换
sed -i 's|JWT_SECRET_PREV=.*|JWT_SECRET_PREV=|' .env
docker compose restart api
```

监控：`curl /api/metrics | grep phoenix_jwt_rotation_active` 应在第 5 步后回到 0。

---

## 2. 故障速查表

| 现象 | 速诊 | 修复 |
|------|------|------|
| **健康检查 503** | `curl /api/readiness` | 看响应 db 字段：`disconnected` → 见 §3.1 |
| **登录 401** | `curl -v /api/auth/login` 看 body | `INVALID_TOKEN` → 用户被锁定/密码错；`NO_TOKEN` → header 缺失 |
| **登录 500** | API 日志 | bcrypt 不可用？JWT_SECRET 缺失？ |
| **EADDRINUSE 3100** | `lsof -i:3100` | `kill -9 PID` |
| **boot migration 卡死** | `docker compose logs api` | 看具体 SQL；找 `_archive/v2-migration-scripts/` 历史脚本 |
| **inv_batches qty / qty_available 不一致** | `SELECT * FROM inv_batches WHERE qty <> qty_available` | 触发器没生效；boot migration 会重建 |
| **订单状态机非法 transition** | API 日志 | 看 VALID_TRANSITIONS 白名单（`order/order.service.ts`） |
| **POS sale_no 重复** | 业务码返回 idempotent:true | 这是幂等正确行为，不是 bug |
| **下单返回 PRICE_LIMIT_ERROR** | SalesEngine BIZ-02 拦截 | 单价 < retail_lower 且无店长授权 |
| **CI 全红** | GitHub Actions log | 看哪个 module-regression 失败；通常是新 schema 漂移 |
| **PWA 不更新** | DevTools → Application → SW | Unregister + 硬刷新；或 prod 等 SW 自动 update |

---

## 3. 详细故障排查

### 3.1 数据库连接断开

```bash
# 检查 db 容器
docker compose ps db
docker compose logs --tail=50 db

# 进容器看
docker compose exec db psql -U $DB_USER -l   # 列数据库

# 看连接数（默认 max 100）
docker compose exec db psql -U $DB_USER -d $DB_NAME -c \
  "SELECT state, COUNT(*) FROM pg_stat_activity GROUP BY state;"

# 杀死空闲超 10 分钟的连接
docker compose exec db psql -U $DB_USER -d $DB_NAME -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE state = 'idle' AND state_change < now() - INTERVAL '10 minutes';"
```

### 3.2 API OOM

容器 OOM 时 Docker 会自动重启（重启策略 unless-stopped）。
查 OOM：

```bash
docker inspect phoenix-v3-api | grep -E "OOMKilled|Started"
```

调整内存上限（compose）：

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          memory: 1G
```

### 3.3 V2 数据回查

V2 三张归档表已 DROP；快照保存在 `_archive/v2-final-snapshot-YYYY-MM-DD.sql.gz`。

紧急回查：

```bash
# 临时还原到一个独立 schema
docker compose exec db psql -U $DB_USER -d $DB_NAME -c "CREATE SCHEMA v2_recovery;"

# 解压并通过 sed 把表名加上 schema 前缀重放
gunzip -c _archive/v2-final-snapshot-2026-05-14.sql.gz \
  | sed 's|public\.|v2_recovery.|g; s|CREATE TABLE |CREATE TABLE v2_recovery.|g; s|COPY public\.|COPY v2_recovery.|g' \
  | docker compose exec -T db psql -U $DB_USER -d $DB_NAME

# 查询
docker compose exec db psql -U $DB_USER -d $DB_NAME -c \
  "SELECT * FROM v2_recovery._v2_archived_sys_users WHERE username = 'XXX';"

# 用完销毁
docker compose exec db psql -U $DB_USER -d $DB_NAME -c "DROP SCHEMA v2_recovery CASCADE;"
```

### 3.4 库存不一致紧急对账

```sql
-- 找出 ledger 累加 ≠ batch.qty 的批次
WITH ledger_sum AS (
  SELECT batch_no, SUM(qty_change)::int AS net_change
    FROM inv_ledger GROUP BY batch_no
)
SELECT b.batch_no, b.qty, l.net_change,
       (b.qty - l.net_change) AS drift
  FROM inv_batches b
  JOIN ledger_sum l USING (batch_no)
 WHERE b.qty <> l.net_change
 ORDER BY ABS(b.qty - l.net_change) DESC LIMIT 50;
```

drift ≠ 0 的批次是历史脏数据；新代码（V3）的所有路径都走 inv_ledger，应保持守恒。

### 3.5 性能调优

慢查询采集：

```sql
ALTER DATABASE phoenix_erp SET log_min_duration_statement = '500ms';
ALTER DATABASE phoenix_erp SET log_statement = 'mod';
SELECT pg_reload_conf();
```

跟踪：

```bash
docker compose logs db | grep -i "duration:"
```

热点表索引：
- `inv_batches` (batch_no, status, store_code)
- `inv_ledger` (batch_no, created_at, change_type)
- `pos_sales` (store_code, created_at, sale_no)
- `ord_orders` (status, customer_code, created_at)

---

## 4. 告警阈值（建议）

接入 Grafana / 飞书 / 钉钉时，按以下阈值告警：

| 指标 | 阈值 | 严重度 |
|------|------|------|
| `phoenix_up` | == 0 持续 1 分钟 | 🔴 P0 |
| `phoenix_jwt_loaded` | == 0 | 🔴 P0 |
| API HTTP 5xx 比例 | > 1% / 5 分钟 | 🟠 P1 |
| API p95 latency | > 1s | 🟡 P2 |
| `phoenix_node_memory_rss_bytes` | > 800MB | 🟡 P2 |
| `phoenix_v2_residual_tables` | > 0 | 🟠 P1 (阶段三应为 0) |
| DB 连接数 | > 80% max | 🟠 P1 |
| 备份脚本失败 | cron 退出码 ≠ 0 | 🔴 P0 |

---

## 5. 应急升级 / 回滚

### 5.1 紧急回滚到上一 tag

```bash
# 假设当前在 v3-stage2-done，需要回滚
git fetch
git checkout v3-bi-done       # 或具体 tag
docker compose down
docker compose up -d --build

# 如果 schema 已经被改坏 → 从备份恢复
docker compose exec -T db pg_restore -U $DB_USER -d $DB_NAME --clean \
  < /var/backups/phoenix/phoenix-YYYY-MM-DDTHHMMSS.dump
```

### 5.2 紧急下线（维护模式）

如果需要短时全停业务：

```bash
docker compose stop api        # 只停 api，db 保留
# 前端会显示连接失败
docker compose start api       # 完成后恢复
```

更优雅：在反向代理层（Caddy / Nginx）切到维护页：

```caddy
@maintenance {
    file /etc/maintenance.flag
}
respond @maintenance "Phoenix ERP 维护中，预计 15 分钟" 503
```

`touch /etc/maintenance.flag` 进入维护，`rm` 退出。

---

## 6. 数据安全

### 6.1 备份完整性自检

每周执行：

```bash
# 在隔离环境 restore 一份最近备份
docker run --rm -v $PWD/backups:/backups -v restore_test:/var/lib/postgresql/data \
  postgres:18 sh -c "
    pg_restore --list /backups/phoenix-LATEST.dump | head -20
  "
```

### 6.2 敏感字段

| 表.字段 | 敏感等级 |
|---------|---------|
| `sys_user.password_hash` | 🔴 极高（bcrypt，无回明文） |
| `ord_customers.credit_limit` | 🟠 高 |
| `fin_transactions.amount` | 🟠 高 |
| `pos_sales.net_amount` | 🟡 中 |

备份文件应加密存储（建议）：

```bash
bash scripts/backup-db.sh && \
  gpg --symmetric --cipher-algo AES256 --output backup-encrypted.dump.gpg backup.dump
```

---

## 7. 例行检查清单

### 每日（自动）
- ✅ cron `02:00` 跑 backup-db.sh
- ✅ Grafana 收 `/api/metrics` 数据
- ✅ CI 通过的 PR 才允许 merge

### 每周（手动 15 分钟）
- ⬜ 抽查最近 1 周 CI 失败原因
- ⬜ 看 `phoenix_orders_total` 各状态量是否合理（CANCELLED 不应暴增）
- ⬜ 备份完整性自检（§6.1）
- ⬜ 看慢查询日志找 N+1

### 每月（手动 1 小时）
- ⬜ 数据库 vacuum analyze（容器内）：
  ```bash
  docker compose exec db psql -U $DB_USER -d $DB_NAME -c "VACUUM ANALYZE;"
  ```
- ⬜ JWT 密钥轮换（§1.5）
- ⬜ 升级安全补丁：`pnpm outdated` + `pnpm update --interactive`
- ⬜ 复审角色权限矩阵（`sys_role_menu_permission`）

### 每季度
- ⬜ 全量回归：`pnpm test:regr` (~3 分钟，340 用例)
- ⬜ 容器镜像 CVE 扫描：`trivy image phoenix-v3-api:latest`
- ⬜ 灾备演练：在 staging 完整 restore 一次最近备份

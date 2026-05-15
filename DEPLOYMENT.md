# Phoenix ERP V3 — 部署手册

> 本文档覆盖：本地 Docker 验证 / 单机生产 / 容器编排 / 滚动升级 / 回滚 / 灾备。
> 阶段二完成态版本（commit ≥ `49cdc1f`）。

---

## 0. 前置依赖

| 项 | 最低版本 | 说明 |
|---|---------|------|
| Docker Engine | 24+ | macOS 装 Docker Desktop / Linux 装 docker-ce |
| Docker Compose | v2+ (内建于 docker CLI) | `docker compose version` 验证 |
| PostgreSQL（如不用容器） | 18 | V3 启动时自动建表 + 迁移 |
| Node.js（如不用容器） | 20 LTS | 仅源码部署需要 |
| pnpm（如不用容器） | 9+ | 仅源码部署需要 |

---

## 1. 本地烟雾测试（一行启动）

```bash
cd /path/to/ABC
bash scripts/verify-docker-stack.sh
```

脚本会：
1. 检查 docker 可用
2. 没有 `.env` 时从 `.env.docker.example` 拷一份，并随机生成 `JWT_SECRET`
3. `docker compose build`（multi-stage：builder 编译 → runtime 精简）
4. `docker compose up -d`（启 db + api）
5. 等 db healthy、api `/api/health` 通
6. 跑 admin 登录冒烟
7. `docker compose down -v` 清理

**保留 stack 不清理**：`KEEP=1 bash scripts/verify-docker-stack.sh`
**同时跑完整回归**：`RUN_REGR=1 bash scripts/verify-docker-stack.sh`

---

## 2. 生产部署 — 单机 Docker Compose

### 2.1 准备 .env

```bash
cp .env.docker.example .env
```

必改字段：

| 变量 | 怎么生成 |
|------|---------|
| `DB_PASSWORD` | `openssl rand -hex 24` |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_SECRET_PREV` | 首次留空；后续轮换时填上一代密钥 |

### 2.2 启动

```bash
docker compose up -d --build
docker compose ps           # 查看状态
docker compose logs -f api  # 跟随 API 日志
```

### 2.3 数据卷

- `phoenix_pg_data` 持久卷自动创建
- 备份：`docker compose exec db pg_dump -U $DB_USER $DB_NAME | gzip > backup-$(date +%F).sql.gz`
- 恢复：`gunzip < backup.sql.gz | docker compose exec -T db psql -U $DB_USER -d $DB_NAME`

### 2.4 端口

| 端口 | 用途 | 备注 |
|------|------|------|
| 3100 | API HTTP | 反向代理（Nginx/Caddy）建议加 TLS |
| 5432 | PostgreSQL | **生产环境建议绑定 127.0.0.1 不对外** |

修改 `docker-compose.yml`：
```yaml
ports:
  - "127.0.0.1:5432:5432"   # 仅本机访问
```

---

## 3. 反向代理示例（Caddy）

```caddy
erp.your-domain.com {
    encode gzip zstd
    @api path /api/* /downloads/*
    handle @api {
        reverse_proxy 127.0.0.1:3100
    }
    handle {
        # 前端 Next.js 单独部署或 Vercel
        reverse_proxy 127.0.0.1:3000
    }
}
```

---

## 4. 滚动升级

```bash
git pull
docker compose build api
docker compose up -d api    # api 容器替换，db 保持
```

API 启动时会自动跑 boot migrations（包含 V2 fidelity backfill / schema dedup）。

如果升级涉及破坏性 schema，**升级前先备份**：

```bash
docker compose exec db pg_dump -U $DB_USER $DB_NAME | gzip > /backups/pre-upgrade-$(date +%F).sql.gz
```

---

## 5. 回滚

```bash
# 1. 停 api
docker compose stop api

# 2. 切回上一个 tag
git checkout v3-stage2-done    # 或具体 module-done tag

# 3. 重新构建 + 起
docker compose up -d --build api

# 4. 如果 schema 已经被新版本改坏 → 从备份恢复
docker compose exec -T db psql -U $DB_USER -d $DB_NAME < /backups/pre-upgrade-2026-05-14.sql
```

---

## 6. 健康检查 + 告警

API 内建 `/api/health`：

```bash
curl -fsS http://localhost:3100/api/health
# {"status":"OK","service":"Phoenix ERP V3 API","timestamp":"...","uptime":1234}
```

Docker HEALTHCHECK 每 30s 自动调用；连续 3 次失败容器进入 `unhealthy` 状态。
配合 `Watchtower` 或自建 cron 监控容器健康状态。

---

## 7. 常见故障速查

| 现象 | 检查 | 修复 |
|------|------|------|
| API 启动 `JWT_SECRET 必须设置` | `.env` 缺 `JWT_SECRET` 或长度<32 | 重新生成密钥 |
| `Connection refused` 连 db | db 容器未起 | `docker compose ps` + `docker compose logs db` |
| 启动后 admin 登录 401 | 数据库是空库，没 seed | 检查 boot migration 是否生效；admin 密码默认 `admin123` 仅 dev |
| `EADDRINUSE` 3100 | 旧 nest 残留进程 | 宿主 `lsof -ti :3100 \| xargs kill -9` |
| `current transaction is aborted` | boot migration 某步 SQL 错误 | 看 `docker compose logs api` 找具体语句；V3 已用 SAVEPOINT 隔离绝大多数 |
| PWA 不更新 | Service Worker 缓存 | 浏览器 DevTools → Application → Unregister SW，或在 dev 域名访问（自动卸载） |
| `qty_available` 与 `qty` 不一致 | 触发器未生效 | 看 `SELECT pg_get_triggerdef(...)`；boot migration 会重建 |

---

## 8. V2 数据归档操作（阶段三）

`_v2_archived_sys_users` / `_v2_archived_sys_roles` / `_v2_archived_sys_user_roles` 三张表已脱离业务路径。当确认无需回溯：

```bash
# 1. 导出最终快照
docker compose exec db pg_dump -U $DB_USER -t '_v2_archived_*' $DB_NAME \
  | gzip > _archive/v2-final-snapshot-$(date +%F).sql.gz

# 2. DROP
docker compose exec db psql -U $DB_USER -d $DB_NAME -c "
  DROP TABLE IF EXISTS _v2_archived_sys_user_roles;
  DROP TABLE IF EXISTS _v2_archived_sys_roles;
  DROP TABLE IF EXISTS _v2_archived_sys_users;
"
```

> 见 `scripts/archive-v2-tables.sh`（阶段三第二步会写）。

---

## 9. CI/CD（GitHub Actions）

`.github/workflows/regression.yml` 已配齐：
- 推送 `v3-admin` / `main` 自动触发
- 起 PG service container
- pnpm install → tsc → build
- 跑 10 模块 regression + E2E
- 失败时 dump 最近 200 行 API 日志

PR 必须绿色才允许合并。

---

## 10. 监控建议（待实施）

- **指标采集**：API 增加 `/metrics`（Prometheus 格式）— 待实施
- **日志聚合**：`docker compose logs --tail=1000 api` → 接 Loki/Splunk
- **告警**：CI 失败 → 飞书/钉钉 webhook
- **DB 备份**：cron 每日 02:00 `pg_dump` 到 NAS / 对象存储 — 待实施

---

## 11. 安全 checklist

- [ ] `.env` 加入 `.gitignore`（已默认）
- [ ] `JWT_SECRET` ≥ 64 字符随机
- [ ] PostgreSQL 5432 只绑 127.0.0.1
- [ ] 反向代理强制 HTTPS（HSTS）
- [ ] 定期轮换 `JWT_SECRET`（用 `JWT_SECRET_PREV` 滚动）
- [ ] 数据库密码 ≥ 24 字符随机
- [ ] 备份文件加密存储

---

## 12. 关键命令汇总

```bash
# 启动
docker compose up -d --build

# 状态
docker compose ps
docker compose logs -f api

# 进入容器
docker compose exec api sh
docker compose exec db psql -U $DB_USER -d $DB_NAME

# 备份
docker compose exec db pg_dump -U $DB_USER $DB_NAME | gzip > backup-$(date +%F).sql.gz

# 升级
git pull && docker compose up -d --build api

# 滚动重启
docker compose restart api

# 彻底清理（含数据卷，慎用）
docker compose down -v
```

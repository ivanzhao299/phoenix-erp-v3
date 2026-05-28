# Phoenix ERP V3 — 数据库备份治理策略

**版本：** Production Stabilization Phase 1  
**更新：** 2026-05-29

---

## 一、备份目标

| 目标 | 要求 |
|------|------|
| RPO（Recovery Point Objective）| ≤ 24 小时（每日全量备份） |
| RTO（Recovery Time Objective）| ≤ 2 小时（从备份恢复到可用状态） |
| 最长保留期 | 90 天 |
| 备份压缩 | pg_dump custom 格式，gzip level 9 |

---

## 二、备份脚本

**位置：** `scripts/backup-postgres.sh`  
**执行方式：**
```bash
# 手动执行
bash scripts/backup-postgres.sh

# 生产 cron（服务器 /etc/cron.d/phoenix-backup）
0 2 * * * phoenix /opt/phoenix/scripts/backup-postgres.sh >> /var/log/phoenix-backup.log 2>&1
```

**环境变量（必须在执行环境中预设）：**
```bash
export DB_HOST="127.0.0.1"
export DB_PORT="5432"
export DB_USER="postgres"
export DB_NAME="phoenix_erp"
export DB_PASSWORD="<生产密码，不写入任何文件>"
export BACKUP_DIR="/var/backups/phoenix-erp"
```

---

## 三、保留策略（三层滚动）

| 年龄区间 | 保留规则 | 说明 |
|----------|----------|------|
| 0 ~ 7 天 | 全部保留 | 提供每日回滚点 |
| 8 ~ 30 天 | 仅保留周一 | 提供每周回滚点 |
| 31 ~ 90 天 | 仅保留每月 1 日 | 提供每月回滚点 |
| > 90 天 | 自动删除 | 超出保留期 |

---

## 四、安全约束

1. **备份文件不进 Git** — `.gitignore` 已排除 `*.dump`、`*.backup`、`/var/backups/`
2. **文件权限 600** — 备份目录 700，文件 600，仅 `phoenix` 用户可读
3. **凭据不硬编码** — 所有数据库密码通过环境变量传入，不写入脚本
4. **备份目录独立** — 建议挂载独立存储卷，与系统盘分离

---

## 五、备份验证（每月执行一次）

```bash
# 1. 列出备份文件，确认数量和日期
ls -lh /var/backups/phoenix-erp/

# 2. 验证备份文件完整性
pg_restore --list /var/backups/phoenix-erp/phoenix_erp_YYYYMMDD_HHMMSS.dump | head -30

# 3. 恢复到测试库（staging 环境）
pg_restore \
  --host=127.0.0.1 \
  --port=5432 \
  --username=postgres \
  --dbname=phoenix_erp_staging \
  --clean \
  --if-exists \
  /var/backups/phoenix-erp/phoenix_erp_YYYYMMDD_HHMMSS.dump

# 4. 在测试库跑健康检查
psql -U postgres -d phoenix_erp_staging \
  -f apps/api/scripts/check-v2-runtime-tables.sql
```

---

## 六、灾难恢复流程

### 场景 A：数据损坏（部分表损坏）

```bash
# 1. 确认损坏范围
psql -U postgres -d phoenix_erp \
  -f apps/api/scripts/check-v2-runtime-tables.sql

# 2. 仅恢复受损表（pg_restore -t 选项）
pg_restore \
  --host=127.0.0.1 \
  --username=postgres \
  --dbname=phoenix_erp \
  --table=wf_approval_instances \
  /var/backups/phoenix-erp/phoenix_erp_YYYYMMDD_HHMMSS.dump
```

### 场景 B：全库恢复

```bash
# 1. 停止 API 服务
docker stop phoenix-api

# 2. 删除损坏数据库（需超级权限）
psql -U postgres -c "DROP DATABASE IF EXISTS phoenix_erp;"
psql -U postgres -c "CREATE DATABASE phoenix_erp OWNER phoenix;"

# 3. 全量恢复
pg_restore \
  --host=127.0.0.1 \
  --username=postgres \
  --dbname=phoenix_erp \
  --verbose \
  /var/backups/phoenix-erp/phoenix_erp_YYYYMMDD_HHMMSS.dump

# 4. 重新执行幂等 DDL（补齐 schema drift）
psql -U postgres -d phoenix_erp \
  -f apps/api/ddl/24_approval_engine_tables.sql
psql -U postgres -d phoenix_erp \
  -f apps/api/ddl/25_production_ops_tables.sql

# 5. 重启服务
docker start phoenix-api
```

---

## 七、监控与告警

- 备份脚本执行后输出日志到 `/var/log/phoenix-backup.log`
- 如果备份失败（非零退出），cron 会发送邮件到系统 root 邮箱
- 建议在 `/system/health` 监控面板中展示最新备份时间和大小

---

## 八、异地备份（推荐，尚未实现）

| 选项 | 说明 |
|------|------|
| 阿里云 OSS | `ossutil cp /var/backups/phoenix-erp/ oss://phoenix-backup/ --recursive` |
| 腾讯云 COS | `coscli cp /var/backups/phoenix-erp/ cos://phoenix-backup/ --recursive` |
| 实现时机 | 当单机磁盘容量不足时优先实现 |

---

## 九、文件命名规范

```
phoenix_erp_YYYYMMDD_HHMMSS.dump      # 主备份文件（pg_dump custom 格式）
phoenix_erp_YYYYMMDD_HHMMSS.meta.json # 备份元数据（时间戳/大小/版本）
```

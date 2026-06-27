#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# W1 DB Gate · S1 备份 + apply（生产，需用户批准 + 稳定通道才执行）
# ⚠️ 本脚本默认 DRY-RUN：写操作段全部注释。确认 00_preflight 结果 + 用户批准后再解开。
# 前提：00_preflight 已确认两条迁移未执行、且部署链 TypeORM 元数据表正常。
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/opt/phoenix-erp-backups/w1-db-gate-${TS}"
echo "==> 备份目录: $BACKUP_DIR"

# ── 1) 备份（强制，apply 前必做）──────────────────────────────────────
# mkdir -p "$BACKUP_DIR"
# 关键两表细备份（回滚最快路径）
# docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
#   -t sys_menu -t sys_role_menu_permission --data-only --column-inserts \
#   > "$BACKUP_DIR/rbac_tables_before.sql"
# 全库快照（兜底）
# docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
#   > "$BACKUP_DIR/full_${TS}.dump"
# echo "✅ 备份完成: $BACKUP_DIR"

# ── 2) apply 迁移 ─────────────────────────────────────────────────────
# 推荐走标准链路（与生产 deploy 一致）：
# docker compose exec -T api ./node_modules/.bin/typeorm migration:run \
#   -d dist/database/data-source.js
# 这会按序执行所有 pending 迁移，含：
#   1782047418112-SeedSettingsOperationalAtomicMenus（补 settings 原子菜单，含 down）
#   1782052418112-RepairRolePermissionMatrixAtomicity（补原子菜单 + 转授权 + 删 56 粗授予，含 down）
# echo "✅ 迁移已执行"

# ── 3) 触发 perms_version bump（若迁移未自动 bump，登录态需刷新 JWT）──
# 通常 trg_bump_perms_user_role 触发器会处理；如未，通知受影响用户重登。

echo "DRY-RUN：未执行任何写操作。确认 00_preflight + 用户批准后解开上方注释。"

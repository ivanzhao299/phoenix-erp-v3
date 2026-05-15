#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Phoenix ERP V3 — 物理迁移脚本
#
#  把当前 ~/Antigravity/ABC/ 提升为独立 git 仓库根，落地到 ~/phoenix-erp/。
#  起新仓库（不保留历史），后续推送到一个新建的 GitHub 仓库。
#
#  在 192.168.124.4 本机（物理盘）上执行，不走 SMB：
#    bash ~/Antigravity/ABC/scripts/migrate-to-physical.sh
#
#  环境变量覆盖：
#    SRC=~/Antigravity/ABC   源目录
#    DST=~/phoenix-erp       目标目录
# ═══════════════════════════════════════════════════════════════════════════════
set -eu

SRC="${SRC:-$HOME/Antigravity/ABC}"
DST="${DST:-$HOME/phoenix-erp}"

GREEN='\033[32m'; RED='\033[31m'; YELLOW='\033[33m'; CYAN='\033[36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { printf "${CYAN}[$(date +%H:%M:%S)]${NC} %s\n" "$1"; }
ok()   { printf "${GREEN}  ✓${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}  !${NC} %s\n" "$1"; }
err()  { printf "${RED}  ✗${NC} %s\n" "$1"; }
bold() { printf "${BOLD}%s${NC}\n" "$1"; }

bold "═══════════════════════════════════════════════════════════════════"
bold "  Phoenix ERP V3 — 物理迁移到独立仓库"
bold "═══════════════════════════════════════════════════════════════════"
log "SRC: $SRC"
log "DST: $DST"
echo ""

# 1) 前提检查 ────────────────────────────────────────────────────────────────
[ -d "$SRC" ] || { err "源目录不存在: $SRC"; exit 1; }
[ -d "$SRC/apps/api" ] || { err "源目录看起来不像 phoenix-erp（缺 apps/api）"; exit 1; }
if [ -e "$DST" ]; then
  err "目标已存在: $DST"
  err "若确认要覆盖，请先: rm -rf $DST"
  exit 1
fi
command -v rsync >/dev/null || { err "缺 rsync — 请 brew install rsync 或用 cp 替代"; exit 1; }
command -v git   >/dev/null || { err "缺 git";  exit 1; }
ok "前提检查通过"

# 2) rsync 拷贝源码，排除运行时产物 ─────────────────────────────────────────
log "rsync 拷贝源码..."
rsync -a \
  --exclude='node_modules'      \
  --exclude='dist'              \
  --exclude='.next'             \
  --exclude='build'             \
  --exclude='coverage'          \
  --exclude='.logs'             \
  --exclude='.claude'           \
  --exclude='_archive'          \
  --exclude='.smbdelete*'       \
  --exclude='.DS_Store'         \
  --exclude='*.log'             \
  --exclude='tsconfig.build.tsbuildinfo' \
  --exclude='.git'              \
  "$SRC/" "$DST/"
ok "源码已拷贝到 $DST"

# 3) 顶层 .gitignore（独立仓库，覆盖式重写）───────────────────────────────
cat > "$DST/.gitignore" <<'EOF'
# Phoenix ERP V3 — .gitignore

# Node
node_modules/
**/node_modules/

# Build outputs
dist/
**/dist/
build/
**/build/
.next/
**/.next/
tsconfig.build.tsbuildinfo
**/tsconfig.build.tsbuildinfo

# Runtime / logs
.logs/
.claude/
coverage/
**/coverage/
*.log

# Environment files (敏感)
.env
.env.local
.env.*.local
.env.docker

# OS files
.DS_Store
Thumbs.db
.smbdelete*
**/.smbdelete*

# IDE
.vscode/
.idea/

# 本地归档 / 大文件
_archive/
**/_archive/
*.sql.gz
EOF
ok "顶层 .gitignore 已生成"

# 4) 写一份顶层 README.md（如果原来没有，或者带前缀残留路径）─────────────
if [ ! -f "$DST/README.md" ]; then
cat > "$DST/README.md" <<'EOF'
# Phoenix ERP V3

蛋鸡养殖全链路 ERP 系统 — 养殖 / 包装 / 仓储 / 订单 / POS / 财务 / 质检 / BI

## 快速开始

```bash
# 1) 初始化数据库
bash apps/api/scripts/init_db.sh

# 2) 一键跑 UAT (含启动 API + Web + seed + 76 用例)
bash scripts/finish-v3-uat.sh
```

期望：🟢 76/76 PASS, p95 < 10ms

## 工程结构

```
phoenix-erp/
├── apps/
│   ├── api/        # NestJS 后端 (3100)
│   └── web/        # Next.js 前端 (3000)
├── scripts/
│   ├── finish-v3-uat.sh        # 一键收口
│   ├── seed-uat-users.sh       # 种 9 个 persona
│   ├── seed-uat-fixture.sh     # 种业务基线数据
│   └── uat-runner.sh           # 跑 UAT 76 用例
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## 技术栈

- 前端：Next.js 16 + React 19 + Vanilla CSS
- 后端：NestJS 10 + TypeORM + PostgreSQL 18
- 监控：Prometheus 指标 + 健康检查
- 部署：Docker Compose

详见 [phoenix-erp-tech-stack.md](phoenix-erp-tech-stack.md)。
EOF
ok "README.md 已生成"
else
  ok "README.md 已存在，跳过"
fi

# 5) git init + 初始 commit ──────────────────────────────────────────────────
log "git init + 初始 commit..."
cd "$DST"
git init -q -b main
git add -A
git commit -q -m "feat: Phoenix ERP V3 — initial commit

V2 → V3 迁移完成基线：
  • UAT: 76/76 PASS (P1-P5 全绿，p95 < 10ms)
  • 完整 V3 schema (33 张关键表 + V2 兼容列)
  • 一键收口器 scripts/finish-v3-uat.sh
  • 监控指标 + Prometheus + 健康检查
  • Docker Compose 单机部署模板
" >/dev/null
ok "初始 commit 完成"

# 6) 完成 ──────────────────────────────────────────────────────────────────
COMMIT_HASH=$(git rev-parse --short HEAD)
FILE_COUNT=$(git ls-files | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh . 2>/dev/null | cut -f1)

echo ""
bold "═══════════════════════════════════════════════════════════════════"
printf "${GREEN}${BOLD}✅ 物理迁移完成${NC}\n\n"
echo "  位置:        $DST"
echo "  初始 commit: $COMMIT_HASH"
echo "  文件数:      $FILE_COUNT"
echo "  总大小:      $TOTAL_SIZE"
echo ""
bold "下一步（在你自己的终端，凭据可触发）："
echo ""
echo "  1) 在 GitHub 创建新仓库（建议命名 phoenix-erp-v3）"
echo "     注意：勾选「Don't initialize with README」"
echo ""
echo "  2) 配置 remote + 推送："
echo ""
echo "     cd $DST"
echo "     git remote add origin https://github.com/<你的用户名>/phoenix-erp-v3.git"
echo "     git push -u origin main"
echo ""
echo "  3) 验证一键收口器仍可跑通："
echo ""
echo "     bash scripts/finish-v3-uat.sh   # 期望 🟢 76/76"
echo ""
bold "═══════════════════════════════════════════════════════════════════"
echo ""
echo "  原 ~/Antigravity/ABC/ 暂保留作快照备份"
echo "  确认新仓库无误后可: rm -rf ~/Antigravity/ABC"
echo ""

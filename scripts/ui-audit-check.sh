#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Phoenix ERP — UI 设计规范审计脚本 (Phase UI-2.0)
# ────────────────────────────────────────────────────────────────────────
# 扫描前端代码中违反 docs/frontend-design-rules.md 的高风险模式：
#   · 硬编码 hex 颜色  #RRGGBB / #RGB
#   · rgba(...) 字面量
#   · 内联 style={{ (视觉样式风险)
#   · 页面级状态色映射 STATUS_COLOR / GRADE_COLORS / SEVERITY_COLOR
#   · 原生弹窗 window.confirm / window.prompt / window.alert / 裸 confirm(/alert(
#
# 用法：
#   bash scripts/ui-audit-check.sh            # 报告模式（默认，exit 0）
#   bash scripts/ui-audit-check.sh --strict   # CI 模式：发现新增债务返回非 0
#   bash scripts/ui-audit-check.sh --top 20   # 仅列前 N 个高风险文件
#
# 豁免：design-tokens.ts / globals.css / *.module.css（设计系统源文件，允许定义色值）
#       独立设计语言（store-pos / terminal / mobile）单独标注，不计入 admin 主体统计。
# ════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web/src"
TOP=30
STRICT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --strict) STRICT=1; shift ;;
    --top) TOP="${2:-30}"; shift 2 ;;
    *) shift ;;
  esac
done

# 豁免文件（设计系统源 / 样式源）
EXCLUDE='design-tokens\.ts|globals\.css|\.module\.css|node_modules'

scan() { # $1=正则  $2=说明
  grep -rlnE "$1" "$WEB/app" "$WEB/components" 2>/dev/null \
    | grep -vE "$EXCLUDE" \
    | while read -r f; do
        c=$(grep -oE "$1" "$f" 2>/dev/null | wc -l | tr -d ' ')
        [ "$c" -gt 0 ] && echo "$c ${f#$ROOT/}"
      done | sort -rn
}

count_total() { scan "$1" | awk '{s+=$1} END{print s+0}'; }

C_HEX='#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}\b'
C_RGBA='rgba?\('
C_STYLE='style=\{\{'
C_STATUSMAP='STATUS_COLOR|GRADE_COLORS|SEVERITY_COLOR'
C_NATIVE='window\.(confirm|prompt|alert)|[^.a-zA-Z](confirm|alert)\('

echo "════════════════════════════════════════════════════════"
echo "  Phoenix ERP — UI Design Rules Audit"
echo "  扫描目录: apps/web/src/{app,components}"
echo "  豁免: design-tokens.ts / globals.css / *.module.css"
echo "════════════════════════════════════════════════════════"

hex_total=$(count_total "$C_HEX")
rgba_total=$(count_total "$C_RGBA")
style_total=$(count_total "$C_STYLE")
map_total=$(count_total "$C_STATUSMAP")
native_total=$(count_total "$C_NATIVE")

echo ""
echo "── 违规总量 ──────────────────────────────"
printf "  硬编码 hex (#RRGGBB)      : %s\n" "$hex_total"
printf "  rgba() 字面量             : %s\n" "$rgba_total"
printf "  内联 style={{             : %s\n" "$style_total"
printf "  页面级状态色映射          : %s\n" "$map_total"
printf "  原生 confirm/prompt/alert : %s\n" "$native_total"

echo ""
echo "── Top $TOP 硬编码 hex 文件（首要风险指标）──"
scan "$C_HEX" | head -"$TOP" | awk '{printf "  %4d  %s\n", $1, $2}'

echo ""
echo "── 仍在用 STATUS_COLOR/GRADE_COLORS/SEVERITY_COLOR 的文件 ──"
scan "$C_STATUSMAP" | awk '{printf "  %4d  %s\n", $1, $2}'

echo ""
echo "── 仍在用原生 confirm/prompt/alert 的文件 ──"
scan "$C_NATIVE" | awk '{printf "  %4d  %s\n", $1, $2}'

echo ""
echo "════════════════════════════════════════════════════════"
echo "  规则依据: docs/frontend-design-rules.md"
echo "  正确做法: 引用 design-tokens.ts (CHART_PALETTE/GRADE_PALETTE/"
echo "            SEVERITY_PALETTE/STATUS_CLASS) 与 var(--color-*)"
echo "════════════════════════════════════════════════════════"

# CI 严格模式：当前作为基线记录；后续可设阈值，新增超过基线则失败。
if [ "$STRICT" -eq 1 ]; then
  # 基线阈值（UI-2.0 建立时的现状快照，UI-2.x 迁移应使其持续下降，不得上升）
  BASE_HEX=2000
  if [ "$hex_total" -gt "$BASE_HEX" ]; then
    echo "::error:: 硬编码 hex 总量 $hex_total 超过基线 $BASE_HEX（出现新增 UI 债务）"
    exit 1
  fi
  echo "✅ STRICT: 未超过基线（hex=$hex_total ≤ $BASE_HEX）"
fi
exit 0

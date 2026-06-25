#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Phoenix ERP — 授予 SSH 访问脚本
#  用途：把一个公钥安全地追加到目标用户的 authorized_keys
#        带：格式校验 / 去重 / 权限修正 / 备份
#  适用：在生产服务器上执行（阿里云 ECS · Debian/Ubuntu）
#
#  用法：
#    bash grant-access.sh -f other_project_key.pub          # 从文件读公钥
#    bash grant-access.sh -k "ssh-ed25519 AAAA... comment"  # 直接传公钥串
#    bash grant-access.sh -f key.pub -u deploy              # 指定目标用户
#    bash grant-access.sh -f key.pub -n                     # 演练（只打印不写入）
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

TARGET_USER="$(id -un)"   # 默认当前用户
PUBKEY=""
DRY_RUN=0

usage() {
  grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# ── 解析参数 ────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--file)  PUBKEY="$(cat "$2")"; shift 2 ;;
    -k|--key)   PUBKEY="$2";          shift 2 ;;
    -u|--user)  TARGET_USER="$2";     shift 2 ;;
    -n|--dry-run) DRY_RUN=1;          shift   ;;
    -h|--help)  usage 0 ;;
    *) echo "✗ 未知参数：$1" >&2; usage 1 ;;
  esac
done

[[ -n "$PUBKEY" ]] || { echo "✗ 必须用 -f <文件> 或 -k <公钥串> 提供公钥" >&2; usage 1; }

# 去掉首尾空白，只取第一行（防止误粘多行/私钥）
PUBKEY="$(printf '%s' "$PUBKEY" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | head -n1)"

# ── 安全校验 ────────────────────────────────────────────────
# 1) 不能是私钥
if printf '%s' "$PUBKEY" | grep -q "PRIVATE KEY"; then
  echo "✗ 这看起来是私钥，绝不能放进 authorized_keys。请只传 .pub 公钥。" >&2
  exit 1
fi
# 2) 必须是合法公钥格式（ssh-keygen 能解析）
if ! printf '%s\n' "$PUBKEY" | ssh-keygen -l -f /dev/stdin >/dev/null 2>&1; then
  echo "✗ 公钥格式非法，ssh-keygen 无法解析。" >&2
  exit 1
fi
FP="$(printf '%s\n' "$PUBKEY" | ssh-keygen -l -f /dev/stdin)"

# ── 定位目标用户 home 与 .ssh ───────────────────────────────
USER_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
[[ -n "$USER_HOME" && -d "$USER_HOME" ]] || { echo "✗ 用户 $TARGET_USER 不存在或无 home 目录" >&2; exit 1; }
SSH_DIR="$USER_HOME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

echo "==> 目标用户 : $TARGET_USER ($USER_HOME)"
echo "==> 公钥指纹 : $FP"

# ── 演练模式 ────────────────────────────────────────────────
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> [dry-run] 将写入 $AUTH_KEYS（未实际执行）"
  exit 0
fi

# ── 创建 .ssh 与文件骨架 ────────────────────────────────────
mkdir -p "$SSH_DIR"
touch "$AUTH_KEYS"

# ── 去重：按 key 主体（type + base64）比对，忽略注释 ─────────
KEY_BODY="$(printf '%s' "$PUBKEY" | awk '{print $1" "$2}')"
if awk '{print $1" "$2}' "$AUTH_KEYS" | grep -qxF "$KEY_BODY"; then
  echo "==> 该公钥已存在，跳过（不重复追加）"
else
  # 追加前先备份一次
  cp -a "$AUTH_KEYS" "$AUTH_KEYS.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
  printf '%s\n' "$PUBKEY" >> "$AUTH_KEYS"
  echo "==> ✅ 公钥已追加"
fi

# ── 权限修正（SSH 严格要求）────────────────────────────────
chown -R "$TARGET_USER":"$(id -gn "$TARGET_USER")" "$SSH_DIR"
chmod 700 "$SSH_DIR"
chmod 600 "$AUTH_KEYS"

echo "══════════════════════════════════════════════"
echo "  完成：$TARGET_USER 现可用对应私钥登录本机"
echo "  撤销：编辑 $AUTH_KEYS 删除该行，或："
echo "    ssh-keygen -lf <(awk '{print}' $AUTH_KEYS)  # 列出所有 key 指纹核对"
echo "══════════════════════════════════════════════"

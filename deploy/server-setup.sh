#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Phoenix ERP — 服务器初始化脚本
#  适用：阿里云 ECS，Debian/Ubuntu 22.04
#  执行：bash server-setup.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

DOMAIN="erp.eggslao.com"
EMAIL="ivanzhao299@gmail.com"
DEPLOY_PATH="/opt/phoenix-erp"

echo "==> [1/7] 更新系统包"
apt-get update -qq && apt-get upgrade -y -qq

echo "==> [2/7] 安装基础工具"
apt-get install -y -qq curl wget git ufw fail2ban nginx certbot python3-certbot-nginx

echo "==> [3/7] 安装 Docker"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# Docker Compose v2（作为 docker plugin）
if ! docker compose version &>/dev/null; then
  apt-get install -y -qq docker-compose-plugin
fi

echo "==> [4/7] 配置防火墙 (UFW)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh        # 22
ufw allow http       # 80
ufw allow https      # 443
ufw --force enable
echo "UFW 状态："
ufw status verbose

echo "==> [5/7] 配置 fail2ban（SSH 暴力破解防护）"
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled  = true
port     = ssh
maxretry = 5
bantime  = 3600
findtime = 600
EOF
systemctl enable --now fail2ban

echo "==> [6/7] 配置 Nginx"
mkdir -p /var/www/certbot

# 临时 HTTP 配置（用于 certbot 验证）
cat > /etc/nginx/sites-available/${DOMAIN} <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'OK'; add_header Content-Type text/plain; }
}
EOF
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> [7/7] 申请 Let's Encrypt 证书"
certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${EMAIL} --redirect

echo ""
echo "==> 安装 ERP 正式 Nginx 配置"
# 将仓库中的 vhost 配置复制到 nginx
cp ${DEPLOY_PATH}/nginx/${DOMAIN}.conf /etc/nginx/sites-available/${DOMAIN}
nginx -t && systemctl reload nginx

echo ""
echo "══════════════════════════════════════════════"
echo "  服务器初始化完成！"
echo "  下一步：cd ${DEPLOY_PATH} && cp .env.example .env"
echo "          (编辑 .env 填写密钥)"
echo "          docker compose up -d"
echo "══════════════════════════════════════════════"

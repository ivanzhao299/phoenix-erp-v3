#!/usr/bin/env bash
set -euo pipefail

RUNNER_USER="${PHOENIX_RUNNER_USER:-phoenix-runner}"
INSTALL_ROOT="${PHOENIX_RUNNER_ROOT:-/opt/phoenix-runner}"
REPO_URL="${PHOENIX_RUNNER_REPO_URL:-git@github.com:ivanzhao299/phoenix-erp-v3.git}"
SERVICE_NAME="phoenix-bug-intake-runner"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi
if ! command -v systemctl >/dev/null; then
  echo "systemd is required" >&2
  exit 1
fi
for command in git node corepack gh codex; do
  command -v "$command" >/dev/null || { echo "missing prerequisite: $command" >&2; exit 1; }
done

id "$RUNNER_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$RUNNER_USER"
install -d -m 0750 -o "$RUNNER_USER" -g "$RUNNER_USER" \
  "$INSTALL_ROOT" "$INSTALL_ROOT/config" "$INSTALL_ROOT/runs" "$INSTALL_ROOT/worktrees"

if [ ! -d "$INSTALL_ROOT/state/.git" ]; then
  sudo -u "$RUNNER_USER" -H git clone "$REPO_URL" "$INSTALL_ROOT/state"
fi
sudo -u "$RUNNER_USER" -H git -C "$INSTALL_ROOT/state" fetch origin main
sudo -u "$RUNNER_USER" -H git -C "$INSTALL_ROOT/state" checkout main
sudo -u "$RUNNER_USER" -H git -C "$INSTALL_ROOT/state" merge --ff-only origin/main

if [ ! -e "$INSTALL_ROOT/code/.git" ]; then
  sudo -u "$RUNNER_USER" -H git -C "$INSTALL_ROOT/state" worktree add --detach "$INSTALL_ROOT/code" origin/main
fi

sudo -u "$RUNNER_USER" -H bash -lc \
  "cd '$INSTALL_ROOT/state' && corepack pnpm install --frozen-lockfile"
install -d -m 0700 -o "$RUNNER_USER" -g "$RUNNER_USER" \
  "/home/$RUNNER_USER/.cache" "/home/$RUNNER_USER/.config"

ENV_FILE="$INSTALL_ROOT/config/bug-intake-runner.env"
if [ ! -f "$ENV_FILE" ]; then
  install -m 0600 -o "$RUNNER_USER" -g "$RUNNER_USER" /dev/null "$ENV_FILE"
  cat > "$ENV_FILE" <<EOF
PHOENIX_ERP_RUNNER_USER=
PHOENIX_ERP_RUNNER_PASS=
PHOENIX_ERP_RUNNER_API_BASE=https://erp.eggslao.com
PHOENIX_ERP_RUNNER_INTERVAL=30
PHOENIX_ERP_RUNNER_MAX_TASKS=6
PHOENIX_ERP_RUNNER_PARALLEL_WORKERS=3
PHOENIX_ERP_RUNNER_MAX_CYCLES=999999
PHOENIX_ERP_RUNNER_AUTO_RELEASE=false
PHOENIX_ERP_RUNNER_HOME=$INSTALL_ROOT/config
PHOENIX_ERP_RUNNER_STATE_REPO=$INSTALL_ROOT/state
PHOENIX_ERP_RUNNER_CODE_REPO=$INSTALL_ROOT/code
PHOENIX_ERP_RUNNER_OUTPUT_DIR=$INSTALL_ROOT/runs/local-runner
PHOENIX_ERP_RUNNER_SYNC_OUTPUT_DIR=$INSTALL_ROOT/runs/inbox
PHOENIX_ERP_AGENT_WORKTREE_ROOT=$INSTALL_ROOT/worktrees/agent-tasks
PHOENIX_ERP_MAIN_ROOT=$INSTALL_ROOT/state
PHOENIX_ERP_NODE_BIN=$(command -v node)
PHOENIX_ERP_CODEX_BIN=$(command -v codex)
PHOENIX_ERP_RUNNER_PATH=/usr/local/bin:/usr/bin:/bin
EOF
fi

install -m 0750 -o "$RUNNER_USER" -g "$RUNNER_USER" /dev/null "$INSTALL_ROOT/run.sh"
cat > "$INSTALL_ROOT/run.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
set -a
source "${PHOENIX_RUNNER_ROOT:-/opt/phoenix-runner}/config/bug-intake-runner.env"
set +a
export PATH="$PHOENIX_ERP_RUNNER_PATH"

git -C "$PHOENIX_ERP_RUNNER_STATE_REPO" fetch origin main --quiet
if [ -n "$(git -C "$PHOENIX_ERP_RUNNER_CODE_REPO" status --porcelain)" ]; then
  echo "runner code worktree is dirty" >&2
  exit 75
fi
git -C "$PHOENIX_ERP_RUNNER_CODE_REPO" checkout --detach origin/main --quiet
cd "$PHOENIX_ERP_RUNNER_STATE_REPO"

ARGS=(
  --api-base "$PHOENIX_ERP_RUNNER_API_BASE" --watch
  --interval "$PHOENIX_ERP_RUNNER_INTERVAL"
  --max-cycles "$PHOENIX_ERP_RUNNER_MAX_CYCLES"
  --max-tasks "$PHOENIX_ERP_RUNNER_MAX_TASKS"
  --parallel-workers "$PHOENIX_ERP_RUNNER_PARALLEL_WORKERS"
  --output-dir "$PHOENIX_ERP_RUNNER_OUTPUT_DIR"
  --sync-output-dir "$PHOENIX_ERP_RUNNER_SYNC_OUTPUT_DIR"
  --apply-queue --execute-approved --approval-token APPROVE_AGENT_EXECUTION
  --auto-recover-generation-drift --auto-unblock-dirty-worktrees --skip-blocked
  --commit-audit-artifacts
)
if [ "${PHOENIX_ERP_RUNNER_AUTO_RELEASE:-false}" = true ]; then
  ARGS+=(--push-after-success --wait-ci-after-push --deploy-after-ci --production-smoke-after-ci)
fi
exec "$PHOENIX_ERP_NODE_BIN" \
  "$PHOENIX_ERP_RUNNER_CODE_REPO/scripts/ops/bug-intake-local-runner.mjs" "${ARGS[@]}"
EOF

cat > "/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Phoenix ERP Production Bug Intake Runner
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=$RUNNER_USER
Group=$RUNNER_USER
WorkingDirectory=$INSTALL_ROOT/state
Environment=HOME=/home/$RUNNER_USER
Environment=PHOENIX_RUNNER_ROOT=$INSTALL_ROOT
ExecStart=$INSTALL_ROOT/run.sh
Restart=always
RestartSec=15
TimeoutStopSec=60
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$INSTALL_ROOT /home/$RUNNER_USER/.cache /home/$RUNNER_USER/.config
UMask=0077
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
echo "Installed $SERVICE_NAME. Configure $ENV_FILE, verify Codex/GitHub auth, then start it."
echo "Keep PHOENIX_ERP_RUNNER_AUTO_RELEASE=false until the read-only acceptance gate passes."

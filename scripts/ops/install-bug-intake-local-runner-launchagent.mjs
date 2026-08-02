#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const LABEL = 'com.phoenix.erp.bug-intake-runner';
const STATE_REPO = '/Users/mac/phoenix-erp-worktrees/bug-intake-runner-main';
const CODE_REPO = '/Users/mac/phoenix-erp-worktrees/bug-intake-runner-code';
const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.phoenix-erp');
const ENV_FILE = path.join(CONFIG_DIR, 'bug-intake-runner.env');
const WRAPPER = path.join(CONFIG_DIR, 'bug-intake-runner.sh');
const RUN_DIR = path.join(CONFIG_DIR, 'runs');
const LOG_DIR = path.join(HOME, 'Library', 'Logs', 'phoenix-erp');
const PLIST = path.join(HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`);

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/install-bug-intake-local-runner-launchagent.mjs [--dry-run] [--apply] [--load]

This installs a macOS LaunchAgent wrapper for the local bug intake runner.
It does not store credentials. Put credentials in:
  ${ENV_FILE}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { dryRun: true };
  for (const arg of argv.map((item) => item.replace(/^–+/, '--'))) {
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') args.dryRun = true;
    if (arg === '--apply') {
      args.apply = true;
      args.dryRun = false;
    }
    if (arg === '--load') args.load = true;
  }
  return args;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function wrapperContent() {
  return `#!/usr/bin/env bash
set -euo pipefail
if [ -f ${shellQuote(ENV_FILE)} ]; then
  set -a
  # shellcheck disable=SC1090
  source ${shellQuote(ENV_FILE)}
  set +a
fi
export PATH="\${PHOENIX_ERP_RUNNER_PATH:-/Users/mac/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin}"
export PHOENIX_ERP_CODEX_BIN="\${PHOENIX_ERP_CODEX_BIN:-/Applications/ChatGPT.app/Contents/Resources/codex}"
NODE_BIN="\${PHOENIX_ERP_NODE_BIN:-$(command -v node || true)}"
if [ -z "$NODE_BIN" ]; then
  echo "node binary not found; set PHOENIX_ERP_NODE_BIN in ${shellQuote(ENV_FILE)}" >&2
  exit 127
fi
STATE_REPO="\${PHOENIX_ERP_RUNNER_STATE_REPO:-${STATE_REPO}}"
CODE_REPO="\${PHOENIX_ERP_RUNNER_CODE_REPO:-${CODE_REPO}}"
git -C "$STATE_REPO" fetch origin main --quiet
if [ -e "$CODE_REPO/.git" ]; then
  if [ -n "$(git -C "$CODE_REPO" status --porcelain)" ]; then
    echo "runner code worktree is dirty; refusing to execute stale or mixed source: $CODE_REPO" >&2
    exit 75
  fi
  git -C "$CODE_REPO" checkout --detach origin/main --quiet
else
  mkdir -p "$(dirname "$CODE_REPO")"
  git -C "$STATE_REPO" worktree add --detach "$CODE_REPO" origin/main
fi
cd "$STATE_REPO"
RUNNER_ARGS=( \\
  --api-base "\${PHOENIX_ERP_RUNNER_API_BASE:-https://erp.eggslao.com}" \\
  --watch \\
  --interval "\${PHOENIX_ERP_RUNNER_INTERVAL:-30}" \\
  --max-cycles "\${PHOENIX_ERP_RUNNER_MAX_CYCLES:-999999}" \\
  --max-tasks "\${PHOENIX_ERP_RUNNER_MAX_TASKS:-6}" \\
  --parallel-workers "\${PHOENIX_ERP_RUNNER_PARALLEL_WORKERS:-3}" \\
  --wake-file "\${PHOENIX_ERP_RUNNER_WAKE_FILE:-/tmp/phoenix-erp-bug-runner-wakeup.json}" \\
  --output-dir "\${PHOENIX_ERP_RUNNER_OUTPUT_DIR:-${path.join(RUN_DIR, 'bug-intake-local-runner')}}" \\
  --sync-output-dir "\${PHOENIX_ERP_RUNNER_SYNC_OUTPUT_DIR:-${path.join(RUN_DIR, 'bug-intake-inbox')}}" \\
  --apply-queue \\
  --execute-approved \\
  --approval-token "APPROVE_AGENT_EXECUTION" \\
  --auto-recover-generation-drift \\
  --auto-unblock-dirty-worktrees \\
  --skip-blocked \\
  --commit-audit-artifacts \\
  --audit-commit-minutes "\${PHOENIX_ERP_RUNNER_AUDIT_COMMIT_MINUTES:-30}" \\
)
if [ "\${PHOENIX_ERP_RUNNER_AUTO_RELEASE:-false}" = "true" ]; then
  RUNNER_ARGS+=(--push-after-success --wait-ci-after-push --deploy-after-ci --production-smoke-after-ci)
fi
exec "$NODE_BIN" "$CODE_REPO/scripts/ops/bug-intake-local-runner.mjs" "\${RUNNER_ARGS[@]}"
`;
}

function plistContent() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${WRAPPER}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>${path.join(LOG_DIR, 'bug-intake-runner.out.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(LOG_DIR, 'bug-intake-runner.err.log')}</string>
  <key>WorkingDirectory</key>
  <string>${STATE_REPO}</string>
</dict>
</plist>
`;
}

function envExample() {
  return `# Phoenix ERP bug intake local runner credentials.
# This file is outside git and is sourced by the LaunchAgent wrapper.
# Use a dedicated service/admin account with MENU_BUG_REPORT permission.
PHOENIX_ERP_RUNNER_USER=
PHOENIX_ERP_RUNNER_PASS=
PHOENIX_ERP_RUNNER_API_BASE=https://erp.eggslao.com
PHOENIX_ERP_RUNNER_INTERVAL=30
PHOENIX_ERP_RUNNER_MAX_TASKS=6
PHOENIX_ERP_RUNNER_PARALLEL_WORKERS=3
PHOENIX_ERP_RUNNER_MAX_CYCLES=999999
PHOENIX_ERP_RUNNER_AUDIT_COMMIT_MINUTES=30
PHOENIX_ERP_RUNNER_STATE_REPO=${STATE_REPO}
PHOENIX_ERP_RUNNER_CODE_REPO=${CODE_REPO}
# Backlog consumption and production release are separate gates.
PHOENIX_ERP_RUNNER_AUTO_RELEASE=false
PHOENIX_ERP_RUNNER_PATH=/Users/mac/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
PHOENIX_ERP_CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex
`;
}

function runLaunchctl(args) {
  return spawnSync('launchctl', args, { encoding: 'utf8', timeout: 10_000 });
}

function inspectLoadedService(service, attempts = 15) {
  let inspected = { status: 1, stdout: '', stderr: 'service inspection not attempted' };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    inspected = runLaunchctl(['print', service]);
    if (
      inspected.status === 0
      && /state = running|pid = \d+/.test(String(inspected.stdout || ''))
    ) {
      return { ...inspected, attempts: attempt };
    }
    spawnSync('/bin/sleep', ['1'], { timeout: 2_000 });
  }
  return { ...inspected, attempts };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = {
    label: LABEL,
    plist: PLIST,
    wrapper: WRAPPER,
    envFile: ENV_FILE,
    logDir: LOG_DIR,
    stateRepo: STATE_REPO,
    codeRepo: CODE_REPO,
    dryRun: args.dryRun,
    load: Boolean(args.load),
  };
  if (args.dryRun) {
    console.log(JSON.stringify({ decision: 'LAUNCHAGENT_INSTALL_DRY_RUN', ...summary }, null, 2));
    return;
  }
  mkdirSync(CONFIG_DIR, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(path.dirname(PLIST), { recursive: true });
  if (!existsSync(ENV_FILE)) writeFileSync(ENV_FILE, envExample(), { mode: 0o600 });
  writeFileSync(WRAPPER, wrapperContent(), { mode: 0o700 });
  writeFileSync(PLIST, plistContent());
  if (args.load) {
    const domain = `gui/${process.getuid()}`;
    const service = `${domain}/${LABEL}`;
    runLaunchctl(['bootout', service]);
    runLaunchctl(['bootout', domain, PLIST]);
    const loaded = runLaunchctl(['bootstrap', `gui/${process.getuid()}`, PLIST]);
    const enabled = runLaunchctl(['enable', `gui/${process.getuid()}/${LABEL}`]);
    const inspected =
      loaded.status === 0 && enabled.status === 0
        ? inspectLoadedService(service)
        : { status: 1, stdout: '', stderr: 'bootstrap or enable failed', attempts: 0 };
    summary.launchctl = {
      bootstrapStatus: loaded.status ?? 1,
      bootstrapStdout: loaded.stdout,
      bootstrapStderr: loaded.stderr,
      enableStatus: enabled.status ?? 1,
      enableStdout: enabled.stdout,
      enableStderr: enabled.stderr,
      inspectStatus: inspected.status ?? 1,
      inspectAttempts: inspected.attempts,
      inspectStdout: inspected.stdout,
      inspectStderr: inspected.stderr,
    };
    if (
      loaded.status !== 0
      || enabled.status !== 0
      || inspected.status !== 0
      || !/state = running|pid = \d+/.test(String(inspected.stdout || ''))
    ) {
      console.error(JSON.stringify({ decision: 'LAUNCHAGENT_INSTALL_FAILED', ...summary }, null, 2));
      process.exit(1);
    }
  }
  console.log(JSON.stringify({ decision: 'LAUNCHAGENT_INSTALLED', ...summary }, null, 2));
}

main();

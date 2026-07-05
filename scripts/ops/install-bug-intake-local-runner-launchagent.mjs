#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const LABEL = 'com.phoenix.erp.bug-intake-runner';
const REPO = '/Users/mac/phoenix-erp-worktrees/codex-orchestrator';
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
export PATH="\${PHOENIX_ERP_RUNNER_PATH:-/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin}"
NODE_BIN="\${PHOENIX_ERP_NODE_BIN:-$(command -v node || true)}"
if [ -z "$NODE_BIN" ]; then
  echo "node binary not found; set PHOENIX_ERP_NODE_BIN in ${shellQuote(ENV_FILE)}" >&2
  exit 127
fi
cd ${shellQuote(REPO)}
exec "$NODE_BIN" scripts/ops/bug-intake-local-runner.mjs \\
  --api-base "https://erp.eggslao.com" \\
  --watch \\
  --interval "\${PHOENIX_ERP_RUNNER_INTERVAL:-300}" \\
  --max-cycles "\${PHOENIX_ERP_RUNNER_MAX_CYCLES:-999999}" \\
  --max-tasks "\${PHOENIX_ERP_RUNNER_MAX_TASKS:-3}" \\
  --output-dir "\${PHOENIX_ERP_RUNNER_OUTPUT_DIR:-${path.join(RUN_DIR, 'bug-intake-local-runner')}}" \\
  --sync-output-dir "\${PHOENIX_ERP_RUNNER_SYNC_OUTPUT_DIR:-${path.join(RUN_DIR, 'bug-intake-inbox')}}" \\
  --apply-queue \\
  --execute-approved \\
  --approval-token "APPROVE_AGENT_EXECUTION" \\
  --push-after-success
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
    <string>${WRAPPER}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(LOG_DIR, 'bug-intake-runner.out.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(LOG_DIR, 'bug-intake-runner.err.log')}</string>
  <key>WorkingDirectory</key>
  <string>${REPO}</string>
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
PHOENIX_ERP_RUNNER_INTERVAL=300
PHOENIX_ERP_RUNNER_MAX_TASKS=3
PHOENIX_ERP_RUNNER_MAX_CYCLES=999999
`;
}

function runLaunchctl(args) {
  return spawnSync('launchctl', args, { encoding: 'utf8' });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = {
    label: LABEL,
    plist: PLIST,
    wrapper: WRAPPER,
    envFile: ENV_FILE,
    logDir: LOG_DIR,
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
    runLaunchctl(['bootout', `gui/${process.getuid()}`, PLIST]);
    const loaded = runLaunchctl(['bootstrap', `gui/${process.getuid()}`, PLIST]);
    const enabled = runLaunchctl(['enable', `gui/${process.getuid()}/${LABEL}`]);
    summary.launchctl = {
      bootstrapStatus: loaded.status ?? 1,
      bootstrapStdout: loaded.stdout,
      bootstrapStderr: loaded.stderr,
      enableStatus: enabled.status ?? 1,
      enableStdout: enabled.stdout,
      enableStderr: enabled.stderr,
    };
  }
  console.log(JSON.stringify({ decision: 'LAUNCHAGENT_INSTALLED', ...summary }, null, 2));
}

main();

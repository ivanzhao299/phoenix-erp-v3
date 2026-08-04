import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const installer = fs.readFileSync(
  new URL('./install-bug-intake-runner-systemd.sh', import.meta.url),
  'utf8',
);

test('systemd sandbox keeps Codex state writable without weakening the full home boundary', () => {
  assert.match(installer, /ProtectHome=read-only/);
  assert.match(installer, /Environment=CODEX_HOME=\/home\/\$RUNNER_USER\/\.codex/);
  assert.match(installer, /ReadWritePaths=.*\/home\/\$RUNNER_USER\/\.codex/);
  assert.match(installer, /ReadWritePaths=.*\/home\/\$RUNNER_USER\/\.local\/share/);
});

test('systemd runner delegates filesystem isolation to the hardened service boundary', () => {
  assert.match(installer, /PHOENIX_ERP_CODEX_SANDBOX_MODE:=danger-full-access/);
  assert.match(installer, /ProtectSystem=strict/);
  assert.match(installer, /ProtectHome=read-only/);
  assert.match(installer, /NoNewPrivileges=true/);
  assert.match(installer, /ReadWritePaths=\$INSTALL_ROOT/);
});

test('systemd runner keeps feature parity with the macOS long-running runner', () => {
  assert.match(installer, /PHOENIX_ERP_RUNNER_WAKE_FILE=/);
  assert.match(installer, /--wake-file "\$PHOENIX_ERP_RUNNER_WAKE_FILE"/);
  assert.match(installer, /PHOENIX_ERP_RUNNER_AUDIT_COMMIT_MINUTES=30/);
  assert.match(installer, /--audit-commit-minutes "\$PHOENIX_ERP_RUNNER_AUDIT_COMMIT_MINUTES"/);
  assert.match(installer, /--apply-queue --execute-approved/);
  assert.match(installer, /--auto-recover-generation-drift --auto-unblock-dirty-worktrees --skip-blocked/);
  assert.match(installer, /--push-after-success --wait-ci-after-push --deploy-after-ci --production-smoke-after-ci/);
});

test('systemd runner periodically refreshes the versioned runner implementation', () => {
  assert.match(installer, /git -C "\$PHOENIX_ERP_RUNNER_STATE_REPO" fetch origin main/);
  assert.match(installer, /checkout --detach origin\/main/);
  assert.match(installer, /RuntimeMaxSec=21600/);
  assert.match(installer, /Restart=always/);
});

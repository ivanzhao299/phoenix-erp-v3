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

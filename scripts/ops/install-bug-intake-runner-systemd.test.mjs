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

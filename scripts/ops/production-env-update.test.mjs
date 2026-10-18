import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { atomicUpdate, updateSource, MANAGED_KEYS } from './update-managed-chanjet-env.mjs';
const prefix = '# operator-owned comment\nPHOENIX_DATA_MOUNT_GUARD=true\nPHOENIX_PG_DATA_DIR=/data/test/postgres\nPHOENIX_UPLOADS_DIR=/data/test/uploads\nCHANJET_READONLY_SYNC_ENABLED=false\nCHANJET_ERP_INBOUND_SYNC_ENABLED=false\nJWT_SECRET=test-secret-32-characters-long-enough\nUNRELATED="retain # this"\n';
const input = prefix + MANAGED_KEYS.map(key => `${key}=old\n`).join('');
const updates = Object.fromEntries(MANAGED_KEYS.map((key, i) => [key, `test-${i} dollar $FOO and ${'${BAR}'} apostrophe ' quote " backslash \\ newline\nsecond-line`]));
function temporary(run) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-env-test-')); try { return run(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
function compose(file) { return JSON.parse(execFileSync('docker', ['compose', '--env-file', file, '-f', path.resolve('docker-compose.yml'), 'config', '--format', 'json'], { encoding: 'utf8', env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] })); }

test('preserves storage, hold, unrelated comments and records byte-for-byte while replacing five keys', () => {
  const result = updateSource(input, updates); assert.ok(result.startsWith(prefix));
  for (const key of MANAGED_KEYS) assert.equal(result.split(`${key}=`).length, 2);
});
test('missing optional managed input preserves existing credential rather than clearing it', () => {
  assert.equal(updateSource(input, {}), input);
  const result = updateSource(input, { CHANJET_APP_KEY: 'changed' });
  for (const key of MANAGED_KEYS.slice(1)) assert.ok(result.includes(`${key}=old\n`));
});
test('actual Compose dotenv round-trip supports dollars, quotes, backslashes and multiline credentials', () => temporary(dir => {
  const file = path.join(dir, '.env'); fs.writeFileSync(file, updateSource(input, updates));
  const config = compose(file);
  for (const key of MANAGED_KEYS) assert.equal(config.services.api.environment[key].replace(/\$\$/g, '$'), updates[key]);
  assert.equal(config.services.api.environment.CHANJET_READONLY_SYNC_ENABLED, 'false');
  assert.equal(config.services.db.volumes[0].source, '/data/test/postgres');
}));
test('replaces a multiline owned record while preserving CRLF comments and the following keys', () => {
  const source = "# retain\r\nCHANJET_CERT='line1\r\nline2'\r\nPHOENIX_DATA_MOUNT_GUARD=true\r\n";
  assert.equal(updateSource(source, { CHANJET_CERT: 'new' }), '# retain\r\nCHANJET_CERT="new"\nPHOENIX_DATA_MOUNT_GUARD=true\r\n');
});
test('rejects ambiguous export, duplicate or unclosed records without touching a file', () => {
  for (const source of ['export PHOENIX_DATA_MOUNT_GUARD=true\n', 'A=1\nA=2\n', "CHANJET_CERT='unterminated\n"]) assert.throws(() => updateSource(source, updates), /ENV_UPDATE_HOLD/);
  assert.throws(() => updateSource(input, { JWT_SECRET: 'wrong-owner' }), /UNOWNED_KEY/);
});
test('atomic update preserves owner/gid and forces 0600; validation observes private staging before replacement', () => temporary(dir => {
  const file = path.join(dir, '.env'); const stage = path.join(dir, 'stage'); fs.mkdirSync(stage, { mode: 0o700 }); fs.writeFileSync(file, input, { mode: 0o600 });
  const before = fs.statSync(file); let validation = false;
  atomicUpdate(file, updates, { authorized: true, stagingDirectory: stage, validate: staged => { validation = true; assert.equal(fs.readFileSync(file, 'utf8'), input); assert.equal(fs.statSync(staged).mode & 0o777, 0o600); } });
  assert.equal(validation, true); const after = fs.statSync(file); assert.equal(after.mode & 0o777, 0o600); assert.equal(after.uid, before.uid); assert.equal(after.gid, before.gid);
  assert.equal(fs.readdirSync(stage).length, 0);
}));
test('validation/crash-before-rename leaves original bytes and cleans private staging', () => temporary(dir => {
  const file = path.join(dir, '.env'); const stage = path.join(dir, 'stage'); fs.mkdirSync(stage, { mode: 0o700 }); fs.writeFileSync(file, input, { mode: 0o600 });
  assert.throws(() => atomicUpdate(file, updates, { authorized: true, stagingDirectory: stage, validate: () => { throw Error('synthetic failure'); } }));
  assert.equal(fs.readFileSync(file, 'utf8'), input); assert.deepEqual(fs.readdirSync(stage), []);
}));
test('normal release is unauthorized to rewrite env; CLI never emits a supplied credential on failure', () => temporary(dir => {
  const file = path.join(dir, '.env'); fs.writeFileSync(file, input, { mode: 0o600 });
  assert.throws(() => atomicUpdate(file, updates), /ROTATION_NOT_AUTHORIZED/); assert.equal(fs.readFileSync(file, 'utf8'), input);
  const marker = 'FAKE_SECRET_MUST_NOT_BE_LOGGED';
  const result = spawnSync(process.execPath, [path.resolve('scripts/ops/update-managed-chanjet-env.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, CHANJET_APP_KEY: marker, ROTATE_CHANJET_CREDENTIALS: 'false' } });
  assert.notEqual(result.status, 0); assert.doesNotMatch(result.stdout + result.stderr, new RegExp(marker));
}));

test('real created-container environment retains literal dollars and escaping without starting a service', () => temporary(dir => {
  const image = 'nginx:1.28-alpine';
  try { execFileSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }); }
  catch { execFileSync('docker', ['pull', image], { stdio: 'ignore' }); }
  const imageId = execFileSync('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const special = { ...updates, CHANJET_CERT: "trailing\\", CHANJET_APP_SECRET: "literal dollar $$ and ${NAME} and \\'" };
  const env = path.join(dir, '.env'); fs.writeFileSync(env, updateSource(input, special));
  const name = `phoenix-env-fixture-${process.pid}-${Date.now()}`;
  const file = path.join(dir, 'compose.json');
  fs.writeFileSync(file, JSON.stringify({ services: { fixture: { image: imageId, network_mode: 'none', container_name: name, environment: Object.fromEntries(MANAGED_KEYS.map(key => [key, '${'+key+'}'])) } } }));
  const args = ['compose', '--project-name', name, '--env-file', env, '-f', file];
  const options = { env: { PATH: process.env.PATH }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  try {
    execFileSync('docker', [...args, 'create', '--pull', 'never'], options);
    const entries = JSON.parse(execFileSync('docker', ['inspect', name, '--format', '{{json .Config.Env}}'], options));
    for (const key of MANAGED_KEYS) assert.ok(entries.includes(`${key}=${special[key]}`));
    assert.equal(execFileSync('docker', ['inspect', name, '--format', '{{.Image}}'], options).trim(), imageId);
    assert.equal(execFileSync('docker', ['inspect', name, '--format', '{{.State.Running}}'], options).trim(), 'false');
  } finally { spawnSync('docker', [...args, 'down', '--volumes'], options); }
}));

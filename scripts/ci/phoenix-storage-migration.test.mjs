import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const composePath = new URL('docker-compose.yml', root);
const compose = readFileSync(composePath, 'utf8');
const deployWorkflow = readFileSync(new URL('.github/workflows/deploy.yml', root), 'utf8');
const maintenanceWorkflow = readFileSync(new URL('.github/workflows/production-disk-maintenance.yml', root), 'utf8');
const guard = readFileSync(new URL('scripts/ops/require-phoenix-data-mount.sh', root), 'utf8');

function composeConfig(extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'phoenix-compose-storage-'));
  const envFile = join(dir, '.env');
  const env = {
    JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
    ...extraEnv,
  };
  writeFileSync(envFile, `${Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  try {
    return JSON.parse(execFileSync('docker', [
      'compose', '--env-file', envFile, '-f', composePath.pathname,
      'config', '--format', 'json',
    ], { encoding: 'utf8' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('default compose storage stays on the existing named volumes', () => {
  const config = composeConfig();
  assert.equal(config.services.db.volumes[0].source, 'phoenix_pg_data');
  assert.equal(config.services.api.volumes[0].source, 'phoenix_uploads');
  assert.match(compose, /phoenix_pg_data:\n\s+name: phoenix_pg_data/);
  assert.match(compose, /phoenix_uploads:\n\s+name: phoenix_uploads/);
});

test('production-like compose storage resolves to /data bind sources', () => {
  const config = composeConfig({
    PHOENIX_PG_DATA_DIR: '/data/test/postgres',
    PHOENIX_UPLOADS_DIR: '/data/test/uploads',
  });
  assert.equal(config.services.db.volumes[0].source, '/data/test/postgres');
  assert.equal(config.services.api.volumes[0].source, '/data/test/uploads');
});

test('deploy and maintenance workflows invoke the fail-closed guard', () => {
  assert.match(deployWorkflow, /CODE_SYNCED=true[\s\S]*bash scripts\/ops\/require-phoenix-data-mount\.sh/);
  assert.match(maintenanceWorkflow, /cd "\$DEPLOY_PATH"[\s\S]*bash scripts\/ops\/require-phoenix-data-mount\.sh/);
  assert.match(guard, /mountpoint -q/);
  assert.match(guard, /\.phoenix-data-volume/);
  assert.match(guard, /findmnt -T/);
  assert.match(guard, /outside \$data_mount/);
});

test('mount guard passes only when the configured data mount is present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phoenix-data-guard-'));
  const mockBin = join(dir, 'bin');
  const dataMount = join(dir, 'data');
  const postgresDir = join(dataMount, 'phoenix-erp-data', 'postgres');
  const uploadsDir = join(dataMount, 'phoenix-erp-data', 'uploads');
  const envFile = join(dir, '.env');
  mkdirSync(mockBin, { recursive: true });
  mkdirSync(postgresDir, { recursive: true });
  mkdirSync(uploadsDir, { recursive: true });
  writeFileSync(join(dataMount, '.phoenix-data-volume'), 'test\n');
  writeFileSync(envFile, [
    `PHOENIX_PG_DATA_DIR=${postgresDir}`,
    `PHOENIX_UPLOADS_DIR=${uploadsDir}`,
  ].join('\n') + '\n');
  writeFileSync(join(mockBin, 'mountpoint'), '#!/bin/sh\nexit 0\n');
  writeFileSync(join(mockBin, 'findmnt'), '#!/bin/sh\nif [ "$1" = "-T" ]; then printf "%s\\n" "$PHOENIX_DATA_MOUNT"; fi\n');
  chmodSync(join(mockBin, 'mountpoint'), 0o755);
  chmodSync(join(mockBin, 'findmnt'), 0o755);
  const env = { ...process.env, PATH: `${mockBin}:${process.env.PATH}`, PHOENIX_ENV_FILE: envFile, PHOENIX_DATA_MOUNT: dataMount };
  try {
    execFileSync('bash', [new URL('scripts/ops/require-phoenix-data-mount.sh', root).pathname], { env, encoding: 'utf8' });
    writeFileSync(join(mockBin, 'mountpoint'), '#!/bin/sh\nexit 1\n');
    assert.throws(
      () => execFileSync('bash', [new URL('scripts/ops/require-phoenix-data-mount.sh', root).pathname], {
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
      (error) => error.status === 1,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('named-volume mode leaves the mount guard disabled', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phoenix-named-volume-'));
  const envFile = join(dir, '.env');
  writeFileSync(envFile, 'JWT_SECRET=test-only\n');
  try {
    execFileSync('bash', [new URL('scripts/ops/require-phoenix-data-mount.sh', root).pathname], {
      env: { ...process.env, PHOENIX_ENV_FILE: envFile },
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

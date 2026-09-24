import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const schemaFirst = fs.readFileSync('scripts/deploy-schema-first.sh', 'utf8');

test('deploy ordering keeps backup and preflight before schema writes and API switch', () => {
  const backup = deploy.indexOf('迁移前强制备份');
  const preflight = deploy.indexOf('只读 ledger preflight');
  const legacy = deploy.indexOf('MIG_MODE=prod MIG_DIR=apps/api bash scripts/db-migrate.sh');
  const candidate = deploy.indexOf('bash scripts/deploy-schema-first.sh');
  const switchPoint = deploy.indexOf('docker compose up -d --no-deps --wait api', candidate);
  assert.ok(backup >= 0 && preflight > backup && legacy > preflight && candidate > legacy && switchPoint > candidate);
});

test('candidate schema-first remains immutable, transactional, and artifact-preserving', () => {
  assert.match(schemaFirst, /PRESERVE_ARTIFACTS.*true/);
  assert.match(schemaFirst, /migration:run --transaction all/);
  assert.match(schemaFirst, /lock_timeout=5s/);
  assert.match(schemaFirst, /statement_timeout=120s/);
  assert.match(schemaFirst, /verified-image\.txt/);
});

test('rollback does not silently restore database or authorize API switch', () => {
  assert.match(deploy, /数据库未自动覆盖恢复/);
  assert.match(deploy, /API_SWITCH_STARTED=false/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('../../apps/api/node_modules/pg');
const root = path.resolve(process.cwd());
const script = path.join(root, 'scripts/db-migrate.sh');
const pg = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
};
const migrator = 'g2_migrator';
const migratorPassword = 'g2_migrator_pass';

function quoteIdent(value) { return `"${String(value).replaceAll('"', '""')}"`; }

async function query(client, text, values) { return client.query(text, values); }

async function resetPublic(admin) {
  await query(admin, 'DROP SCHEMA public CASCADE');
  await query(admin, 'CREATE SCHEMA public');
  await query(admin, 'GRANT USAGE, CREATE ON SCHEMA public TO PUBLIC');
}

async function createMigrator(admin) {
  await query(admin, `DO $block$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${migrator}') THEN
      CREATE ROLE ${quoteIdent(migrator)} LOGIN PASSWORD '${migratorPassword}';
    END IF;
  END $block$`);
  await query(admin, `ALTER ROLE ${quoteIdent(migrator)} LOGIN PASSWORD '${migratorPassword}'`);
}

function fixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-db-migrate-'));
  fs.mkdirSync(path.join(dir, 'ddl'));
  fs.mkdirSync(path.join(dir, 'migrations'));
  fs.writeFileSync(path.join(dir, 'ddl/001_fixture.sql'), 'CREATE TABLE IF NOT EXISTS fixture_ddl (id integer PRIMARY KEY);\n');
  fs.writeFileSync(path.join(dir, 'migrations/20260101_fixture.sql'), 'CREATE TABLE IF NOT EXISTS fixture_migration (id integer PRIMARY KEY);\n');
  return dir;
}

function dockerShim(dir) {
  const file = path.join(dir, 'docker');
  fs.writeFileSync(file, '#!/bin/sh\nexec psql -X -tAq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"\n', { mode: 0o755 });
  return file;
}

function runMigration(dir, shim) {
  const env = {
    ...process.env,
    MIG_MODE: 'prod',
    MIG_DIR: dir,
    POSTGRES_USER: migrator,
    POSTGRES_PASSWORD: migratorPassword,
    POSTGRES_DB: pg.database,
    PGHOST: pg.host,
    PGPORT: String(pg.port),
    PGUSER: migrator,
    PGPASSWORD: migratorPassword,
    PGDATABASE: pg.database,
    PATH: `${path.dirname(shim)}:${process.env.PATH}`,
  };
  try {
    return { status: 0, output: execFileSync('bash', [script], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { status: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

async function prepareTrackingTable(admin, { withUser = false, denyInsert = false } = {}) {
  await query(admin, 'CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  if (withUser) {
    await query(admin, 'CREATE TABLE sys_user (id integer PRIMARY KEY)');
    await query(admin, 'INSERT INTO sys_user(id) VALUES (1)');
    await query(admin, `GRANT SELECT ON sys_user TO ${quoteIdent(migrator)}`);
  }
  await query(admin, `GRANT SELECT ON schema_migrations TO ${quoteIdent(migrator)}`);
  if (denyInsert) await query(admin, `REVOKE INSERT ON schema_migrations FROM ${quoteIdent(migrator)}`);
}

async function main() {
  const admin = new Client(pg);
  await admin.connect();
  const version = (await query(admin, 'SHOW server_version')).rows[0].server_version;
  const versionNum = (await query(admin, "SELECT current_setting('server_version_num') AS version_num")).rows[0].version_num;
  assert.equal(versionNum, '160014', `fixture requires PostgreSQL 16.14, got ${version} (${versionNum})`);
  await createMigrator(admin);
  const dir = fixtureDir();
  const shim = dockerShim(dir);
  try {
    await resetPublic(admin);
    let result = runMigration(dir, shim);
    assert.equal(result.status, 0, result.output);
    assert.equal((await query(admin, 'SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 1);
    console.log('EMPTY_DB=PASS');

    result = runMigration(dir, shim);
    assert.equal(result.status, 0, result.output);
    assert.equal((await query(admin, 'SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 1);
    console.log('SECOND_IDEMPOTENT_RUN=PASS');

    await resetPublic(admin);
    await query(admin, `REVOKE CREATE ON SCHEMA public FROM PUBLIC, ${quoteIdent(migrator)}`);
    result = runMigration(dir, shim);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.output, /裸 SQL 迁移完成/);
    console.log('TRACKING_TABLE_CREATE_FAILURE=BLOCK_PASS');

    await resetPublic(admin);
    await prepareTrackingTable(admin, { withUser: true, denyInsert: true });
    result = runMigration(dir, shim);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.output, /裸 SQL 迁移完成/);
    console.log('BASELINE_TRACKING_INSERT_FAILURE=BLOCK_PASS');

    await resetPublic(admin);
    await prepareTrackingTable(admin, { denyInsert: true });
    result = runMigration(dir, shim);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /Applying 20260101_fixture\.sql/);
    assert.doesNotMatch(result.output, /裸 SQL 迁移完成/);
    assert.equal((await query(admin, 'SELECT count(*)::int AS n FROM fixture_migration')).rows[0].n, 0);
    console.log('POST_MIGRATION_TRACKING_INSERT_FAILURE=BLOCK_PASS');
    console.log(`PG_VERSION=${version}`);
    console.log(`PG_VERSION_NUM=${versionNum}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    await resetPublic(admin);
    await admin.end();
  }
}

await main();

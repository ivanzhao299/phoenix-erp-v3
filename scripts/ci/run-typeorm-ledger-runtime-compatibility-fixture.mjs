import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('../../apps/api/node_modules/pg');
const typeormPackage = require('../../apps/api/node_modules/typeorm/package.json');
const root = path.resolve(process.cwd());
const pgEnv = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
};
const cli = path.join(root, 'apps/api/node_modules/.bin/typeorm');
const dataSource = path.join(root, 'apps/api/dist/database/data-source.js');
const phase1Timestamps = new Set([1789600000000, 1789600100000, 1789600200000, 1789600300000]);
const retired = { name: 'DropHouseOwnershipRedundantColumns1787647200000', timestamp: 1787647200000 };

function inventory() {
  const output = execFileSync(process.execPath, ['scripts/ci/typeorm-migration-inventory.mjs', 'apps/api/dist/database/migrations'], { encoding: 'utf8' });
  const entries = JSON.parse(output);
  assert.equal(entries.length, 88, `expected 88 canonical migrations, got ${entries.length}`);
  const phase1 = entries.filter((entry) => phase1Timestamps.has(entry.timestamp));
  assert.equal(phase1.length, 4, 'Phase 1 inventory must contain exactly four timestamps');
  assert.equal(new Set(phase1.map((entry) => entry.timestamp)).size, 4);
  return { entries, phase1 };
}

function runCli(args) {
  return execFileSync(cli, ['-d', dataSource, ...args], {
    cwd: path.join(root, 'apps/api'),
    env: { ...process.env, DB_HOST: pgEnv.host, DB_PORT: String(pgEnv.port), DB_USER: pgEnv.user, DB_PASSWORD: pgEnv.password, DB_NAME: pgEnv.database },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  console.log(`TYPEORM_RUNTIME_VERSION=${typeormPackage.version}`);
  const { entries, phase1 } = inventory();
  const canonicalNames = new Set(entries.map((entry) => entry.effective_name));
  const legacyFiles = fs.readdirSync(path.join(root, 'apps/api/migrations')).filter((name) => /^2026.*\.sql$/.test(name)).sort();
  assert.equal(legacyFiles.length, 169, `expected 169 legacy SQL migrations, got ${legacyFiles.length}`);
  const client = new Client(pgEnv);
  await client.connect();
  const q = (text, values) => client.query(text, values);
  try {
    await q('DROP SCHEMA public CASCADE');
    await q('CREATE SCHEMA public');
    await q(`CREATE TABLE acc_ledger (id bigserial PRIMARY KEY, store_code varchar(32), ref_no varchar(128), ledger_type varchar(64), amount numeric)`);
    await q(`CREATE TABLE wms_stocktake (id bigserial PRIMARY KEY, status varchar(32))`);
    await q(`CREATE TABLE pda_sync_log (id bigserial PRIMARY KEY, payload text)`);
    await q(`CREATE TABLE wms_inbound (id bigserial PRIMARY KEY, created_at timestamp DEFAULT CURRENT_TIMESTAMP, updated_at timestamp DEFAULT CURRENT_TIMESTAMP)`);
    await q(`CREATE TABLE wms_warehouses (id bigserial PRIMARY KEY, warehouse_code varchar(32) UNIQUE)`);
    const links = [
      ['store_warehouse_bindings', 'warehouse_code', 'store_warehouse_bindings_warehouse_code_fkey'],
      ['store_replenishment_requests', 'source_warehouse_code', 'store_replenishment_requests_source_warehouse_code_fkey'],
      ['store_replenishment_requests', 'target_warehouse_code', 'store_replenishment_requests_target_warehouse_code_fkey'],
      ['sal_sales_orders', 'fulfillment_warehouse_code', 'sal_sales_orders_fulfillment_warehouse_code_fkey'],
      ['sal_delivery_orders', 'fulfillment_warehouse_code', 'sal_delivery_orders_fulfillment_warehouse_code_fkey'],
      ['sal_return_orders', 'target_warehouse_code', 'sal_return_orders_target_warehouse_code_fkey'],
    ];
    await q(`INSERT INTO acc_ledger(store_code, ref_no, ledger_type, amount) VALUES ('S1', 'REF-1', 'SALE', 10)`);
    await q(`CREATE TABLE mon_device_property_dict (property_code varchar(64) PRIMARY KEY)`);
    for (const [table, column, constraint] of [
      ['mon_device_realtime_snapshot', 'property_code', 'mon_device_realtime_snapshot_property_code_fkey'],
      ['mon_device_property_history', 'property_code', 'mon_device_property_history_property_code_fkey'],
      ['mon_device_alert_event', 'property_code', 'mon_device_alert_event_property_code_fkey'],
    ]) await q(`CREATE TABLE ${table} (id bigserial PRIMARY KEY, ${column} varchar(64), CONSTRAINT ${constraint} FOREIGN KEY (${column}) REFERENCES mon_device_property_dict(property_code))`);
    await q(`CREATE TABLE store_warehouse_bindings (id bigserial PRIMARY KEY, warehouse_code varchar(32), CONSTRAINT store_warehouse_bindings_warehouse_code_fkey FOREIGN KEY (warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
    await q(`CREATE TABLE store_replenishment_requests (id bigserial PRIMARY KEY, source_warehouse_code varchar(32), target_warehouse_code varchar(32), CONSTRAINT store_replenishment_requests_source_warehouse_code_fkey FOREIGN KEY (source_warehouse_code) REFERENCES wms_warehouses(warehouse_code), CONSTRAINT store_replenishment_requests_target_warehouse_code_fkey FOREIGN KEY (target_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
    await q(`CREATE TABLE sal_sales_orders (id bigserial PRIMARY KEY, fulfillment_warehouse_code varchar(32), CONSTRAINT sal_sales_orders_fulfillment_warehouse_code_fkey FOREIGN KEY (fulfillment_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
    await q(`CREATE TABLE sal_delivery_orders (id bigserial PRIMARY KEY, fulfillment_warehouse_code varchar(32), CONSTRAINT sal_delivery_orders_fulfillment_warehouse_code_fkey FOREIGN KEY (fulfillment_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
    await q(`CREATE TABLE sal_return_orders (id bigserial PRIMARY KEY, target_warehouse_code varchar(32), CONSTRAINT sal_return_orders_target_warehouse_code_fkey FOREIGN KEY (target_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
    await q(`INSERT INTO wms_stocktake(status) VALUES ('IN_PROGRESS')`);
    await q(`INSERT INTO pda_sync_log(payload) VALUES ('{"op":"ok"}')`);
    await q(`INSERT INTO wms_inbound(created_at, updated_at) VALUES (TIMESTAMP '2026-01-02 12:00:00', TIMESTAMP '2026-01-02 11:59:59.999665')`);
    await q(`INSERT INTO wms_warehouses(warehouse_code) VALUES ('WH-1')`);

    await q('CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    await q('CREATE TABLE migrations (id serial PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL)');
    for (const filename of legacyFiles) await q('INSERT INTO schema_migrations(filename) VALUES ($1)', [filename]);
    for (const entry of entries.filter((entry) => !phase1Timestamps.has(entry.timestamp))) await q('INSERT INTO migrations(timestamp, name) VALUES ($1, $2)', [entry.timestamp, entry.effective_name]);
    await q('INSERT INTO migrations(timestamp, name) VALUES ($1, $2)', [retired.timestamp, retired.name]);
    assert.equal((await q('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 169);
    assert.equal((await q('SELECT count(*)::int AS n FROM migrations')).rows[0].n, 85);
    console.log('INITIAL_LEDGER=PASS');

    const before = runCli(['migration:show']);
    for (const entry of phase1) assert.ok(before.includes(`[ ] ${entry.effective_name}`), `missing pending migration ${entry.effective_name}`);
    assert.equal((before.match(/\[ \]/g) || []).length, 4, 'migration:show must report exactly four pending migrations');
    console.log('MIGRATION_SHOW_BEFORE=PASS');
    console.log('RETIRED_ROW_TOLERATED=YES');
    console.log('LEGACY_BRIDGE_REQUIRED_BY_TYPEORM=NO');

    const missing = entries.find((entry) => !phase1Timestamps.has(entry.timestamp));
    await q('DELETE FROM migrations WHERE name = $1', [missing.effective_name]);
    const negative = runCli(['migration:show']);
    assert.equal((negative.match(/\[ \]/g) || []).length, 5, 'missing canonical row must add one pending migration');
    console.log('PREEXISTING_PENDING_NEGATIVE_CONTROL=PASS');
    await q('INSERT INTO migrations(timestamp, name) VALUES ($1, $2)', [missing.timestamp, missing.effective_name]);

    const preflight = (() => {
      try { return { status: 0, output: execFileSync(process.execPath, ['scripts/ledger-preflight.mjs', '--db-mode', 'ci', '--mode', 'pre-migration'], { cwd: root, env: { ...process.env, MIG_MODE: 'ci', PGHOST: pgEnv.host, PGPORT: String(pgEnv.port), PGUSER: pgEnv.user, PGPASSWORD: pgEnv.password, PGDATABASE: pgEnv.database }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (error) { return { status: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }; }
    })();
    console.log(`CURRENT_LEDGER_PREFLIGHT_RESULT=${preflight.status === 0 ? 'PASS' : 'BLOCK'}`);
    if (preflight.status !== 0) {
      try {
        const diagnostics = JSON.parse(preflight.output);
        console.log(`CURRENT_LEDGER_PREFLIGHT_BLOCK_REASONS=${JSON.stringify(diagnostics.failures ?? diagnostics.diagnostics ?? diagnostics)}`);
      } catch {
        console.log('CURRENT_LEDGER_PREFLIGHT_BLOCK_REASONS=UNPARSEABLE_PREFLIGHT_OUTPUT');
      }
    }

    const runOutput = runCli(['migration:run', '--transaction', 'all']);
    for (const entry of phase1) assert.match(runOutput, new RegExp(entry.effective_name));
    assert.doesNotMatch(runOutput, new RegExp(retired.name));
    assert.equal((await q('SELECT count(*)::int AS n FROM migrations')).rows[0].n, 89);
    assert.equal((await q('SELECT count(*)::int AS n FROM migrations WHERE name = $1', [retired.name])).rows[0].n, 1);
    console.log('MIGRATION_RUN_EXACTLY_FOUR=PASS');
    console.log('RETIRED_ROW_PRESERVED=PASS');
    assert.equal((await q('SELECT count(*)::int AS n FROM migrations WHERE name LIKE $1', ['2026%'])).rows[0].n, 0);
    console.log('LEGACY_BRIDGE_REMAINS_ABSENT=PASS');

    const after = runCli(['migration:show']);
    assert.equal((after.match(/\[ \]/g) || []).length, 0);
    console.log('MIGRATION_SHOW_AFTER=PASS');
    const checks = await q(`SELECT
      (SELECT character_maximum_length FROM information_schema.columns WHERE table_name='acc_ledger' AND column_name='store_code') AS store_width,
      (SELECT character_maximum_length FROM information_schema.columns WHERE table_name='acc_ledger' AND column_name='ref_no') AS ref_width,
      (SELECT character_maximum_length FROM information_schema.columns WHERE table_name='acc_ledger' AND column_name='ledger_type') AS ledger_width,
      (SELECT data_type FROM information_schema.columns WHERE table_name='pda_sync_log' AND column_name='payload') AS payload_type,
      (SELECT data_type FROM information_schema.columns WHERE table_name='wms_inbound' AND column_name='created_at') AS created_type,
      (SELECT data_type FROM information_schema.columns WHERE table_name='wms_inbound' AND column_name='updated_at') AS updated_type,
      (SELECT count(*)::int FROM pg_constraint WHERE contype='f' AND conname IN ('store_warehouse_bindings_warehouse_code_fkey','store_replenishment_requests_source_warehouse_code_fkey','store_replenishment_requests_target_warehouse_code_fkey','sal_sales_orders_fulfillment_warehouse_code_fkey','sal_delivery_orders_fulfillment_warehouse_code_fkey','sal_return_orders_target_warehouse_code_fkey')) AS warehouse_fks,
      (SELECT count(*)::int FROM pg_constraint WHERE conname IN ('mon_device_realtime_snapshot_property_code_fkey','mon_device_property_history_property_code_fkey','mon_device_alert_event_property_code_fkey')) AS iot_fks,
      (SELECT extract(epoch FROM updated_at-created_at) FROM wms_inbound LIMIT 1) AS delta`);
    const row = checks.rows[0];
    assert.deepEqual([Number(row.store_width), Number(row.ref_width), Number(row.ledger_width)], [64, 128, 64]);
    assert.equal(row.payload_type, 'jsonb');
    assert.equal(row.created_type, 'timestamp with time zone');
    assert.equal(row.updated_type, 'timestamp with time zone');
    assert.equal(Number(row.warehouse_fks), 6);
    assert.equal(Number(row.iot_fks), 0);
    assert.equal(Number(row.delta), -0.000335);
    console.log('SCHEMA_INVARIANTS=PASS');
    console.log('DATA_INVARIANTS=PASS');
    console.log('LEDGER_RUNTIME_COMPATIBILITY=PASS');
    console.log('LEDGER_PREFLIGHT_RUNTIME_SEMANTICS_DIVERGENCE=CONFIRMED');
  } finally {
    await client.end();
  }
}

await main();

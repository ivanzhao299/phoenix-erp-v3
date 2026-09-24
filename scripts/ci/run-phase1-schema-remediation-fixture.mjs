import assert from 'node:assert/strict';
import { DataSource } from '../../apps/api/node_modules/typeorm/index.js';
import { ConvergePhase1CanonicalSchema1789600000000 } from '../../apps/api/dist/database/migrations/1789600000000-ConvergePhase1CanonicalSchema.js';
import { WidenAccLedgerStoreCode1789600100000 } from '../../apps/api/dist/database/migrations/1789600100000-WidenAccLedgerStoreCode.js';
import { WidenWarehouseCodeForeignKeys1789600200000 } from '../../apps/api/dist/database/migrations/1789600200000-WidenWarehouseCodeForeignKeys.js';
import { ConvergeInboundTimestamps1789600300000 } from '../../apps/api/dist/database/migrations/1789600300000-ConvergeInboundTimestamps.js';

const options = { type: 'postgres', host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), username: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE };
const migrations = [
  new ConvergePhase1CanonicalSchema1789600000000(),
  new WidenAccLedgerStoreCode1789600100000(),
  new WidenWarehouseCodeForeignKeys1789600200000(),
  new ConvergeInboundTimestamps1789600300000(),
];

const ds = new DataSource(options);
await ds.initialize();
const qr = ds.createQueryRunner();
await qr.connect();

async function reset() {
  await qr.query('DROP SCHEMA public CASCADE');
  await qr.query('CREATE SCHEMA public');
}

async function createDriftFixture() {
  await reset();
  await qr.query(`CREATE TABLE acc_ledger (id bigserial PRIMARY KEY, store_code varchar(32), ref_no varchar(128), ledger_type varchar(64), amount numeric)`);
  await qr.query(`CREATE INDEX idx_acc_ledger_store ON acc_ledger(store_code)`);
  await qr.query(`INSERT INTO acc_ledger(store_code, ref_no, ledger_type, amount) VALUES ('S1','REF-1','SALE',10)`);
  await qr.query(`CREATE TABLE wms_stocktake (id bigserial PRIMARY KEY, status varchar(32))`);
  await qr.query(`INSERT INTO wms_stocktake(status) VALUES ('IN_PROGRESS')`);
  await qr.query(`CREATE TABLE pda_sync_log (id bigserial PRIMARY KEY, payload text)`);
  await qr.query(`INSERT INTO pda_sync_log(payload) VALUES ('{"op":"ok"}')`);
  await qr.query(`CREATE TABLE wms_inbound (id bigserial PRIMARY KEY, created_at timestamp DEFAULT CURRENT_TIMESTAMP, updated_at timestamp DEFAULT CURRENT_TIMESTAMP)`);
  await qr.query(`INSERT INTO wms_inbound(created_at, updated_at) VALUES (TIMESTAMP '2026-01-02 12:00:00', TIMESTAMP '2026-01-02 11:59:59.999665')`);
  await qr.query(`CREATE TABLE wms_warehouses (id bigserial PRIMARY KEY, warehouse_code varchar(32) UNIQUE)`);
  await qr.query(`INSERT INTO wms_warehouses(warehouse_code) VALUES ('WH-1')`);
  await qr.query(`CREATE TABLE store_warehouse_bindings (id bigserial PRIMARY KEY, warehouse_code varchar(32), CONSTRAINT store_warehouse_bindings_warehouse_code_fkey FOREIGN KEY (warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
  await qr.query(`CREATE TABLE store_replenishment_requests (id bigserial PRIMARY KEY, source_warehouse_code varchar(32), target_warehouse_code varchar(32), CONSTRAINT store_replenishment_requests_source_warehouse_code_fkey FOREIGN KEY (source_warehouse_code) REFERENCES wms_warehouses(warehouse_code), CONSTRAINT store_replenishment_requests_target_warehouse_code_fkey FOREIGN KEY (target_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
  await qr.query(`CREATE TABLE sal_sales_orders (id bigserial PRIMARY KEY, fulfillment_warehouse_code varchar(32), CONSTRAINT sal_sales_orders_fulfillment_warehouse_code_fkey FOREIGN KEY (fulfillment_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
  await qr.query(`CREATE TABLE sal_delivery_orders (id bigserial PRIMARY KEY, fulfillment_warehouse_code varchar(32), CONSTRAINT sal_delivery_orders_fulfillment_warehouse_code_fkey FOREIGN KEY (fulfillment_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
  await qr.query(`CREATE TABLE sal_return_orders (id bigserial PRIMARY KEY, target_warehouse_code varchar(32), CONSTRAINT sal_return_orders_target_warehouse_code_fkey FOREIGN KEY (target_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
  await qr.query(`CREATE TABLE mon_device_property_dict (property_code varchar(64) PRIMARY KEY)`);
  await qr.query(`CREATE TABLE mon_device_realtime_snapshot (id bigserial PRIMARY KEY, property_code varchar(64), CONSTRAINT mon_device_realtime_snapshot_property_code_fkey FOREIGN KEY (property_code) REFERENCES mon_device_property_dict(property_code))`);
  await qr.query(`CREATE TABLE mon_device_property_history (id bigserial PRIMARY KEY, property_code varchar(64), CONSTRAINT mon_device_property_history_property_code_fkey FOREIGN KEY (property_code) REFERENCES mon_device_property_dict(property_code))`);
  await qr.query(`CREATE TABLE mon_device_alert_event (id bigserial PRIMARY KEY, property_code varchar(64), CONSTRAINT mon_device_alert_event_property_code_fkey FOREIGN KEY (property_code) REFERENCES mon_device_property_dict(property_code))`);
}

async function runMigrations() {
  for (const migration of migrations) await migration.up(qr);
}

async function assertInvalidJsonFailsClosed() {
  await reset();
  await qr.query(`CREATE TABLE pda_sync_log (id bigserial PRIMARY KEY, payload text)`);
  await qr.query(`INSERT INTO pda_sync_log(payload) VALUES ('not-json')`);
  await assert.rejects(() => migrations[0].up(qr));
  console.log('INVALID_JSON_FAIL_CLOSED=PASS');
}

async function verify(expectNegativeTimestamp = true) {
  const columns = await qr.query(`SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND ((table_name='acc_ledger' AND column_name IN ('store_code','ref_no','ledger_type')) OR (table_name='wms_stocktake' AND column_name='status') OR (table_name='pda_sync_log' AND column_name='payload') OR (table_name='wms_inbound' AND column_name IN ('created_at','updated_at')) OR (table_name='wms_warehouses' AND column_name='warehouse_code')) ORDER BY table_name,column_name`);
  const byKey = new Map(columns.map((row) => [`${row.table_name}.${row.column_name}`, row]));
  assert.equal(byKey.get('acc_ledger.store_code').character_maximum_length, 64);
  assert.equal(byKey.get('acc_ledger.ref_no').character_maximum_length, 128);
  assert.equal(byKey.get('acc_ledger.ledger_type').character_maximum_length, 64);
  assert.equal(byKey.get('wms_stocktake.status').character_maximum_length, 32);
  assert.equal(byKey.get('pda_sync_log.payload').data_type, 'jsonb');
  for (const key of ['wms_inbound.created_at', 'wms_inbound.updated_at']) {
    assert.equal(byKey.get(key).data_type, 'timestamp with time zone');
    assert.equal(byKey.get(key).is_nullable, 'NO');
    assert.match(byKey.get(key).column_default, /now\(\)/i);
  }
  assert.equal(byKey.get('wms_warehouses.warehouse_code').character_maximum_length, 64);
  const children = await qr.query(`SELECT count(*)::int AS count FROM pg_constraint WHERE contype='f' AND conname IN ('store_warehouse_bindings_warehouse_code_fkey','store_replenishment_requests_source_warehouse_code_fkey','store_replenishment_requests_target_warehouse_code_fkey','sal_sales_orders_fulfillment_warehouse_code_fkey','sal_delivery_orders_fulfillment_warehouse_code_fkey','sal_return_orders_target_warehouse_code_fkey')`);
  assert.equal(Number(children[0].count), 6);
  const dynamicFks = await qr.query(`SELECT count(*)::int AS count FROM pg_constraint WHERE conname IN ('mon_device_realtime_snapshot_property_code_fkey','mon_device_property_history_property_code_fkey','mon_device_alert_event_property_code_fkey')`);
  assert.equal(Number(dynamicFks[0].count), 0);
  const epoch = await qr.query(`SELECT extract(epoch FROM created_at) AS created, extract(epoch FROM updated_at) AS updated, extract(epoch FROM updated_at-created_at) AS delta FROM wms_inbound`);
  if (expectNegativeTimestamp) assert.equal(Number(epoch[0].delta), -0.000335);
  await qr.query(`SET TIME ZONE 'Asia/Shanghai'`);
  const nonUtcEpoch = await qr.query(`SELECT extract(epoch FROM created_at) AS created, extract(epoch FROM updated_at) AS updated FROM wms_inbound`);
  await qr.query(`SET TIME ZONE 'UTC'`);
  const utcEpoch = await qr.query(`SELECT extract(epoch FROM created_at) AS created, extract(epoch FROM updated_at) AS updated FROM wms_inbound`);
  assert.equal(Number(nonUtcEpoch[0].created), Number(utcEpoch[0].created));
  assert.equal(Number(nonUtcEpoch[0].updated), Number(utcEpoch[0].updated));
  console.log('PHASE1_PRODUCTION_LIKE_REHEARSAL=PASS');
  console.log('WAREHOUSE_FK_INVARIANTS=PASS');
  console.log('TIMESTAMP_UTC_INVARIANTS=PASS');
}

await assertInvalidJsonFailsClosed();
await createDriftFixture();
await runMigrations();
await verify(false);
await reset();
await qr.query(`CREATE TABLE acc_ledger (id bigserial PRIMARY KEY, store_code varchar(64), ref_no varchar(128), ledger_type varchar(64))`);
await qr.query(`CREATE TABLE wms_stocktake (id bigserial PRIMARY KEY, status varchar(32))`);
await qr.query(`CREATE TABLE pda_sync_log (id bigserial PRIMARY KEY, payload jsonb)`);
await qr.query(`CREATE TABLE wms_inbound (id bigserial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
await qr.query(`CREATE TABLE wms_warehouses (id bigserial PRIMARY KEY, warehouse_code varchar(64) UNIQUE)`);
await qr.query(`CREATE TABLE store_warehouse_bindings (id bigserial PRIMARY KEY, warehouse_code varchar(64), CONSTRAINT store_warehouse_bindings_warehouse_code_fkey FOREIGN KEY (warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
await qr.query(`CREATE TABLE store_replenishment_requests (id bigserial PRIMARY KEY, source_warehouse_code varchar(64), target_warehouse_code varchar(64), CONSTRAINT store_replenishment_requests_source_warehouse_code_fkey FOREIGN KEY (source_warehouse_code) REFERENCES wms_warehouses(warehouse_code), CONSTRAINT store_replenishment_requests_target_warehouse_code_fkey FOREIGN KEY (target_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
await qr.query(`CREATE TABLE sal_sales_orders (id bigserial PRIMARY KEY, fulfillment_warehouse_code varchar(64), CONSTRAINT sal_sales_orders_fulfillment_warehouse_code_fkey FOREIGN KEY (fulfillment_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
await qr.query(`CREATE TABLE sal_delivery_orders (id bigserial PRIMARY KEY, fulfillment_warehouse_code varchar(64), CONSTRAINT sal_delivery_orders_fulfillment_warehouse_code_fkey FOREIGN KEY (fulfillment_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
await qr.query(`CREATE TABLE sal_return_orders (id bigserial PRIMARY KEY, target_warehouse_code varchar(64), CONSTRAINT sal_return_orders_target_warehouse_code_fkey FOREIGN KEY (target_warehouse_code) REFERENCES wms_warehouses(warehouse_code))`);
await qr.query(`INSERT INTO wms_inbound DEFAULT VALUES`);
await runMigrations();
await verify(false);
console.log('FRESH_CANONICAL_TARGET=PASS');
await qr.release();
await ds.destroy();

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export function compareInvariantEvidence(before, after) {
  const failures = [];
  for (const table of Object.keys(before?.rowCounts ?? {})) {
    if (before.rowCounts[table] !== after?.rowCounts?.[table]) failures.push(`ROW_COUNT_CHANGED:${table}`);
  }
  if (before?.timestampDelta !== undefined && before.timestampDelta !== after?.timestampDelta) failures.push('TIMESTAMP_DELTA_CHANGED');
  if (after?.warehouseForeignKeys !== 6) failures.push('WAREHOUSE_FK_COUNT');
  if (after?.iotDynamicPropertyCodeForeignKeys !== 0) failures.push('IOT_DYNAMIC_FK_PRESENT');
  if (after?.schemaValid !== true || after?.dataValid !== true) failures.push('SCHEMA_OR_DATA_INVALID');
  return { pass: failures.length === 0, failures };
}

export function captureFixtureEvidence() {
  const sql = `WITH c AS (
    SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns
    WHERE (table_name, column_name) IN (
      ('acc_ledger','store_code'),('acc_ledger','ref_no'),('acc_ledger','ledger_type'),
      ('wms_stocktake','status'),('pda_sync_log','payload'),('wms_warehouses','warehouse_code'),
      ('store_warehouse_bindings','warehouse_code'),('store_replenishment_requests','source_warehouse_code'),
      ('store_replenishment_requests','target_warehouse_code'),('sal_sales_orders','fulfillment_warehouse_code'),
      ('sal_delivery_orders','fulfillment_warehouse_code'),('sal_return_orders','target_warehouse_code'),
      ('wms_inbound','created_at'),('wms_inbound','updated_at')
    )
  ), f AS (SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN (
    'store_warehouse_bindings_warehouse_code_fkey','store_replenishment_requests_source_warehouse_code_fkey',
    'store_replenishment_requests_target_warehouse_code_fkey','sal_sales_orders_fulfillment_warehouse_code_fkey',
    'sal_delivery_orders_fulfillment_warehouse_code_fkey','sal_return_orders_target_warehouse_code_fkey'
  )), i AS (SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN (
    'mon_device_realtime_snapshot_property_code_fkey','mon_device_property_history_property_code_fkey','mon_device_alert_event_property_code_fkey'
  ))
  SELECT json_build_object(
    'schemaValid', (SELECT count(*) = 14 FROM c) AND (SELECT n = 6 FROM f) AND (SELECT n = 0 FROM i),
    'dataValid', true,
    'warehouseForeignKeys', (SELECT n FROM f),
    'iotDynamicPropertyCodeForeignKeys', (SELECT n FROM i),
    'rowCounts', json_build_object('wms_inbound', (SELECT count(*) FROM wms_inbound), 'acc_ledger', (SELECT count(*) FROM acc_ledger)),
    'timestampDelta', (SELECT EXTRACT(EPOCH FROM (updated_at - created_at)) FROM wms_inbound WHERE updated_at < created_at ORDER BY updated_at - created_at LIMIT 1)
  ) AS evidence`;
  const mode = process.env.INVARIANT_DB_MODE ?? 'ci';
  const output = mode === 'prod'
    ? execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c', 'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { input: sql, encoding: 'utf8' })
    : execFileSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  return JSON.parse(String(output).trim());
}

if (process.argv[1]?.endsWith('phase1-production-invariants.mjs')) {
  if (process.argv.includes('--capture')) {
    const output = captureFixtureEvidence();
    if (process.argv.includes('--output')) fs.writeFileSync(process.argv[process.argv.indexOf('--output') + 1], JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  }
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const result = compareInvariantEvidence(input.before, input.after);
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}

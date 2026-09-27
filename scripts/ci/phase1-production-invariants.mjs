import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export function compareInvariantEvidence(before, after) {
  const failures = [];
  for (const table of Object.keys(before?.rowCounts ?? {})) {
    if (before.rowCounts[table] !== after?.rowCounts?.[table]) failures.push(`ROW_COUNT_CHANGED:${table}`);
  }
  if (before?.timestampDelta !== undefined && before.timestampDelta !== after?.timestampDelta) failures.push('TIMESTAMP_DELTA_CHANGED');
  for (const key of Object.keys(before?.semanticFingerprints ?? {})) {
    if (JSON.stringify(before.semanticFingerprints[key]) !== JSON.stringify(after?.semanticFingerprints?.[key])) failures.push(`DATA_FINGERPRINT_CHANGED:${key}`);
  }
  if (JSON.stringify(Object.keys(before?.semanticFingerprints ?? {}).sort()) !== JSON.stringify(Object.keys(after?.semanticFingerprints ?? {}).sort())) failures.push('DATA_FINGERPRINT_SET_CHANGED');
  for (const key of ['timestampNegativeCount', 'timestampMinDelta', 'timestampMaxDelta']) {
    if (before?.[key] !== after?.[key]) failures.push(`TIMESTAMP_EVIDENCE_CHANGED:${key}`);
  }
  if (after?.warehouseForeignKeys !== 6) failures.push('WAREHOUSE_FK_COUNT');
  if (after?.iotDynamicPropertyCodeForeignKeys !== 0) failures.push('IOT_DYNAMIC_FK_PRESENT');
  if (after?.schemaValid !== true || after?.dataValid !== true) failures.push('SCHEMA_OR_DATA_INVALID');
  return { pass: failures.length === 0, failures };
}

export function captureFixtureEvidence() {
  const sql = `WITH expected(table_name, column_name, data_type, max_len, nullable, default_pattern) AS (VALUES
    ('acc_ledger','store_code','character varying',64,NULL,NULL),
    ('acc_ledger','ref_no','character varying',128,NULL,NULL),
    ('acc_ledger','ledger_type','character varying',64,NULL,NULL),
    ('wms_stocktake','status','character varying',32,NULL,NULL),
    ('pda_sync_log','payload','jsonb',NULL,NULL,NULL),
    ('wms_warehouses','warehouse_code','character varying',64,NULL,NULL),
    ('store_warehouse_bindings','warehouse_code','character varying',64,NULL,NULL),
    ('store_replenishment_requests','source_warehouse_code','character varying',64,NULL,NULL),
    ('store_replenishment_requests','target_warehouse_code','character varying',64,NULL,NULL),
    ('sal_sales_orders','fulfillment_warehouse_code','character varying',64,NULL,NULL),
    ('sal_delivery_orders','fulfillment_warehouse_code','character varying',64,NULL,NULL),
    ('sal_return_orders','target_warehouse_code','character varying',64,NULL,NULL),
    ('wms_inbound','created_at','timestamp with time zone',NULL,'NO','now()'),
    ('wms_inbound','updated_at','timestamp with time zone',NULL,'NO','now()')
  ), c AS (
    SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns
    WHERE (table_name, column_name) IN (SELECT table_name, column_name FROM expected)
  ), f AS (SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN (
    'store_warehouse_bindings_warehouse_code_fkey','store_replenishment_requests_source_warehouse_code_fkey',
    'store_replenishment_requests_target_warehouse_code_fkey','sal_sales_orders_fulfillment_warehouse_code_fkey',
    'sal_delivery_orders_fulfillment_warehouse_code_fkey','sal_return_orders_target_warehouse_code_fkey'
  )), i AS (SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN (
    'mon_device_realtime_snapshot_property_code_fkey','mon_device_property_history_property_code_fkey','mon_device_alert_event_property_code_fkey'
  )), d AS (
    SELECT count(*)::int AS mismatches FROM expected e LEFT JOIN c ON c.table_name=e.table_name AND c.column_name=e.column_name
    WHERE c.table_name IS NULL OR c.data_type <> e.data_type OR (e.max_len IS NOT NULL AND c.character_maximum_length <> e.max_len)
      OR (e.nullable IS NOT NULL AND c.is_nullable <> e.nullable) OR (e.default_pattern IS NOT NULL AND coalesce(c.column_default,'') NOT ILIKE '%' || e.default_pattern || '%')
  ), fp AS (
    SELECT json_build_object(
      'accLedger', md5(coalesce((SELECT string_agg(jsonb_build_array(id, store_code, ref_no, ledger_type)::text, E'\\n' ORDER BY id) FROM acc_ledger), '')),
      'warehouseCodes', json_build_object(
        'wms_warehouses', md5(coalesce((SELECT string_agg(jsonb_build_array(id, warehouse_code)::text, E'\\n' ORDER BY id) FROM wms_warehouses), '')),
        'store_warehouse_bindings', md5(coalesce((SELECT string_agg(jsonb_build_array(id, warehouse_code)::text, E'\\n' ORDER BY id) FROM store_warehouse_bindings), '')),
        'store_replenishment_requests_source', md5(coalesce((SELECT string_agg(jsonb_build_array(id, source_warehouse_code)::text, E'\\n' ORDER BY id) FROM store_replenishment_requests), '')),
        'store_replenishment_requests_target', md5(coalesce((SELECT string_agg(jsonb_build_array(id, target_warehouse_code)::text, E'\\n' ORDER BY id) FROM store_replenishment_requests), '')),
        'sal_sales_orders', md5(coalesce((SELECT string_agg(jsonb_build_array(id, fulfillment_warehouse_code)::text, E'\\n' ORDER BY id) FROM sal_sales_orders), '')),
        'sal_delivery_orders', md5(coalesce((SELECT string_agg(jsonb_build_array(id, fulfillment_warehouse_code)::text, E'\\n' ORDER BY id) FROM sal_delivery_orders), '')),
        'sal_return_orders', md5(coalesce((SELECT string_agg(jsonb_build_array(id, target_warehouse_code)::text, E'\\n' ORDER BY id) FROM sal_return_orders), ''))
      ),
      'stocktakeStatus', md5(coalesce((SELECT string_agg(jsonb_build_array(id, status)::text, E'\\n' ORDER BY id) FROM wms_stocktake), '')),
      'pdaPayloadSemantic', md5(coalesce((SELECT string_agg(jsonb_build_array(id, payload::jsonb)::text, E'\\n' ORDER BY id) FROM pda_sync_log), '')),
      'iotPropertyCode', json_build_object(
        'mon_device_realtime_snapshot', CASE WHEN to_regclass('public.mon_device_realtime_snapshot') IS NULL THEN 'ABSENT' ELSE md5(coalesce((SELECT string_agg(jsonb_build_array(id, property_code)::text, E'\\n' ORDER BY id) FROM mon_device_realtime_snapshot), '')) END,
        'mon_device_property_history', CASE WHEN to_regclass('public.mon_device_property_history') IS NULL THEN 'ABSENT' ELSE md5(coalesce((SELECT string_agg(jsonb_build_array(id, property_code)::text, E'\\n' ORDER BY id) FROM mon_device_property_history), '')) END,
        'mon_device_alert_event', CASE WHEN to_regclass('public.mon_device_alert_event') IS NULL THEN 'ABSENT' ELSE md5(coalesce((SELECT string_agg(jsonb_build_array(id, property_code)::text, E'\\n' ORDER BY id) FROM mon_device_alert_event), '')) END
      ),
      'inboundTimestamps', md5(coalesce((SELECT string_agg(jsonb_build_array(id, extract(epoch FROM (created_at AT TIME ZONE 'UTC')), extract(epoch FROM (updated_at AT TIME ZONE 'UTC')))::text, E'\\n' ORDER BY id) FROM wms_inbound), '')
    )) AS value
  )
  SELECT json_build_object(
    'schemaValid', (SELECT mismatches = 0 FROM d) AND (SELECT n = 6 FROM f) AND (SELECT n = 0 FROM i),
    'dataValid', to_regclass('public.acc_ledger') IS NOT NULL AND to_regclass('public.wms_inbound') IS NOT NULL AND (SELECT data_type = 'jsonb' FROM information_schema.columns WHERE table_name='pda_sync_log' AND column_name='payload'),
    'warehouseForeignKeys', (SELECT n FROM f),
    'iotDynamicPropertyCodeForeignKeys', (SELECT n FROM i),
    'rowCounts', json_build_object('acc_ledger',(SELECT count(*) FROM acc_ledger),'wms_stocktake',(SELECT count(*) FROM wms_stocktake),'pda_sync_log',(SELECT count(*) FROM pda_sync_log),'wms_inbound',(SELECT count(*) FROM wms_inbound),'wms_warehouses',(SELECT count(*) FROM wms_warehouses),'store_warehouse_bindings',(SELECT count(*) FROM store_warehouse_bindings),'store_replenishment_requests',(SELECT count(*) FROM store_replenishment_requests),'sal_sales_orders',(SELECT count(*) FROM sal_sales_orders),'sal_delivery_orders',(SELECT count(*) FROM sal_delivery_orders),'sal_return_orders',(SELECT count(*) FROM sal_return_orders)),
    'semanticFingerprints', (SELECT value FROM fp),
    'timestampDelta', (SELECT EXTRACT(EPOCH FROM (updated_at - created_at)) FROM wms_inbound WHERE updated_at < created_at ORDER BY updated_at - created_at LIMIT 1),
    'timestampNegativeCount', (SELECT count(*) FROM wms_inbound WHERE updated_at < created_at),
    'timestampMinDelta', (SELECT min(EXTRACT(EPOCH FROM (updated_at - created_at))) FROM wms_inbound WHERE updated_at < created_at),
    'timestampMaxDelta', (SELECT max(EXTRACT(EPOCH FROM (updated_at - created_at))) FROM wms_inbound WHERE updated_at < created_at)
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

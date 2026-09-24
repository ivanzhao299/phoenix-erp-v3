WITH
req AS (
  SELECT
    count(*)::bigint AS total_rows,
    count(*) FILTER (WHERE req_no IS NULL)::bigint AS null_count,
    count(*) FILTER (WHERE req_no IS NOT NULL AND btrim(req_no) = '')::bigint AS blank_count,
    coalesce(count(*) FILTER (WHERE length(req_no) > 64), 0)::bigint AS over_64_count,
    coalesce(max(length(req_no)), 0)::bigint AS max_length,
    (SELECT count(*)::bigint FROM (SELECT req_no FROM prc_purchase_requests WHERE req_no IS NOT NULL GROUP BY req_no HAVING count(*) > 1) d) AS duplicate_group_count,
    (SELECT coalesce(sum(n - 1), 0)::bigint FROM (SELECT count(*)::bigint AS n FROM prc_purchase_requests WHERE req_no IS NOT NULL GROUP BY req_no HAVING count(*) > 1) d) AS duplicate_excess_row_count,
    (count(*) FILTER (WHERE req_no IS NULL) = 0 AND count(*) FILTER (WHERE btrim(coalesce(req_no, '')) = '') = 0) AS not_null_safe,
    ((SELECT count(*)::bigint FROM (SELECT req_no FROM prc_purchase_requests WHERE req_no IS NOT NULL GROUP BY req_no HAVING count(*) > 1) d) = 0) AS uniqueness_safe,
    (count(*) FILTER (WHERE length(req_no) > 64) = 0) AS length_safe
  FROM prc_purchase_requests
),
req_meta AS (
  SELECT
    coalesce(jsonb_agg(jsonb_build_object('name', c.conname, 'type', c.contype, 'definition', pg_get_constraintdef(c.oid)) ORDER BY c.conname), '[]'::jsonb) AS constraints,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', i.indexname, 'definition', i.indexdef) ORDER BY i.indexname) FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = 'prc_purchase_requests' AND i.indexdef ILIKE '%req_no%'), '[]'::jsonb) AS indexes
  FROM pg_constraint c
  WHERE c.conrelid = 'public.prc_purchase_requests'::regclass
    AND pg_get_constraintdef(c.oid) ILIKE '%req_no%'
),
stocktake AS (
  SELECT
    count(*)::bigint AS total_rows,
    count(*) FILTER (WHERE status IS NULL)::bigint AS null_count,
    coalesce(max(length(status)), 0)::bigint AS max_length,
    count(*) FILTER (WHERE length(status) > 20)::bigint AS over_20_count,
    (SELECT count(*)::bigint FROM (SELECT status FROM wms_stocktake GROUP BY status) d) AS distinct_count,
    coalesce((SELECT jsonb_agg(jsonb_build_object('value', status, 'count', n) ORDER BY status) FROM (SELECT status, count(*)::bigint AS n FROM wms_stocktake GROUP BY status ORDER BY status LIMIT 50) d), '[]'::jsonb) AS status_domain,
    (count(*) FILTER (WHERE length(status) > 20) = 0) AS length_safe
  FROM wms_stocktake
),
inbound AS (
  SELECT count(*)::bigint AS total_rows,
         count(*) FILTER (WHERE created_at IS NULL)::bigint AS null_count,
         min(created_at) AS min_created_at,
         max(created_at) AS max_created_at
  FROM wms_inbound
),
ledger AS (
  SELECT count(*)::bigint AS total_rows,
         count(*) FILTER (WHERE store_code IS NULL)::bigint AS null_count,
         coalesce(max(length(store_code)), 0)::bigint AS max_length,
         true AS widening_safe
  FROM acc_ledger
),
warehouse AS (
  SELECT count(*)::bigint AS total_rows,
         count(*) FILTER (WHERE warehouse_code IS NULL)::bigint AS null_count,
         count(*) FILTER (WHERE warehouse_code IS NOT NULL AND btrim(warehouse_code) = '')::bigint AS blank_count,
         coalesce(max(length(warehouse_code)), 0)::bigint AS max_length,
         (SELECT count(*)::bigint FROM (SELECT warehouse_code FROM wms_warehouses WHERE warehouse_code IS NOT NULL GROUP BY warehouse_code HAVING count(*) > 1) d) AS duplicate_count,
         (SELECT NOT EXISTS (
            SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema = 'public' AND c.column_name = 'warehouse_code'
              AND c.table_name <> 'wms_warehouses'
              AND c.data_type = 'character varying'
              AND c.character_maximum_length IS NOT NULL
              AND c.character_maximum_length < 64
          )) AS dependency_width_compatible,
         true AS widening_safe
  FROM wms_warehouses
),
column_meta AS (
  SELECT jsonb_build_object(
    'type', c.data_type,
    'udt_name', c.udt_name,
    'default', c.column_default,
    'not_null', (c.is_nullable = 'NO')
  ) AS created_at
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'wms_inbound' AND c.column_name = 'created_at'
),
ledger_deps AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'index', 'name', i.indexname, 'definition', i.indexdef) ORDER BY i.indexname), '[]'::jsonb) AS indexes
  FROM pg_indexes i
  WHERE i.schemaname = 'public' AND i.tablename = 'acc_ledger' AND i.indexdef ILIKE '%store_code%'
),
warehouse_deps AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'constraint', con.conname,
    'child_table', child.relname,
    'child_column', child_att.attname,
    'child_type', format_type(child_att.atttypid, child_att.atttypmod),
    'parent_type', format_type(parent_att.atttypid, parent_att.atttypmod)
  ) ORDER BY con.conname), '[]'::jsonb) AS foreign_keys
  FROM pg_constraint con
  JOIN pg_class child ON child.oid = con.conrelid
  JOIN pg_class parent ON parent.oid = con.confrelid
  JOIN pg_attribute child_att ON child_att.attrelid = con.conrelid AND child_att.attnum = con.conkey[1]
  JOIN pg_attribute parent_att ON parent_att.attrelid = con.confrelid AND parent_att.attnum = con.confkey[1]
  WHERE con.contype = 'f' AND con.confrelid = 'public.wms_warehouses'::regclass AND parent_att.attname = 'warehouse_code'
),
warehouse_columns AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('table', c.table_name, 'column', c.column_name, 'type', c.data_type, 'length', c.character_maximum_length) ORDER BY c.table_name, c.column_name), '[]'::jsonb) AS columns
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.column_name = 'warehouse_code'
)
SELECT json_build_object(
  'database_timezone', current_setting('TimeZone'),
  'server_version_num', current_setting('server_version_num'),
  'prc_purchase_requests', (SELECT row_to_json(req) FROM req),
  'prc_purchase_requests_metadata', (SELECT row_to_json(req_meta) FROM req_meta),
  'wms_stocktake', (SELECT row_to_json(stocktake) FROM stocktake),
  'wms_inbound', (SELECT row_to_json(inbound) FROM inbound),
  'wms_inbound_created_at', (SELECT created_at FROM column_meta),
  'acc_ledger', (SELECT row_to_json(ledger) FROM ledger),
  'acc_ledger_store_code_dependencies', (SELECT indexes FROM ledger_deps),
  'wms_warehouses', (SELECT row_to_json(warehouse) FROM warehouse),
  'wms_warehouse_foreign_keys', (SELECT foreign_keys FROM warehouse_deps),
  'wms_warehouse_code_columns', (SELECT columns FROM warehouse_columns),
  'relation_sizes', json_build_object(
    'prc_purchase_requests', json_build_object('estimated_rows', (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.prc_purchase_requests'::regclass), 'bytes', pg_total_relation_size('public.prc_purchase_requests'::regclass)),
    'wms_stocktake', json_build_object('estimated_rows', (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.wms_stocktake'::regclass), 'bytes', pg_total_relation_size('public.wms_stocktake'::regclass)),
    'wms_inbound', json_build_object('estimated_rows', (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.wms_inbound'::regclass), 'bytes', pg_total_relation_size('public.wms_inbound'::regclass)),
    'acc_ledger', json_build_object('estimated_rows', (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.acc_ledger'::regclass), 'bytes', pg_total_relation_size('public.acc_ledger'::regclass)),
    'wms_warehouses', json_build_object('estimated_rows', (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.wms_warehouses'::regclass), 'bytes', pg_total_relation_size('public.wms_warehouses'::regclass))
  )
)::text;

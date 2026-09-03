\echo '--- SALES_ORDER_INVENTORY_LINK_SCHEMA_COLUMNS ---'
SELECT table_name,
       ordinal_position,
       column_name,
       data_type,
       udt_name,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'inv_batches',
    'inv_ledger',
    'sal_sales_orders',
    'sal_order_items',
    'sal_delivery_orders',
    'sal_delivery_order_items',
    'store_master',
    'store_warehouse_bindings',
    'wms_warehouses'
  )
ORDER BY table_name, ordinal_position;

\echo '--- SALES_ORDER_INVENTORY_LINK_SCHEMA_CONSTRAINTS ---'
SELECT tc.table_name,
       tc.constraint_name,
       tc.constraint_type,
       kcu.column_name,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_schema = tc.constraint_schema
 AND kcu.constraint_name = tc.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_schema = tc.constraint_schema
 AND ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'inv_batches',
    'inv_ledger',
    'sal_sales_orders',
    'sal_order_items',
    'sal_delivery_orders',
    'sal_delivery_order_items',
    'store_master',
    'store_warehouse_bindings',
    'wms_warehouses'
  )
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

SELECT 'INVENTORY_DISPLAY_SOURCE_COUNTS' AS section,
       (SELECT COUNT(*) FROM inv_batches)::int AS batches,
       (SELECT COUNT(*) FROM wms_inbound)::int AS inbound,
       (SELECT COUNT(*) FROM wms_outbound)::int AS outbound,
       (SELECT COUNT(*) FROM wms_transfer)::int AS transfers,
       (SELECT COUNT(*) FROM wms_stocktake)::int AS stocktakes,
       (SELECT COUNT(*) FROM inv_ledger)::int AS ledger_rows;

SELECT 'INVENTORY_DISPLAY_OPERATOR_MAPPING' AS section,
       COUNT(*) FILTER (WHERE x.operator IS NOT NULL)::int AS operator_rows,
       COUNT(*) FILTER (WHERE u.username IS NOT NULL)::int AS username_hits,
       COUNT(*) FILTER (WHERE u.username IS NOT NULL AND NULLIF(u.real_name, '') IS NOT NULL)::int AS real_name_hits
  FROM (
    SELECT operator FROM wms_inbound UNION ALL SELECT operator FROM wms_outbound
    UNION ALL SELECT operator FROM wms_transfer UNION ALL SELECT operator FROM wms_stocktake
    UNION ALL SELECT operator FROM inv_ledger
  ) x
  LEFT JOIN sys_user u ON u.username=x.operator;

SELECT 'WMS_TRANSFER_STATUS_DISTRIBUTION' AS section,
       COALESCE(status, '<NULL>') AS status,
       COUNT(*)::int AS row_count
  FROM wms_transfer
 GROUP BY status
 ORDER BY status NULLS FIRST;

SELECT 'INVENTORY_DISPLAY_ERROR_WINDOW_60M' AS section, COUNT(*)::int AS error_count
  FROM sys_error_logs
 WHERE created_at >= NOW() - INTERVAL '60 minutes'
   AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '') IN (
     '/api/inventory/batches', '/api/crud/wms_inbound', '/api/crud/wms_outbound',
     '/api/crud/wms_transfer', '/api/crud/wms_stocktake', '/api/crud/inv_ledger',
     '/api/crud/wms_warehouses'
   );

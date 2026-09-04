SELECT 'purchase_requests' AS audit,
       COUNT(*) AS total_rows,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(company_code), '') IS NOT NULL) AS company_code_rows,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(requester_id::text), '') IS NOT NULL) AS requester_rows
  FROM prc2_purchase_requests;

SELECT 'store_inventory_names' AS audit,
       COUNT(*) AS positive_batches,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(s.sku_name), '') IS NOT NULL) AS sku_named_rows,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(w.warehouse_name), '') IS NOT NULL) AS warehouse_named_rows,
       COUNT(*) FILTER (WHERE b.location_code IS NULL OR NULLIF(BTRIM(l.location_name), '') IS NOT NULL) AS location_named_or_unset_rows
  FROM inv_batches b
  LEFT JOIN product_skus s ON s.sku_code=b.sku_code
  LEFT JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code
  LEFT JOIN wms_locations l ON l.warehouse_code=b.warehouse_code AND l.location_code=b.location_code
 WHERE COALESCE(b.qty, 0)>0;

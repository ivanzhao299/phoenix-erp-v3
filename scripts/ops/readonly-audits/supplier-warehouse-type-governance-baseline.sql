-- Stage 1 production baseline for supplier / warehouse type-domain governance.
-- Executed only by run-production-readonly-audit.sh, which enforces both
-- connection-level and transaction-level read-only mode and rolls back.

SELECT 'BASELINE_TOTALS' AS section,
       (SELECT COUNT(*)::int FROM prc2_suppliers) AS supplier_total,
       (SELECT COUNT(*)::int FROM wms_warehouses) AS warehouse_total;

SELECT 'SUPPLIER_TYPE_DISTRIBUTION' AS section,
       COALESCE(supplier_type, '<NULL>') AS current_value,
       COUNT(*)::int AS row_count
  FROM prc2_suppliers
 GROUP BY supplier_type
 ORDER BY current_value;

SELECT 'SUPPLIER_MANIFEST' AS section,
       supplier_code,
       supplier_name,
       COALESCE(supplier_type, '<NULL>') AS current_supplier_type,
       CASE
         WHEN supplier_type IN ('CHICK', 'FEED', 'OTHER', 'PACKAGING',
                                'RAW_MATERIAL', 'VACCINE', 'VETERINARY')
           THEN supplier_type
         WHEN supplier_type IN ('LOCAL', 'OVERSEAS') THEN ''
         ELSE ''
       END AS proposed_supply_category,
       CASE
         WHEN supplier_type IN ('LOCAL', 'OVERSEAS') THEN supplier_type
         ELSE 'UNSPECIFIED'
       END AS proposed_sourcing_type,
       status,
       is_active,
       shared_scope,
       owner_company_code,
       owner_project_code,
       (SELECT COUNT(*)::int
          FROM prc2_purchase_orders po
         WHERE po.supplier_code = s.supplier_code) AS purchase_order_refs,
       (SELECT COUNT(*)::int
          FROM prc2_receipts r
          JOIN prc2_purchase_orders po ON po.id = r.po_id
         WHERE po.supplier_code = s.supplier_code) AS receipt_refs,
       (SELECT COUNT(*)::int
          FROM prc2_ap_ledger ap
         WHERE ap.supplier_code = s.supplier_code) AS ap_refs
  FROM prc2_suppliers s
 ORDER BY supplier_code;

SELECT 'S4_APPROVAL_REQUIRED' AS section,
       supplier_code,
       supplier_name,
       supplier_type AS current_supplier_type,
       ''::text AS proposed_supply_category,
       supplier_type AS proposed_sourcing_type
  FROM prc2_suppliers
 WHERE supplier_type IN ('LOCAL', 'OVERSEAS')
 ORDER BY supplier_type, supplier_code;

SELECT 'WAREHOUSE_TYPE_DISTRIBUTION' AS section,
       COALESCE(type, '<NULL>') AS current_value,
       COUNT(*)::int AS row_count
  FROM wms_warehouses
 GROUP BY type
 ORDER BY current_value;

SELECT 'W4_APPROVAL_REQUIRED' AS section,
       w.warehouse_code,
       COALESCE(NULLIF(BTRIM(w.warehouse_name_zh), ''), w.warehouse_name) AS warehouse_name,
       w.company_code,
       w.site_code,
       w.domain,
       COALESCE(w.type, '<NULL>') AS current_type,
       CASE
         WHEN w.domain IN ('FINANCE_MAPPING', 'TEST') THEN 'GENERAL'
         WHEN w.type = 'EGG_FARM' THEN 'FACTORY'
         WHEN w.type = 'EGG_SALES' THEN 'DISTRIBUTION'
         WHEN w.type = 'FINISHED' THEN 'DISTRIBUTION'
         WHEN w.type = 'PURCHASE_RECV' THEN 'TRANSIT'
         ELSE 'GENERAL'
       END AS facility_candidate,
       CASE
         WHEN w.domain = 'FINANCE_MAPPING' THEN '财务映射身份；设施保守候选 GENERAL，不改变 domain 或操作面'
         WHEN w.domain = 'TEST' THEN '测试身份；设施保守候选 GENERAL，保持不可操作'
         WHEN w.type = 'EGG_FARM' THEN '养殖生产用途；候选 FACTORY，仍需逐行确认'
         WHEN w.type = 'EGG_SALES' THEN '销售库存用途；保守候选 DISTRIBUTION，若为门店自有仓请改 STORE'
         WHEN w.type = 'FINISHED' THEN '成品用途；候选 DISTRIBUTION，若服务包装生产请改 FACTORY'
         WHEN w.type = 'PURCHASE_RECV' THEN '采购到货用途；候选 TRANSIT，仅确属中转节点时批准'
         WHEN w.type IN ('FEED', 'RAW_MATERIAL', 'MEDICINE') THEN '生产物资用途；保守候选 GENERAL，服务生产场站时可改 FACTORY'
         WHEN w.type = 'COLD_STORAGE' THEN '冷链是 capability；设施保守候选 GENERAL，另标 COLD_CHAIN'
         WHEN w.type = 'GENERAL' THEN '旧用途信息不足；保守候选 GENERAL，需结合实际职责确认'
         WHEN w.type IS NULL THEN '旧用途为空；保守候选 GENERAL，需结合 domain 与实际职责确认'
         ELSE '未知旧值；不得自动映射，需人工确认'
       END AS reason,
       w.status,
       (SELECT COUNT(*)::int FROM wms_zones z WHERE z.warehouse_code = w.warehouse_code) AS zone_refs,
       (SELECT COUNT(*)::int FROM wms_locations l WHERE l.warehouse_code = w.warehouse_code) AS location_refs,
       (SELECT COUNT(*)::int FROM inv_batches b WHERE b.warehouse_code = w.warehouse_code) AS batch_refs,
       (SELECT COUNT(*)::int FROM inv_ledger il WHERE il.warehouse_code = w.warehouse_code) AS ledger_refs,
       (SELECT COUNT(*)::int FROM prc2_receipts r WHERE r.warehouse_code = w.warehouse_code) AS receipt_refs
  FROM wms_warehouses w
 ORDER BY w.warehouse_code;

DO $$
DECLARE
  supplier_total integer;
  warehouse_total integer;
  supplier_s4_total integer;
  warehouse_cold_total integer;
  warehouse_null_total integer;
  supplier_duplicate_codes integer;
  warehouse_duplicate_codes integer;
BEGIN
  SELECT COUNT(*) INTO supplier_total FROM prc2_suppliers;
  SELECT COUNT(*) INTO warehouse_total FROM wms_warehouses;
  SELECT COUNT(*) INTO supplier_s4_total FROM prc2_suppliers WHERE supplier_type IN ('LOCAL', 'OVERSEAS');
  SELECT COUNT(*) INTO warehouse_cold_total FROM wms_warehouses WHERE type = 'COLD_STORAGE';
  SELECT COUNT(*) INTO warehouse_null_total FROM wms_warehouses WHERE type IS NULL;
  SELECT COUNT(*) INTO supplier_duplicate_codes
    FROM (SELECT supplier_code FROM prc2_suppliers GROUP BY supplier_code HAVING COUNT(*) > 1) d;
  SELECT COUNT(*) INTO warehouse_duplicate_codes
    FROM (SELECT warehouse_code FROM wms_warehouses GROUP BY warehouse_code HAVING COUNT(*) > 1) d;

  IF supplier_total <> 34 OR warehouse_total <> 31 OR supplier_s4_total <> 5
     OR warehouse_cold_total <> 1 OR warehouse_null_total <> 1
     OR supplier_duplicate_codes <> 0 OR warehouse_duplicate_codes <> 0 THEN
    RAISE EXCEPTION
      'baseline drift: suppliers=% warehouses=% S4=% cold=% null_type=% supplier_dupes=% warehouse_dupes=%',
      supplier_total, warehouse_total, supplier_s4_total, warehouse_cold_total,
      warehouse_null_total, supplier_duplicate_codes, warehouse_duplicate_codes;
  END IF;
END $$;

SELECT 'BASELINE_ASSERTIONS' AS section,
       'PASS' AS result,
       34 AS supplier_total,
       31 AS warehouse_total,
       5 AS s4_total,
       1 AS cold_storage_total,
       1 AS null_type_total,
       0 AS duplicate_code_total;

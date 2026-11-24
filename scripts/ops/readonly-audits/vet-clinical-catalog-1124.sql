-- Clinical catalog provenance and document usage. Aggregates exclude patient, operator and customer information.
WITH candidates AS (
  SELECT medication_code,medication_name,status,product_type,unit_code,specification,store_code,created_at::date AS created_on
    FROM brd_medications
   WHERE medication_code IN ('MED-001','MED-002','MED-003','MED-004','MED-005','MED-006','MED-007','MED-008','LPH-MED-045')
)
SELECT 'VET_CLINICAL_CATALOG' AS section,c.*,
       (SELECT count(*) FROM sys_dict d WHERE d.dict_code=c.medication_code) AS dictionary_code_matches,
       (SELECT count(*) FROM brd_vaccinations v WHERE c.medication_code IN (v.vaccine_code,v.vaccine)) AS vaccination_records,
       (SELECT count(*) FROM brd_medication_records r WHERE r.medication_code=c.medication_code) AS medication_records,
       (SELECT count(*) FROM inv_batches b WHERE c.medication_code IN (b.product_code,b.material_code)) AS inventory_batches,
       (SELECT count(*) FROM brd_vaccination_issue_lines i WHERE i.vaccine_code=c.medication_code) AS vaccination_allocations,
       (SELECT count(*) FROM brd_medication_issue_lines i WHERE to_jsonb(i)->>'medication_code'=c.medication_code) AS medication_allocations
FROM candidates c ORDER BY c.medication_code;

SELECT 'VET_ACTUAL_MATERIALS' AS section,material_code,material_name,spec,unit,status,
       (SELECT count(*) FROM inv_batches b WHERE b.material_code=m.material_code AND b.item_type='MATERIAL') AS inventory_batches
FROM mst_materials m WHERE material_type='VET_DRUG' ORDER BY material_code;

SELECT 'VET_LEGACY_STOCK' AS section,
       CASE WHEN m.store_code='ALL' THEN 'GLOBAL' ELSE 'SITE' END AS clinical_origin,
       w.company_code,w.site_code,b.warehouse_code,b.unit,count(*) AS positive_batches,
       count(DISTINCT m.medication_code) AS distinct_items,sum(b.qty) AS quantity
FROM brd_medications m JOIN inv_batches b ON b.product_code=m.medication_code
JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code
WHERE b.material_code IS NULL AND b.sku_code IS NULL AND b.item_type IS NULL AND b.qty>0
GROUP BY 2,w.company_code,w.site_code,b.warehouse_code,b.unit ORDER BY 2,3,4,5,6;

SELECT 'VET_LEGACY_LOT' AS section,b.id,b.batch_no,m.medication_code,m.medication_name,
       b.qty,b.qty_available,b.unit AS lot_unit,m.dosage AS catalog_dosage,b.status,b.warehouse_code
FROM inv_batches b JOIN brd_medications m ON m.medication_code=b.product_code
JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code
WHERE b.material_code IS NULL AND b.sku_code IS NULL AND b.item_type IS NULL AND b.qty>0
ORDER BY b.warehouse_code,m.medication_code,b.id;

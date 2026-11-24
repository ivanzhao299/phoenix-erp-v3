-- Read the active business-date configuration and the two master records reported in #572/#573.
WITH expected(company_code, house_code, product_mode, variety_code) AS (
  SELECT 'COMP-LAO-AGRI', 'HOUSE_MS_0' || n, 'STANDARD', NULL::text FROM generate_series(1,6) AS n
  UNION ALL
  SELECT 'COMP-LAO-XINGCHI', 'HOUSE_DP_0' || n, 'VARIANT',
         CASE WHEN n IN (1,3,5) THEN 'EGG_PINK' ELSE 'EGG_RED' END FROM generate_series(1,5) AS n
), checked AS (
  SELECT e.house_code, e.product_mode, e.variety_code, count(p.profile_code) AS active_profiles,
         count(p.profile_code) FILTER (WHERE p.product_mode=e.product_mode
           AND p.variety_code IS NOT DISTINCT FROM e.variety_code) AS matching_profiles
  FROM expected e LEFT JOIN md_egg_source_profiles p ON p.company_code=e.company_code AND p.house_code=e.house_code
    AND p.status='ACTIVE' AND p.effective_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Vientiane')::date
    AND (p.expire_date IS NULL OR p.expire_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Vientiane')::date)
  GROUP BY e.house_code,e.product_mode,e.variety_code
)
SELECT 'VET_EGG_SOURCE_COVERAGE' AS section, count(*) AS expected_houses,
       count(*) FILTER (WHERE active_profiles=1 AND matching_profiles=1) AS confirmed_houses,
       array_agg(house_code ORDER BY house_code) FILTER (WHERE active_profiles<>1 OR matching_profiles<>1) AS review_houses
FROM checked;

SELECT 'VET_ACTUAL_ITEM' AS section, material_code,material_name,material_type,unit,spec,status
FROM mst_materials WHERE material_code='MAT-VET-NDV';

SELECT 'VET_SCHEMA_COLUMNS' AS section, table_name, column_name, data_type
FROM information_schema.columns WHERE table_schema='public' AND
  ((table_name='inv_ledger' AND column_name IN ('house_code','medication_code','material_code')) OR
   (table_name='wms_inbound' AND column_name IN ('item_name','item_type','material_code','remark')) OR
   (table_name='brd_vaccinations' AND column_name IN ('vaccine_code','material_code','planned_issue_lines')) OR
   (table_name='brd_medication_records' AND column_name IN ('actual_heads','material_code','medication_code')))
ORDER BY table_name,column_name;

SELECT 'VET_REPORTED_BATCH' AS section,b.batch_no,b.item_type,b.material_code,b.status,
       b.qty_available,b.unit,b.expire_date,b.warehouse_code,w.company_code,w.site_code
FROM inv_batches b LEFT JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code
WHERE b.batch_no='IBN-20261117-UCPTON';

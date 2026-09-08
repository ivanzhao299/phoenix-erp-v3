\echo '=== recent production egg batch facts (sanitized) ==='
SELECT b.batch_no,
       b.company_code,
       b.warehouse_code,
       b.product_code,
       b.quality_grade,
       b.grade_code_std,
       b.sku_code,
       COALESCE(s.sku_name, p.product_name_zh, p.product_name_en, b.product_code) AS display_name,
       b.qty,
       b.qty_available,
       b.status,
       b.egg_date,
       b.expire_date,
       b.source_type,
       (s.sku_code IS NOT NULL) AS sku_mapping_exists,
       (p.product_code IS NOT NULL) AS product_mapping_exists,
       (b.product_code = 'EGG') AS matches_legacy_list_filter
  FROM inv_batches b
  LEFT JOIN product_skus s ON s.sku_code = b.sku_code
  LEFT JOIN mst_products p ON p.product_code = b.product_code
 WHERE b.source_type = 'TEMP_PRODUCTION'
 ORDER BY b.created_at DESC
 LIMIT 20;

\echo '=== current KPI scope versus current batch-list scope ==='
WITH kpi_scope AS (
  SELECT batch_no, qty_available
    FROM inv_batches
   WHERE status = 'AVAILABLE'
     AND qty_available > 0
),
legacy_list_scope AS (
  SELECT batch_no, qty_available
    FROM inv_batches
   WHERE status = 'AVAILABLE'
     AND qty_available > 0
     AND product_code = 'EGG'
     AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
)
SELECT (SELECT COUNT(*) FROM kpi_scope) AS kpi_active_batches,
       (SELECT COALESCE(SUM(qty_available), 0) FROM kpi_scope) AS kpi_total_available,
       (SELECT COUNT(*) FROM legacy_list_scope) AS legacy_list_batches,
       (SELECT COALESCE(SUM(qty_available), 0) FROM legacy_list_scope) AS legacy_list_total_available,
       (SELECT COUNT(*) FROM kpi_scope k LEFT JOIN legacy_list_scope l USING (batch_no)
         WHERE l.batch_no IS NULL) AS hidden_from_legacy_list;

\echo '=== exact exclusion reason for KPI-visible production batches ==='
SELECT CASE
         WHEN b.product_code <> 'EGG' THEN 'PRODUCT_CODE_FILTER'
         WHEN b.expire_date < CURRENT_DATE THEN 'EXPIRED_DATE_FILTER'
         ELSE 'OTHER'
       END AS exclusion_reason,
       COUNT(*) AS batch_count,
       COALESCE(SUM(b.qty_available), 0) AS qty_available
  FROM inv_batches b
 WHERE b.source_type = 'TEMP_PRODUCTION'
   AND b.status = 'AVAILABLE'
   AND b.qty_available > 0
   AND NOT (
     b.product_code = 'EGG'
     AND (b.expire_date IS NULL OR b.expire_date >= CURRENT_DATE)
   )
 GROUP BY 1
 ORDER BY 1;

\echo '=== LEFT JOIN preservation assertion ==='
WITH base AS (
  SELECT b.batch_no
    FROM inv_batches b
   WHERE b.source_type = 'TEMP_PRODUCTION'
     AND b.status = 'AVAILABLE'
     AND b.qty_available > 0
),
decorated AS (
  SELECT b.batch_no
    FROM inv_batches b
    LEFT JOIN product_skus s ON s.sku_code = b.sku_code
    LEFT JOIN mst_products p ON p.product_code = b.product_code
   WHERE b.source_type = 'TEMP_PRODUCTION'
     AND b.status = 'AVAILABLE'
     AND b.qty_available > 0
)
SELECT (SELECT COUNT(*) FROM base) AS base_count,
       (SELECT COUNT(*) FROM decorated) AS decorated_count,
       (SELECT COUNT(*) FROM base b LEFT JOIN decorated d USING (batch_no)
         WHERE d.batch_no IS NULL) AS lost_by_left_joins;

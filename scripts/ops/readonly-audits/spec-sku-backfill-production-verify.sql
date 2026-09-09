\pset pager off
\pset null '[NULL]'
BEGIN TRANSACTION READ ONLY;

DO $assert$
BEGIN
  IF (SELECT count(*) FROM packaging_specs
       WHERE spec_code = 'PKG_PACK_SPEC_3' AND spec_name = '精品礼盒(30枚/盒)'
         AND qty_per_unit = 30 AND status = 'ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'ACTIVE 30-egg packaging spec verification failed';
  END IF;
  IF (SELECT count(*) FROM product_skus
       WHERE status = 'ACTIVE' AND spec_code = 'PKG_PACK_SPEC_3'
         AND (product_code, grade_code) IN (
           ('PRD-EGG-GRADE_1', 'GRADE_1'), ('PRD-EGG-GRADE_2', 'GRADE_2'))) <> 2 THEN
    RAISE EXCEPTION 'two ACTIVE authoritative SKUs verification failed';
  END IF;
  IF (SELECT count(*) FROM sys_dict
       WHERE dict_type = 'PKG_PACK_SPEC' AND dict_code = 'PKG_PACK_SPEC_3'
         AND status = 'ACTIVE' AND name = '精品礼盒(30枚/盒)'
         AND dict_label_zh = '精品礼盒(30枚/盒)'
         AND dict_label_en LIKE '%30%' AND dict_label_lo LIKE '%30%') <> 1 THEN
    RAISE EXCEPTION '30-egg multilingual dictionary verification failed';
  END IF;
END
$assert$;

SELECT ps.spec_code, ps.spec_name, ps.spec_name_en, ps.spec_name_lo, ps.qty_per_unit, ps.status,
       s.sku_code, s.product_code, s.grade_code, s.sku_name, s.status AS sku_status
  FROM packaging_specs ps
  JOIN product_skus s ON s.spec_code = ps.spec_code
 WHERE ps.spec_code = 'PKG_PACK_SPEC_3'
 ORDER BY s.grade_code;
SELECT dict_code, name, dict_label_zh, dict_label_en, dict_label_lo, config_json, status
  FROM sys_dict WHERE dict_type = 'PKG_PACK_SPEC' AND dict_code = 'PKG_PACK_SPEC_3';

ROLLBACK;

\pset pager off
\pset null '[NULL]'
BEGIN TRANSACTION READ ONLY;

DO $assert$
BEGIN
  IF (SELECT count(*) FROM packaging_specs WHERE spec_code = 'PKG_PACK_SPEC_3') NOT IN (0, 1) THEN
    RAISE EXCEPTION 'packaging spec code is not unique';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code = 'PRD-EGG-GRADE_1' AND grade_code = 'GRADE_1' AND spec_code = 'PKG_PACK_SPEC_3') NOT IN (0, 1) THEN
    RAISE EXCEPTION 'GRADE_1 SKU tuple is not unique';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code = 'PRD-EGG-GRADE_2' AND grade_code = 'GRADE_2' AND spec_code = 'PKG_PACK_SPEC_3') NOT IN (0, 1) THEN
    RAISE EXCEPTION 'GRADE_2 SKU tuple is not unique';
  END IF;
  IF (SELECT count(*) FROM sys_dict WHERE dict_type = 'PKG_PACK_SPEC' AND dict_code = 'PKG_PACK_SPEC_3') <> 1 THEN
    RAISE EXCEPTION 'PKG_PACK_SPEC_3 dictionary row must exist exactly once';
  END IF;
END
$assert$;

SELECT 'SPEC' AS section, spec_code, spec_name, spec_name_en, spec_name_lo,
       qty_per_unit, base_unit, display_unit, status
  FROM packaging_specs WHERE spec_code = 'PKG_PACK_SPEC_3';
SELECT 'SKU' AS section, sku_code, product_code, grade_code, spec_code, sku_name, status
  FROM product_skus
 WHERE (product_code, grade_code, spec_code) IN (
   ('PRD-EGG-GRADE_1', 'GRADE_1', 'PKG_PACK_SPEC_3'),
   ('PRD-EGG-GRADE_2', 'GRADE_2', 'PKG_PACK_SPEC_3'))
 ORDER BY grade_code;
SELECT 'DICT' AS section, id, dict_code, name, dict_label_zh, dict_label_en,
       dict_label_lo, config_json, status
  FROM sys_dict WHERE dict_type = 'PKG_PACK_SPEC' AND dict_code = 'PKG_PACK_SPEC_3';

ROLLBACK;

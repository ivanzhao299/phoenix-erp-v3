-- Synthetic analogue of the retained grade 4/5 scope, for a newly created DB only.
-- Old inventory and its ledger exist before the candidate migration, with all guards enabled.
BEGIN;
INSERT INTO inv_batches (batch_no, company_code, warehouse_code, product_code, sku_code,
    grade_code_std, spec_code, unit, qty, qty_available, status, source_type, source_no,
    egg_date, collection_batch_ref)
SELECT 'ASSURANCE-' || grade, 'FIXTURE-C', 'FIXTURE-W', 'PRD-EGG-RAW', 'SKU-' || grade,
    grade, 'LOOSE', '枚', 30, 30, 'AVAILABLE', 'TEMP_PRODUCTION', 'ASSURANCE-' || grade,
    DATE '2026-11-01', 'HOUSE-FIXTURE-H'
FROM (VALUES ('GRADE_4'), ('GRADE_5')) grades(grade);
INSERT INTO inv_ledger (batch_no, company_code, warehouse_code, sku_code, quality_grade,
    qty_change, change_type, ref_no)
SELECT batch_no, company_code, warehouse_code, sku_code, grade_code_std, qty, 'FARM_IN', source_no
FROM inv_batches WHERE batch_no IN ('ASSURANCE-GRADE_4', 'ASSURANCE-GRADE_5');
COMMIT;

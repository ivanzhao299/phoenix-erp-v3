\pset pager off
\pset null '[NULL]'
BEGIN TRANSACTION READ ONLY;

CREATE TEMP TABLE approved_batches (
  batch_no text PRIMARY KEY, packaging_ref text NOT NULL, product_code text NOT NULL,
  grade_code text NOT NULL, qty numeric NOT NULL, qty_available numeric NOT NULL,
  company_code text NOT NULL, warehouse_code text, location_code text
) ON COMMIT DROP;
INSERT INTO approved_batches VALUES
 ('EGG-20260725-00001','PKG-20260725-089829','PRD-EGG-GRADE_1','GRADE_1',120,0,'COMP-LAO-AGRI',NULL,NULL),
 ('EGG-20260725-00002','PKG-20260725-089829','PRD-EGG-GRADE_2','GRADE_2',60,0,'COMP-LAO-AGRI',NULL,NULL),
 ('EGG-20260817-00001','PKG-20260817-418565','PRD-EGG-GRADE_1','GRADE_1',300,300,'ALL',NULL,NULL),
 ('EGG-20260909-00001','PKG-20260909-206420','PRD-EGG-GRADE_1','GRADE_1',300,300,'COMP-LAO-AGRI','LPH_MS_EGG_FARM','CS-KW-MS01');

DO $assert$
BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN approved_batches a USING (batch_no)
       WHERE b.source_type = 'PACKAGING' AND b.source_no = a.packaging_ref
         AND b.packaging_batch_ref = a.packaging_ref AND b.product_code = a.product_code
         AND b.quality_grade = a.grade_code AND b.grade_code_std = a.grade_code
         AND b.qty = a.qty AND b.qty_available = a.qty_available
         AND b.company_code = a.company_code
         AND b.warehouse_code IS NOT DISTINCT FROM a.warehouse_code
         AND b.location_code IS NOT DISTINCT FROM a.location_code
         AND b.spec_code IS NULL AND b.sku_code IS NULL) <> 4 THEN
    RAISE EXCEPTION 'approved four-batch manifest drifted';
  END IF;
  IF (SELECT count(*) FROM packaging_specs WHERE spec_code='PKG_PACK_SPEC_3' AND status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'target packaging spec is not uniquely ACTIVE';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE spec_code='PKG_PACK_SPEC_3' AND status='ACTIVE'
       AND (product_code,grade_code) IN (('PRD-EGG-GRADE_1','GRADE_1'),('PRD-EGG-GRADE_2','GRADE_2'))) <> 2 THEN
    RAISE EXCEPTION 'target SKU tuples are not exactly two ACTIVE rows';
  END IF;
  IF (SELECT count(*) FROM inv_ledger l JOIN approved_batches a USING (batch_no) WHERE l.change_type='FIFO_OUT') <> 0 THEN
    RAISE EXCEPTION 'FIFO_OUT appeared on approved batches';
  END IF;
  IF (SELECT count(*) FROM sal_order_item_batch_allocation_actions aa
       JOIN inv_ledger l ON l.id=aa.ledger_id JOIN approved_batches a USING (batch_no)) <> 0 THEN
    RAISE EXCEPTION 'allocation action appeared on approved batches';
  END IF;
  IF (SELECT count(*) FROM approved_batches a
       JOIN pkg_packing_records p ON p.code=a.packaging_ref
       JOIN LATERAL jsonb_array_elements(COALESCE(p.batches_json,'[]'::jsonb)) i ON true
       WHERE i->>'grade'=a.grade_code AND i->>'specId'='PKG_PACK_SPEC_3'
         AND i->>'spec'='精品礼盒(30枚/盒)' AND (i->>'eggs')::numeric=a.qty) <> 4 THEN
    RAISE EXCEPTION 'immutable packing source evidence drifted';
  END IF;
END
$assert$;

SELECT b.batch_no,b.source_type,b.source_no,b.packaging_batch_ref,b.product_code,b.grade_code_std,
       b.qty,b.qty_available,b.company_code,b.warehouse_code,b.location_code,b.spec_code,b.sku_code
  FROM inv_batches b JOIN approved_batches a USING(batch_no) ORDER BY b.batch_no;
ROLLBACK;

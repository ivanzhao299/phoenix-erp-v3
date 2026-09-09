\pset pager off
\pset null '[NULL]'
BEGIN TRANSACTION READ ONLY;

DO $assert$
BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN (VALUES
       ('EGG-20260725-00001','PKG-20260725-089829','PRD-EGG-GRADE_1','GRADE_1',120::numeric,0::numeric,'COMP-LAO-AGRI',NULL::text,NULL::text),
       ('EGG-20260725-00002','PKG-20260725-089829','PRD-EGG-GRADE_2','GRADE_2',60::numeric,0::numeric,'COMP-LAO-AGRI',NULL::text,NULL::text),
       ('EGG-20260817-00001','PKG-20260817-418565','PRD-EGG-GRADE_1','GRADE_1',300::numeric,300::numeric,'ALL',NULL::text,NULL::text),
       ('EGG-20260909-00001','PKG-20260909-206420','PRD-EGG-GRADE_1','GRADE_1',300::numeric,300::numeric,'COMP-LAO-AGRI','LPH_MS_EGG_FARM','CS-KW-MS01')
       ) AS a(batch_no,packaging_ref,product_code,grade_code,qty,qty_available,company_code,warehouse_code,location_code) USING (batch_no)
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
  IF (SELECT count(*) FROM inv_ledger l JOIN (VALUES
       ('EGG-20260725-00001'),('EGG-20260725-00002'),('EGG-20260817-00001'),('EGG-20260909-00001')
       ) AS a(batch_no) USING (batch_no) WHERE l.change_type='FIFO_OUT') <> 0 THEN
    RAISE EXCEPTION 'FIFO_OUT appeared on approved batches';
  END IF;
  IF (SELECT count(*) FROM sal_order_item_batch_allocation_actions aa
       JOIN inv_ledger l ON l.id=aa.ledger_id JOIN (VALUES
       ('EGG-20260725-00001'),('EGG-20260725-00002'),('EGG-20260817-00001'),('EGG-20260909-00001')
       ) AS a(batch_no) USING (batch_no)) <> 0 THEN
    RAISE EXCEPTION 'allocation action appeared on approved batches';
  END IF;
  IF (SELECT count(*) FROM (VALUES
       ('EGG-20260725-00001','PKG-20260725-089829','GRADE_1',120::numeric),
       ('EGG-20260725-00002','PKG-20260725-089829','GRADE_2',60::numeric),
       ('EGG-20260817-00001','PKG-20260817-418565','GRADE_1',300::numeric),
       ('EGG-20260909-00001','PKG-20260909-206420','GRADE_1',300::numeric)
       ) AS a(batch_no,packaging_ref,grade_code,qty)
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
  FROM inv_batches b WHERE b.batch_no IN
       ('EGG-20260725-00001','EGG-20260725-00002','EGG-20260817-00001','EGG-20260909-00001')
 ORDER BY b.batch_no;
ROLLBACK;

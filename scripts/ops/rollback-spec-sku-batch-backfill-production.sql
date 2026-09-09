\pset pager off
BEGIN;
CREATE TEMP TABLE approved_rollback(batch_no text PRIMARY KEY, product_code text NOT NULL, grade_code text NOT NULL) ON COMMIT DROP;
INSERT INTO approved_rollback VALUES
 ('EGG-20260725-00001','PRD-EGG-GRADE_1','GRADE_1'),
 ('EGG-20260725-00002','PRD-EGG-GRADE_2','GRADE_2'),
 ('EGG-20260817-00001','PRD-EGG-GRADE_1','GRADE_1'),
 ('EGG-20260909-00001','PRD-EGG-GRADE_1','GRADE_1');
UPDATE inv_batches b SET spec_code=NULL,sku_code=NULL
  FROM approved_rollback r JOIN product_skus s
    ON s.product_code=r.product_code AND s.grade_code=r.grade_code
   AND s.spec_code='PKG_PACK_SPEC_3' AND s.status='ACTIVE'
 WHERE b.batch_no=r.batch_no AND b.source_type='PACKAGING'
   AND b.spec_code='PKG_PACK_SPEC_3' AND b.sku_code=s.sku_code;
DO $assert$ BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN approved_rollback r USING(batch_no)
      WHERE b.spec_code IS NULL AND b.sku_code IS NULL) <> 4 THEN
    RAISE EXCEPTION 'guarded rollback did not restore exactly four rows';
  END IF;
END $assert$;
COMMIT;

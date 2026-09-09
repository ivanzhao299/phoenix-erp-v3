\pset pager off
\pset null '[NULL]'
BEGIN;

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

SELECT b.batch_no FROM inv_batches b JOIN approved_batches a USING(batch_no)
 WHERE b.source_type='PACKAGING' AND b.source_no=a.packaging_ref AND b.packaging_batch_ref=a.packaging_ref
   AND b.product_code=a.product_code AND b.quality_grade=a.grade_code AND b.grade_code_std=a.grade_code
   AND b.qty=a.qty AND b.qty_available=a.qty_available AND b.company_code=a.company_code
   AND b.warehouse_code IS NOT DISTINCT FROM a.warehouse_code
   AND b.location_code IS NOT DISTINCT FROM a.location_code
   AND b.spec_code IS NULL AND b.sku_code IS NULL
 FOR UPDATE OF b;
CREATE TEMP TABLE locked_before ON COMMIT DROP AS
SELECT b.* FROM inv_batches b JOIN approved_batches a USING(batch_no)
 WHERE b.source_type='PACKAGING' AND b.source_no=a.packaging_ref AND b.packaging_batch_ref=a.packaging_ref
   AND b.product_code=a.product_code AND b.quality_grade=a.grade_code AND b.grade_code_std=a.grade_code
   AND b.qty=a.qty AND b.qty_available=a.qty_available AND b.company_code=a.company_code
   AND b.warehouse_code IS NOT DISTINCT FROM a.warehouse_code
   AND b.location_code IS NOT DISTINCT FROM a.location_code
   AND b.spec_code IS NULL AND b.sku_code IS NULL;

DO $assert$
BEGIN
  IF (SELECT count(*) FROM locked_before) <> 4 THEN RAISE EXCEPTION 'locked manifest count is not four'; END IF;
  IF (SELECT count(*) FROM packaging_specs WHERE spec_code='PKG_PACK_SPEC_3' AND status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'target spec not uniquely ACTIVE';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE spec_code='PKG_PACK_SPEC_3' AND status='ACTIVE'
       AND (product_code,grade_code) IN (('PRD-EGG-GRADE_1','GRADE_1'),('PRD-EGG-GRADE_2','GRADE_2'))) <> 2 THEN
    RAISE EXCEPTION 'target SKUs not uniquely ACTIVE';
  END IF;
  IF (SELECT count(*) FROM inv_ledger l JOIN approved_batches a USING(batch_no) WHERE l.change_type='FIFO_OUT') <> 0 THEN
    RAISE EXCEPTION 'FIFO_OUT appeared; stop';
  END IF;
  IF (SELECT count(*) FROM sal_order_item_batch_allocation_actions aa JOIN inv_ledger l ON l.id=aa.ledger_id
       JOIN approved_batches a USING(batch_no)) <> 0 THEN RAISE EXCEPTION 'allocation action appeared; stop'; END IF;
  IF (SELECT count(*) FROM approved_batches a
       JOIN pkg_packing_records p ON p.code=a.packaging_ref
       JOIN LATERAL jsonb_array_elements(COALESCE(p.batches_json,'[]'::jsonb)) i ON true
       WHERE i->>'grade'=a.grade_code AND i->>'specId'='PKG_PACK_SPEC_3'
         AND i->>'spec'='精品礼盒(30枚/盒)' AND (i->>'eggs')::numeric=a.qty) <> 4 THEN
    RAISE EXCEPTION 'immutable packing source evidence drifted';
  END IF;
END
$assert$;

CREATE TEMP TABLE changed_batches ON COMMIT DROP AS
WITH changed AS (
  UPDATE inv_batches b
     SET spec_code='PKG_PACK_SPEC_3', sku_code=s.sku_code
    FROM approved_batches a
    JOIN product_skus s ON s.product_code=a.product_code AND s.grade_code=a.grade_code
      AND s.spec_code='PKG_PACK_SPEC_3' AND s.status='ACTIVE'
   WHERE b.batch_no=a.batch_no AND b.source_type='PACKAGING'
     AND b.packaging_batch_ref=a.packaging_ref AND b.spec_code IS NULL AND b.sku_code IS NULL
  RETURNING b.batch_no,b.spec_code,b.sku_code,b.qty,b.qty_available,b.source_type,b.packaging_batch_ref
) SELECT * FROM changed;

DO $assert$
BEGIN
  IF (SELECT count(*) FROM changed_batches) <> 4 THEN RAISE EXCEPTION 'UPDATE did not change exactly four rows'; END IF;
  IF EXISTS (SELECT 1 FROM locked_before x JOIN inv_batches b USING(batch_no)
             WHERE b.qty IS DISTINCT FROM x.qty OR b.qty_available IS DISTINCT FROM x.qty_available
                OR b.source_type IS DISTINCT FROM x.source_type OR b.packaging_batch_ref IS DISTINCT FROM x.packaging_batch_ref
                OR b.company_code IS DISTINCT FROM x.company_code OR b.warehouse_code IS DISTINCT FROM x.warehouse_code
                OR b.location_code IS DISTINCT FROM x.location_code) THEN
    RAISE EXCEPTION 'forbidden inventory fields changed';
  END IF;
END
$assert$;

SELECT 'CHANGED' AS section,* FROM changed_batches ORDER BY batch_no;
SELECT 'ROLLBACK_GUARD' AS section,
       'UPDATE inv_batches SET spec_code=NULL, sku_code=NULL WHERE batch_no=' || quote_literal(batch_no) ||
       ' AND spec_code=' || quote_literal(spec_code) || ' AND sku_code=' || quote_literal(sku_code) || ';' AS rollback_sql
  FROM changed_batches ORDER BY batch_no;
COMMIT;

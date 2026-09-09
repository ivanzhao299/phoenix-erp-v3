\pset pager off
\pset null '[NULL]'
BEGIN TRANSACTION READ ONLY;
DO $assert$
BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN product_skus s ON s.sku_code=b.sku_code
       WHERE b.batch_no IN ('EGG-20260725-00001','EGG-20260725-00002','EGG-20260817-00001','EGG-20260909-00001')
         AND b.source_type='PACKAGING' AND b.spec_code='PKG_PACK_SPEC_3' AND s.status='ACTIVE'
         AND s.product_code=b.product_code AND s.grade_code=b.grade_code_std AND s.spec_code=b.spec_code) <> 4 THEN
    RAISE EXCEPTION 'four-batch spec/SKU verification failed';
  END IF;
  IF (SELECT count(*) FROM inv_ledger WHERE batch_no IN
      ('EGG-20260725-00001','EGG-20260725-00002','EGG-20260817-00001','EGG-20260909-00001')
      AND change_type='FIFO_OUT') <> 0 THEN RAISE EXCEPTION 'unexpected FIFO_OUT'; END IF;
END
$assert$;
SELECT b.batch_no,b.source_type,b.packaging_batch_ref,b.product_code,b.grade_code_std,b.qty,b.qty_available,
       b.company_code,b.warehouse_code,b.location_code,b.spec_code,b.sku_code
  FROM inv_batches b WHERE b.batch_no IN
  ('EGG-20260725-00001','EGG-20260725-00002','EGG-20260817-00001','EGG-20260909-00001')
 ORDER BY b.batch_no;
ROLLBACK;

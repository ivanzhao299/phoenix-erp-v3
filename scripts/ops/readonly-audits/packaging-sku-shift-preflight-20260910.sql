\pset tuples_only on
\pset format unaligned
SELECT jsonb_build_object('section','protection','connection_ro',current_setting('default_transaction_read_only'),'transaction_ro',current_setting('transaction_read_only'));
SELECT jsonb_build_object('section','product_counts','table','mst_products','total',count(*),'active',count(*) FILTER(WHERE status='ACTIVE')) FROM mst_products;
SELECT jsonb_build_object('section','products','row',to_jsonb(p)) FROM mst_products p ORDER BY product_code;
SELECT jsonb_build_object('section','legacy_product_counts','table','product_master','total',count(*),'candidate',count(*) FILTER(WHERE product_code IN ('PRD-EGG-5','PRD-EGG-GRADE_5'))) FROM product_master;
SELECT jsonb_build_object('section','exact_product_count','code',v.code,'count',count(p.id)) FROM (VALUES ('PRD-EGG-5'),('PRD-EGG-GRADE_5')) v(code) LEFT JOIN mst_products p ON p.product_code=v.code GROUP BY v.code;
SELECT jsonb_build_object('section','grade5_skus','count',count(*),'gift_count',count(*) FILTER(WHERE spec_code='PKG_PACK_SPEC_3'),'rows',jsonb_agg(to_jsonb(s))) FROM product_skus s WHERE grade_code='GRADE_5';
SELECT jsonb_build_object('section','grade','row',to_jsonb(g)) FROM product_grades g WHERE grade_code='GRADE_5';
SELECT jsonb_build_object('section','spec','row',to_jsonb(s)) FROM packaging_specs s WHERE spec_code='PKG_PACK_SPEC_3';
SELECT jsonb_build_object('section','packing33','row',to_jsonb(p),'handovers',(SELECT count(*) FROM pkg_handover_records h WHERE h.packing_code=p.code),'batches',(SELECT count(*) FROM inv_batches b WHERE b.packaging_batch_ref=p.code OR b.source_no=p.code),'ledgers',(SELECT count(*) FROM inv_ledger l WHERE l.ref_no=p.code)) FROM pkg_packing_records p WHERE id=33;
SELECT jsonb_build_object('section','latest_migration','row',to_jsonb(m)) FROM migrations m ORDER BY id DESC LIMIT 1;

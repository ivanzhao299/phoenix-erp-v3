\pset tuples_only on
\pset format unaligned
SELECT jsonb_build_object('section','protection','connection',current_setting('default_transaction_read_only'),'transaction',current_setting('transaction_read_only'),'at',clock_timestamp());
SELECT jsonb_build_object('section','column','row',to_jsonb(c)) FROM information_schema.columns c WHERE table_schema='public' AND (table_name LIKE 'pkg_%' OR table_name IN ('inv_batches','inv_ledger','sal_order_allocations','sal_sales_order_items')) ORDER BY table_name,ordinal_position;
SELECT jsonb_build_object('section','constraint','table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid)) FROM pg_constraint WHERE connamespace='public'::regnamespace AND (conrelid::regclass::text LIKE 'pkg_%' OR contype='f' AND confrelid::regclass::text IN ('inv_batches','pkg_packing_records','pkg_grading_records','pkg_source_batches')) ORDER BY conrelid::regclass::text,conname;
SELECT jsonb_build_object('section','index','row',to_jsonb(i)) FROM pg_indexes i WHERE schemaname='public' AND tablename LIKE 'pkg_%';
SELECT jsonb_build_object('section','source','row',to_jsonb(s)) FROM pkg_source_batches s ORDER BY id;
SELECT jsonb_build_object('section','grading','row',to_jsonb(g)) FROM pkg_grading_records g ORDER BY id;
SELECT jsonb_build_object('section','packing','row',to_jsonb(p)) FROM pkg_packing_records p ORDER BY id;
SELECT jsonb_build_object('section','shift','row',to_jsonb(s)) FROM pkg_work_shifts s ORDER BY id;
SELECT jsonb_build_object('section','handover','row',to_jsonb(h)) FROM pkg_handover_records h ORDER BY id;
SELECT jsonb_build_object('section','link','row',to_jsonb(l)) FROM pkg_grading_source_links l ORDER BY grading_id,source_batch_id;
SELECT jsonb_build_object('section','inventory','row',to_jsonb(b)) FROM inv_batches b WHERE source_type='PACKAGING' OR packaging_batch_ref IS NOT NULL;
SELECT jsonb_build_object('section','ledger','row',to_jsonb(l)) FROM inv_ledger l WHERE change_type='PACKAGING_INBOUND' OR batch_no IN (SELECT batch_no FROM inv_batches WHERE source_type='PACKAGING' OR packaging_batch_ref IS NOT NULL);
SELECT jsonb_build_object('section','inbound','row',to_jsonb(w)) FROM wms_inbound w WHERE inbound_no IN (SELECT source_inbound_no FROM pkg_source_batches);
SELECT jsonb_build_object('section','allocation','row',to_jsonb(a)) FROM sal_order_item_batch_allocations a WHERE batch_no IN (SELECT batch_no FROM inv_batches WHERE source_type='PACKAGING' OR packaging_batch_ref IS NOT NULL);
SELECT jsonb_build_object('section','allocation_action','row',to_jsonb(a)) FROM sal_order_item_batch_allocation_actions a WHERE allocation_id IN (SELECT id FROM sal_order_item_batch_allocations WHERE batch_no IN (SELECT batch_no FROM inv_batches WHERE source_type='PACKAGING' OR packaging_batch_ref IS NOT NULL));

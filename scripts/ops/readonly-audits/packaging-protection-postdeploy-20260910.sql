\pset tuples_only on
\pset format unaligned
DO $$ BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
    AND ((table_name IN ('pkg_work_shifts','pkg_source_batches','pkg_grading_records','pkg_packing_records') AND column_name='is_test' AND is_nullable='NO' AND column_default='false')
    OR (table_name='pkg_packing_records' AND column_name IN ('status','void_reason','voided_at','voided_by','idempotency_key','payload_hash')))) <> 10 THEN
    RAISE EXCEPTION 'PACKAGING_PROTECTION_SCHEMA_INCOMPLETE';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='pkg_packing_records'::regclass AND conname='ck_packing_record_status')
    OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE tablename='pkg_packing_records' AND indexname='uq_packing_idempotency') THEN
    RAISE EXCEPTION 'PACKAGING_PROTECTION_CONSTRAINT_INCOMPLETE';
  END IF;
END $$;
SELECT jsonb_build_object('section','protection','connection',current_setting('default_transaction_read_only'),'transaction',current_setting('transaction_read_only'),'at',clock_timestamp());
SELECT jsonb_build_object('section','retained_targets','sources',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',batch_status)) FROM pkg_source_batches WHERE id IN (16,34,38)),'grading',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',status)) FROM pkg_grading_records WHERE id IN (13,42,43,44,45,53,54)),'packing',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'is_test',is_test)) FROM pkg_packing_records WHERE id IN (21,25,26,27,28)));
SELECT jsonb_build_object('section','test_counts','shifts',(SELECT count(*) FROM pkg_work_shifts WHERE is_test),'sources',(SELECT count(*) FROM pkg_source_batches WHERE is_test),'grading',(SELECT count(*) FROM pkg_grading_records WHERE is_test),'packing',(SELECT count(*) FROM pkg_packing_records WHERE is_test),'packing_void',(SELECT count(*) FROM pkg_packing_records WHERE status='VOID'));
SELECT jsonb_build_object('section','migration','row',to_jsonb(m)) FROM migrations m WHERE name='ProtectPackagingVoidAndTestIsolation1789099201000';
SELECT jsonb_build_object('section','inventory_hash','count',count(*),'hash',md5(COALESCE(string_agg(md5(row_to_json(b)::text),'' ORDER BY batch_no),''))) FROM inv_batches b;
SELECT jsonb_build_object('section','ledger_hash','count',count(*),'hash',md5(COALESCE(string_agg(md5(row_to_json(l)::text),'' ORDER BY id),''))) FROM inv_ledger l;

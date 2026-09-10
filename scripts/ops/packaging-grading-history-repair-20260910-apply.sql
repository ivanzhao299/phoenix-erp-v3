\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE repair_hashes AS
SELECT
  (SELECT md5(COALESCE(string_agg(md5(row_to_json(b)::text),'' ORDER BY b.batch_no),'')) FROM inv_batches b) AS batches_hash,
  (SELECT md5(COALESCE(string_agg(md5(row_to_json(l)::text),'' ORDER BY l.id),'')) FROM inv_ledger l) AS ledger_hash,
  (SELECT md5((to_jsonb(p)-'grading_code'-'grading_codes_json')::text) FROM pkg_packing_records p WHERE id=31) AS packing_logistics_hash,
  (SELECT md5(COALESCE(string_agg(md5(payload),'' ORDER BY kind,id),''))
     FROM (
       SELECT 'source' AS kind,id,row_to_json(s)::text AS payload FROM pkg_source_batches s WHERE shift_id=54
       UNION ALL SELECT 'grading',id,row_to_json(g)::text FROM pkg_grading_records g WHERE shift_id=54
       UNION ALL SELECT 'packing',id,row_to_json(p)::text FROM pkg_packing_records p WHERE shift_id=54
     ) shift54) AS shift54_hash;

DO $$
DECLARE locked_count integer;
BEGIN
  PERFORM 1 FROM pkg_grading_records WHERE id IN (71,72,73,74,75,76,77) ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS locked_count = ROW_COUNT;
  IF locked_count <> 7 THEN RAISE EXCEPTION 'expected 7 grading rows, locked %', locked_count; END IF;
  PERFORM 1 FROM pkg_packing_records WHERE id=31 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'packing row 31 missing'; END IF;
  PERFORM 1 FROM pkg_source_batches WHERE id=48 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source row 48 missing'; END IF;

  IF EXISTS (SELECT 1 FROM pkg_grading_records WHERE id IN (71,72,73,74,75,76,77) AND status <> 'ACTIVE')
     OR (SELECT COUNT(*) FROM pkg_grading_records WHERE id IN (71,72,73,74,75,76,77)) <> 7 THEN
    RAISE EXCEPTION 'target grading status/count drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pkg_source_batches WHERE id=48 AND batch_code='SRC-20260910-H-DEBUG--R3VW'
       AND shift_id=56 AND house_code='H-DEBUG-A01' AND total_qty=100 AND dirty_qty=1 AND cracked_qty=1
       AND batch_status='RECEIVED' AND created_at='2026-09-10 02:28:15.597138')
     OR NOT EXISTS (SELECT 1 FROM pkg_grading_records WHERE id=73 AND code='GRD-20260909-267637' AND total_output=300 AND created_at='2026-09-09 08:57:47.638061')
     OR NOT EXISTS (SELECT 1 FROM pkg_grading_records WHERE id=74 AND code='GRD-20260909-269652' AND total_output=300 AND created_at='2026-09-09 08:57:49.652964')
     OR NOT EXISTS (SELECT 1 FROM pkg_grading_records WHERE id=77 AND code='GRD-20260910-306173' AND total_output=98 AND created_at='2026-09-10 00:31:46.173537') THEN
    RAISE EXCEPTION 'void target baseline drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pkg_packing_records WHERE id=31 AND grading_code='GRD-20260909-136133'
    AND grading_codes_json='["GRD-20260909-136133","GRD-20260909-265670","GRD-20260909-267637","GRD-20260909-269652"]'::jsonb
    AND total_boxes=10 AND total_eggs=300) THEN RAISE EXCEPTION 'packing reference baseline drift'; END IF;
END $$;

UPDATE pkg_source_batches
   SET batch_status='VOID', updated_at=clock_timestamp()
 WHERE id=48 AND batch_status='RECEIVED';
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pkg_source_batches WHERE id=48 AND batch_status='VOID') <> 1
  THEN RAISE EXCEPTION 'expected source row 48 voided'; END IF;
END $$;

UPDATE pkg_grading_records
   SET status='VOID', void_reason='duplicate-submit-first-valid; operator=controlled-repair-20260910; approval=GRADING-REPAIR-20260910',
       voided_at=clock_timestamp(), voided_by='controlled-repair-20260910'
 WHERE id IN (73,74,77) AND status='ACTIVE';
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pkg_grading_records WHERE id IN (73,74,77) AND status='VOID' AND voided_by='controlled-repair-20260910') <> 3
  THEN RAISE EXCEPTION 'expected 3 voided rows'; END IF;
END $$;

INSERT INTO pkg_audit_logs(entity_type,entity_id,action,before_data,after_data,reason,created_at)
VALUES ('SOURCE_BATCH','SRC-20260910-H-DEBUG--R3VW','VOID_TEST_HOUSE_POLLUTION',
  '{"batchStatus":"RECEIVED","netQty":98,"houseCode":"H-DEBUG-A01"}',
  '{"batchStatus":"VOID","operator":"controlled-repair-20260910","approval":"GRADING-REPAIR-20260910"}',
  'test-house-pollution; operator=controlled-repair-20260910; approval=GRADING-REPAIR-20260910',clock_timestamp());

UPDATE pkg_packing_records
   SET grading_code='GRD-20260909-265670', grading_codes_json='["GRD-20260909-265670"]'::jsonb
 WHERE id=31 AND grading_code='GRD-20260909-136133'
   AND grading_codes_json='["GRD-20260909-136133","GRD-20260909-265670","GRD-20260909-267637","GRD-20260909-269652"]'::jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pkg_packing_records WHERE id=31 AND grading_code='GRD-20260909-265670'
    AND grading_codes_json='["GRD-20260909-265670"]'::jsonb) THEN
    RAISE EXCEPTION 'expected one packing reference correction';
  END IF;
END $$;

INSERT INTO pkg_audit_logs(entity_type,entity_id,action,before_data,after_data,reason,created_at)
SELECT 'GRADING_RECORD', code, 'VOID_TECHNICAL_DUPLICATE',
       jsonb_build_object('status','ACTIVE','totalOutput',total_output,'outputs',outputs_json),
       jsonb_build_object('status','VOID','voidedBy',voided_by,'voidedAt',voided_at), void_reason, clock_timestamp()
FROM pkg_grading_records WHERE id IN (73,74,77);
INSERT INTO pkg_audit_logs(entity_type,entity_id,action,before_data,after_data,reason,created_at)
VALUES ('PACKING_RECORD','PKG-20260909-293183','CORRECT_GRADING_REFERENCES',
  '{"gradingCode":"GRD-20260909-136133","gradingCodes":["GRD-20260909-136133","GRD-20260909-265670","GRD-20260909-267637","GRD-20260909-269652"]}',
  '{"gradingCode":"GRD-20260909-265670","gradingCodes":["GRD-20260909-265670"]}',
  'GRD-20260909-136133归属班次54；班次55仅保留合法首笔引用，不改变包装实物数量或库存',clock_timestamp());

DO $$
DECLARE before_hashes repair_hashes%ROWTYPE;
BEGIN
  SELECT * INTO before_hashes FROM repair_hashes;
  IF (SELECT SUM(total_qty-dirty_qty-cracked_qty) FROM pkg_source_batches WHERE shift_id=55 AND batch_status<>'VOID') <> 300
     OR (SELECT SUM(total_qty-dirty_qty-cracked_qty) FROM pkg_source_batches WHERE shift_id=56 AND batch_status<>'VOID') <> 196
     OR (SELECT SUM(total_output) FROM pkg_grading_records WHERE shift_id=55 AND status='ACTIVE') <> 300
     OR (SELECT SUM(total_output) FROM pkg_grading_records WHERE shift_id=56 AND status='ACTIVE') <> 196 THEN
    RAISE EXCEPTION 'post-apply grading reconciliation failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pkg_packing_records WHERE id=31 AND total_boxes=10 AND total_eggs=300
    AND grading_code='GRD-20260909-265670' AND grading_codes_json='["GRD-20260909-265670"]'::jsonb) THEN
    RAISE EXCEPTION 'packing reference correction failed';
  END IF;
  IF before_hashes.batches_hash <> (SELECT md5(COALESCE(string_agg(md5(row_to_json(b)::text),'' ORDER BY b.batch_no),'')) FROM inv_batches b)
     OR before_hashes.ledger_hash <> (SELECT md5(COALESCE(string_agg(md5(row_to_json(l)::text),'' ORDER BY l.id),'')) FROM inv_ledger l)
     OR before_hashes.packing_logistics_hash <> (SELECT md5((to_jsonb(p)-'grading_code'-'grading_codes_json')::text) FROM pkg_packing_records p WHERE id=31)
     OR before_hashes.shift54_hash <> (SELECT md5(COALESCE(string_agg(md5(payload),'' ORDER BY kind,id),''))
       FROM (
         SELECT 'source' AS kind,id,row_to_json(s)::text AS payload FROM pkg_source_batches s WHERE shift_id=54
         UNION ALL SELECT 'grading',id,row_to_json(g)::text FROM pkg_grading_records g WHERE shift_id=54
         UNION ALL SELECT 'packing',id,row_to_json(p)::text FROM pkg_packing_records p WHERE shift_id=54
       ) shift54) THEN
    RAISE EXCEPTION 'inventory/ledger/packing logistics hash changed';
  END IF;
END $$;

SELECT 'ROLLBACK_SQL' AS marker,
 'BEGIN; UPDATE pkg_grading_records SET status=''ACTIVE'',void_reason=NULL,voided_at=NULL,voided_by=NULL WHERE id='||id||' AND status=''VOID'' AND voided_by=''controlled-repair-20260910''; COMMIT;' AS sql
FROM pkg_grading_records WHERE id IN (73,74,77) ORDER BY id;
SELECT 'ROLLBACK_SQL' AS marker,
 'BEGIN; UPDATE pkg_source_batches SET batch_status=''RECEIVED'',updated_at=clock_timestamp() WHERE id=48 AND batch_code=''SRC-20260910-H-DEBUG--R3VW'' AND batch_status=''VOID''; INSERT INTO pkg_audit_logs(entity_type,entity_id,action,before_data,after_data,reason,created_at) VALUES (''SOURCE_BATCH'',''SRC-20260910-H-DEBUG--R3VW'',''REVERSE_VOID_TEST_HOUSE_POLLUTION'',''{"batchStatus":"VOID"}'',''{"batchStatus":"RECEIVED"}'',''guarded reversal; approval=GRADING-REPAIR-20260910'',clock_timestamp()); COMMIT;' AS sql;
SELECT 'ROLLBACK_SQL' AS marker,
 'BEGIN; UPDATE pkg_packing_records SET grading_code=''GRD-20260909-136133'',grading_codes_json=''["GRD-20260909-136133","GRD-20260909-265670","GRD-20260909-267637","GRD-20260909-269652"]''::jsonb WHERE id=31 AND grading_code=''GRD-20260909-265670'' AND grading_codes_json=''["GRD-20260909-265670"]''::jsonb; COMMIT;' AS sql;
COMMIT;

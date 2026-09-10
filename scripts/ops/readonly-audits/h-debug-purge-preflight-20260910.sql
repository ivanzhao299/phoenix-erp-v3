-- Approval H-DEBUG-PURGE-20260910: exactly 3 sources + 7 gradings + 2 packings.
-- Frozen from production readonly run 34448940336, 2026-09-10 07:14:45 UTC.
-- Readonly gate only. Known unapproved dependencies must fail; never auto-expand.
\pset tuples_only on
\pset format unaligned
SELECT jsonb_build_object('section','preflight_at','at',clock_timestamp());
DO $guard$
DECLARE expected jsonb; actual jsonb; item jsonb;
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'READONLY_REQUIRED';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements($baseline$[{"row": {"id": 16, "lay_date": "2026-07-30", "shift_id": 22, "dirty_qty": 0, "qc_result": null, "total_qty": 300, "batch_code": "SRC-20260730-H-DEBUG--9E4F", "created_at": "2026-07-30T06:40:15.040216", "flock_code": "", "house_code": "H-DEBUG-A01", "updated_at": "2026-07-30T06:40:15.040216", "cracked_qty": 0, "received_by": null, "batch_status": "RECEIVED", "expected_qty": 300, "received_qty": 300, "container_count": 0, "expected_weight": 0.0, "production_date": "2026-07-30", "received_weight": 0.0, "variance_reason": "", "source_inbound_no": "SRC-20260730-H-DEBUG--9E4F"}, "section": "source"}, {"row": {"id": 34, "lay_date": "2026-08-20", "shift_id": 43, "dirty_qty": 1, "qc_result": null, "total_qty": 302, "batch_code": "SRC-20260820-H-DEBUG--9YWE", "created_at": "2026-08-20T08:53:45.327241", "flock_code": "", "house_code": "H-DEBUG-A01", "updated_at": "2026-08-20T08:53:45.327241", "cracked_qty": 1, "received_by": null, "batch_status": "RECEIVED", "expected_qty": 302, "received_qty": 302, "container_count": 0, "expected_weight": 0.0, "production_date": "2026-08-20", "received_weight": 0.0, "variance_reason": "", "source_inbound_no": "SRC-20260820-H-DEBUG--9YWE"}, "section": "source"}, {"row": {"id": 38, "lay_date": "2026-08-21", "shift_id": 48, "dirty_qty": 1, "qc_result": null, "total_qty": 302, "batch_code": "SRC-20260821-H-DEBUG--6HQK", "created_at": "2026-08-21T05:50:45.836885", "flock_code": "", "house_code": "H-DEBUG-A01", "updated_at": "2026-08-21T05:50:45.836885", "cracked_qty": 1, "received_by": null, "batch_status": "RECEIVED", "expected_qty": 302, "received_qty": 302, "container_count": 0, "expected_weight": 0.0, "production_date": "2026-08-21", "received_weight": 0.0, "variance_reason": "", "source_inbound_no": "SRC-20260821-H-DEBUG--6HQK"}, "section": "source"}, {"row": {"id": 13, "code": "GRD-20260730-620666", "status": "ACTIVE", "shift_id": 22, "voided_at": null, "voided_by": null, "created_at": "2026-07-30T06:40:20.666075", "void_reason": null, "outputs_json": {"DIRTY": 0, "BROKEN": 0, "CRACKED": 0, "DAMAGED": 0, "GRADE_1": 300, "GRADE_2": 0, "GRADE_3": 0, "GRADE_4": 0, "GRADE_5": 0}, "payload_hash": "b5cd4c6de51ce696acebee96955fbff7", "total_output": 300, "idempotency_key": "legacy-grading-13", "production_date": "2026-07-30", "source_batch_code": null}, "section": "grading"}, {"row": {"id": 42, "code": "GRD-20260820-031587", "status": "ACTIVE", "shift_id": 43, "voided_at": null, "voided_by": null, "created_at": "2026-08-20T08:53:51.587813", "void_reason": null, "outputs_json": {"DIRTY": 0, "BROKEN": 0, "CRACKED": 0, "DAMAGED": 0, "GRADE_1": 300, "GRADE_2": 0, "GRADE_3": 0, "GRADE_4": 0, "GRADE_5": 0}, "payload_hash": "b5cd4c6de51ce696acebee96955fbff7", "total_output": 300, "idempotency_key": "legacy-grading-42", "production_date": "2026-08-20", "source_batch_code": null}, "section": "grading"}, {"row": {"id": 43, "code": "GRD-20260820-033567", "status": "ACTIVE", "shift_id": 43, "voided_at": null, "voided_by": null, "created_at": "2026-08-20T08:53:53.567823", "void_reason": null, "outputs_json": {"DIRTY": 0, "BROKEN": 0, "CRACKED": 0, "DAMAGED": 0, "GRADE_1": 300, "GRADE_2": 0, "GRADE_3": 0, "GRADE_4": 0, "GRADE_5": 0}, "payload_hash": "b5cd4c6de51ce696acebee96955fbff7", "total_output": 300, "idempotency_key": "legacy-grading-43", "production_date": "2026-08-20", "source_batch_code": null}, "section": "grading"}, {"row": {"id": 44, "code": "GRD-20260820-041071", "status": "ACTIVE", "shift_id": 43, "voided_at": null, "voided_by": null, "created_at": "2026-08-20T08:54:01.071294", "void_reason": null, "outputs_json": {"DIRTY": 0, "BROKEN": 0, "CRACKED": 0, "DAMAGED": 0, "GRADE_1": 600, "GRADE_2": 0, "GRADE_3": 0, "GRADE_4": 0, "GRADE_5": 0}, "payload_hash": "c50e44ee5298405ec7ee3b1850d7ede0", "total_output": 600, "idempotency_key": "legacy-grading-44", "production_date": "2026-08-20", "source_batch_code": null}, "section": "grading"}, {"row": {"id": 45, "code": "GRD-20260820-055835", "status": "ACTIVE", "shift_id": 43, "voided_at": null, "voided_by": null, "created_at": "2026-08-20T08:54:15.835114", "void_reason": null, "outputs_json": {"DIRTY": 0, "BROKEN": 0, "CRACKED": 0, "DAMAGED": 0, "GRADE_1": 300, "GRADE_2": 0, "GRADE_3": 0, "GRADE_4": 0, "GRADE_5": 0}, "payload_hash": "b5cd4c6de51ce696acebee96955fbff7", "total_output": 300, "idempotency_key": "legacy-grading-45", "production_date": "2026-08-20", "source_batch_code": null}, "section": "grading"}, {"row": {"id": 53, "code": "GRD-20260821-451624", "status": "ACTIVE", "shift_id": 48, "voided_at": null, "voided_by": null, "created_at": "2026-08-21T05:50:51.624586", "void_reason": null, "outputs_json": {"DIRTY": 0, "BROKEN": 0, "CRACKED": 0, "DAMAGED": 0, "GRADE_1": 300, "GRADE_2": 0, "GRADE_3": 0, "GRADE_4": 0, "GRADE_5": 0}, "payload_hash": "b5cd4c6de51ce696acebee96955fbff7", "total_output": 300, "idempotency_key": "legacy-grading-53", "production_date": "2026-08-21", "source_batch_code": null}, "section": "grading"}, {"row": {"id": 54, "code": "GRD-20260821-454538", "status": "ACTIVE", "shift_id": 48, "voided_at": null, "voided_by": null, "created_at": "2026-08-21T05:50:54.538078", "void_reason": null, "outputs_json": {"DIRTY": 0, "BROKEN": 0, "CRACKED": 0, "DAMAGED": 0, "GRADE_1": 300, "GRADE_2": 0, "GRADE_3": 0, "GRADE_4": 0, "GRADE_5": 0}, "payload_hash": "b5cd4c6de51ce696acebee96955fbff7", "total_output": 300, "idempotency_key": "legacy-grading-54", "production_date": "2026-08-21", "source_batch_code": null}, "section": "grading"}, {"row": {"id": 21, "code": "PKG-20260820-070592", "shift_id": 43, "created_at": "2026-08-20T08:54:30.592773", "total_eggs": 300, "total_boxes": 10, "batches_json": [{"eggs": 300, "spec": "精品礼盒(30枚/盒)", "boxes": 10, "grade": "GRADE_1", "specId": "PKG_PACK_SPEC_3"}], "grading_code": "GRD-20260820-245422", "production_date": "2026-08-20", "grading_codes_json": ["GRD-20260820-245422", "GRD-20260820-957756", "GRD-20260820-959584", "GRD-20260820-962530", "GRD-20260820-031587", "GRD-20260820-033567", "GRD-20260820-041071", "GRD-20260820-055835"]}, "section": "packing"}, {"row": {"id": 25, "code": "PKG-20260821-476346", "shift_id": 48, "created_at": "2026-08-21T05:51:16.346493", "total_eggs": 300, "total_boxes": 10, "batches_json": [{"eggs": 300, "spec": "精品礼盒(30枚/盒)", "boxes": 10, "grade": "GRADE_1", "specId": "PKG_PACK_SPEC_3"}], "grading_code": "GRD-20260821-620530", "production_date": "2026-08-21", "grading_codes_json": ["GRD-20260821-620530", "GRD-20260821-962364", "GRD-20260821-965512", "GRD-20260821-005901", "GRD-20260821-008275", "GRD-20260821-010271", "GRD-20260821-011358", "GRD-20260821-451624", "GRD-20260821-454538"]}, "section": "packing"}]$baseline$::jsonb) LOOP
    expected := item->'row';
    CASE item->>'section'
      WHEN 'source' THEN SELECT to_jsonb(s) INTO actual FROM pkg_source_batches s WHERE id=(expected->>'id')::int;
      WHEN 'grading' THEN SELECT to_jsonb(g) INTO actual FROM pkg_grading_records g WHERE id=(expected->>'id')::int;
      WHEN 'packing' THEN SELECT to_jsonb(p) INTO actual FROM pkg_packing_records p WHERE id=(expected->>'id')::int;
    END CASE;
    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'ORIGINAL_STATE_DRIFT kind=% id=%; no replay',item->>'section',expected->>'id';
    END IF;
  END LOOP;
END $guard$;
SELECT jsonb_build_object('section','unapproved_handover','row',to_jsonb(h))
FROM pkg_handover_records h WHERE packing_code IN ('PKG-20260820-070592','PKG-20260821-476346') ORDER BY id;
WITH target AS (SELECT code FROM pkg_grading_records WHERE id IN (13,42,43,44,45,53,54))
SELECT jsonb_build_object('section','unapproved_packing','row',to_jsonb(p))
FROM pkg_packing_records p WHERE id NOT IN (21,25)
AND (grading_code IN (SELECT code FROM target) OR EXISTS (SELECT 1 FROM target t WHERE p.grading_codes_json ? t.code)) ORDER BY id;
SELECT jsonb_build_object('section','smoke_isolation_schema','table',table_name,'column',column_name)
FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('pkg_work_shifts','pkg_source_batches','pkg_grading_records','pkg_packing_records')
AND (column_name ILIKE '%test%' OR column_name ILIKE '%smoke%' OR column_name IN ('status','batch_status')) ORDER BY table_name,column_name;
SELECT jsonb_build_object('section','inventory_hash','count',count(*),'hash',md5(COALESCE(string_agg(md5(row_to_json(b)::text),'' ORDER BY batch_no),''))) FROM inv_batches b;
SELECT jsonb_build_object('section','ledger_hash','count',count(*),'hash',md5(COALESCE(string_agg(md5(row_to_json(l)::text),'' ORDER BY id),''))) FROM inv_ledger l;
DO $gate$
DECLARE blockers text[] := ARRAY[]::text[];
BEGIN
 IF EXISTS (SELECT 1 FROM pkg_handover_records WHERE packing_code IN ('PKG-20260820-070592','PKG-20260821-476346')) THEN
   blockers:=array_append(blockers,'UNAPPROVED_HANDOVER_DEPENDENCIES');
 END IF;
 IF EXISTS (SELECT 1 FROM pkg_packing_records p WHERE id NOT IN (21,25) AND EXISTS (
   SELECT 1 FROM pkg_grading_records g WHERE g.id IN (13,42,43,44,45,53,54) AND (p.grading_code=g.code OR p.grading_codes_json ? g.code))) THEN
   blockers:=array_append(blockers,'UNAPPROVED_PACKING_DEPENDENCIES');
 END IF;
 IF EXISTS (SELECT 1 FROM pkg_grading_source_links WHERE source_batch_id IN (16,34,38) OR grading_id IN (13,42,43,44,45,53,54)) THEN
   blockers:=array_append(blockers,'NEW_SOURCE_LINKS');
 END IF;
 IF EXISTS (SELECT 1 FROM inv_batches WHERE packaging_batch_ref IN ('PKG-20260820-070592','PKG-20260821-476346'))
 OR EXISTS (SELECT 1 FROM inv_ledger WHERE ref_no IN ('PKG-20260820-070592','PKG-20260821-476346')) THEN
   blockers:=array_append(blockers,'INVENTORY_IMPACT');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pkg_packing_records' AND column_name='status') THEN
   blockers:=array_append(blockers,'PACKING_VOID_SCHEMA_NOT_DEPLOYED');
 END IF;
 IF cardinality(blockers)>0 THEN RAISE EXCEPTION 'H_DEBUG_PURGE_BLOCKED: %',array_to_string(blockers,','); END IF;
 -- Passing this readonly gate alone NEVER authorizes applying data or bypassing revision/consumer checks.
END $gate$;

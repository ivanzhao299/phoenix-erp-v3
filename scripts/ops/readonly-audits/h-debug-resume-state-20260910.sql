\pset tuples_only on
\pset format unaligned
SELECT jsonb_build_object('section','snapshot','at',clock_timestamp());
SELECT jsonb_build_object('section','source','row',to_jsonb(s)) FROM pkg_source_batches s WHERE shift_id IN (22,43,48) OR id=48 OR batch_code ILIKE '%SMOKE%' ORDER BY id;
SELECT jsonb_build_object('section','grading','row',to_jsonb(g)) FROM pkg_grading_records g WHERE shift_id IN (22,43,48) OR id IN (73,74,77) OR code ILIKE '%SMOKE%' OR idempotency_key ILIKE '%SMOKE%' ORDER BY id;
SELECT jsonb_build_object('section','packing','row',to_jsonb(p)) FROM pkg_packing_records p WHERE shift_id IN (22,43,48) OR id=31 OR code ILIKE '%SMOKE%' ORDER BY id;
SELECT jsonb_build_object('section','shift','row',to_jsonb(s)) FROM pkg_work_shifts s WHERE id IN (22,43,48) OR shift_code ILIKE '%SMOKE%' ORDER BY id;
SELECT jsonb_build_object('section','links','row',to_jsonb(l)) FROM pkg_grading_source_links l ORDER BY grading_id,source_batch_id;
SELECT jsonb_build_object('section','recent_source','row',to_jsonb(s)) FROM pkg_source_batches s WHERE created_at >= '2026-09-10 05:00:00' ORDER BY id;
SELECT jsonb_build_object('section','recent_grading','row',to_jsonb(g)) FROM pkg_grading_records g WHERE created_at >= '2026-09-10 05:00:00' ORDER BY id;
SELECT jsonb_build_object('section','recent_packing','row',to_jsonb(p)) FROM pkg_packing_records p WHERE created_at >= '2026-09-10 05:00:00' ORDER BY id;
SELECT jsonb_build_object('section','recent_shift','row',to_jsonb(s)) FROM pkg_work_shifts s WHERE created_at >= '2026-09-10 05:00:00' ORDER BY id;
SELECT jsonb_build_object('section','audit','row',to_jsonb(a)) FROM pkg_audit_logs a WHERE reason ILIKE '%H-DEBUG%' OR reason ILIKE '%GRADING-REPAIR-20260910%' OR reason ILIKE '%SMOKE%' OR created_at >= '2026-09-10 05:00:00' ORDER BY id;
WITH codes AS (SELECT code FROM pkg_grading_records WHERE id IN (13,42,43,44,45,53,54))
SELECT jsonb_build_object('section','dependent_packing','row',to_jsonb(p)) FROM pkg_packing_records p WHERE p.grading_code IN (SELECT code FROM codes) OR EXISTS(SELECT 1 FROM codes WHERE p.grading_codes_json ? codes.code);
SELECT jsonb_build_object('section','handover','row',to_jsonb(h)) FROM pkg_handover_records h WHERE shift_id IN (22,43,48) OR packing_code IN ('PKG-20260820-070592','PKG-20260821-476346');
SELECT jsonb_build_object('section','inventory','row',to_jsonb(b)) FROM inv_batches b WHERE packaging_batch_ref IN ('PKG-20260820-070592','PKG-20260821-476346');
SELECT jsonb_build_object('section','ledger','row',to_jsonb(l)) FROM inv_ledger l WHERE ref_no IN ('PKG-20260820-070592','PKG-20260821-476346') OR batch_no IN (SELECT batch_no FROM inv_batches WHERE packaging_batch_ref IN ('PKG-20260820-070592','PKG-20260821-476346'));
SELECT jsonb_build_object('section','inventory_hash','count',count(*),'hash',md5(COALESCE(string_agg(md5(row_to_json(b)::text),'' ORDER BY batch_no),''))) FROM inv_batches b;
SELECT jsonb_build_object('section','ledger_hash','count',count(*),'hash',md5(COALESCE(string_agg(md5(row_to_json(l)::text),'' ORDER BY id),''))) FROM inv_ledger l;

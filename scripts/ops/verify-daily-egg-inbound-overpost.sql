-- Read-only verification for the Daily Egg Overpost Repair workflow
-- (preflight / verify phases). Kept beside repair-daily-egg-inbound-overpost.sql
-- so the workflow can stage it from the reviewed TARGET_SHA the same way;
-- inline SQL in the workflow file breaks YAML block scalars (column-0 lines).
SELECT jsonb_agg(to_jsonb(x)) FROM (
 SELECT b.batch_no,b.qty,b.qty_available,b.status,b.source_type,b.source_no,b.company_code,b.quality_grade,b.grade_code_std,
        COALESCE((SELECT sum(l.qty_change) FROM inv_ledger l WHERE l.batch_no=b.batch_no),0) AS ledger_qty
 FROM inv_batches b WHERE b.batch_no IN ('EGG-20261105-00002','EGG-20261107-00002','EGG-20261107-00001')
 ORDER BY b.batch_no
) x;

\set ON_ERROR_STOP on

-- Compensating rollback only. Every row must still match the corrected state.
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM inv_batches WHERE id IN (2847,2848,2850,2860,2889,2890,2891) AND company_code='COMP-LAO-AGRI') <> 7
     OR (SELECT count(*) FROM inv_batches WHERE id=2888 AND company_code='COMP-LAO-XINGCHI') <> 1 THEN
    RAISE EXCEPTION 'rollback batch precondition failed'; END IF;
  IF (SELECT count(*) FROM inv_ledger WHERE id IN (36,39,45,77,80,174,175,178,179,180,181,182)
      AND company_code='COMP-LAO-AGRI') <> 12
     OR (SELECT count(*) FROM inv_ledger WHERE id IN (172,176,177) AND company_code='COMP-LAO-XINGCHI') <> 3 THEN
    RAISE EXCEPTION 'rollback ledger precondition failed'; END IF;
END $$;
UPDATE inv_batches SET company_code='ALL',updated_at=updated_at
 WHERE id IN (2847,2848,2850,2860,2888,2889,2890,2891)
 RETURNING id,batch_no,company_code,status,qty,qty_available;
UPDATE inv_ledger SET company_code=CASE id
  WHEN 176 THEN NULL WHEN 177 THEN 'COMP-LAO-AGRI' WHEN 175 THEN 'COMP-LAO-AGRI' ELSE 'ALL' END
 WHERE id IN (36,39,45,77,80,172,174,175,176,177,178,179,180,181,182)
 RETURNING id,batch_no,ref_no,company_code,change_type,qty_change;
COMMIT;

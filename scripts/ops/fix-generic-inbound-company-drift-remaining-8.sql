\set ON_ERROR_STOP on

-- Each batch is its own committed transaction. If a later assertion fails,
-- psql stops while earlier corrections remain committed and auditable.

BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN wms_warehouses w USING (warehouse_code)
      WHERE b.id=2847 AND b.batch_no='IBN-20260713-KVN57H' AND b.product_code='TEST000001'
        AND b.warehouse_code='LPH_MS_EGG_FARM' AND b.company_code='ALL' AND w.company_code='COMP-LAO-AGRI'
        AND b.status='AVAILABLE' AND b.qty=1.000 AND b.qty_available=1.000 AND b.store_code='ALL') <> 1 THEN
    RAISE EXCEPTION 'IBN-20260713-KVN57H batch precondition failed'; END IF;
  IF (SELECT count(*) FROM inv_ledger WHERE batch_no='IBN-20260713-KVN57H') <> 1 OR
     NOT EXISTS (SELECT 1 FROM inv_ledger WHERE id=36 AND batch_no='IBN-20260713-KVN57H'
       AND ref_no='INB-20260713-2SYI' AND change_type='INBOUND' AND qty_change=1.000 AND company_code='ALL') THEN
    RAISE EXCEPTION 'IBN-20260713-KVN57H ledger precondition failed'; END IF;
END $$;
UPDATE inv_batches SET company_code='COMP-LAO-AGRI',updated_at=updated_at
 WHERE id=2847 AND batch_no='IBN-20260713-KVN57H' AND company_code='ALL' RETURNING id,batch_no,company_code,status,qty,qty_available;
UPDATE inv_ledger SET company_code='COMP-LAO-AGRI'
 WHERE id=36 AND batch_no='IBN-20260713-KVN57H' AND company_code='ALL' RETURNING id,batch_no,ref_no,company_code,change_type,qty_change;
DO $$ BEGIN IF (SELECT count(*) FROM inv_batches WHERE id=2847 AND company_code='COMP-LAO-AGRI' AND status='AVAILABLE' AND qty=1 AND qty_available=1)<>1
 OR (SELECT count(*) FROM inv_ledger WHERE id=36 AND company_code='COMP-LAO-AGRI')<>1 THEN RAISE EXCEPTION 'IBN-20260713-KVN57H postcondition failed'; END IF; END $$;
COMMIT;

BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN wms_warehouses w USING (warehouse_code)
      WHERE b.id=2848 AND b.batch_no='IBN-20260715-PYVE48' AND b.product_code='TEST-715'
        AND b.warehouse_code='LPH_MS_EGG_FARM' AND b.company_code='ALL' AND w.company_code='COMP-LAO-AGRI'
        AND b.status='AVAILABLE' AND b.qty=99.000 AND b.qty_available=99.000 AND b.store_code='ALL') <> 1 THEN
    RAISE EXCEPTION 'IBN-20260715-PYVE48 batch precondition failed'; END IF;
  IF (SELECT count(*) FROM inv_ledger WHERE batch_no='IBN-20260715-PYVE48') <> 1 OR
     NOT EXISTS (SELECT 1 FROM inv_ledger WHERE id=39 AND ref_no='INB-20260715-62AG'
       AND batch_no='IBN-20260715-PYVE48' AND change_type='INBOUND' AND qty_change=99.000 AND company_code='ALL') THEN
    RAISE EXCEPTION 'IBN-20260715-PYVE48 ledger precondition failed'; END IF;
END $$;
UPDATE inv_batches SET company_code='COMP-LAO-AGRI',updated_at=updated_at
 WHERE id=2848 AND batch_no='IBN-20260715-PYVE48' AND company_code='ALL' RETURNING id,batch_no,company_code,status,qty,qty_available;
UPDATE inv_ledger SET company_code='COMP-LAO-AGRI'
 WHERE id=39 AND batch_no='IBN-20260715-PYVE48' AND company_code='ALL' RETURNING id,batch_no,ref_no,company_code,change_type,qty_change;
DO $$ BEGIN IF (SELECT count(*) FROM inv_batches WHERE id=2848 AND company_code='COMP-LAO-AGRI' AND status='AVAILABLE' AND qty=99 AND qty_available=99)<>1
 OR (SELECT count(*) FROM inv_ledger WHERE id=39 AND company_code='COMP-LAO-AGRI')<>1 THEN RAISE EXCEPTION 'IBN-20260715-PYVE48 postcondition failed'; END IF; END $$;
COMMIT;

BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN wms_warehouses w USING (warehouse_code)
      WHERE b.id=2850 AND b.batch_no='IBN-20260716-RV0SUA' AND b.product_code='TEST-0716'
        AND b.warehouse_code='LPH_MS_EGG_FARM' AND b.company_code='ALL' AND w.company_code='COMP-LAO-AGRI'
        AND b.status='AVAILABLE' AND b.qty=10.000 AND b.qty_available=10.000 AND b.store_code='ALL') <> 1 THEN
    RAISE EXCEPTION 'IBN-20260716-RV0SUA batch precondition failed'; END IF;
  IF (SELECT count(*) FROM inv_ledger WHERE batch_no='IBN-20260716-RV0SUA') <> 1 OR
     NOT EXISTS (SELECT 1 FROM inv_ledger WHERE id=45 AND ref_no='INB-20260716-AS7L'
       AND batch_no='IBN-20260716-RV0SUA' AND change_type='INBOUND' AND qty_change=10.000 AND company_code='ALL') THEN
    RAISE EXCEPTION 'IBN-20260716-RV0SUA ledger precondition failed'; END IF;
END $$;
UPDATE inv_batches SET company_code='COMP-LAO-AGRI',updated_at=updated_at
 WHERE id=2850 AND batch_no='IBN-20260716-RV0SUA' AND company_code='ALL' RETURNING id,batch_no,company_code,status,qty,qty_available;
UPDATE inv_ledger SET company_code='COMP-LAO-AGRI'
 WHERE id=45 AND batch_no='IBN-20260716-RV0SUA' AND company_code='ALL' RETURNING id,batch_no,ref_no,company_code,change_type,qty_change;
DO $$ BEGIN IF (SELECT count(*) FROM inv_batches WHERE id=2850 AND company_code='COMP-LAO-AGRI' AND status='AVAILABLE' AND qty=10 AND qty_available=10)<>1
 OR (SELECT count(*) FROM inv_ledger WHERE id=45 AND company_code='COMP-LAO-AGRI')<>1 THEN RAISE EXCEPTION 'IBN-20260716-RV0SUA postcondition failed'; END IF; END $$;
COMMIT;

BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN wms_warehouses w USING (warehouse_code)
      WHERE b.id=2860 AND b.batch_no='IBN-20260724-HY1Y6S' AND b.product_code='TEST0724'
        AND b.warehouse_code='LPH_MS_EGG_FARM' AND b.company_code='ALL' AND w.company_code='COMP-LAO-AGRI'
        AND b.status='AVAILABLE' AND b.qty=99.000 AND b.qty_available=99.000 AND b.store_code='ALL') <> 1 THEN
    RAISE EXCEPTION 'IBN-20260724-HY1Y6S batch precondition failed'; END IF;
  IF (SELECT count(*) FROM inv_ledger WHERE batch_no='IBN-20260724-HY1Y6S') <> 2 OR
     (SELECT count(*) FROM inv_ledger WHERE id IN (77,80) AND batch_no='IBN-20260724-HY1Y6S'
       AND ((id=77 AND ref_no='INB-20260724-WZOR' AND change_type='INBOUND' AND qty_change=100.000 AND company_code='ALL')
         OR (id=80 AND ref_no='UAT-WO-20260726-081316' AND change_type='OUTBOUND' AND qty_change=-1.000 AND company_code='ALL'))) <> 2 THEN
    RAISE EXCEPTION 'IBN-20260724-HY1Y6S ledger precondition failed'; END IF;
END $$;
UPDATE inv_batches SET company_code='COMP-LAO-AGRI',updated_at=updated_at
 WHERE id=2860 AND batch_no='IBN-20260724-HY1Y6S' AND company_code='ALL' RETURNING id,batch_no,company_code,status,qty,qty_available;
UPDATE inv_ledger SET company_code='COMP-LAO-AGRI'
 WHERE id IN (77,80) AND batch_no='IBN-20260724-HY1Y6S' AND company_code='ALL' RETURNING id,batch_no,ref_no,company_code,change_type,qty_change;
DO $$ BEGIN IF (SELECT count(*) FROM inv_batches WHERE id=2860 AND company_code='COMP-LAO-AGRI' AND status='AVAILABLE' AND qty=99 AND qty_available=99)<>1
 OR (SELECT count(*) FROM inv_ledger WHERE id IN (77,80) AND company_code='COMP-LAO-AGRI')<>2 THEN RAISE EXCEPTION 'IBN-20260724-HY1Y6S postcondition failed'; END IF; END $$;
COMMIT;

BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN wms_warehouses w USING (warehouse_code)
      WHERE b.id=2888 AND b.batch_no='IBN-20260826-8WUHPK' AND b.material_code='MAT-CON-CEMENT'
        AND b.warehouse_code='LPH_DP_EGG_FARM' AND b.company_code='ALL' AND w.company_code='COMP-LAO-XINGCHI'
        AND b.status='AVAILABLE' AND b.qty=7.999 AND b.qty_available=7.999 AND b.store_code='SITE-DONGPENG-LAYER') <> 1 THEN
    RAISE EXCEPTION 'IBN-20260826-8WUHPK batch precondition failed'; END IF;
  IF (SELECT count(*) FROM inv_ledger WHERE batch_no='IBN-20260826-8WUHPK') <> 3 OR
     (SELECT count(*) FROM inv_ledger WHERE batch_no='IBN-20260826-8WUHPK' AND
       ((id=172 AND ref_no='INB-20260826-NW6K' AND change_type='SALES_RETURN_INBOUND' AND qty_change=10.000 AND company_code='ALL') OR
        (id=176 AND change_type='PRODUCTION_ISSUE' AND qty_change=-0.001 AND company_code IS NULL) OR
        (id=177 AND ref_no='WO-92709825' AND change_type='PRODUCTION_ISSUE' AND qty_change=-2.000 AND company_code='COMP-LAO-AGRI'))) <> 3 THEN
    RAISE EXCEPTION 'IBN-20260826-8WUHPK ledger precondition failed'; END IF;
END $$;
UPDATE inv_batches SET company_code='COMP-LAO-XINGCHI',updated_at=updated_at
 WHERE id=2888 AND batch_no='IBN-20260826-8WUHPK' AND company_code='ALL' RETURNING id,batch_no,company_code,status,qty,qty_available;
UPDATE inv_ledger SET company_code='COMP-LAO-XINGCHI'
 WHERE id IN (172,176,177) AND batch_no='IBN-20260826-8WUHPK' AND company_code IS DISTINCT FROM 'COMP-LAO-XINGCHI'
 RETURNING id,batch_no,ref_no,company_code,change_type,qty_change;
DO $$ BEGIN IF (SELECT count(*) FROM inv_batches WHERE id=2888 AND company_code='COMP-LAO-XINGCHI' AND status='AVAILABLE' AND qty=7.999 AND qty_available=7.999)<>1
 OR (SELECT count(*) FROM inv_ledger WHERE id IN (172,176,177) AND company_code='COMP-LAO-XINGCHI')<>3 THEN RAISE EXCEPTION 'IBN-20260826-8WUHPK postcondition failed'; END IF; END $$;
COMMIT;

BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN wms_warehouses w USING (warehouse_code)
      WHERE b.id=2889 AND b.batch_no='IBN-20260827-P6XOFM' AND b.sku_code='SKU-1-TRAY36'
        AND b.warehouse_code='LPH_MS_EGG_FARM' AND b.company_code='ALL' AND w.company_code='COMP-LAO-AGRI'
        AND b.status='AVAILABLE' AND b.qty=6.000 AND b.qty_available=6.000 AND b.store_code='COMP-LAO-AGRI') <> 1 THEN
    RAISE EXCEPTION 'IBN-20260827-P6XOFM batch precondition failed'; END IF;
  IF (SELECT count(*) FROM inv_ledger WHERE batch_no='IBN-20260827-P6XOFM') <> 4 OR
     (SELECT count(*) FROM inv_ledger WHERE id IN (174,175,178,180) AND batch_no='IBN-20260827-P6XOFM') <> 4 THEN
    RAISE EXCEPTION 'IBN-20260827-P6XOFM ledger cardinality failed'; END IF;
  IF EXISTS (SELECT 1 FROM inv_ledger WHERE id IN (174,178,180) AND company_code<>'ALL') OR
     NOT EXISTS (SELECT 1 FROM inv_ledger WHERE id=175 AND ref_no='WO-90737724' AND change_type='SALE_OUTBOUND'
       AND qty_change=-1.000 AND company_code='COMP-LAO-AGRI') THEN
    RAISE EXCEPTION 'IBN-20260827-P6XOFM ledger values failed'; END IF;
END $$;
UPDATE inv_batches SET company_code='COMP-LAO-AGRI',updated_at=updated_at
 WHERE id=2889 AND batch_no='IBN-20260827-P6XOFM' AND company_code='ALL' RETURNING id,batch_no,company_code,status,qty,qty_available;
UPDATE inv_ledger SET company_code='COMP-LAO-AGRI'
 WHERE id IN (174,178,180) AND batch_no='IBN-20260827-P6XOFM' AND company_code='ALL'
 RETURNING id,batch_no,ref_no,company_code,change_type,qty_change;
DO $$ BEGIN IF (SELECT count(*) FROM inv_batches WHERE id=2889 AND company_code='COMP-LAO-AGRI' AND status='AVAILABLE' AND qty=6 AND qty_available=6)<>1
 OR (SELECT count(*) FROM inv_ledger WHERE id IN (174,175,178,180) AND company_code='COMP-LAO-AGRI')<>4 THEN RAISE EXCEPTION 'IBN-20260827-P6XOFM postcondition failed'; END IF; END $$;
COMMIT;

BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN wms_warehouses w USING (warehouse_code)
      WHERE b.id=2890 AND b.batch_no='IBN-20260827-P6XOFM-T-1LR' AND b.sku_code='SKU-1-TRAY36'
        AND b.warehouse_code='LPH_MS_EGG_SALES' AND b.company_code='ALL' AND w.company_code='COMP-LAO-AGRI'
        AND b.status='AVAILABLE' AND b.qty=2.000 AND b.qty_available=2.000 AND b.location_code='TRANSFER-IN') <> 1 THEN
    RAISE EXCEPTION 'IBN-20260827-P6XOFM-T-1LR batch precondition failed'; END IF;
  IF (SELECT count(*) FROM inv_ledger WHERE batch_no='IBN-20260827-P6XOFM-T-1LR') <> 1 OR
     NOT EXISTS (SELECT 1 FROM inv_ledger WHERE id=179 AND ref_no='WT-254007' AND batch_no='IBN-20260827-P6XOFM-T-1LR'
       AND change_type='TRANSFER_IN' AND qty_change=2.000 AND company_code='ALL') THEN
    RAISE EXCEPTION 'IBN-20260827-P6XOFM-T-1LR ledger precondition failed'; END IF;
END $$;
UPDATE inv_batches SET company_code='COMP-LAO-AGRI',updated_at=updated_at
 WHERE id=2890 AND batch_no='IBN-20260827-P6XOFM-T-1LR' AND company_code='ALL' RETURNING id,batch_no,company_code,status,qty,qty_available;
UPDATE inv_ledger SET company_code='COMP-LAO-AGRI'
 WHERE id=179 AND batch_no='IBN-20260827-P6XOFM-T-1LR' AND company_code='ALL' RETURNING id,batch_no,ref_no,company_code,change_type,qty_change;
DO $$ BEGIN IF (SELECT count(*) FROM inv_batches WHERE id=2890 AND company_code='COMP-LAO-AGRI' AND status='AVAILABLE' AND qty=2 AND qty_available=2)<>1
 OR (SELECT count(*) FROM inv_ledger WHERE id=179 AND company_code='COMP-LAO-AGRI')<>1 THEN RAISE EXCEPTION 'IBN-20260827-P6XOFM-T-1LR postcondition failed'; END IF; END $$;
COMMIT;

BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM inv_batches b JOIN wms_warehouses w USING (warehouse_code)
      WHERE b.id=2891 AND b.batch_no='IBN-20260827-P6XOFM-T-CR8' AND b.sku_code='SKU-1-TRAY36'
        AND b.warehouse_code='LPH_MS_EGG_SALES' AND b.company_code='ALL' AND w.company_code='COMP-LAO-AGRI'
        AND b.status='AVAILABLE' AND b.qty=1.000 AND b.qty_available=1.000 AND b.location_code='TRANSFER-IN') <> 1 THEN
    RAISE EXCEPTION 'IBN-20260827-P6XOFM-T-CR8 batch precondition failed'; END IF;
  IF (SELECT count(*) FROM inv_ledger WHERE batch_no='IBN-20260827-P6XOFM-T-CR8') <> 2 OR
     NOT EXISTS (SELECT 1 FROM inv_ledger WHERE id=181 AND ref_no='WT-344301' AND batch_no='IBN-20260827-P6XOFM-T-CR8'
       AND change_type='TRANSFER_IN' AND qty_change=1.000 AND company_code='ALL') OR
     NOT EXISTS (SELECT 1 FROM inv_ledger WHERE id=182 AND ref_no='FK-MT6LRP7S1AF' AND batch_no='IBN-20260827-P6XOFM-T-CR8'
       AND change_type='FARM_IN' AND qty_change=100.000 AND company_code='ALL') THEN
    RAISE EXCEPTION 'IBN-20260827-P6XOFM-T-CR8 ledger precondition failed'; END IF;
END $$;
UPDATE inv_batches SET company_code='COMP-LAO-AGRI',updated_at=updated_at
 WHERE id=2891 AND batch_no='IBN-20260827-P6XOFM-T-CR8' AND company_code='ALL' RETURNING id,batch_no,company_code,status,qty,qty_available;
UPDATE inv_ledger SET company_code='COMP-LAO-AGRI'
 WHERE id IN (181,182) AND batch_no='IBN-20260827-P6XOFM-T-CR8' AND company_code='ALL'
 RETURNING id,batch_no,ref_no,company_code,change_type,qty_change;
DO $$ BEGIN IF (SELECT count(*) FROM inv_batches WHERE id=2891 AND company_code='COMP-LAO-AGRI' AND status='AVAILABLE' AND qty=1 AND qty_available=1)<>1
 OR (SELECT count(*) FROM inv_ledger WHERE id IN (181,182) AND company_code='COMP-LAO-AGRI')<>2 THEN RAISE EXCEPTION 'IBN-20260827-P6XOFM-T-CR8 postcondition failed'; END IF; END $$;
COMMIT;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM inv_batches b JOIN wms_warehouses w USING (warehouse_code)
             WHERE b.batch_no LIKE 'IBN-%' AND b.company_code IS DISTINCT FROM w.company_code) THEN
    RAISE EXCEPTION 'GENERIC_INBOUND_COMPANY_DRIFT did not reach zero';
  END IF;
END $$;

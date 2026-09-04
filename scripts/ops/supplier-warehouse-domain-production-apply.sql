\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE approved_supplier_special(code text PRIMARY KEY, expected_name text, old_type text, category text, sourcing text) ON COMMIT DROP;
INSERT INTO approved_supplier_special VALUES
 ('LJ-S-006','鞠德清（中粮）','OVERSEAS','FEED','OVERSEAS'),
 ('SUP-00002','张鹏（装修工程）','LOCAL','SERVICE','LOCAL'),
 ('SUP-00003','罗成松','LOCAL','OTHER','LOCAL'),
 ('SUP-00004','20260705测试','LOCAL','OTHER','LOCAL'),
 ('SUP-00005','202600708测试','LOCAL','OTHER','LOCAL');

CREATE TEMP TABLE approved_warehouse(code text PRIMARY KEY, old_type text, new_type text, facility text, capability text) ON COMMIT DROP;
INSERT INTO approved_warehouse VALUES
 ('ST_LAO_AGRI_BKX_001_SALES','EGG_SALES','EGG_SALES','STORE',NULL),('ST_LAO_AGRI_LPB_001_SALES','EGG_SALES','EGG_SALES','STORE',NULL),
 ('ST_LAO_AGRI_MX_001_SALES','EGG_SALES','EGG_SALES','STORE',NULL),('ST_LAO_AGRI_PSL_001_SALES','EGG_SALES','EGG_SALES','STORE',NULL),
 ('ST_LAO_AGRI_VTE_001_SALES','EGG_SALES','EGG_SALES','STORE',NULL),('ST_LAO_AGRI_VTE_WH_001_SALES','EGG_SALES','EGG_SALES','STORE',NULL),
 ('ST_LAO_XINGCHI_DP_001_SALES','EGG_SALES','EGG_SALES','STORE',NULL),('ST_LAO_XINGCHI_HS_001_SALES','EGG_SALES','EGG_SALES','STORE',NULL),
 ('ST_LAO_XINGCHI_XB_001_SALES','EGG_SALES','EGG_SALES','STORE',NULL),('ST_LAO_XINGCHI_XC_001_SALES','EGG_SALES','EGG_SALES','STORE',NULL),
 ('CJ-WH-AGRI-03','GENERAL','GENERAL','GENERAL',NULL),('CJ-WH-FOOD-01','GENERAL','GENERAL','GENERAL',NULL),
 ('CJ-WH-FOOD-03','GENERAL','GENERAL','GENERAL',NULL),('CJ-WH-XINGCHI-01','GENERAL','GENERAL','GENERAL',NULL),
 ('CJ-WH-XINGCHI-03','GENERAL','GENERAL','GENERAL',NULL),('CJ-WH-XINGCHI-04','GENERAL','GENERAL','GENERAL',NULL),
 ('CJ-WH-XINGCHI-05','RAW_MATERIAL','RAW_MATERIAL','GENERAL',NULL),('CJ-WH-XINGCHI-06','RAW_MATERIAL','RAW_MATERIAL','GENERAL',NULL),
 ('CJ-WH-XINGCHI-07','COLD_STORAGE','GENERAL','GENERAL','COLD_CHAIN'),
 ('LPH_DP_FEED','FEED','FEED','GENERAL',NULL),('LPH_DP_MEDICINE','MEDICINE','MEDICINE','GENERAL',NULL),
 ('LPH_MS_FEED','FEED','FEED','GENERAL',NULL),('LPH_MS_MEDICINE','MEDICINE','MEDICINE','GENERAL',NULL),
 ('LPH_MS_RAW','RAW_MATERIAL','RAW_MATERIAL','GENERAL',NULL),('WH-0001',NULL,'GENERAL','GENERAL',NULL),
 ('LPH_DP_EGG_FARM','EGG_FARM','EGG_FARM','FACTORY',NULL),('LPH_MS_EGG_FARM','EGG_FARM','EGG_FARM','FACTORY',NULL),
 ('LPH_DP_EGG_SALES','EGG_SALES','EGG_SALES','DISTRIBUTION',NULL),('LPH_MS_EGG_SALES','EGG_SALES','EGG_SALES','DISTRIBUTION',NULL),
 ('LPH_MS_FINISHED','FINISHED','FINISHED','DISTRIBUTION',NULL),('LPH_MS_PURCHASE','PURCHASE_RECV','PURCHASE_RECV','TRANSIT',NULL);

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM prc2_suppliers; IF n <> 34 THEN RAISE EXCEPTION 'supplier total %, expected 34',n; END IF;
  SELECT count(*) INTO n FROM prc2_suppliers WHERE supplier_type IN ('CHICK','FEED','OTHER','PACKAGING','RAW_MATERIAL','VACCINE','VETERINARY');
  IF n <> 29 THEN RAISE EXCEPTION 'supplier identity set %, expected 29',n; END IF;
  SELECT count(*) INTO n FROM prc2_suppliers s JOIN approved_supplier_special m ON m.code=s.supplier_code AND m.expected_name=s.supplier_name AND m.old_type=s.supplier_type;
  IF n <> 5 THEN RAISE EXCEPTION 'supplier special manifest mismatch: %/5',n; END IF;
  SELECT count(*) INTO n FROM wms_warehouses; IF n <> 31 THEN RAISE EXCEPTION 'warehouse total %, expected 31',n; END IF;
  SELECT count(*) INTO n FROM wms_warehouses w JOIN approved_warehouse m ON m.code=w.warehouse_code AND w.type IS NOT DISTINCT FROM m.old_type;
  IF n <> 31 THEN RAISE EXCEPTION 'warehouse manifest mismatch: %/31',n; END IF;
  IF (SELECT domain FROM wms_warehouses WHERE warehouse_code='CJ-WH-XINGCHI-07') <> 'FINANCE_MAPPING' THEN RAISE EXCEPTION 'cold store domain drift'; END IF;
  IF (SELECT domain FROM wms_warehouses WHERE warehouse_code='WH-0001') <> 'TEST' THEN RAISE EXCEPTION 'WH-0001 domain drift'; END IF;
END $$;

UPDATE prc2_suppliers SET supply_category=supplier_type, sourcing_type='UNSPECIFIED', updated_at=NOW()
 WHERE supplier_type IN ('CHICK','FEED','OTHER','PACKAGING','RAW_MATERIAL','VACCINE','VETERINARY')
 RETURNING supplier_code,supplier_type,supply_category,sourcing_type;
UPDATE prc2_suppliers s SET supply_category=m.category,sourcing_type=m.sourcing,updated_at=NOW()
 FROM approved_supplier_special m WHERE s.supplier_code=m.code AND s.supplier_name=m.expected_name AND s.supplier_type=m.old_type
 RETURNING s.supplier_code,s.supplier_type,s.supply_category,s.sourcing_type;
UPDATE wms_warehouses w SET type=m.new_type,facility_class=m.facility,capability=m.capability,updated_at=NOW()
 FROM approved_warehouse m WHERE w.warehouse_code=m.code AND w.type IS NOT DISTINCT FROM m.old_type
 RETURNING w.warehouse_code,m.old_type,w.type,w.facility_class,w.capability,w.domain;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM prc2_suppliers WHERE supply_category IS NULL OR sourcing_type IS NULL) THEN RAISE EXCEPTION 'supplier NULL remains'; END IF;
 IF EXISTS (SELECT 1 FROM wms_warehouses WHERE type IS NULL OR facility_class IS NULL) THEN RAISE EXCEPTION 'warehouse NULL remains'; END IF;
 IF (SELECT count(*) FROM wms_warehouses WHERE facility_class='STORE') <> 10 THEN RAISE EXCEPTION 'STORE must equal 10'; END IF;
END $$;
ALTER TABLE prc2_suppliers VALIDATE CONSTRAINT chk_prc2_suppliers_supply_category;
ALTER TABLE prc2_suppliers VALIDATE CONSTRAINT chk_prc2_suppliers_sourcing_type;
ALTER TABLE wms_warehouses VALIDATE CONSTRAINT chk_wms_warehouses_usage_type;
ALTER TABLE wms_warehouses VALIDATE CONSTRAINT chk_wms_warehouses_facility_class;
ALTER TABLE wms_warehouses VALIDATE CONSTRAINT chk_wms_warehouses_capability;
COMMIT;

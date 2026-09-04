\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
DO $$ DECLARE n int; BEGIN
 IF to_regclass('public.prc2_suppliers') IS NULL OR to_regclass('public.wms_warehouses') IS NULL THEN RAISE EXCEPTION 'required tables missing'; END IF;
 SELECT count(*) INTO n FROM prc2_suppliers; IF n<>34 THEN RAISE EXCEPTION 'supplier total %, expected 34',n; END IF;
 SELECT count(*) INTO n FROM prc2_suppliers WHERE supplier_type IN ('CHICK','FEED','OTHER','PACKAGING','RAW_MATERIAL','VACCINE','VETERINARY'); IF n<>29 THEN RAISE EXCEPTION 'identity supplier count %, expected 29',n; END IF;
 IF (SELECT count(*) FROM prc2_suppliers WHERE (supplier_code,supplier_name,supplier_type) IN (VALUES
   ('LJ-S-006','鞠德清（中粮）','OVERSEAS'),('SUP-00002','张鹏（装修工程）','LOCAL'),('SUP-00003','罗成松','LOCAL'),('SUP-00004','20260705测试','LOCAL'),('SUP-00005','202600708测试','LOCAL')))<>5 THEN RAISE EXCEPTION 'special supplier manifest mismatch'; END IF;
 IF (SELECT count(*) FROM wms_warehouses)<>31 THEN RAISE EXCEPTION 'warehouse total mismatch'; END IF;
 IF (SELECT count(*) FROM wms_warehouses WHERE (warehouse_code,type) IN (VALUES
 ('ST_LAO_AGRI_BKX_001_SALES','EGG_SALES'),('ST_LAO_AGRI_LPB_001_SALES','EGG_SALES'),('ST_LAO_AGRI_MX_001_SALES','EGG_SALES'),('ST_LAO_AGRI_PSL_001_SALES','EGG_SALES'),('ST_LAO_AGRI_VTE_001_SALES','EGG_SALES'),('ST_LAO_AGRI_VTE_WH_001_SALES','EGG_SALES'),
 ('ST_LAO_XINGCHI_DP_001_SALES','EGG_SALES'),('ST_LAO_XINGCHI_HS_001_SALES','EGG_SALES'),('ST_LAO_XINGCHI_XB_001_SALES','EGG_SALES'),('ST_LAO_XINGCHI_XC_001_SALES','EGG_SALES'),
 ('CJ-WH-AGRI-03','GENERAL'),('CJ-WH-FOOD-01','GENERAL'),('CJ-WH-FOOD-03','GENERAL'),('CJ-WH-XINGCHI-01','GENERAL'),('CJ-WH-XINGCHI-03','GENERAL'),('CJ-WH-XINGCHI-04','GENERAL'),('CJ-WH-XINGCHI-05','RAW_MATERIAL'),('CJ-WH-XINGCHI-06','RAW_MATERIAL'),('CJ-WH-XINGCHI-07','COLD_STORAGE'),
 ('LPH_DP_FEED','FEED'),('LPH_DP_MEDICINE','MEDICINE'),('LPH_MS_FEED','FEED'),('LPH_MS_MEDICINE','MEDICINE'),('LPH_MS_RAW','RAW_MATERIAL'),
 ('LPH_DP_EGG_FARM','EGG_FARM'),('LPH_MS_EGG_FARM','EGG_FARM'),('LPH_DP_EGG_SALES','EGG_SALES'),('LPH_MS_EGG_SALES','EGG_SALES'),('LPH_MS_FINISHED','FINISHED'),('LPH_MS_PURCHASE','PURCHASE_RECV')))<>30 THEN RAISE EXCEPTION 'non-null warehouse manifest mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM wms_warehouses WHERE warehouse_code='WH-0001' AND type IS NULL AND domain='TEST') THEN RAISE EXCEPTION 'WH-0001 old-state mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM wms_warehouses WHERE warehouse_code='CJ-WH-XINGCHI-07' AND domain='FINANCE_MAPPING') THEN RAISE EXCEPTION 'cold-store domain mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM prc2_suppliers WHERE supply_category IS NOT NULL OR sourcing_type IS NOT NULL) THEN RAISE EXCEPTION 'supplier rollout already partially applied'; END IF;
 IF EXISTS(SELECT 1 FROM wms_warehouses WHERE facility_class IS NOT NULL OR capability IS NOT NULL) THEN RAISE EXCEPTION 'warehouse rollout already partially applied'; END IF;
END $$;
SELECT supplier_code,supplier_name,supplier_type,status FROM prc2_suppliers ORDER BY supplier_code;
SELECT warehouse_code,warehouse_name,type,domain,company_code,site_code,status FROM wms_warehouses ORDER BY warehouse_code;
ROLLBACK;

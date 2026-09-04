\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
DO $$ BEGIN
 IF (SELECT count(*) FROM prc2_suppliers) <> 34 THEN RAISE EXCEPTION 'supplier total drift'; END IF;
 IF EXISTS (SELECT 1 FROM prc2_suppliers WHERE supply_category IS NULL OR sourcing_type IS NULL OR supply_category NOT IN ('CHICK','FEED','RAW_MATERIAL','PACKAGING','VACCINE','VETERINARY','EQUIPMENT','MEDICINE','SERVICE','OTHER') OR sourcing_type NOT IN ('LOCAL','OVERSEAS','AGENT','UNSPECIFIED')) THEN RAISE EXCEPTION 'supplier domain violation'; END IF;
 IF (SELECT count(*) FROM wms_warehouses) <> 31 THEN RAISE EXCEPTION 'warehouse total drift'; END IF;
 IF EXISTS (SELECT 1 FROM wms_warehouses WHERE type IS NULL OR facility_class IS NULL OR type NOT IN ('EGG_FARM','EGG_SALES','MEDICINE','FEED','RAW_MATERIAL','PURCHASE_RECV','FINISHED','GENERAL') OR facility_class NOT IN ('FACTORY','DISTRIBUTION','STORE','TRANSIT','GENERAL') OR capability IS NOT NULL AND capability <> 'COLD_CHAIN') THEN RAISE EXCEPTION 'warehouse domain violation'; END IF;
 IF (SELECT count(*) FROM wms_warehouses WHERE facility_class='STORE') <> 10 THEN RAISE EXCEPTION 'STORE count drift'; END IF;
 IF NOT EXISTS (SELECT 1 FROM wms_warehouses WHERE warehouse_code='CJ-WH-XINGCHI-07' AND type='GENERAL' AND facility_class='GENERAL' AND capability='COLD_CHAIN' AND domain='FINANCE_MAPPING') THEN RAISE EXCEPTION 'cold store assertion failed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM wms_warehouses WHERE warehouse_code='WH-0001' AND type='GENERAL' AND facility_class='GENERAL' AND domain='TEST') THEN RAISE EXCEPTION 'WH-0001 assertion failed'; END IF;
END $$;
SELECT supply_category,sourcing_type,count(*) FROM prc2_suppliers GROUP BY 1,2 ORDER BY 1,2;
SELECT type,facility_class,capability,domain,count(*) FROM wms_warehouses GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;
SELECT warehouse_code,type,facility_class FROM wms_warehouses WHERE type IN ('FEED','MEDICINE','PURCHASE_RECV','RAW_MATERIAL','EGG_FARM') ORDER BY 1;
ROLLBACK;

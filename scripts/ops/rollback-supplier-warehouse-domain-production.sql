\set ON_ERROR_STOP on
BEGIN;
-- Guarded rollback: restore legacy supplier_type-derived rows only while current governed values still equal this rollout's targets.
UPDATE prc2_suppliers SET supply_category=NULL,sourcing_type=NULL,updated_at=NOW()
 WHERE supplier_type IN ('CHICK','FEED','OTHER','PACKAGING','RAW_MATERIAL','VACCINE','VETERINARY')
   AND supply_category=supplier_type AND sourcing_type='UNSPECIFIED';
UPDATE prc2_suppliers SET supply_category=NULL,sourcing_type=NULL,updated_at=NOW()
 WHERE (supplier_code,supply_category,sourcing_type) IN (VALUES
 ('LJ-S-006','FEED','OVERSEAS'),('SUP-00002','SERVICE','LOCAL'),('SUP-00003','OTHER','LOCAL'),('SUP-00004','OTHER','LOCAL'),('SUP-00005','OTHER','LOCAL'));
-- Warehouse rollback is intentionally explicit and current-target guarded.
UPDATE wms_warehouses SET type='COLD_STORAGE',facility_class=NULL,capability=NULL,updated_at=NOW()
 WHERE warehouse_code='CJ-WH-XINGCHI-07' AND type='GENERAL' AND facility_class='GENERAL' AND capability='COLD_CHAIN' AND domain='FINANCE_MAPPING';
UPDATE wms_warehouses SET type=NULL,facility_class=NULL,capability=NULL,updated_at=NOW()
 WHERE warehouse_code='WH-0001' AND type='GENERAL' AND facility_class='GENERAL' AND capability IS NULL AND domain='TEST';
UPDATE wms_warehouses SET facility_class=NULL,capability=NULL,updated_at=NOW()
 WHERE warehouse_code NOT IN ('CJ-WH-XINGCHI-07','WH-0001') AND facility_class IN ('FACTORY','DISTRIBUTION','STORE','TRANSIT','GENERAL') AND capability IS NULL;
COMMIT;

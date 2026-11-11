#!/usr/bin/env bash
set -euo pipefail

# Disposable E2E-only bootstrap. It refuses to run unless explicitly marked as
# test mode, so production credentials/databases cannot be targeted by
# accident. The final line is the JSON consumed by
# apps/web/e2e/support/replenishment-fixture.ts.
if [[ "${E2E_DB:-}" != "1" || "${NODE_ENV:-}" != "test" ]]; then
  echo "seed-e2e-replenishment-fixture requires E2E_DB=1 and NODE_ENV=test" >&2
  exit 1
fi

PSQL_BIN="${PSQL_BIN:-psql}"
PSQL=("$PSQL_BIN" -X -v ON_ERROR_STOP=1)
if [[ -n "${DATABASE_URL:-}" ]]; then PSQL+=("$DATABASE_URL"); fi
OUT_FILE="${1:-}"

if [[ "${2:-}" == "--clean" ]]; then
  "${PSQL[@]}" <<'SQL'
BEGIN;
DELETE FROM inv_batches WHERE batch_no LIKE 'E2E-REPLENISH-%';
DELETE FROM brd_flocks WHERE flock_no='PW-FLOCK-001';
DELETE FROM brd_houses WHERE house_code='PW-HOUSE-001';
DELETE FROM brd_farms WHERE farm_code='PW-FARM-001';
DELETE FROM sys_organizations WHERE org_code='E2E-REPLENISH-SITE' AND org_type='SITE';
DELETE FROM product_skus WHERE sku_code='E2E-REPLENISH-SKU';
DELETE FROM packaging_specs WHERE spec_code='E2E-SPEC';
DELETE FROM product_grades WHERE grade_code='E2E-GRADE';
DELETE FROM mst_products WHERE product_code='E2E-REPLENISH-PRODUCT';
DELETE FROM store_warehouse_bindings WHERE store_id IN (SELECT id FROM store_master WHERE store_code='E2E-REPLENISH-STORE');
DELETE FROM wms_warehouses WHERE warehouse_code IN ('E2E-REPLENISH-SRC','E2E-REPLENISH-TGT');
DELETE FROM store_master WHERE store_code='E2E-REPLENISH-STORE';
COMMIT;
SQL
  exit 0
fi

"${PSQL[@]}" <<'SQL'
BEGIN;
-- Explicit standard breed, never inferred from a legacy label or dictionary order.
INSERT INTO sys_dict (dict_type,dict_code,dict_label_zh,dict_label_lo,dict_label_en,dict_value,sort_no,status,name)
VALUES ('BRD_BREED','HY_LINE_BROWN','海兰褐','','Hy-Line Brown','HY_LINE_BROWN',10,'ACTIVE','品种')
ON CONFLICT (dict_type,dict_code) DO UPDATE SET status='ACTIVE',dict_label_zh=EXCLUDED.dict_label_zh;

-- Real organization ownership, not ALL or a guessed site/farm-code alias.
-- The COMPANY is also used by seed-e2e-replenishment-users.sh; keep it on clean.
INSERT INTO sys_organizations (org_code,org_name,org_type,level,status,company_code)
VALUES ('E2E-COMPANY','E2E company','COMPANY',1,'ACTIVE','E2E-COMPANY')
ON CONFLICT (org_code) DO UPDATE SET org_type='COMPANY',status='ACTIVE',company_code=EXCLUDED.company_code;
INSERT INTO sys_organizations (org_code,org_name,org_type,parent_id,level,status,company_code)
SELECT 'E2E-REPLENISH-SITE','E2E flock site','SITE',c.id,2,'ACTIVE',c.company_code
FROM sys_organizations c WHERE c.org_code='E2E-COMPANY' AND c.org_type='COMPANY' AND c.status='ACTIVE'
ON CONFLICT (org_code) DO UPDATE SET org_type='SITE',parent_id=EXCLUDED.parent_id,status='ACTIVE',company_code=EXCLUDED.company_code;

INSERT INTO brd_farms (farm_code,farm_name,location,status,capacity,store_code,company_code,mapped_site_code)
VALUES ('PW-FARM-001','E2E flock farm','E2E','ACTIVE',10000,'E2E-REPLENISH-STORE','E2E-COMPANY','E2E-REPLENISH-SITE')
ON CONFLICT (farm_code) DO UPDATE SET status='ACTIVE',capacity=10000,store_code='E2E-REPLENISH-STORE',company_code=EXCLUDED.company_code,mapped_site_code=EXCLUDED.mapped_site_code;
INSERT INTO brd_houses (house_code,house_name,farm_code,status,house_type,capacity,current_birds)
VALUES ('PW-HOUSE-001','E2E flock house','PW-FARM-001','ACTIVE','LAYER',5000,900)
ON CONFLICT (house_code) DO UPDATE SET farm_code=EXCLUDED.farm_code,status='ACTIVE',capacity=5000,current_birds=900;
INSERT INTO brd_flocks (flock_no,house_code,farm_code,company_code,site_code,breed_code,strain,placement_date,initial_qty,current_qty,status,start_date,current_lay_rate,breed_type,store_code)
VALUES ('PW-FLOCK-001','PW-HOUSE-001','PW-FARM-001','E2E-COMPANY','E2E-REPLENISH-SITE','HY_LINE_BROWN','海兰褐',CURRENT_DATE,900,900,'LAYING',CURRENT_DATE,92.5,'海兰褐','E2E-REPLENISH-STORE')
ON CONFLICT (flock_no) DO UPDATE SET house_code='PW-HOUSE-001',farm_code='PW-FARM-001',company_code=EXCLUDED.company_code,site_code=EXCLUDED.site_code,breed_code=EXCLUDED.breed_code,strain=EXCLUDED.strain,breed_type=EXCLUDED.breed_type,status='LAYING',current_qty=900,initial_qty=900;

INSERT INTO store_master (store_code,store_name,company_code,status,timezone)
VALUES ('E2E-REPLENISH-STORE','E2E replenishment store','E2E-COMPANY','ACTIVE','Asia/Vientiane')
ON CONFLICT (store_code) DO UPDATE SET status='ACTIVE',company_code='E2E-COMPANY';

INSERT INTO wms_warehouses
  (warehouse_code,warehouse_name,company_code,store_code,status,domain,type,owner_store_id)
SELECT 'E2E-REPLENISH-SRC','E2E replenishment source','E2E-COMPANY','ALL','ACTIVE','OPERATIONAL','GENERAL',NULL
ON CONFLICT (warehouse_code) DO UPDATE SET status='ACTIVE',domain='OPERATIONAL';

INSERT INTO wms_warehouses
  (warehouse_code,warehouse_name,company_code,store_code,status,domain,type,owner_store_id)
SELECT 'E2E-REPLENISH-TGT','E2E replenishment target','E2E-COMPANY','E2E-REPLENISH-STORE','ACTIVE','OPERATIONAL','EGG_SALES',s.id
FROM store_master s WHERE s.store_code='E2E-REPLENISH-STORE'
ON CONFLICT (warehouse_code) DO UPDATE SET status='ACTIVE',domain='OPERATIONAL',owner_store_id=EXCLUDED.owner_store_id;

DELETE FROM store_warehouse_bindings
WHERE store_id=(SELECT id FROM store_master WHERE store_code='E2E-REPLENISH-STORE')
  AND warehouse_code='E2E-REPLENISH-TGT' AND purpose='SALES';
INSERT INTO store_warehouse_bindings
  (store_id,warehouse_code,purpose,priority,status,effective_from,effective_to)
SELECT s.id,'E2E-REPLENISH-TGT','SALES',1,'ACTIVE',CURRENT_DATE,NULL
FROM store_master s WHERE s.store_code='E2E-REPLENISH-STORE'
;

-- Replenishment uses sale/stock SKU policy: all three parents must exist and
-- be ACTIVE, with a grade usable for both sales and stock. Fix the fixture,
-- not SkuPolicy; re-running also repairs older incomplete E2E seeds.
INSERT INTO mst_products (product_code,product_name_zh,status)
VALUES ('E2E-REPLENISH-PRODUCT','E2E replenishment egg','ACTIVE')
ON CONFLICT (product_code) DO UPDATE SET status='ACTIVE';
INSERT INTO product_grades (grade_code,grade_name,is_saleable,is_storable,status)
VALUES ('E2E-GRADE','E2E replenishment grade',TRUE,TRUE,'ACTIVE')
ON CONFLICT (grade_code) DO UPDATE SET status='ACTIVE',is_saleable=TRUE,is_storable=TRUE;
INSERT INTO packaging_specs (spec_code,spec_name,qty_per_unit,base_unit,display_unit,status)
VALUES ('E2E-SPEC','E2E replenishment loose egg',1,'枚','枚','ACTIVE')
ON CONFLICT (spec_code) DO UPDATE SET status='ACTIVE',qty_per_unit=1,base_unit='枚',display_unit='枚';

INSERT INTO product_skus
  (sku_code,product_code,product_name,grade_code,spec_code,sku_name,status)
VALUES ('E2E-REPLENISH-SKU','E2E-REPLENISH-PRODUCT','E2E replenishment egg','E2E-GRADE','E2E-SPEC','E2E replenishment SKU','ACTIVE')
ON CONFLICT (sku_code) DO UPDATE SET status='ACTIVE';

INSERT INTO inv_batches
  (batch_no,product_code,sku_code,qty,qty_available,status,warehouse_code,store_code,company_code,expire_date)
VALUES ('E2E-REPLENISH-BATCH','E2E-REPLENISH-PRODUCT','E2E-REPLENISH-SKU',100,100,'AVAILABLE','E2E-REPLENISH-SRC','E2E-REPLENISH-STORE','E2E-COMPANY',CURRENT_DATE+30)
ON CONFLICT (batch_no) DO UPDATE SET sku_code='E2E-REPLENISH-SKU',qty=100,qty_available=100,status='AVAILABLE',warehouse_code='E2E-REPLENISH-SRC',store_code='E2E-REPLENISH-STORE',company_code='E2E-COMPANY';
COMMIT;
SQL

json=$("${PSQL[@]}" -Atc "SELECT json_build_object('storeCode','E2E-REPLENISH-STORE','sourceWarehouseCode','E2E-REPLENISH-SRC','skuCode','E2E-REPLENISH-SKU','qty',1)::text")
if [[ -n "$OUT_FILE" ]]; then printf '%s\n' "$json" > "$OUT_FILE"; else printf '%s\n' "$json"; fi

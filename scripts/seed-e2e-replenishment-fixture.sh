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
DELETE FROM product_skus WHERE sku_code='E2E-REPLENISH-SKU';
DELETE FROM store_warehouse_bindings WHERE store_id IN (SELECT id FROM store_master WHERE store_code='E2E-REPLENISH-STORE');
DELETE FROM wms_warehouses WHERE warehouse_code IN ('E2E-REPLENISH-SRC','E2E-REPLENISH-TGT');
DELETE FROM store_master WHERE store_code='E2E-REPLENISH-STORE';
COMMIT;
SQL
  exit 0
fi

"${PSQL[@]}" <<'SQL'
BEGIN;
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

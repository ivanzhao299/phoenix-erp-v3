#!/usr/bin/env bash
# Local/UAT-only, repeatable vaccine master and inventory seed.
# This script is intentionally separate from production migrations. It never
# runs automatically and uses UAT-* keys so it can be cleaned safely.
set -eu

PSQL="${PSQL:-$(command -v psql || true)}"
DB="${DB_NAME:-phoenix_erp}"
if [ -z "$PSQL" ]; then
  echo "psql not found" >&2
  exit 1
fi

run_sql() { "$PSQL" "$DB" -v ON_ERROR_STOP=1 -q "$@"; }

if [ "${1:-}" = "--clean" ]; then
  run_sql -c "DELETE FROM inv_batches WHERE batch_no LIKE 'UAT-VAC-%';"
  run_sql -c "DELETE FROM brd_medications WHERE medication_code LIKE 'UAT-VAC-%';"
fi

run_sql <<'SQL'
INSERT INTO brd_medications
  (medication_code, medication_name, dosage, status, store_code, product_type,
   unit_code, default_route, default_withdraw_days)
VALUES
  ('UAT-VAC-ND', 'UAT 新城疫疫苗', '1000 dose/vial', 'ACTIVE', 'ALL', 'VACCINE', 'DOSE', 'DRINKING_WATER', 0),
  ('UAT-VAC-AI', 'UAT 禽流感疫苗', '500 dose/vial', 'ACTIVE', 'ALL', 'VACCINE', 'DOSE', 'INJECTION', 0)
ON CONFLICT (medication_code) DO UPDATE SET
  medication_name = EXCLUDED.medication_name,
  status = 'ACTIVE',
  store_code = 'ALL',
  product_type = 'VACCINE',
  unit_code = EXCLUDED.unit_code,
  default_route = EXCLUDED.default_route,
  default_withdraw_days = EXCLUDED.default_withdraw_days;

INSERT INTO inv_batches
  (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, expire_date, inbound_date)
SELECT 'UAT-VAC-ND-LOT-01', 'UAT-VAC-ND', 10000, 10000, 'AVAILABLE', w.warehouse_code, COALESCE(w.site_code, 'ALL'), CURRENT_DATE + 365, CURRENT_DATE
  FROM wms_warehouses w
 WHERE w.type = 'MEDICINE' AND w.status = 'ACTIVE'
 ORDER BY w.warehouse_code
 LIMIT 1
ON CONFLICT (batch_no) DO UPDATE SET qty = 10000, qty_available = 10000, status = 'AVAILABLE';

INSERT INTO inv_batches
  (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, expire_date, inbound_date)
SELECT 'UAT-VAC-AI-LOT-01', 'UAT-VAC-AI', 5000, 5000, 'AVAILABLE', w.warehouse_code, COALESCE(w.site_code, 'ALL'), CURRENT_DATE + 365, CURRENT_DATE
  FROM wms_warehouses w
 WHERE w.type = 'MEDICINE' AND w.status = 'ACTIVE'
 ORDER BY w.warehouse_code
 LIMIT 1
ON CONFLICT (batch_no) DO UPDATE SET qty = 5000, qty_available = 5000, status = 'AVAILABLE';
SQL

echo "UAT vaccine master ready: UAT-VAC-ND, UAT-VAC-AI"

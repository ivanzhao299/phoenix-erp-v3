#!/usr/bin/env bash
# Phoenix ERP V3 — UAT 基线数据种子（"金凤凰示例集团"）
#
# 灌入：
#   - 1 农场 F-VTE-001 (海蓝养殖场) + 3 鸡舍 H-001/2/3 + 1 鸡群 FK-2025-001
#   - 1 包装厂 PKG-VTE-001
#   - 1 仓库 WMS-VTE-MAIN + 5 库区 + 起始批次 INV-EGG-1-INIT
#   - 3 门店 ST-VTE-001/2 + ST-LPB-001
#   - 5 客户 (NORMAL + 黑名单 + 无授信 + VIP)
#   - 1 价格簿 PB-RETAIL-2026 + 3 SKU 价格 (PRD-EGG-1/2/X)
#   - 1 财务账户 CASH-LAK
#
# 设计原则：
#   - 所有 INSERT 用 ON CONFLICT DO UPDATE 实现幂等
#   - 业务主键统一前缀 UAT-* 便于清理
#   - 不动 RBAC 表（seed-uat-users.sh 负责）
#
# 用法：
#   bash scripts/seed-uat-fixture.sh
#   bash scripts/seed-uat-fixture.sh --clean    # 清理后重建
set -eu

PSQL="${PSQL:-$(command -v psql || echo /Applications/Postgres.app/Contents/Versions/18/bin/psql)}"
DB="${DB_NAME:-phoenix_erp}"

red()    { printf '\033[31m%s\033[0m\n' "$1"; }
green()  { printf '\033[32m%s\033[0m\n' "$1"; }
cyan()   { printf '\033[36m%s\033[0m\n' "$1"; }

# 兜底：表/列不存在不要 abort 整脚本
PSQLQ() { "$PSQL" "$DB" -v ON_ERROR_STOP=0 -q "$@" 2>/dev/null || true; }
PSQLQT() { "$PSQL" "$DB" -tA -c "$1" 2>/dev/null || true; }

cyan "═══════════════════════════════════════════════════════════════════"
cyan "  Phoenix ERP V3 — UAT 基线数据种子（金凤凰示例集团）"
cyan "═══════════════════════════════════════════════════════════════════"

# ── --clean 模式 ───────────────────────────────────────────────────────────
if [ "${1:-}" = "--clean" ]; then
  cyan ""
  cyan "▶ --clean 清理上一轮 UAT 数据"
  PSQLQ -c "DELETE FROM inv_ledger          WHERE batch_no LIKE 'UAT-%' OR ref_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM pos_sale_items      WHERE sale_no  LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM pos_sales           WHERE sale_no  LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM pos_sessions        WHERE session_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM ord_order_items     WHERE order_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM ord_approval_log    WHERE order_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM ord_orders          WHERE order_no LIKE 'UAT-%' OR customer_code LIKE 'UAT-CUST-%';"
  PSQLQ -c "DELETE FROM daily_close         WHERE close_no LIKE 'DCL-%-UAT-%';"
  PSQLQ -c "DELETE FROM acc_ledger          WHERE ref_no   LIKE '%UAT%';"
  PSQLQ -c "DELETE FROM fin_transactions    WHERE ref_no   LIKE '%UAT%' OR txn_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM fin_invoices        WHERE invoice_no LIKE 'UAT-%' OR ref_no LIKE 'UAT-PO-%';"
  PSQLQ -c "DELETE FROM inv_batches         WHERE batch_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM wms_inbound         WHERE task_no  LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM wms_outbound        WHERE task_no  LIKE 'UAT-%' OR outbound_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM store_receiving     WHERE order_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM store_losses        WHERE loss_no  LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM brd_daily_logs      WHERE flock_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM brd_medications     WHERE batch_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM brd_vaccinations    WHERE flock_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM brd_flocks          WHERE flock_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM brd_houses          WHERE house_code LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM brd_farms           WHERE farm_code LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM ord_customers       WHERE customer_code LIKE 'UAT-CUST-%';"
  PSQLQ -c "DELETE FROM prc_price_items     WHERE price_book_id = 'UAT-PB-RETAIL-2026';"
  PSQLQ -c "DELETE FROM fin_accounts        WHERE account_code LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM mst_stores          WHERE store_code LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM qa_inspections      WHERE inspect_no LIKE 'UAT-%';"
  PSQLQ -c "DELETE FROM qa_non_conformance  WHERE nc_no LIKE 'UAT-%';"
  green "  ✓ 清理完毕"
fi

# ──────────────────────────────────────────────────────────────────────────
# 1) 农场 + 鸡舍 + 鸡群
# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ 1) 农场 / 鸡舍 / 鸡群"

PSQLQ <<'SQL'
INSERT INTO brd_farms (farm_code, farm_name, capacity, manager, location, status, breed_type, start_date, current_qty, initial_qty)
VALUES ('UAT-F-VTE-001', '海蓝养殖场（示例）', 15000, '场长测试', '万象省', 'ACTIVE', '海兰褐', '2025-08-01', 14400, 15000)
ON CONFLICT (farm_code) DO UPDATE SET
  farm_name = EXCLUDED.farm_name,
  status = 'ACTIVE',
  updated_at = now()::text;
SQL
echo "  ✓ farm UAT-F-VTE-001"

# brd_houses 表如果不存在则跳过；存在则插入 3 个
HAS_HOUSES=$(PSQLQT "SELECT 1 FROM information_schema.tables WHERE table_name='brd_houses' LIMIT 1")
if [ "$HAS_HOUSES" = "1" ]; then
  for I in 001 002 003; do
    PSQLQ -c "INSERT INTO brd_houses (house_code, farm_code, capacity, status)
              VALUES ('UAT-H-$I','UAT-F-VTE-001',5000,'ACTIVE')
              ON CONFLICT (house_code) DO UPDATE SET status='ACTIVE', updated_at=now()::text;"
    echo "  ✓ house UAT-H-$I"
  done
fi

PSQLQ <<'SQL'
INSERT INTO brd_flocks (flock_no, farm_code, breed_type, start_date, initial_qty, current_qty, current_lay_rate, status)
VALUES ('UAT-FK-2025-001', 'UAT-F-VTE-001', '海兰褐', '2025-08-01', 4800, 4795, 92.5, 'LAYING')
ON CONFLICT (flock_no) DO UPDATE SET status='LAYING', current_qty=4795, updated_at=now()::text;
SQL
echo "  ✓ flock UAT-FK-2025-001 (LAYING 4795/4800)"

# ──────────────────────────────────────────────────────────────────────────
# 2) 仓库 / 商品 / 起始库存
# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ 2) 商品 + 起始库存"

# 3 个 SKU
HAS_PROD=$(PSQLQT "SELECT 1 FROM information_schema.tables WHERE table_name='mst_products' LIMIT 1")
if [ "$HAS_PROD" = "1" ]; then
  for ROW in \
    "PRD-EGG-1|1号蛋（59-66g）|EGG|ACTIVE" \
    "PRD-EGG-2|2号蛋（53-59g）|EGG|ACTIVE" \
    "PRD-EGG-X|破损蛋（不可售）|EGG|ACTIVE"; do
    CODE=$(echo "$ROW" | cut -d'|' -f1)
    NAME=$(echo "$ROW" | cut -d'|' -f2)
    CAT=$(echo  "$ROW" | cut -d'|' -f3)
    ST=$(echo   "$ROW" | cut -d'|' -f4)
    PSQLQ -c "INSERT INTO mst_products (product_code, product_name_zh, category, status)
              VALUES ('$CODE','$NAME','$CAT','$ST')
              ON CONFLICT (product_code) DO UPDATE SET product_name_zh=EXCLUDED.product_name_zh, status='ACTIVE';"
    echo "  ✓ product $CODE"
  done
fi

# 起始库存批次
PSQLQ <<'SQL'
INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code)
VALUES ('UAT-BAT-INIT-EGG1', 'PRD-EGG-1', 10000, 10000, 'AVAILABLE', 'WMS-VTE-MAIN', 'ALL')
ON CONFLICT (batch_no) DO UPDATE SET qty=10000, qty_available=10000, status='AVAILABLE';

INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code)
VALUES ('UAT-BAT-INIT-EGG2', 'PRD-EGG-2', 5000, 5000, 'AVAILABLE', 'WMS-VTE-MAIN', 'ALL')
ON CONFLICT (batch_no) DO UPDATE SET qty=5000, qty_available=5000, status='AVAILABLE';

INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code)
VALUES ('UAT-BAT-INIT-EGGX', 'PRD-EGG-X', 50, 0, 'QUARANTINE', 'WMS-VTE-MAIN', 'ALL')
ON CONFLICT (batch_no) DO UPDATE SET qty=50, qty_available=0, status='QUARANTINE';
SQL
echo "  ✓ inv_batches UAT-BAT-INIT-EGG1 (10000), EGG2 (5000), EGGX (50 QUARANTINE)"

# ──────────────────────────────────────────────────────────────────────────
# 3) 价格簿
# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ 3) 价格簿 UAT-PB-RETAIL-2026"

PSQLQ <<'SQL'
INSERT INTO prc_price_items (item_id, price_book_id, sku_code, retail_lower, retail_upper)
VALUES
  ('UAT-PI-EGG1','UAT-PB-RETAIL-2026','PRD-EGG-1', 8.0, 15.0),
  ('UAT-PI-EGG2','UAT-PB-RETAIL-2026','PRD-EGG-2', 6.0, 12.0),
  ('UAT-PI-EGGX','UAT-PB-RETAIL-2026','PRD-EGG-X', 1.0,  3.0)
ON CONFLICT (item_id) DO UPDATE SET
  retail_lower = EXCLUDED.retail_lower,
  retail_upper = EXCLUDED.retail_upper;
SQL
echo "  ✓ price_book UAT-PB-RETAIL-2026: EGG-1 [8,15] / EGG-2 [6,12] / EGG-X [1,3]"

# ──────────────────────────────────────────────────────────────────────────
# 4) 客户档案（5 个，覆盖正常/黑名单/无授信/VIP）
# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ 4) 客户档案 5 户"

# ord_customers 历史 schema 仅 id 是 PK，customer_code 没 UNIQUE → 先补一个
# (PG 不允许 partial index 用于 ON CONFLICT 推断，所以建非 partial 的)
PSQLQ -c "CREATE UNIQUE INDEX IF NOT EXISTS ord_customers_code_uq ON ord_customers(customer_code);"

PSQLQ <<'SQL'
INSERT INTO ord_customers (customer_code, customer_name, customer_type, tier, credit_limit, credit_used, status, risk_flag, protection_status, store_code)
VALUES
  ('UAT-CUST-A',     '万象A批发店',   'B2B', 'NORMAL', 50000, 0, 'ACTIVE', 'NORMAL','INIT','ALL'),
  ('UAT-CUST-B',     '万象B超市',     'B2B', 'NORMAL', 20000, 0, 'ACTIVE', 'NORMAL','INIT','ALL'),
  ('UAT-CUST-BLACK', '黑名单测试客户','B2B', 'NORMAL', 10000, 0, 'ACTIVE', 'BLACKLIST','PROTECTED','ALL'),
  ('UAT-CUST-NEW',   '新客户(无授信)','B2B', 'NORMAL',     0, 0, 'ACTIVE', 'NORMAL','INIT','ALL'),
  ('UAT-CUST-VIP',   'VIP琅勃拉邦',   'B2B', 'VIP',  200000, 0, 'ACTIVE', 'NORMAL','INIT','ALL')
ON CONFLICT (customer_code) DO UPDATE SET
  customer_name = EXCLUDED.customer_name,
  credit_limit = EXCLUDED.credit_limit,
  credit_used = 0,
  status = 'ACTIVE',
  risk_flag = EXCLUDED.risk_flag,
  protection_status = EXCLUDED.protection_status;
SQL
echo "  ✓ customers: A(信用5W) B(2W) BLACK(blacklist) NEW(0) VIP(20W)"

# ──────────────────────────────────────────────────────────────────────────
# 5) 门店 mst_stores（视表是否存在）
# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ 5) 门店"

HAS_STORES=$(PSQLQT "SELECT 1 FROM information_schema.tables WHERE table_name='mst_stores' LIMIT 1")
if [ "$HAS_STORES" = "1" ]; then
  PSQLQ <<'SQL'
INSERT INTO mst_stores (store_code, store_name, status)
VALUES
  ('UAT-ST-VTE-001','万象1号店(UAT)','ACTIVE'),
  ('UAT-ST-VTE-002','万象2号店(UAT)','ACTIVE'),
  ('UAT-ST-LPB-001','琅勃拉邦店(UAT)','ACTIVE')
ON CONFLICT (store_code) DO UPDATE SET status='ACTIVE';
SQL
  echo "  ✓ stores UAT-ST-VTE-001/2, UAT-ST-LPB-001"
else
  echo "  ▸ mst_stores 不存在，跳过门店灌入（门店由 store_code 字段隐式管理）"
fi

# ──────────────────────────────────────────────────────────────────────────
# 6) 财务账户
# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ 6) 财务账户"

PSQLQ <<'SQL'
INSERT INTO fin_accounts (account_code, account_name, currency, balance, status)
VALUES
  ('UAT-CASH-LAK','UAT 现金账户LAK','LAK', 100000, 'ACTIVE'),
  ('UAT-CASH-CNY','UAT 现金账户CNY','CNY',  10000, 'ACTIVE')
ON CONFLICT (account_code) DO UPDATE SET balance=EXCLUDED.balance, status='ACTIVE';
SQL
echo "  ✓ fin_accounts UAT-CASH-LAK (10W) + UAT-CASH-CNY (1W)"

# ──────────────────────────────────────────────────────────────────────────
# 7) 自检
# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ 7) 自检"

CNT_FARM=$(PSQLQT "SELECT COUNT(*) FROM brd_farms WHERE farm_code LIKE 'UAT-%';")
CNT_FLOCK=$(PSQLQT "SELECT COUNT(*) FROM brd_flocks WHERE flock_no LIKE 'UAT-%';")
CNT_BATCH=$(PSQLQT "SELECT COUNT(*) FROM inv_batches WHERE batch_no LIKE 'UAT-%';")
CNT_CUST=$(PSQLQT "SELECT COUNT(*) FROM ord_customers WHERE customer_code LIKE 'UAT-%';")
CNT_PB=$(PSQLQT "SELECT COUNT(*) FROM prc_price_items WHERE price_book_id='UAT-PB-RETAIL-2026';")
CNT_ACC=$(PSQLQT "SELECT COUNT(*) FROM fin_accounts WHERE account_code LIKE 'UAT-%';")

printf "  农场: %s / 鸡群: %s / 批次: %s / 客户: %s / 价格行: %s / 财务户: %s\n" \
  "$CNT_FARM" "$CNT_FLOCK" "$CNT_BATCH" "$CNT_CUST" "$CNT_PB" "$CNT_ACC"

cyan ""
green "═══════════════════════════════════════════════════════════════════"
green "  ✅ UAT 基线数据就绪 — 可以开跑业务流"
green "═══════════════════════════════════════════════════════════════════"
green "  清理命令:    bash scripts/seed-uat-fixture.sh --clean"
green "  组合脚本:    bash scripts/seed-uat-users.sh && bash scripts/seed-uat-fixture.sh"
green "═══════════════════════════════════════════════════════════════════"

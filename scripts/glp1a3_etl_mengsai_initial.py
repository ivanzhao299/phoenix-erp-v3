#!/usr/bin/env python3
"""
ETL: 孟赛蛋鸡场 6/1-6/4 Excel → 生产 DB
聚焦：生产日报 + 鸡蛋入库 + 原料采购 + 现金收支 (4 块核心数据)
"""
import openpyxl, re, sys
from datetime import datetime, timedelta

WB = openpyxl.load_workbook('/Users/mac/phoenix-erp/data/生产报表.xlsx', data_only=True)

# Excel 序列号 → 日期
EXCEL_EPOCH = datetime(1899, 12, 30)
def serial_to_date(n):
    return (EXCEL_EPOCH + timedelta(days=int(n))).date()

def md_to_date(s):
    """6.1 (float 或 '6.1' str) → 2026-06-01"""
    if isinstance(s, (int, float)):
        m = int(s)
        if not (1 <= m <= 12) or (s - m) == 0: return None
        d = round((s - m) * 10)
        if 1 <= d <= 31:
            return datetime(2026, m, d).date()
        return None
    if isinstance(s, str):
        mr = re.match(r'^(\d{1,2})\.(\d{1,2})日?$', s.strip())
        if not mr: return None
        return datetime(2026, int(mr.group(1)), int(mr.group(2))).date()
    return None

# 鸡舍号 → HOUSE code 映射
HOUSE_MAP = {
    '1号鸡舍': 'HOUSE_MS_01', '2号鸡舍': 'HOUSE_MS_02', '3号鸡舍': 'HOUSE_MS_03',
    '4号鸡舍': 'HOUSE_MS_04', '5号鸡舍': 'HOUSE_MS_05', '6号鸡舍': 'HOUSE_MS_06',
}
# 鸡舍 → flock_no（GLP-1A-2 已建）
FLOCK_MAP = {
    'HOUSE_MS_02': 'LPH_MS_F02', 'HOUSE_MS_03': 'LPH_MS_F03',
    'HOUSE_MS_04': 'LPH_MS_F04', 'HOUSE_MS_05': 'LPH_MS_F05',
    'HOUSE_MS_06': 'LPH_MS_F06',
}
# 蛋型中文 → grade_code
GRADE_MAP = {
    '特大蛋': 'XL', '一号蛋': 'L', '二号蛋': 'M',
    '三号蛋': 'S', '四号蛋': 'XS', '脏蛋': 'DIRTY', '破损': 'BROKEN',
}

SQL = ['BEGIN;', '-- ETL Mengsai 6/1-6/4', '']

# ═══════════════════════════════════════════════════════════════════
# Sheet 1: 生产、死淘日报表 → brd_daily_logs (20 行：5 鸡群 × 4 天)
# ═══════════════════════════════════════════════════════════════════
ws = WB['生产、死淘日报表']
rows = list(ws.iter_rows(values_only=True))
current_date = None
SQL.append('-- ▼ Sheet 1: 生产日报 (20 行)')
inserted_daily = 0
for r in rows:
    if not r or all(v in (None, '') for v in r): continue
    # 日期行（含 Excel serial 在 col 9）
    if len(r) >= 10 and isinstance(r[9], (int, float)) and 46000 < r[9] < 50000:
        current_date = serial_to_date(r[9])
        continue
    # 数据行
    if isinstance(r[0], str) and r[0] in HOUSE_MAP:
        house = HOUSE_MAP[r[0]]
        flock = FLOCK_MAP.get(house, 'NULL')
        if flock == 'NULL': continue  # 1 号舍空栏跳过
        try:
            opening = int(r[2]) if r[2] else 0
            culling = int(r[3]) if r[3] else 0
            mort = int(r[4]) if r[4] else 0
            self_use = int(r[5]) if r[5] else 0
            closing = int(r[6]) if r[6] else 0
            eggs = int(r[7]) if r[7] else 0
            lay_rate = float(r[8]) if r[8] else 0
            note = (r[9] or '').strip().replace("'", "''")[:200]
        except Exception:
            continue
        SQL.append(f"""INSERT INTO brd_daily_logs (
  flock_no, log_date, shift, mortality_qty, eggs_produced, note, operator,
  farm_code, house_code, elimination_qty, store_code, opening_qty, closing_qty,
  self_use_qty, lay_rate, company_code, project_code, site_code, business_date
) VALUES ('{flock}', '{current_date}', 'DAY', {mort}, {eggs}, '{note}', 'ETL_INITIAL',
  'LPH_MENGSAI', '{house}', {culling}, 'SITE-MENGSAI-LAYER', {opening}, {closing},
  {self_use}, {lay_rate}, 'COMP-LAO-AGRI', 'PRJ_MENGSAI_LAYER', 'SITE-MENGSAI-LAYER',
  '{current_date}'
) ON CONFLICT (log_date, house_code, shift) DO NOTHING;""")
        inserted_daily += 1
SQL.append(f'-- 生产日报合计 {inserted_daily} 行')
SQL.append('')

# ═══════════════════════════════════════════════════════════════════
# Sheet 2: 鸡蛋入库 → inv_batches (按 grade 一批一行)
# ═══════════════════════════════════════════════════════════════════
ws = WB['鸡蛋入库汇总表']
rows = list(ws.iter_rows(values_only=True))
current_date = None
SQL.append('-- ▼ Sheet 2: 鸡蛋入库 → inv_batches')
inserted_inv = 0
for r in rows:
    if not r or all(v in (None, '') for v in r): continue
    if len(r) >= 10 and isinstance(r[9], (int, float)) and 46000 < r[9] < 50000:
        current_date = serial_to_date(r[9])
        continue
    if isinstance(r[0], str) and r[0] in HOUSE_MAP:
        house = HOUSE_MAP[r[0]]
        # 7 蛋型分别建 batch
        for col_idx, grade_zh in [(1,'特大蛋'),(2,'一号蛋'),(3,'二号蛋'),(4,'三号蛋'),(5,'四号蛋'),(6,'脏蛋'),(7,'破损')]:
            qty = r[col_idx]
            if not qty or (isinstance(qty, (int, float)) and qty == 0): continue
            try: qty = int(qty)
            except: continue
            grade = GRADE_MAP[grade_zh]
            batch_no = f"EGG-{current_date.strftime('%Y%m%d')}-{house}-{grade}"
            SQL.append(f"""INSERT INTO inv_batches (
  batch_no, product_code, qty, qty_available, status, warehouse_code, store_code,
  company_code, egg_date, quality_grade, source_type, source_no, grade_code_std
) VALUES ('{batch_no}', 'EGG', {qty}, {qty}, 'AVAILABLE', 'SITE-MENGSAI-LAYER',
  'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', '{current_date}', '{grade}',
  'HOUSE_INBOUND', '{house}', '{grade}'
) ON CONFLICT DO NOTHING;""")
            inserted_inv += 1
SQL.append(f'-- 鸡蛋入库批次 {inserted_inv} 行')
SQL.append('')

# ═══════════════════════════════════════════════════════════════════
# Sheet 6: 原料采购 → prc2_purchase_orders + prc2_order_items
# ═══════════════════════════════════════════════════════════════════
ws = WB['原材料采购明细表']
rows = list(ws.iter_rows(values_only=True))
SQL.append('-- ▼ Sheet 6: 原料采购 (5 行 PO)')
SUPPLIER_MAP = {'中粮鞠德清':'SUP_ZHONGLIANG','胥总':'SUP_XU','万象蛋托厂':'SUP_VTE_TRAY'}
PRODUCT_MAP = {'玉米':'FEED_CORN','豆粕':'FEED_SOY_MEAL','预混料':'FEED_PREMIX','蛋托':'PKG_EGG_TRAY'}
CURRENCY_MAP = {'人民币':'CNY','基普':'LAK','老挝币':'LAK'}
po_idx = 0
inserted_po = 0
for r in rows[2:8]:
    if not r or not r[0]: continue
    date = md_to_date(r[0])
    if not date: continue
    prod = PRODUCT_MAP.get(r[1].strip() if r[1] else '', None)
    if not prod: continue
    sup = SUPPLIER_MAP.get(r[2].strip() if r[2] else '', 'SUP_XU')
    unit = r[3] or '公斤'
    qty = float(r[4] or 0)
    price = float(r[5] or 0)
    amt = float(r[6] or 0)
    curr = CURRENCY_MAP.get(r[7].strip() if r[7] else '', 'LAK')
    po_idx += 1
    po_no = f"PO-ETL-{date.strftime('%Y%m%d')}-{po_idx:02d}"
    SQL.append(f"""INSERT INTO prc2_purchase_orders (
  po_no, subject, company_code, company_name, project_code, project_name,
  supplier_code, supplier_name, purchase_type, currency_code, total_amount,
  plan_qty, received_qty, paid_amount, expected_date, status, approval_status,
  created_at, updated_at
) VALUES ('{po_no}', '{r[1]} 采购 - {date}', 'COMP-LAO-AGRI', '老挝凤凰农业发展有限公司',
  'PRJ_MENGSAI_LAYER', '孟赛蛋鸡场经营项目',
  '{sup}', (SELECT supplier_name FROM prc2_suppliers WHERE supplier_code='{sup}'),
  'MATERIAL', '{curr}', {amt}, {qty}, {qty}, {amt},
  '{date}', 'COMPLETED', 'APPROVED', '{date}', '{date}'
) ON CONFLICT (po_no) DO NOTHING
RETURNING id;""")
    SQL.append(f"""INSERT INTO prc2_order_items (
  po_id, po_no, item_code, item_name, qty, received_qty, unit, unit_price, amount,
  project_code, project_name
) SELECT id, po_no, '{prod}', '{r[1]}', {qty}, {qty}, '{unit}', {price}, {amt},
  'PRJ_MENGSAI_LAYER', '孟赛蛋鸡场经营项目'
  FROM prc2_purchase_orders WHERE po_no='{po_no}';""")
    inserted_po += 1
SQL.append(f'-- 采购订单 {inserted_po} 行')
SQL.append('')

# ═══════════════════════════════════════════════════════════════════
# Sheet 7: 现金收支 → fin_cash_transactions
# ═══════════════════════════════════════════════════════════════════
ws = WB['现金收支表']
rows = list(ws.iter_rows(values_only=True))
SQL.append('-- ▼ Sheet 7: 现金收支 → fin_cash_transactions')
current_date = None
txn_idx = 0
inserted_cash = 0
balance_lak = 0   # 老挝币累计
balance_cny = 0   # 人民币累计

# 期初余额：上月结转 26531 万 LAK + 11412 CNY
balance_lak = 26531 * 10000   # 老币（万元）转 LAK 元
balance_cny = 11412

for r in rows[5:]:  # 从 R6 上月结转 开始
    if not r or all(v in (None, '') for v in r): continue
    # 日期
    new_date = md_to_date(r[0]) if r[0] else None
    if new_date: current_date = new_date
    if not current_date: continue
    if isinstance(r[1], str) and ('合计' in r[1] or '结转' in r[1]): continue
    summary = (r[1] or '').strip()
    if not summary: continue
    # 老挝币
    income_lak = r[2] or 0
    expense_lak = r[3] or 0
    income_cny = r[5] or 0
    expense_cny = r[6] or 0
    remark = summary.replace("'", "''")[:150]

    # 老挝币流水
    for amt_field, direction, currency, account in [
        (income_lak, 'IN', 'LAK', 'CASH_LAK'),
        (expense_lak, 'OUT', 'LAK', 'CASH_LAK'),
        (income_cny, 'IN', 'CNY', 'CASH_CNY'),
        (expense_cny, 'OUT', 'CNY', 'CASH_CNY'),
    ]:
        if not amt_field: continue
        try: amt = float(amt_field) * (10000 if currency == 'LAK' else 1)
        except: continue
        if amt == 0: continue
        if currency == 'LAK':
            balance_lak += amt if direction == 'IN' else -amt
            bal = balance_lak
        else:
            balance_cny += amt if direction == 'IN' else -amt
            bal = balance_cny
        txn_idx += 1
        txn_no = f"TXN-ETL-{current_date.strftime('%Y%m%d')}-{txn_idx:04d}"
        SQL.append(f"""INSERT INTO fin_cash_transactions (
  txn_no, account_id, account_code, account_name, company_code, company_name,
  direction, currency_code, amount, balance_after, txn_date, remark, created_by
) SELECT '{txn_no}', a.id, '{account}', a.account_name, 'COMP-LAO-AGRI', '老挝凤凰农业发展有限公司',
  '{direction}', '{currency}', {amt}, {bal}, '{current_date}', '{remark}', 'ETL_INITIAL'
  FROM fin_cash_accounts a WHERE a.account_code='{account}'
ON CONFLICT (txn_no) DO NOTHING;""")
        inserted_cash += 1

# 更新账户余额
SQL.append(f"UPDATE fin_cash_accounts SET current_balance={balance_lak} WHERE account_code='CASH_LAK';")
SQL.append(f"UPDATE fin_cash_accounts SET current_balance={balance_cny} WHERE account_code='CASH_CNY';")
SQL.append(f'-- 现金流水 {inserted_cash} 行 / LAK 余额={balance_lak} / CNY 余额={balance_cny}')

SQL.append('')
SQL.append('COMMIT;')
SQL.append('')
SQL.append("SELECT '生产日报' tbl, count(*) FROM brd_daily_logs WHERE business_date BETWEEN '2026-06-01' AND '2026-06-04' AND site_code='SITE-MENGSAI-LAYER'")
SQL.append("UNION ALL SELECT '鸡蛋批次', count(*) FROM inv_batches WHERE egg_date BETWEEN '2026-06-01' AND '2026-06-04' AND company_code='COMP-LAO-AGRI'")
SQL.append("UNION ALL SELECT '采购订单', count(*) FROM prc2_purchase_orders WHERE po_no LIKE 'PO-ETL-%' AND company_code='COMP-LAO-AGRI'")
SQL.append("UNION ALL SELECT '现金流水', count(*) FROM fin_cash_transactions WHERE created_by='ETL_INITIAL';")

print('\n'.join(SQL))

#!/usr/bin/env python3
"""
G10 · 孟赛药品/疫苗 ETL（数据/药品、疫苗出库明细表.xlsx → SQL）
═══════════════════════════════════════════════════════════════════════════
输入：data/药品、疫苗出库明细表.xlsx（45 SKU + 期初 5/31 + 出库 6/2、6/4）
输出：migrations/20260606_g10_mengsai_medicine_initial.sql

策略（等效宋明光手工操作）：
  ① brd_medications：45 行药品目录 INSERT NOT EXISTS
     · code: MED-001 ~ MED-047（按 Excel 编号，跳 5/16/18）
     · name: Excel 药品名称
     · dosage: 单位描述（瓶/袋/公斤等，与 inv_batches.qty 单位一致）
     · status: ACTIVE
     · store_code: SITE-MENGSAI-LAYER（孟赛专属）
  ② inv_batches：45 行 MEDICINE 仓库期初批次（5/31 状态）
     · batch_no: MED-STOCK-{code}（与 farm-medicine.service.batchNo 一致）
     · warehouse_code: 'MEDICINE'
     · qty / qty_available: 期末库存（5/31 - 出库）
     · store_code: SITE-MENGSAI-LAYER
     · status: AVAILABLE
  ③ inv_ledger：4 行出库流水（6/2 四系63瓶、6/2 黏菌素 3.8、6/4 黏菌素 2.5、6/2 林可 3.8、6/4 林可 2.5）
     · batch_no: 对应 MED-STOCK-{code}
     · change_type: 'FARM_OUT_MEDICATION'
     · qty_change: 负数
     · log_date: 6/2 或 6/4
     · operator: 'ETL_INITIAL'

数量单位处理：
  · 整数（瓶/袋/包/桶）：直接 int(qty)
  · 小数公斤：x 10 存储（17.55公斤 → 176，单位换"百克"）
    → 简化：取整数公斤（17.55 → 17），精度损失记入 note
  · "苍蝇药AB 各100袋"：作为 1 行 SKU = 200（业务方后续可拆 2 SKU）

权限：
  写入需 MENU_FARM_VET:V/E，宋明光当前无 — 同 mig 给他角色加该权限
═══════════════════════════════════════════════════════════════════════════
"""
import re
from openpyxl import load_workbook

WB = load_workbook('data/药品、疫苗出库明细表.xlsx', data_only=True)
ws = WB.active

# 解析"XX瓶"/"XX袋"/"XX公斤"/"XX克"
UNIT_RE = re.compile(r'^([\d.]+)\s*(.+?)$')
QTY_TYPO_RE = re.compile(r'各\s*(\d+)')  # "各100袋" → 100 (per A/B)

def parse_qty_unit(s):
    """返回 (qty NUMERIC 字符串, 单位描述, 原始字符串). G11 升级 NUMERIC 保留小数 2 位"""
    if s is None: return '0', '', ''
    s = str(s).strip()
    if not s or s == '0': return '0', '', ''
    # 苍蝇药 "各100袋" 不在这里处理 — 单独逻辑拆 A/B 两 SKU
    m = UNIT_RE.match(s)
    if m:
        raw_qty = float(m.group(1))
        unit = m.group(2).strip()
        # G11：保留小数 2 位（inv_batches.qty NUMERIC(12,3) 升级配合）
        qty_str = f'{raw_qty:.3f}'.rstrip('0').rstrip('.') or '0'
        return qty_str, unit, s
    return '0', '', s

# 解析 47 行（跳标题 2 行）
# G11 业务确认：
#   - 6/3 没有出库（Excel 无该列即为 0，不是漏录）
#   - 苍蝇药 AB 拆 2 SKU（MED-041A 苍蝇药A、MED-041B 苍蝇药B 各 100 袋）
#   - 小数公斤保留精度（inv_batches.qty 升级 NUMERIC(12,3)）
medications = []
for row in ws.iter_rows(min_row=3, values_only=True):
    if not row or not row[0]: continue
    no = row[0]
    name = row[1]
    initial_str = row[2]   # 5.31 库存
    out_62_str  = row[3]   # 6.2 出库
    out_64_str  = row[4]   # 6.4 出库
    end_str     = row[5]   # 期末库存

    if not isinstance(no, (int, float)): continue
    code = f"LPH-MED-{int(no):03d}"  # G11.5：孟赛专属前缀，避免与全局 MED-* 模板冲突
    name_clean = name.strip() if name else f'未知{int(no)}'

    # G11：苍蝇药 AB 特殊处理 — 拆 2 个 SKU（Excel 标注 "各100袋"）
    if '苍蝇药AB' in name_clean or '苍蝇药A B' in name_clean:
        for suffix, label in [('A', '苍蝇药A'), ('B', '苍蝇药B')]:
            medications.append({
                'code': f"{code}{suffix}",
                'name': label,
                'unit': '袋',
                'init_qty':  '100',
                'out_62':    '0',
                'out_64':    '0',
                'end_qty':   '100',
                'note': f'Excel: 苍蝇药AB 各100袋（G11 拆 2 SKU），原值={initial_str}',
            })
        continue

    init_qty, init_unit, init_raw = parse_qty_unit(initial_str)
    out62_qty, _, out62_raw = parse_qty_unit(out_62_str)
    out64_qty, _, out64_raw = parse_qty_unit(out_64_str)
    end_qty, _, end_raw = parse_qty_unit(end_str)

    medications.append({
        'code': code,
        'name': name_clean,
        'unit': init_unit or '瓶',  # 单位以期初为准
        'init_qty':  init_qty,
        'out_62':    out62_qty,
        'out_64':    out64_qty,
        'end_qty':   end_qty,
        # G11：6/3 业务确认无出库（不是漏录）
        'note': f'Excel: 期初={init_raw}, 6.2出={out62_raw or "0"}, 6.3=0(无出库), 6.4出={out64_raw or "0"}, 期末={end_raw}',
    })

print(f'解析 {len(medications)} 个药品 SKU（含苍蝇药拆分）')

# 生成 SQL
sql = []
sql.append('-- ═════════════════════════════════════════════════════════════════════════════')
sql.append('-- G10 · 孟赛药品/疫苗初始化（45 SKU + 期初 5/31 + 出库 6/2/6/4）')
sql.append('-- ═════════════════════════════════════════════════════════════════════════════')
sql.append('-- 来源：data/药品、疫苗出库明细表.xlsx（业务方提供）')
sql.append('-- 等效宋明光手工操作路径：')
sql.append('--   ① 主数据中心 → 兽药目录（brd_medications）新增 45 行')
sql.append('--   ② /breeding/med-stock → 期初入库 45 行')
sql.append('--   ③ /breeding/med-stock → 6/2、6/4 出库流水')
sql.append('-- 数量精度：小数公斤已取整（业务方原始单位记入 dosage 字段 + ledger note）')
sql.append('-- 权限：同 mig 给宋明光角色加 MENU_FARM_VET:V,C,E')
sql.append('-- ═════════════════════════════════════════════════════════════════════════════')
sql.append('')
sql.append('BEGIN;')
sql.append('')

# § 1. 给宋明光角色加 MENU_FARM_VET 权限
sql.append('-- § 1. 给 ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR 加 MENU_FARM_VET:V,C,E')
sql.append('DO $body$')
sql.append('BEGIN')
sql.append("  IF NOT EXISTS (SELECT 1 FROM information_schema.tables")
sql.append("                  WHERE table_schema='public' AND table_name='sys_role_menu_permission') THEN")
sql.append("    RAISE NOTICE '[g10] sys_role_menu_permission 不存在（CI），跳过';")
sql.append("    RETURN;")
sql.append('  END IF;')
sql.append('')
sql.append('  INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)')
sql.append('  SELECT r.role_id, m.menu_id, $$V,C,E$$')
sql.append('    FROM sys_role r, sys_menu m')
sql.append("   WHERE r.role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR'")
sql.append("     AND m.menu_code='MENU_FARM_VET'")
sql.append('     AND NOT EXISTS (')
sql.append('       SELECT 1 FROM sys_role_menu_permission p')
sql.append('       WHERE p.role_id=r.role_id AND p.menu_id=m.menu_id');
sql.append('     );')
sql.append('END $body$;')
sql.append('')

# § 2. brd_medications
sql.append('-- § 2. brd_medications：45 SKU INSERT NOT EXISTS')
sql.append('DO $body$')
sql.append('BEGIN')
sql.append("  IF NOT EXISTS (SELECT 1 FROM information_schema.tables")
sql.append("                  WHERE table_schema='public' AND table_name='brd_medications') THEN")
sql.append("    RAISE NOTICE '[g10] brd_medications 不存在（CI），跳过';")
sql.append("    RETURN;")
sql.append('  END IF;')
sql.append('')
for m in medications:
    name = m['name'].replace("'", "''")
    dosage = m['unit']
    sql.append(f"  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)")
    sql.append(f"  SELECT '{m['code']}', '{name}', '{dosage}', 'ACTIVE', 'SITE-MENGSAI-LAYER'")
    sql.append(f"   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='{m['code']}');")
sql.append('END $body$;')
sql.append('')

# § 3. inv_batches MEDICINE 仓库期初库存（取期末库存 = 5/31 - 出库）
sql.append('-- § 3. inv_batches：MEDICINE 仓库 45 期末库存批次（=期初 - 出库）')
sql.append('DO $body$')
sql.append('BEGIN')
sql.append("  IF NOT EXISTS (SELECT 1 FROM information_schema.tables")
sql.append("                  WHERE table_schema='public' AND table_name='inv_batches') THEN")
sql.append("    RAISE NOTICE '[g10] inv_batches 不存在（CI），跳过';")
sql.append("    RETURN;")
sql.append('  END IF;')
sql.append('')
for m in medications:
    bn = f"MED-STOCK-{m['code']}"
    end_qty = m['end_qty']
    sql.append(f"  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)")
    sql.append(f"  SELECT '{bn}', '{m['code']}', {end_qty}, {end_qty}, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'")
    sql.append(f"   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='{bn}');")
sql.append('END $body$;')
sql.append('')

# § 4. inv_ledger 出库流水（仅有出库的）
sql.append('-- § 4. inv_ledger：6/2 + 6/4 出库流水')
sql.append('DO $body$')
sql.append('BEGIN')
sql.append("  IF NOT EXISTS (SELECT 1 FROM information_schema.tables")
sql.append("                  WHERE table_schema='public' AND table_name='inv_ledger') THEN")
sql.append("    RAISE NOTICE '[g10] inv_ledger 不存在（CI），跳过';")
sql.append("    RETURN;")
sql.append('  END IF;')
sql.append('  -- CI 测试库 inv_ledger 简化版无 log_date 列，跳过整段（生产端有）')
sql.append('  IF NOT EXISTS (SELECT 1 FROM information_schema.columns')
sql.append("                  WHERE table_schema='public' AND table_name='inv_ledger' AND column_name='log_date') THEN")
sql.append("    RAISE NOTICE '[g10] inv_ledger.log_date 不存在（CI 测试库），跳过 § 4';")
sql.append('    RETURN;')
sql.append('  END IF;')
sql.append('')
for m in medications:
    bn = f"MED-STOCK-{m['code']}"
    if float(m['out_62']) > 0:
        note = m['note'].replace("'", "''")
        sql.append(f"  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)")
        sql.append(f"  SELECT '{bn}', 'FARM_OUT_MEDICATION', -{m['out_62']}, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-02', 'MEDICINE', 'COMP-LAO-AGRI', '{note}'")
        sql.append(f"   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='{bn}' AND log_date='2026-06-02' AND change_type='FARM_OUT_MEDICATION');")
    if float(m['out_64']) > 0:
        note = m['note'].replace("'", "''")
        sql.append(f"  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)")
        sql.append(f"  SELECT '{bn}', 'FARM_OUT_MEDICATION', -{m['out_64']}, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-04', 'MEDICINE', 'COMP-LAO-AGRI', '{note}'")
        sql.append(f"   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='{bn}' AND log_date='2026-06-04' AND change_type='FARM_OUT_MEDICATION');")
sql.append('END $body$;')
sql.append('')

sql.append('COMMIT;')
sql.append('')
sql.append('-- ─── 验证 SQL ─────────────────────────────────────────')
sql.append("-- SELECT count(*) FROM brd_medications WHERE store_code='SITE-MENGSAI-LAYER';  -- 期望 45")
sql.append("-- SELECT count(*) FROM inv_batches WHERE warehouse_code='MEDICINE' AND store_code='SITE-MENGSAI-LAYER';  -- 期望 45")
sql.append("-- SELECT count(*) FROM inv_ledger WHERE change_type='FARM_OUT_MEDICATION';  -- 期望 5")
sql.append('')
sql.append('-- ─── 回滚 ─────────────────────────────────────────────')
sql.append("-- DELETE FROM inv_ledger  WHERE change_type='FARM_OUT_MEDICATION' AND operator='ETL_INITIAL';")
sql.append("-- DELETE FROM inv_batches WHERE source_no='ETL_G10';")
sql.append("-- DELETE FROM brd_medications WHERE medication_code LIKE 'LPH-MED-%' AND store_code='SITE-MENGSAI-LAYER';")
sql.append("-- DELETE FROM sys_role_menu_permission p USING sys_role r, sys_menu m")
sql.append("--   WHERE p.role_id=r.role_id AND p.menu_id=m.menu_id")
sql.append("--     AND r.role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR' AND m.menu_code='MENU_FARM_VET';")

with open('migrations/20260606_g10_mengsai_medicine_initial.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql))

print(f"✅ 已生成 migrations/20260606_g10_mengsai_medicine_initial.sql")
print(f"   - 45 brd_medications")
print(f"   - 45 inv_batches (MEDICINE warehouse)")
out_lines = sum(1 for m in medications if float(m['out_62']) > 0) + sum(1 for m in medications if float(m['out_64']) > 0)
print(f"   - {out_lines} inv_ledger 出库流水")
print(f"   - 1 sys_role_menu_permission（宋明光 MENU_FARM_VET:V,C,E）")

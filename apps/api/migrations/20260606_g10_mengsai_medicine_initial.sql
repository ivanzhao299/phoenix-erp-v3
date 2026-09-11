-- ═════════════════════════════════════════════════════════════════════════════
-- G10 · 孟赛药品/疫苗初始化（45 SKU + 期初 5/31 + 出库 6/2/6/4）
-- ═════════════════════════════════════════════════════════════════════════════
-- 来源：data/药品、疫苗出库明细表.xlsx（业务方提供）
-- 等效宋明光手工操作路径：
--   ① 主数据中心 → 兽药目录（brd_medications）新增 45 行
--   ② /breeding/med-stock → 期初入库 45 行
--   ③ /breeding/med-stock → 6/2、6/4 出库流水
-- 数量精度：小数公斤已取整（业务方原始单位记入 dosage 字段 + ledger note）
-- 权限：同 mig 给宋明光角色加 MENU_FARM_VET:V,C,E
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- § 1. 给 ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR 加 MENU_FARM_VET:V,C,E
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='sys_role_menu_permission') THEN
    RAISE NOTICE '[g10] sys_role_menu_permission 不存在（CI），跳过';
    RETURN;
  END IF;

  INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
  SELECT r.role_id, m.menu_id, $$V,C,E$$
    FROM sys_role r, sys_menu m
   WHERE r.role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR'
     AND m.menu_code='MENU_FARM_VET'
     AND NOT EXISTS (
       SELECT 1 FROM sys_role_menu_permission p
       WHERE p.role_id=r.role_id AND p.menu_id=m.menu_id
     );
END $body$;

-- § 2. brd_medications：45 SKU INSERT NOT EXISTS
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='brd_medications') THEN
    RAISE NOTICE '[g10] brd_medications 不存在（CI），跳过';
    RETURN;
  END IF;

  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-001', '头孢喹五注射液', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-001');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-002', '感多安H5+H7', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-002');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-003', '多力安新支减流', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-003');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-004', '新流腺', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-004');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-006', '葡萄糖', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-006');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-007', '青梅', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-007');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-008', '新流肽', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-008');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-009', '蝇蛆立净', '包', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-009');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-010', '柴胡注射液', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-010');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-011', '聚维酮碘', '升', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-011');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-012', '浓戊二酸溶液', '升', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-012');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-013', '新胃康', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-013');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-014', '小苏打', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-014');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-015', '氟苯尼考', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-015');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-017', '克隆30', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-017');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-045', '喉炎疫苗', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-045');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-019', '四系', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-019');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-020', '新易支', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-020');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-021', '黏菌素', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-021');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-022', '新霉素', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-022');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-023', '磺胺间甲氧', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-023');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-024', '林可霉素', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-024');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-025', '阿莫西林', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-025');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-026', '地美硝锉', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-026');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-027', '干扰素', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-027');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-028', '泰妙', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-028');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-029', '安普霉素', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-029');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-030', '林可粉剂冠支林', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-030');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-031', 'VC', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-031');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-032', '卡巴匹林钙', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-032');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-033', '卡巴匹林钙', '克', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-033');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-034', '生理盐水', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-034');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-035', '多维益生素', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-035');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-036', '脑痘', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-036');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-037', '多西环素', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-037');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-038', '氯化铵', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-038');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-039', '强力拜固舒', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-039');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-040', '鼻炎水苗', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-040');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-041A', '苍蝇药A', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-041A');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-041B', '苍蝇药B', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-041B');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-042', '鱼肝油', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-042');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-043', '支易佳', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-043');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-044', '头孢噻亏', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-044');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-045', '治梅静', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-045');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-046', '清瘟口服液', '桶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-046');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'LPH-MED-047', '新流二联', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='LPH-MED-047');
END $body$;

-- § 3. inv_batches：MEDICINE 仓库 45 期末库存批次（=期初 - 出库）
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='inv_batches') THEN
    RAISE NOTICE '[g10] inv_batches 不存在（CI），跳过';
    RETURN;
  END IF;

  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-001', 'LPH-MED-001', 44, 44, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-001');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-002', 'LPH-MED-002', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-002');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-003', 'LPH-MED-003', 69, 69, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-003');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-004', 'LPH-MED-004', 20, 20, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-004');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-006', 'LPH-MED-006', 18, 18, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-006');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-007', 'LPH-MED-007', 623, 623, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-007');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-008', 'LPH-MED-008', 107, 107, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-008');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-009', 'LPH-MED-009', 148, 148, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-009');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-010', 'LPH-MED-010', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-010');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-011', 'LPH-MED-011', 25, 25, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-011');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-012', 'LPH-MED-012', 25, 25, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-012');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-013', 'LPH-MED-013', 86, 86, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-013');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-014', 'LPH-MED-014', 412, 412, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-014');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-015', 'LPH-MED-015', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-015');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-017', 'LPH-MED-017', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-017');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-045', 'LPH-MED-045', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-045');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-019', 'LPH-MED-019', 77, 77, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-019');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-020', 'LPH-MED-020', 208, 208, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-020');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-021', 'LPH-MED-021', 11.25, 11.25, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-021');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-022', 'LPH-MED-022', 14.3, 14.3, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-022');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-023', 'LPH-MED-023', 7.2, 7.2, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-023');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-024', 'LPH-MED-024', 13.9, 13.9, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-024');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-025', 'LPH-MED-025', 17.6, 17.6, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-025');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-026', 'LPH-MED-026', 7.65, 7.65, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-026');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-027', 'LPH-MED-027', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-027');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-028', 'LPH-MED-028', 35, 35, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-028');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-029', 'LPH-MED-029', 2.1, 2.1, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-029');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-030', 'LPH-MED-030', 63, 63, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-030');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-031', 'LPH-MED-031', 2.6, 2.6, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-031');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-032', 'LPH-MED-032', 1, 1, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-032');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-033', 'LPH-MED-033', 53600, 53600, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-033');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-034', 'LPH-MED-034', 2, 2, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-034');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-035', 'LPH-MED-035', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-035');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-036', 'LPH-MED-036', 120, 120, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-036');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-037', 'LPH-MED-037', 44.8, 44.8, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-037');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-038', 'LPH-MED-038', 10.6, 10.6, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-038');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-039', 'LPH-MED-039', 14, 14, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-039');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-040', 'LPH-MED-040', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-040');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-041A', 'LPH-MED-041A', 100, 100, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-041A');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-041B', 'LPH-MED-041B', 100, 100, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-041B');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-042', 'LPH-MED-042', 500, 500, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-042');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-043', 'LPH-MED-043', 160, 160, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-043');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-044', 'LPH-MED-044', 24.95, 24.95, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-044');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-045', 'LPH-MED-045', 182, 182, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-045');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-046', 'LPH-MED-046', 1, 1, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-046');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-LPH-MED-047', 'LPH-MED-047', 15, 15, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-LPH-MED-047');
END $body$;

-- § 4. inv_ledger：6/2 + 6/4 出库流水
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='inv_ledger') THEN
    RAISE NOTICE '[g10] inv_ledger 不存在（CI），跳过';
    RETURN;
  END IF;
  -- CI 测试库 inv_ledger 简化版无 log_date 列，跳过整段（生产端有）
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='inv_ledger' AND column_name='log_date') THEN
    RAISE NOTICE '[g10] inv_ledger.log_date 不存在（CI 测试库），跳过 § 4';
    RETURN;
  END IF;

  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)
  SELECT 'MED-STOCK-LPH-MED-019', 'FARM_OUT_MEDICATION', -63, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-02', 'MEDICINE', 'COMP-LAO-AGRI', 'Excel: 期初=140瓶, 6.2出=63瓶, 6.3=0(无出库), 6.4出=0, 期末=77瓶'
   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='MED-STOCK-LPH-MED-019' AND log_date='2026-06-02' AND change_type='FARM_OUT_MEDICATION');
  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)
  SELECT 'MED-STOCK-LPH-MED-021', 'FARM_OUT_MEDICATION', -3.8, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-02', 'MEDICINE', 'COMP-LAO-AGRI', 'Excel: 期初=17.55公斤, 6.2出=3.8公斤, 6.3=0(无出库), 6.4出=2.5公斤, 期末=11.25公斤'
   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='MED-STOCK-LPH-MED-021' AND log_date='2026-06-02' AND change_type='FARM_OUT_MEDICATION');
  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)
  SELECT 'MED-STOCK-LPH-MED-021', 'FARM_OUT_MEDICATION', -2.5, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-04', 'MEDICINE', 'COMP-LAO-AGRI', 'Excel: 期初=17.55公斤, 6.2出=3.8公斤, 6.3=0(无出库), 6.4出=2.5公斤, 期末=11.25公斤'
   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='MED-STOCK-LPH-MED-021' AND log_date='2026-06-04' AND change_type='FARM_OUT_MEDICATION');
  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)
  SELECT 'MED-STOCK-LPH-MED-024', 'FARM_OUT_MEDICATION', -3.8, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-02', 'MEDICINE', 'COMP-LAO-AGRI', 'Excel: 期初=20.2公斤, 6.2出=3.8公斤, 6.3=0(无出库), 6.4出=2.5公斤, 期末=13.9公斤'
   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='MED-STOCK-LPH-MED-024' AND log_date='2026-06-02' AND change_type='FARM_OUT_MEDICATION');
  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)
  SELECT 'MED-STOCK-LPH-MED-024', 'FARM_OUT_MEDICATION', -2.5, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-04', 'MEDICINE', 'COMP-LAO-AGRI', 'Excel: 期初=20.2公斤, 6.2出=3.8公斤, 6.3=0(无出库), 6.4出=2.5公斤, 期末=13.9公斤'
   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='MED-STOCK-LPH-MED-024' AND log_date='2026-06-04' AND change_type='FARM_OUT_MEDICATION');
END $body$;

COMMIT;

-- ─── 验证 SQL ─────────────────────────────────────────
-- SELECT count(*) FROM brd_medications WHERE store_code='SITE-MENGSAI-LAYER';  -- 期望 45
-- SELECT count(*) FROM inv_batches WHERE warehouse_code='MEDICINE' AND store_code='SITE-MENGSAI-LAYER';  -- 期望 45
-- SELECT count(*) FROM inv_ledger WHERE change_type='FARM_OUT_MEDICATION';  -- 期望 4

-- ─── 回滚 ─────────────────────────────────────────────
-- DELETE FROM inv_ledger  WHERE change_type='FARM_OUT_MEDICATION' AND operator='ETL_INITIAL';
-- DELETE FROM inv_batches WHERE source_no='ETL_G10';
-- DELETE FROM brd_medications WHERE medication_code LIKE 'MED-0__' AND store_code='SITE-MENGSAI-LAYER';
-- DELETE FROM sys_role_menu_permission p USING sys_role r, sys_menu m
--   WHERE p.role_id=r.role_id AND p.menu_id=m.menu_id
--     AND r.role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR' AND m.menu_code='MENU_FARM_VET';

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
  SELECT 'MED-001', '头孢喹五注射液', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-001');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-002', '感多安H5+H7', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-002');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-003', '多力安新支减流', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-003');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-004', '新流腺', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-004');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-006', '葡萄糖', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-006');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-007', '青梅', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-007');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-008', '新流肽', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-008');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-009', '蝇蛆立净', '包', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-009');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-010', '柴胡注射液', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-010');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-011', '聚维酮碘', '升', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-011');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-012', '浓戊二酸溶液', '升', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-012');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-013', '新胃康', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-013');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-014', '小苏打', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-014');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-015', '氟苯尼考', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-015');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-017', '克隆30', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-017');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-045', '喉炎疫苗', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-045');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-019', '四系', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-019');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-020', '新易支', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-020');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-021', '黏菌素', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-021');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-022', '新霉素', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-022');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-023', '磺胺间甲氧', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-023');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-024', '林可霉素', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-024');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-025', '阿莫西林', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-025');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-026', '地美硝锉', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-026');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-027', '干扰素', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-027');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-028', '泰妙', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-028');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-029', '安普霉素', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-029');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-030', '林可粉剂冠支林', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-030');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-031', 'VC', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-031');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-032', '卡巴匹林钙', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-032');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-033', '卡巴匹林钙', '克', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-033');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-034', '生理盐水', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-034');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-035', '多维益生素', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-035');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-036', '脑痘', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-036');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-037', '多西环素', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-037');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-038', '氯化铵', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-038');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-039', '强力拜固舒', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-039');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-040', '鼻炎水苗', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-040');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-041A', '苍蝇药A', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-041A');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-041B', '苍蝇药B', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-041B');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-042', '鱼肝油', '袋', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-042');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-043', '支易佳', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-043');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-044', '头孢噻亏', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-044');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-045', '治梅静', '公斤', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-045');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-046', '清瘟口服液', '桶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-046');
  INSERT INTO brd_medications (medication_code, medication_name, dosage, status, store_code)
  SELECT 'MED-047', '新流二联', '瓶', 'ACTIVE', 'SITE-MENGSAI-LAYER'
   WHERE NOT EXISTS (SELECT 1 FROM brd_medications WHERE medication_code='MED-047');
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
  SELECT 'MED-STOCK-MED-001', 'MED-001', 44, 44, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-001');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-002', 'MED-002', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-002');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-003', 'MED-003', 69, 69, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-003');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-004', 'MED-004', 20, 20, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-004');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-006', 'MED-006', 18, 18, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-006');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-007', 'MED-007', 623, 623, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-007');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-008', 'MED-008', 107, 107, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-008');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-009', 'MED-009', 148, 148, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-009');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-010', 'MED-010', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-010');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-011', 'MED-011', 25, 25, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-011');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-012', 'MED-012', 25, 25, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-012');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-013', 'MED-013', 86, 86, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-013');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-014', 'MED-014', 412, 412, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-014');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-015', 'MED-015', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-015');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-017', 'MED-017', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-017');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-045', 'MED-045', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-045');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-019', 'MED-019', 77, 77, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-019');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-020', 'MED-020', 208, 208, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-020');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-021', 'MED-021', 11.25, 11.25, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-021');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-022', 'MED-022', 14.3, 14.3, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-022');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-023', 'MED-023', 7.2, 7.2, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-023');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-024', 'MED-024', 13.9, 13.9, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-024');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-025', 'MED-025', 17.6, 17.6, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-025');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-026', 'MED-026', 7.65, 7.65, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-026');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-027', 'MED-027', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-027');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-028', 'MED-028', 35, 35, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-028');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-029', 'MED-029', 2.1, 2.1, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-029');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-030', 'MED-030', 63, 63, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-030');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-031', 'MED-031', 2.6, 2.6, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-031');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-032', 'MED-032', 1, 1, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-032');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-033', 'MED-033', 53600, 53600, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-033');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-034', 'MED-034', 2, 2, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-034');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-035', 'MED-035', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-035');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-036', 'MED-036', 120, 120, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-036');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-037', 'MED-037', 44.8, 44.8, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-037');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-038', 'MED-038', 10.6, 10.6, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-038');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-039', 'MED-039', 14, 14, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-039');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-040', 'MED-040', 0, 0, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-040');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-041A', 'MED-041A', 100, 100, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-041A');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-041B', 'MED-041B', 100, 100, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-041B');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-042', 'MED-042', 500, 500, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-042');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-043', 'MED-043', 160, 160, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-043');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-044', 'MED-044', 24.95, 24.95, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-044');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-045', 'MED-045', 182, 182, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-045');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-046', 'MED-046', 1, 1, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-046');
  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)
  SELECT 'MED-STOCK-MED-047', 'MED-047', 15, 15, 'AVAILABLE', 'MEDICINE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI', 'INITIAL', 'ETL_G10'
   WHERE NOT EXISTS (SELECT 1 FROM inv_batches WHERE batch_no='MED-STOCK-MED-047');
END $body$;

-- § 4. inv_ledger：6/2 + 6/4 出库流水
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='inv_ledger') THEN
    RAISE NOTICE '[g10] inv_ledger 不存在（CI），跳过';
    RETURN;
  END IF;

  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)
  SELECT 'MED-STOCK-MED-019', 'FARM_OUT_MEDICATION', -63, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-02', 'MEDICINE', 'COMP-LAO-AGRI', 'Excel: 期初=140瓶, 6.2出=63瓶, 6.3=0(无出库), 6.4出=0, 期末=77瓶'
   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='MED-STOCK-MED-019' AND log_date='2026-06-02' AND change_type='FARM_OUT_MEDICATION');
  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)
  SELECT 'MED-STOCK-MED-021', 'FARM_OUT_MEDICATION', -3.8, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-02', 'MEDICINE', 'COMP-LAO-AGRI', 'Excel: 期初=17.55公斤, 6.2出=3.8公斤, 6.3=0(无出库), 6.4出=2.5公斤, 期末=11.25公斤'
   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='MED-STOCK-MED-021' AND log_date='2026-06-02' AND change_type='FARM_OUT_MEDICATION');
  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)
  SELECT 'MED-STOCK-MED-021', 'FARM_OUT_MEDICATION', -2.5, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-04', 'MEDICINE', 'COMP-LAO-AGRI', 'Excel: 期初=17.55公斤, 6.2出=3.8公斤, 6.3=0(无出库), 6.4出=2.5公斤, 期末=11.25公斤'
   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='MED-STOCK-MED-021' AND log_date='2026-06-04' AND change_type='FARM_OUT_MEDICATION');
  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)
  SELECT 'MED-STOCK-MED-024', 'FARM_OUT_MEDICATION', -3.8, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-02', 'MEDICINE', 'COMP-LAO-AGRI', 'Excel: 期初=20.2公斤, 6.2出=3.8公斤, 6.3=0(无出库), 6.4出=2.5公斤, 期末=13.9公斤'
   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='MED-STOCK-MED-024' AND log_date='2026-06-02' AND change_type='FARM_OUT_MEDICATION');
  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)
  SELECT 'MED-STOCK-MED-024', 'FARM_OUT_MEDICATION', -2.5, 'ETL_INITIAL', 'SITE-MENGSAI-LAYER', '2026-06-04', 'MEDICINE', 'COMP-LAO-AGRI', 'Excel: 期初=20.2公斤, 6.2出=3.8公斤, 6.3=0(无出库), 6.4出=2.5公斤, 期末=13.9公斤'
   WHERE NOT EXISTS (SELECT 1 FROM inv_ledger WHERE batch_no='MED-STOCK-MED-024' AND log_date='2026-06-04' AND change_type='FARM_OUT_MEDICATION');
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
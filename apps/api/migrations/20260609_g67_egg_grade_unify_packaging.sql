-- ════════════════════════════════════════════════════════════════════════
-- G67：蛋等级统一到包装方案（1~5号）— product_grades 主数据 realign
-- ════════════════════════════════════════════════════════════════════════
-- 决策（用户 2026-06-09）：可售等级统一为包装的 1号/2号/3号/4号/5号，
--   存 product_grades 主数据（单一源；养殖日报 useProductGrades + 包装终端
--   BFF /terminal/dicts + 销售 都读它，realign 后全链路自动统一）。
--   缺陷等级保留现有 4 档（脏蛋/裂缝蛋/破蛋/损坏蛋）。
-- 旧方案处理（用户："不管以前的等级，无正式生产数据，可重来"）：
--   - 可售 XL/L/M/S/XS（特大/一号..四号）→ DEPRECATED。
--   - AA/A/B/C（特级/一级/二级/三级）此前已 DEPRECATED，不动。
--   - 缺陷 DIRTY/CRACKED/BROKEN/DAMAGED 保持 ACTIVE。
-- grade_code 即 BFF 的 terminalCode（bff.controller PKG_EGG_GRADE 映射）。
-- 幂等：ADD COLUMN IF NOT EXISTS + INSERT WHERE NOT EXISTS + UPDATE 限定旧码。
-- ⚠️ 注意：28 个 product_skus 引用旧码 AA/A/B/C，realign 后需另行重建 SKU
--   （用户已确认无正式生产数据、可重来；本迁移不动 SKU，留待 SKU 重建）。
-- ════════════════════════════════════════════════════════════════════════

-- 1) 加 weight_range 列（重量段；BFF 将扩展为透传给包装终端）
ALTER TABLE product_grades ADD COLUMN IF NOT EXISTS weight_range varchar(20);

-- 2) 旧可售尺寸等级 XL/L/M/S/XS → DEPRECATED
UPDATE product_grades SET status='DEPRECATED', updated_at=now()
WHERE grade_code IN ('XL','L','M','S','XS') AND status='ACTIVE';

-- 3) 写入 canonical 1~5号 可售等级（幂等）
INSERT INTO product_grades (grade_code, grade_name, grade_name_lo, sort_order, is_saleable, is_storable, weight_range, status)
SELECT v.code, v.zh, v.lo, v.so, true, true, v.wr, 'ACTIVE'
FROM (VALUES
  ('GRADE_1','1号蛋','ໄຂ່ຊັ້ນ 1',10,'59-66g'),
  ('GRADE_2','2号蛋','ໄຂ່ຊັ້ນ 2',20,'53-59g'),
  ('GRADE_3','3号蛋','ໄຂ່ຊັ້ນ 3',30,'46-53g'),
  ('GRADE_4','4号蛋','ໄຂ່ຊັ້ນ 4',40,'40-46g'),
  ('GRADE_5','5号蛋','ໄຂ່ຊັ້ນ 5',50,'30-40g')
) AS v(code, zh, lo, so, wr)
WHERE NOT EXISTS (SELECT 1 FROM product_grades pg WHERE pg.grade_code = v.code);
-- 缺陷等级（脏/裂/破/损坏）保持 ACTIVE 不动；sort_order 60~90 本就在可售之后。

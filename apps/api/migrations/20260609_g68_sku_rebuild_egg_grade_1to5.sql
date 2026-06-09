-- ════════════════════════════════════════════════════════════════════════
-- G68：SKU 按 1~5号等级重建（承接 G67 蛋等级统一）
-- ════════════════════════════════════════════════════════════════════════
-- 背景：G67 把 product_grades 可售等级统一为 GRADE_1..5(1~5号)。旧 28 个 SKU
--   绑在已废弃的 AA/A/B/C 上（4 等级 × 7 规格）。用户确认无正式生产数据、要求
--   清掉旧 SKU 按 1~5号重建。
-- 处理：
--   1) 旧 SKU(grade AA/A/B/C) → status=ARCHIVED（"清掉"的安全可逆形式：移出
--      ACTIVE，SKU 选择器/产品主数据不再显示；不硬删以防孤立销售/库存引用）。
--   2) 重建 5 等级(1~5号) × 7 规格 = 35 个 SKU（CROSS JOIN 生成，幂等）。
-- product_skus 非 sys_dict，无字典保护；幂等 UPDATE 限定旧码 + INSERT WHERE NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

-- 1) 归档旧 AA/A/B/C SKU
UPDATE product_skus SET status='ARCHIVED', updated_at=now()
WHERE grade_code IN ('AA','A','B','C') AND status <> 'ARCHIVED';

-- 2) 重建 1~5号 × 7规格 = 35 SKU（幂等）
INSERT INTO product_skus (sku_code, product_code, product_name, grade_code, spec_code, sku_name, status)
SELECT 'SKU-' || g.num || '-' || s.spec_code,
       'PRD-EGG-' || g.num,
       g.gname,
       g.gcode,
       s.spec_code,
       g.gname || ' ' || s.spec_name,
       'ACTIVE'
FROM (VALUES
  ('1','GRADE_1','1号蛋'),
  ('2','GRADE_2','2号蛋'),
  ('3','GRADE_3','3号蛋'),
  ('4','GRADE_4','4号蛋'),
  ('5','GRADE_5','5号蛋')
) AS g(num, gcode, gname)
CROSS JOIN (VALUES
  ('LOOSE','散装'),
  ('TRAY30','30枚/托'),
  ('TRAY36','36枚/托'),
  ('BOX360','360枚/箱'),
  ('BOX720','720枚/箱'),
  ('GIFT12','礼盒装 12枚'),
  ('GIFT24','礼盒装 24枚')
) AS s(spec_code, spec_name)
WHERE NOT EXISTS (
  SELECT 1 FROM product_skus px WHERE px.sku_code = 'SKU-' || g.num || '-' || s.spec_code
);

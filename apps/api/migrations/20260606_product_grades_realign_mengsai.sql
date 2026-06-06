-- ═════════════════════════════════════════════════════════════════════════════
-- product_grades 等级主数据回归孟赛业务真实口径
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：
--   product_grades 原 seed（H2，2026-05-30）是泛化品质等级 AA/A/B/C — 占位用，
--   非任何真实业务口径。孟赛实际 Excel 表头按尺寸分档：
--     特大蛋 / 一号蛋 / 二号蛋 / 三号蛋 / 四号蛋 / 脏蛋 / 破损
--   对应 codes：XL / L / M / S / XS / DIRTY / BROKEN
--   ETL（scripts/glp1a3_etl_mengsai_initial.py）已按此 MAP 写入 inv_batches，
--   126 行 grade_code_std = XL/L/M/S/XS，但 product_grades 表里没这些 codes →
--   前端 useProductGrades 拉回 AA/A/B/C，与历史数据 + 业务方习惯完全不匹配。
--
-- 修法（不破坏 FK 完整性）：
--   1) AA/A/B/C 4 档标 DEPRECATED — 旧 product_skus 仍可引用，前端 useProductGrades
--      只展示 ACTIVE，业务方录入不再看到。
--   2) XL/L/M/S/XS 5 档新增 ACTIVE（孟赛 Excel 真实表头）
--   3) DIRTY / BROKEN 已存在则保持；CRACKED / DAMAGED 保留 ACTIVE 作为质量异常档备用
--   4) sort_order 调整：XL(10)/L(20)/M(30)/S(40)/XS(50)/DIRTY(60)/CRACKED(70)/BROKEN(80)/DAMAGED(90)
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='product_grades') THEN
    RAISE NOTICE '[product_grades_realign_mengsai] product_grades 不存在（CI），跳过';
    RETURN;
  END IF;

  -- 1) 老占位等级 AA/A/B/C 标 DEPRECATED
  EXECUTE $$UPDATE product_grades
              SET status='DEPRECATED',
                  remark = COALESCE(remark, '') || ' [2026-06-06 孟赛业务口径回归，停用占位品质档]'
            WHERE grade_code IN ('AA','A','B','C') AND status='ACTIVE'$$;

  -- 2) 新增孟赛业务真实尺寸档 XL/L/M/S/XS（幂等 ON CONFLICT）
  EXECUTE $$
    INSERT INTO product_grades (grade_code, grade_name, grade_name_lo, sort_order, is_saleable, is_storable, status, remark)
    VALUES
      ('XL', '特大蛋', 'Extra Large', 10, TRUE, TRUE, 'ACTIVE', '孟赛业务尺寸档：≥66g'),
      ('L',  '一号蛋', 'Large',       20, TRUE, TRUE, 'ACTIVE', '孟赛业务尺寸档：59-66g · 主流销售档'),
      ('M',  '二号蛋', 'Medium',      30, TRUE, TRUE, 'ACTIVE', '孟赛业务尺寸档：53-59g'),
      ('S',  '三号蛋', 'Small',       40, TRUE, TRUE, 'ACTIVE', '孟赛业务尺寸档：46-53g'),
      ('XS', '四号蛋', 'Extra Small', 50, TRUE, TRUE, 'ACTIVE', '孟赛业务尺寸档：40-46g')
    ON CONFLICT (grade_code) DO UPDATE
      SET grade_name    = EXCLUDED.grade_name,
          grade_name_lo = EXCLUDED.grade_name_lo,
          sort_order    = EXCLUDED.sort_order,
          is_saleable   = EXCLUDED.is_saleable,
          is_storable   = EXCLUDED.is_storable,
          status        = 'ACTIVE',
          remark        = EXCLUDED.remark
      WHERE product_grades.status = 'ACTIVE'
         OR product_grades.status = 'DEPRECATED' -- 重启
  $$;

  -- 3) DIRTY / CRACKED / BROKEN / DAMAGED 调整 sort_order，确保排在尺寸档之后
  EXECUTE $$UPDATE product_grades SET sort_order=60 WHERE grade_code='DIRTY'   AND status='ACTIVE'$$;
  EXECUTE $$UPDATE product_grades SET sort_order=70 WHERE grade_code='CRACKED' AND status='ACTIVE'$$;
  EXECUTE $$UPDATE product_grades SET sort_order=80 WHERE grade_code='BROKEN'  AND status='ACTIVE'$$;
  EXECUTE $$UPDATE product_grades SET sort_order=90 WHERE grade_code='DAMAGED' AND status='ACTIVE'$$;

  RAISE NOTICE '[product_grades_realign_mengsai] 完成：ACTIVE = XL/L/M/S/XS/DIRTY/CRACKED/BROKEN/DAMAGED；DEPRECATED = AA/A/B/C';
END $body$;

COMMIT;

-- ─── 回滚 ───────────────────────────────────────────
--   UPDATE product_grades SET status='ACTIVE' WHERE grade_code IN ('AA','A','B','C');
--   UPDATE product_grades SET status='DEPRECATED' WHERE grade_code IN ('XL','L','M','S','XS');

-- ═════════════════════════════════════════════════════════════════════════════
-- G5 收尾 · sys_dict.PKG_EGG_GRADE 标 DEPRECATED（BFF 已切到 product_grades）
-- ═════════════════════════════════════════════════════════════════════════════
-- 2026-06-06 等级收口（commit 06e13f7 / a0338fb）之后 BFF /dicts endpoint 对
-- PKG_EGG_GRADE 类型已切到 product_grades 主数据读取，sys_dict.PKG_EGG_GRADE 7 档
-- 实质已无活引用。前 2 周观察期已过，标 DEPRECATED 锁死，主数据中心 UI 提示业务方
-- 后续维护走 /api/product-master/grades。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  affected INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='sys_dict') THEN
    RAISE NOTICE '[g5_cleanup_pkg_egg_grade] sys_dict 不存在（CI），跳过';
    RETURN;
  END IF;

  EXECUTE $$UPDATE sys_dict
              SET status='DEPRECATED'
            WHERE dict_type='PKG_EGG_GRADE'
              AND status='ACTIVE'$$;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '[g5_cleanup_pkg_egg_grade] PKG_EGG_GRADE % 行标 DEPRECATED；权威源 = product_grades', affected;
END $body$;

COMMIT;

-- 回滚：UPDATE sys_dict SET status='ACTIVE' WHERE dict_type='PKG_EGG_GRADE' AND status='DEPRECATED';

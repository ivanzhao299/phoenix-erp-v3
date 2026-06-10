-- ============================================================================
-- G81：将 mst_stores 直营店纳入组织架构 sys_organizations 作为 STORE 节点
--      挂到对应公司（COMPANY）下，level = 公司 level + 1
-- 幂等：org_code 已存在则回填 parent/level/path（兼容已由 API 创建的节点）；否则插入
-- 公司映射来自 mst_stores.region 的 "/<company_code>" 后缀
-- ============================================================================
DO $$
DECLARE
  r        RECORD;
  v_pid    BIGINT;
  v_ppath  TEXT;
  v_plevel INT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('STORE-XC-001',  '特区直营店',     'COMP-LAO-XINGCHI'),
      ('STORE-DP-001',  '东鹏直营店',     'COMP-LAO-XINGCHI'),
      ('STORE-HS-001',  '会晒直营店',     'COMP-LAO-XINGCHI'),
      ('STORE-XB-001',  '沙耶武里直营店', 'COMP-LAO-AGRI'),
      ('STORE-MX-001',  '孟赛直营店',     'COMP-LAO-AGRI'),
      ('STORE-LPB-001', '拉邦直营店',     'COMP-LAO-AGRI'),
      ('STORE-VTE-001', '万象直营店',     'COMP-LAO-FOOD'),
      ('STORE-BKX-001', '波利坎赛直营店', 'COMP-LAO-FOOD')
    ) AS t(store_code, store_name, company_code)
  LOOP
    SELECT id, path, level INTO v_pid, v_ppath, v_plevel
      FROM sys_organizations WHERE org_code = r.company_code;
    IF v_pid IS NULL THEN
      RAISE NOTICE 'G81 跳过 %：父公司 % 不存在', r.store_code, r.company_code;
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM sys_organizations WHERE org_code = r.store_code) THEN
      -- 回填（API 创建的节点 parent_code / org_name_cn 可能为空）
      UPDATE sys_organizations SET
        parent_id   = v_pid,
        parent_code = r.company_code,
        org_name_cn = COALESCE(org_name_cn, r.store_name),
        org_type    = 'STORE',
        level       = v_plevel + 1,
        path        = COALESCE(v_ppath, '/') || r.store_code || '/',
        company_code= r.company_code,
        updated_at  = NOW()
      WHERE org_code = r.store_code;
    ELSE
      INSERT INTO sys_organizations
        (org_code, org_name, org_name_cn, parent_id, parent_code, org_type,
         level, path, status, company_code, sort_order, created_at, updated_at)
      VALUES
        (r.store_code, r.store_name, r.store_name, v_pid, r.company_code, 'STORE',
         v_plevel + 1, COALESCE(v_ppath, '/') || r.store_code || '/', 'ACTIVE',
         r.company_code, 50, NOW(), NOW());
    END IF;
  END LOOP;
END $$;

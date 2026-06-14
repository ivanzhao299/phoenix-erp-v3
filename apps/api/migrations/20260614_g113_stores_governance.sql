-- ════════════════════════════════════════════════════════════════════════
-- G113 直营店主数据治理（Stage 4）2026-06-14  ⚠️ 本地提交·未部署·待审
-- ────────────────────────────────────────────────────────────────────────
-- 1. 新字典 STORE_OP_TYPE：厂家直营/代理商自营店/代理商合作店/加盟店/合作仓
-- 2. mst_stores 加列 operation_type(经营类型) + contact(联系人)
-- 3. 3 店改名（拉邦→琅勃拉邦、特区→金三角特区、波利坎赛→波利坎赛省）
-- 4. 3 店移公司（沙耶武里→星驰；万象/波利坎赛→农业）：sys_org parent/path/level + mst.company_code
-- 5. 2 店新建（丰沙里省 STORE-PSL-001、万象仓储中心 STORE-VTE-WH-001）→ 农业公司
-- 6. 回填全 10 店 operation_type / manager / contact / company_code / region
-- 7. 删 UAT 垃圾 STR-00001
-- ⚠️ org_code 子查询解析 id；幂等；to_regclass 守卫。用户已授权本字典/门店 DML。
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. 字典 STORE_OP_TYPE（dict_code=dict_value=中文，与 BRD_SHIFT 同范式）──
DO $$
BEGIN
  IF to_regclass('public.sys_dict') IS NOT NULL THEN
    INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
    SELECT 'STORE_OP_TYPE', v.code, v.code, v.en, v.code, v.so, 'ACTIVE'
    FROM (VALUES
      ('厂家直营','Factory Direct',10),
      ('代理商自营店','Agent Self-run',20),
      ('代理商合作店','Agent Partner',30),
      ('加盟店','Franchise',40),
      ('合作仓','Partner Warehouse',50)
    ) AS v(code, en, so)
    WHERE NOT EXISTS (SELECT 1 FROM sys_dict d WHERE d.dict_type='STORE_OP_TYPE' AND d.dict_code=v.code);
  END IF;
END $$;

-- ── 2. mst_stores 加列 ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.mst_stores') IS NOT NULL THEN
    ALTER TABLE mst_stores ADD COLUMN IF NOT EXISTS operation_type VARCHAR(32);
    ALTER TABLE mst_stores ADD COLUMN IF NOT EXISTS contact        VARCHAR(128);
  END IF;
END $$;

-- ── 3~6. 门店改名/移公司/新建/回填 ─────────────────────────────────────────
DO $$
DECLARE
  v_agri_id   BIGINT; v_agri_path TEXT; v_agri_lvl INT;
  v_xc_id     BIGINT; v_xc_path   TEXT; v_xc_lvl   INT;
BEGIN
  IF to_regclass('public.sys_organizations') IS NULL THEN RETURN; END IF;
  SELECT id, path, level INTO v_agri_id, v_agri_path, v_agri_lvl FROM sys_organizations WHERE org_code='COMP-LAO-AGRI';
  SELECT id, path, level INTO v_xc_id,   v_xc_path,   v_xc_lvl   FROM sys_organizations WHERE org_code='COMP-LAO-XINGCHI';

  -- 3. 改名（sys_org STORE 节点）
  UPDATE sys_organizations SET org_name='琅勃拉邦直营店',   org_name_cn='琅勃拉邦直营店',   updated_at=NOW() WHERE org_code='STORE-LPB-001';
  UPDATE sys_organizations SET org_name='金三角特区直营店', org_name_cn='金三角特区直营店', updated_at=NOW() WHERE org_code='STORE-XC-001';
  UPDATE sys_organizations SET org_name='波利坎赛省直营店', org_name_cn='波利坎赛省直营店', updated_at=NOW() WHERE org_code='STORE-BKX-001';

  -- 4. 移公司（沙耶武里→星驰）
  UPDATE sys_organizations SET parent_id=v_xc_id, parent_code='COMP-LAO-XINGCHI', company_code='COMP-LAO-XINGCHI',
         path=v_xc_path||'STORE-XB-001/', level=v_xc_lvl+1, updated_at=NOW()
   WHERE org_code='STORE-XB-001';
  -- 4. 移公司（万象、波利坎赛→农业）
  UPDATE sys_organizations SET parent_id=v_agri_id, parent_code='COMP-LAO-AGRI', company_code='COMP-LAO-AGRI',
         path=v_agri_path||org_code||'/', level=v_agri_lvl+1, updated_at=NOW()
   WHERE org_code IN ('STORE-VTE-001','STORE-BKX-001');

  -- 5. 新建 2 店（sys_org STORE 节点，挂农业公司）
  INSERT INTO sys_organizations (org_code, org_name, org_name_cn, parent_id, parent_code, org_type, level, path, status, company_code, sort_order, created_at, updated_at)
  SELECT v.code, v.nm, v.nm, v_agri_id, 'COMP-LAO-AGRI', 'STORE', v_agri_lvl+1, v_agri_path||v.code||'/', 'ACTIVE', 'COMP-LAO-AGRI', v.so, NOW(), NOW()
  FROM (VALUES
    ('STORE-PSL-001',   '丰沙里省直营店',   70),
    ('STORE-VTE-WH-001','万象仓储中心店',   80)
  ) AS v(code, nm, so)
  WHERE NOT EXISTS (SELECT 1 FROM sys_organizations o WHERE o.org_code=v.code);
END $$;

-- ── mst_stores：回填经营类型/负责人/联系人/公司 + 改名 + 新建行 ────────────
DO $$
BEGIN
  IF to_regclass('public.mst_stores') IS NULL THEN RETURN; END IF;

  -- 改名
  UPDATE mst_stores SET store_name='琅勃拉邦直营店'   WHERE store_code='STORE-LPB-001';
  UPDATE mst_stores SET store_name='金三角特区直营店' WHERE store_code='STORE-XC-001';
  UPDATE mst_stores SET store_name='波利坎赛省直营店' WHERE store_code='STORE-BKX-001';

  -- 回填：经营类型/负责人/联系人/公司（按 store_code）
  UPDATE mst_stores AS m SET
    operation_type = v.op, manager = v.mgr, contact = v.ct, company_code = v.cc, updated_at = NOW()
  FROM (VALUES
    ('STORE-HS-001',    '厂家直营',     NULL,   NULL,   'COMP-LAO-XINGCHI'),
    ('STORE-XB-001',    '厂家直营',     NULL,   NULL,   'COMP-LAO-XINGCHI'),
    ('STORE-DP-001',    '代理商自营店', '刘晓成', NULL,  'COMP-LAO-XINGCHI'),
    ('STORE-XC-001',    '代理商自营店', '朱兆安', '陈茂飞','COMP-LAO-XINGCHI'),
    ('STORE-MX-001',    '厂家直营',     NULL,   NULL,   'COMP-LAO-AGRI'),
    ('STORE-LPB-001',   '厂家直营',     NULL,   NULL,   'COMP-LAO-AGRI'),
    ('STORE-VTE-001',   '代理商自营店', '刘彬',  NULL,   'COMP-LAO-AGRI'),
    ('STORE-BKX-001',   '代理商合作店', '啊塞',  NULL,   'COMP-LAO-AGRI')
  ) AS v(code, op, mgr, ct, cc)
  WHERE m.store_code = v.code;

  -- 新建 2 店主数据行
  INSERT INTO mst_stores (store_code, store_name, region, manager, contact, operation_type, company_code, status, created_at, updated_at)
  SELECT v.code, v.nm, v.rg, v.mgr, v.ct, v.op, 'COMP-LAO-AGRI', 'ACTIVE', NOW(), NOW()
  FROM (VALUES
    ('STORE-PSL-001',   '丰沙里省直营店', '丰沙里省 / COMP-LAO-AGRI', '老王', NULL, '代理商自营店'),
    ('STORE-VTE-WH-001','万象仓储中心店', '万象市 / COMP-LAO-AGRI',   NULL,  NULL, '厂家直营')
  ) AS v(code, nm, rg, mgr, ct, op)
  WHERE NOT EXISTS (SELECT 1 FROM mst_stores s WHERE s.store_code=v.code);

  -- 7. 删 UAT 垃圾
  DELETE FROM mst_stores WHERE store_code='STR-00001';
END $$;

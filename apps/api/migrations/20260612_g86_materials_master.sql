-- ════════════════════════════════════════════════════════════════════════
-- G86 采购物料主数据 — mst_materials + 物料类型字典 + 菜单/授权
-- ────────────────────────────────────────────────────────────────────────
-- 背景：采购明细此前误用「自家产品 SKU」选择器（G4-B 引入）——采购买的是
--      饲料/兽药/包材/配件/建材等生产物资，不是自家卖的产品。本迁移建立
--      采购物料主数据，采购申请/订单/收货明细全部改挂 MaterialSelector。
-- 幂等：IF NOT EXISTS / NOT EXISTS / ON CONFLICT。
-- ════════════════════════════════════════════════════════════════════════

-- ① 物料主数据表（接入 master-data runtime：code/name/status 生命周期）
CREATE TABLE IF NOT EXISTS mst_materials (
  id               BIGSERIAL PRIMARY KEY,
  material_code    VARCHAR(64)  NOT NULL UNIQUE,
  material_name    VARCHAR(200) NOT NULL,
  material_type    VARCHAR(40),                 -- dict: PRC_MATERIAL_TYPE
  spec             VARCHAR(200),                -- 规格型号
  unit             VARCHAR(20),                 -- 计量单位
  default_currency VARCHAR(8),                  -- 常用采购币种（dict: SYS_CURRENCY）
  remark           TEXT,
  status           VARCHAR(32)  NOT NULL DEFAULT 'DRAFT',
    -- DRAFT / PENDING_APPROVAL / ACTIVE / REJECTED / FROZEN / ARCHIVED（runtime 生命周期）
  created_by       VARCHAR(80),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mst_materials_status ON mst_materials (status);
CREATE INDEX IF NOT EXISTS idx_mst_materials_type   ON mst_materials (material_type);

-- ② 物料类型字典（幂等 NOT EXISTS）
INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
SELECT v.dict_type, v.dict_code, v.dict_label_zh, v.dict_label_en, v.dict_code, v.sort_no, 'ACTIVE'
FROM (VALUES
  ('PRC_MATERIAL_TYPE','FEED_RAW',     '饲料原料',   'Feed Raw Material', 1),
  ('PRC_MATERIAL_TYPE','VET_DRUG',     '兽药疫苗',   'Vet Drug/Vaccine',  2),
  ('PRC_MATERIAL_TYPE','PACKAGING',    '包装材料',   'Packaging',         3),
  ('PRC_MATERIAL_TYPE','EQUIPMENT',    '设备及配件', 'Equipment/Parts',   4),
  ('PRC_MATERIAL_TYPE','CONSTRUCTION', '建筑材料',   'Construction',      5),
  ('PRC_MATERIAL_TYPE','OFFICE',       '办公易耗',   'Office Supply',     6),
  ('PRC_MATERIAL_TYPE','TOOL',         '工具器具',   'Tools',             7),
  ('PRC_MATERIAL_TYPE','OTHER',        '其他物资',   'Other',             9)
) AS v(dict_type, dict_code, dict_label_zh, dict_label_en, sort_no)
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict d WHERE d.dict_type = v.dict_type AND d.dict_code = v.dict_code
);

-- ③ 菜单（挂主数据中心，G56-B per-entity 模式）
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, parent_code, sort_order)
SELECT 'MENU_MD_MATERIAL', '物料档案', 'MASTER', 'MENU_MASTER_DATA', 712
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code = 'MENU_MD_MATERIAL');

-- ④ 授权：管理员全权；采购员可建可编可看（物料是采购的主数据）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.perms
FROM (VALUES
  ('ROLE_ADMIN',     'V,C,E,D,A,X'),
  ('ROLE_PRC_BUYER', 'V,C,E')
) AS v(role_code, perms)
JOIN sys_role r ON r.role_code = v.role_code
JOIN sys_menu m ON m.menu_code = 'MENU_MD_MATERIAL'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_menu_permission p WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
);

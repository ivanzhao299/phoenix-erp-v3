-- ════════════════════════════════════════════════════════════════════════
-- Finance Authority Reconstruction Phase 1 — A. 集团虚拟财务中心 + 岗位组 + 岗位角色
-- ────────────────────────────────────────────────────────────────────────
-- 目标：财务权限从「人员驱动」改为「岗位驱动」。岗位决定权限，人员只是岗位载体；
--       后续人员变动只调整岗位绑定，不修改权限体系。
--
-- 本迁移建立：
--   1) 虚拟组织 ORG-FINANCE-CENTER（集团财务中心，VIRTUAL_ORGANIZATION，不对应实体办公地点）
--   2) 三个岗位组（DEPARTMENT 建模）：财务审核组 / 资金管理组 / 财务分析与核算组
--   3) 三个岗位角色：ROLE_FINANCE_REVIEW_MANAGER / ROLE_TREASURY_MANAGER / ROLE_FINANCE_ANALYST
--
-- 幂等：ALTER CHECK 用 DROP+ADD；组织 ON CONFLICT(org_code) DO NOTHING；角色 ON CONFLICT(role_code) DO NOTHING。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 扩展 org_type 枚举，新增 VIRTUAL_ORGANIZATION（虚拟组织）─────────────
ALTER TABLE sys_organizations DROP CONSTRAINT IF EXISTS chk_org_type;
ALTER TABLE sys_organizations ADD CONSTRAINT chk_org_type CHECK (
  org_type IN (
    'GROUP','COMPANY','FACTORY','PROJECT','WAREHOUSE','STORE',
    'DEPARTMENT','BU','SITE','VIRTUAL_ORGANIZATION'
  )
);

/* ════════ G193 数据 seed 冻结：财务中心/岗位组等组织节点属人工维护，迁移不再重跑覆盖 ════════
-- ── 2. 集团财务中心（虚拟组织，挂在集团 ORG-GROUP 下）──────────────────────
INSERT INTO sys_organizations
  (org_code, org_name, org_name_cn, org_short_name, org_type,
   parent_id, parent_code, level, path, status, sort_order, remark)
SELECT
  'ORG-FINANCE-CENTER', '集团财务中心', '集团财务中心', '财务中心', 'VIRTUAL_ORGANIZATION',
  g.id, 'ORG-GROUP', 2, '/ORG-GROUP/ORG-FINANCE-CENTER/', 'ACTIVE', 30,
  '虚拟组织，不对应实体办公地点，负责全集团财务管理（岗位驱动权限体系的载体）'
FROM sys_organizations g
WHERE g.org_code = 'ORG-GROUP'
ON CONFLICT (org_code) DO NOTHING;

-- ── 3. 三个岗位组（DEPARTMENT，挂在财务中心下）────────────────────────────
INSERT INTO sys_organizations
  (org_code, org_name, org_name_cn, org_short_name, org_type,
   parent_id, parent_code, level, path, status, sort_order, remark)
SELECT
  v.org_code, v.org_name, v.org_name, v.org_short, 'DEPARTMENT',
  fc.id, 'ORG-FINANCE-CENTER', 3,
  '/ORG-GROUP/ORG-FINANCE-CENTER/' || v.org_code || '/', 'ACTIVE', v.sort_order, v.remark
FROM sys_organizations fc
CROSS JOIN (VALUES
  ('DEPT-FIN-REVIEW',   '财务审核组',        '审核组', 10, '凭证/入库/收款/费用/工资/往来账审核，财务合规审核（审核人，非付款人）'),
  ('DEPT-FIN-TREASURY', '资金管理组',        '资金组', 20, '付款单录入/付款执行/收款登记/银行流水/资金日报（付款人，非审核人）'),
  ('DEPT-FIN-ANALYSIS', '财务分析与核算组',  '分析组', 30, '成本/利润核算、项目经营分析、股东投资分析、资本流录入与分析（分析核算人）')
) AS v(org_code, org_name, org_short, sort_order, remark)
WHERE fc.org_code = 'ORG-FINANCE-CENTER'
ON CONFLICT (org_code) DO NOTHING;

   ════════ G193 冻结结束（§2/§3 组织节点已停跑；§4 角色 seed 保留跟代码） ════════ */
-- ── 4. 三个岗位角色 ───────────────────────────────────────────────────────
INSERT INTO sys_role (role_code, role_name_zh, role_type, approval_level, description)
VALUES
  ('ROLE_FINANCE_REVIEW_MANAGER', '财务审核经理', 'FINANCE', 3,
   '集团财务中心·财务审核组岗位。职责：凭证/入库单/收款单/费用单/工资表/往来账审核、财务合规审核。'
   || '允许：查看全部财务单据、审核财务单据、查看利润/成本/应收/应付/资金、查看股东驾驶舱、查看资本流、参与审批。'
   || '禁止：付款、资金调拨、银行账户操作、股权调整、系统管理。审批链定位：审核人，不是付款人。'),
  ('ROLE_TREASURY_MANAGER', '资金经理', 'FINANCE', 2,
   '集团财务中心·资金管理组岗位。职责：付款单录入、付款执行、收款登记、银行流水管理、资金日报。'
   || '允许：资金账户查看、付款单录入、付款执行、收款登记、银行流水管理、资金日报、查看费用单、查看应收应付。'
   || '禁止：利润核算、成本核算、财务审核、股权调整、系统管理。审批链定位：付款人，不是审核人。'),
  ('ROLE_FINANCE_ANALYST', '财务分析经理', 'FINANCE', 1,
   '集团财务中心·财务分析与核算组岗位（代表赵永伟体系财务管理，人员可替换岗位不变）。'
   || '职责：成本/利润核算、项目经营分析、股东投资分析、股东驾驶舱、资本流录入与分析、投资回报分析。'
   || '允许：查看利润/成本/经营数据/股东数据、录入资本流、查看资本流、查看项目投资、查看股东驾驶舱、查看集团驾驶舱。'
   || '禁止：付款、资金调拨、银行账户操作、审核财务单据、股权调整、系统管理。审批链定位：分析核算人，不是审核人不是付款人。')
ON CONFLICT (role_code) DO NOTHING;

COMMIT;

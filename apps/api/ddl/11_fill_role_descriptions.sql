-- ============================================================
-- 11_fill_role_descriptions.sql
-- 按 role_type 为 description 为空的角色补充默认说明
-- ============================================================
UPDATE sys_role SET description = CASE role_type
  WHEN 'SYSTEM'      THEN '系统管理员，负责系统配置、用户权限、组织架构及基础数据维护。拥有最高操作权限，须由专职 IT 人员担任。'
  WHEN 'DECISION'    THEN '决策层管理角色，拥有全局数据查看与审批权限，负责战略决策与绩效审核，通常不参与日常业务操作。'
  WHEN 'FINANCE'     THEN '财务管理角色，负责应收应付、成本核算、财务结算及审计合规，须遵守岗位分离原则，不兼任收款与审计。'
  WHEN 'MANAGEMENT'  THEN '管理层角色，负责跨部门协调、审批流程及运营报表查阅，具备所辖业务域的查看与审批权限。'
  WHEN 'PRODUCTION'  THEN '生产作业角色，负责养殖生产日报录入、鸡群档案管理及免疫用药记录，数据权限限定于所属养殖场。'
  WHEN 'QUALITY'     THEN '质检追溯角色，负责场端与成品质检、不合格品处置及品质标准维护，提出人与审批人须分离。'
  WHEN 'PACKAGING'   THEN '包装作业角色，负责分级包装操作、批次管理及异常处理，作业数据仅限当日班次范围。'
  WHEN 'WAREHOUSE'   THEN '仓储管理角色，负责出入库操作、库存盘点、调拨及仓库主档管理，不兼任分级统计岗位。'
  WHEN 'LOGISTICS'   THEN '物流配送角色，负责配货计划制定、配送波次跟踪及到店签收，装车执行与出库复核须双人分离。'
  WHEN 'COMMON'      THEN '通用业务角色，承担跨部门基础操作，具体权限范围视业务需要分配，适用于兼岗或临时授权场景。'
  WHEN 'PROCUREMENT' THEN '采购供应角色，负责采购申请、订单跟进、到货收货及供应商档案管理，付款审批须由上级审批人完成。'
  WHEN 'STORE'       THEN '门店运营角色，负责门店收货验收、库存管理、补货申请及日结操作，权限范围限定于所属门店。'
  WHEN 'SALES'       THEN '销售营销角色，负责客户档案维护、订单管理、B2B 分销及会员营销活动，不兼任财务审计岗位。'
  WHEN 'EXTERNAL'    THEN '外部合作角色，权限范围受限，仅可访问指定的协作功能模块，数据可见范围由管理员单独配置。'
  ELSE description
END
WHERE description IS NULL OR TRIM(description) = '';

-- 验证结果
SELECT role_code, role_type, LEFT(description, 30) AS desc_preview
FROM sys_role
ORDER BY role_type, role_code;

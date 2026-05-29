-- ═══════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — DDL 26: UAT & Pilot Run Runtime 建表
-- 幂等：所有 CREATE TABLE / INDEX 均使用 IF NOT EXISTS
-- Phase E：UAT 用户验收测试 + 试运行体系
-- 覆盖表（4 张）：
--   uat_feedbacks        — 问题反馈中心
--   uat_training_records — 培训记录体系
--   uat_checklists       — 验收清单体系
--   uat_pilot_runs       — 试运行记录
-- ═══════════════════════════════════════════════════════════════

-- ── 序列（编号生成） ────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS seq_uat_feedback_no START 1;
CREATE SEQUENCE IF NOT EXISTS seq_uat_training_no START 1;
CREATE SEQUENCE IF NOT EXISTS seq_uat_pilot_no    START 1;

-- ── 1. 问题反馈 uat_feedbacks ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS uat_feedbacks (
  id               BIGSERIAL     PRIMARY KEY,
  feedback_no      VARCHAR(64)   NOT NULL UNIQUE,
  title            VARCHAR(256)  NOT NULL,
  description      TEXT,
  module_code      VARCHAR(64),
  company_code     VARCHAR(64),
  -- 分类/严重度/状态
  feedback_type    VARCHAR(32)   NOT NULL DEFAULT 'BUG',
  severity         VARCHAR(16)   NOT NULL DEFAULT 'MEDIUM',
  status           VARCHAR(32)   NOT NULL DEFAULT 'OPEN',
  -- 报告人
  reporter_id      BIGINT,
  reporter_name    VARCHAR(128),
  -- 指派人
  assignee_id      BIGINT,
  assignee_name    VARCHAR(128),
  -- 截图/附件
  screenshot_urls  JSONB,
  -- 解决方案
  resolution       TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
-- feedback_type: BUG / ENHANCEMENT / QUESTION / TRAINING / DATA_ISSUE
-- severity:      LOW / MEDIUM / HIGH / CRITICAL
-- status:        OPEN / IN_PROGRESS / RESOLVED / CLOSED / REJECTED

CREATE INDEX IF NOT EXISTS idx_uat_fb_status      ON uat_feedbacks (status);
CREATE INDEX IF NOT EXISTS idx_uat_fb_severity    ON uat_feedbacks (severity);
CREATE INDEX IF NOT EXISTS idx_uat_fb_module      ON uat_feedbacks (module_code);
CREATE INDEX IF NOT EXISTS idx_uat_fb_company     ON uat_feedbacks (company_code) WHERE company_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_fb_reporter    ON uat_feedbacks (reporter_id)  WHERE reporter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_fb_assignee    ON uat_feedbacks (assignee_id)  WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_fb_created     ON uat_feedbacks (created_at DESC);

-- ── 2. 培训记录 uat_training_records ─────────────────────────────
CREATE TABLE IF NOT EXISTS uat_training_records (
  id               BIGSERIAL     PRIMARY KEY,
  training_no      VARCHAR(64)   NOT NULL UNIQUE,
  training_type    VARCHAR(32)   NOT NULL,
  training_title   VARCHAR(256)  NOT NULL,
  trainer_name     VARCHAR(128),
  participant_count INTEGER       NOT NULL DEFAULT 0,
  training_date    DATE          NOT NULL,
  score            NUMERIC(5,2),
  company_code     VARCHAR(64),
  remark           TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
-- training_type: SALES / DELIVERY / INVENTORY / FINANCE / APPROVAL / MANAGEMENT

CREATE INDEX IF NOT EXISTS idx_uat_tr_type    ON uat_training_records (training_type);
CREATE INDEX IF NOT EXISTS idx_uat_tr_date    ON uat_training_records (training_date DESC);
CREATE INDEX IF NOT EXISTS idx_uat_tr_company ON uat_training_records (company_code) WHERE company_code IS NOT NULL;

-- ── 3. 验收清单 uat_checklists ────────────────────────────────────
CREATE TABLE IF NOT EXISTS uat_checklists (
  id               BIGSERIAL     PRIMARY KEY,
  module_code      VARCHAR(64)   NOT NULL,
  item_name        VARCHAR(256)  NOT NULL,
  item_description TEXT,
  status           VARCHAR(32)   NOT NULL DEFAULT 'NOT_STARTED',
  tester_id        BIGINT,
  tester_name      VARCHAR(128),
  tested_at        TIMESTAMPTZ,
  company_code     VARCHAR(64),
  remark           TEXT,
  sort_order       INT           NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
-- status: NOT_STARTED / PASSED / FAILED / BLOCKED

CREATE INDEX IF NOT EXISTS idx_uat_cl_module  ON uat_checklists (module_code);
CREATE INDEX IF NOT EXISTS idx_uat_cl_status  ON uat_checklists (status);
CREATE INDEX IF NOT EXISTS idx_uat_cl_company ON uat_checklists (company_code) WHERE company_code IS NOT NULL;

-- ── 4. 试运行记录 uat_pilot_runs ─────────────────────────────────
CREATE TABLE IF NOT EXISTS uat_pilot_runs (
  id               BIGSERIAL     PRIMARY KEY,
  run_no           VARCHAR(64)   NOT NULL UNIQUE,
  company_code     VARCHAR(64),
  site_name        VARCHAR(256),
  run_start_date   DATE          NOT NULL,
  run_end_date     DATE,
  status           VARCHAR(32)   NOT NULL DEFAULT 'PLANNED',
  order_count      INTEGER       NOT NULL DEFAULT 0,
  delivery_count   INTEGER       NOT NULL DEFAULT 0,
  receipt_count    INTEGER       NOT NULL DEFAULT 0,
  return_count     INTEGER       NOT NULL DEFAULT 0,
  issue_count      INTEGER       NOT NULL DEFAULT 0,
  remark           TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
-- status: PLANNED / RUNNING / COMPLETED / FAILED

CREATE INDEX IF NOT EXISTS idx_uat_pr_status  ON uat_pilot_runs (status);
CREATE INDEX IF NOT EXISTS idx_uat_pr_company ON uat_pilot_runs (company_code) WHERE company_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_pr_start   ON uat_pilot_runs (run_start_date DESC);

-- ── 验收清单种子数据（幂等插入，60 项） ──────────────────────────

-- 采购管理 (PROCUREMENT)
INSERT INTO uat_checklists (module_code, item_name, item_description, sort_order)
SELECT * FROM (VALUES
  ('PROCUREMENT', '供应商主档创建与管理',    '验证供应商新增/编辑/禁用功能正常', 10),
  ('PROCUREMENT', '采购申请（PR）创建',       '验证采购申请表单字段完整，提交触发审批', 20),
  ('PROCUREMENT', '采购订单（PO）创建',       '验证 PR 转 PO，订单金额/数量计算正确', 30),
  ('PROCUREMENT', '采购订单审批流程',         '验证 PO 提交审批、批准、拒绝流程正常', 40),
  ('PROCUREMENT', '收货入库操作',             '验证收货单创建、数量核验、库存自动增加', 50),
  ('PROCUREMENT', '供应商发票核验',           '验证 AP 发票金额与 PO 一致性检查', 60),
  ('PROCUREMENT', '付款申请与审批',           '验证付款申请创建、CFO 审批、执行流程', 70),
  ('PROCUREMENT', '跨境采购管理',             '验证 cross_border=true 场景的税率/汇率处理', 80),
  ('PROCUREMENT', '历史数据初始化',           '验证批量导入历史采购数据，幂等性正常', 90),
  ('PROCUREMENT', 'AP 核销操作',              '验证 AP 核销与 AP 账龄台账联动正确', 100)
) AS t(module_code, item_name, item_description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'PROCUREMENT');

-- 财务管理 (FINANCE)
INSERT INTO uat_checklists (module_code, item_name, item_description, sort_order)
SELECT * FROM (VALUES
  ('FINANCE', 'AR 发票自动生成',            '验证配送签收后 AR 发票自动创建，金额正确', 10),
  ('FINANCE', 'AP 发票管理',                '验证 AP 发票录入/编辑/作废功能', 20),
  ('FINANCE', '收款核销（AR Receipt）',      '验证客户收款与 AR 发票核销流程', 30),
  ('FINANCE', '资金账户管理',               '验证银行账户/现金账户余额跟踪', 40),
  ('FINANCE', '股东资金录入与审批',          '验证股东资金录入需要 CFO 审批', 50),
  ('FINANCE', '汇率管理',                   '验证多币种汇率配置与自动换算', 60),
  ('FINANCE', '费用报销申请',               '验证农场/门店经理提交报销申请', 70),
  ('FINANCE', '财务报表生成',               '验证 AP/AR 汇总报表数据准确性', 80),
  ('FINANCE', 'AP 账龄分析',                '验证逾期 AP 按天数分组统计正确', 90),
  ('FINANCE', '财务数据导出',               '验证财务报表导出格式与权限控制', 100)
) AS t(module_code, item_name, item_description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'FINANCE');

-- 销售管理 (SALES)
INSERT INTO uat_checklists (module_code, item_name, item_description, sort_order)
SELECT * FROM (VALUES
  ('SALES', '客户主档创建与管理',      '验证客户新增、编辑、信用额度设置', 10),
  ('SALES', '销售渠道与价格本配置',    '验证渠道创建、价格本绑定、有效期设置', 20),
  ('SALES', '销售订单创建',            '验证订单录入、产品选择、数量/价格计算', 30),
  ('SALES', '低价审批触发',            '验证价格低于下限时自动触发审批流程', 40),
  ('SALES', '信用控制检查',            '验证信用额度超限时自动冻结/预警', 50),
  ('SALES', '销售订单审批流程',        '验证提交、批准、拒绝全链路', 60),
  ('SALES', '配送单自动生成',          '验证订单审批通过后配送单自动创建', 70),
  ('SALES', '客户签收与 AR 生成',      '验证签收后 AR 发票自动生成，金额一致', 80),
  ('SALES', '销售退货流程',            '验证退货单创建、质检、回库、Credit Note', 90),
  ('SALES', '销售经营报表与分析',      '验证 11 维经营分析数据准确性', 100)
) AS t(module_code, item_name, item_description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'SALES');

-- 配送管理 (DELIVERY)
INSERT INTO uat_checklists (module_code, item_name, item_description, sort_order)
SELECT * FROM (VALUES
  ('DELIVERY', '配送单创建与编辑',        '验证配送单从销售订单自动生成，字段正确', 10),
  ('DELIVERY', '司机与车辆主档管理',      '验证司机/车辆信息录入、执照有效期预警', 20),
  ('DELIVERY', '配送路线分配',            '验证配送员分配、路线规划关联', 30),
  ('DELIVERY', '配送状态跟踪',            '验证 PLANNED→LOADING→IN_TRANSIT→DELIVERED 状态机', 40),
  ('DELIVERY', '客户签收确认',            '验证签收时间记录、数量确认、异常备注', 50),
  ('DELIVERY', '签收异常处理',            '验证部分签收、拒收场景的退货联动', 60),
  ('DELIVERY', 'AR 自动生成验证',         '验证签收触发 AR 发票，金额与配送数量一致', 70),
  ('DELIVERY', '配送超时预警',            '验证 SLA 超时后发出提醒通知', 80),
  ('DELIVERY', '配送完成报表',            '验证配送统计、准时率、签收率报表', 90),
  ('DELIVERY', '退货关联配送',            '验证退货单关联原配送单，流程完整', 100)
) AS t(module_code, item_name, item_description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'DELIVERY');

-- 库存管理 (INVENTORY)
INSERT INTO uat_checklists (module_code, item_name, item_description, sort_order)
SELECT * FROM (VALUES
  ('INVENTORY', '库存批次录入（FIFO）',    '验证入库批次生效日期/数量录入正确', 10),
  ('INVENTORY', 'FIFO 出库验证',           '验证出库时先进先出，批次消耗顺序正确', 20),
  ('INVENTORY', '库存盘点操作',            '验证盘点单创建、差异确认、账务调整', 30),
  ('INVENTORY', '库存安全库存预警',        '验证低于安全库存时触发预警提醒', 40),
  ('INVENTORY', '库存调整申请',            '验证手动调整需要审批流程', 50),
  ('INVENTORY', '批次临期预警',            '验证 Advisory Lock 防并发，临期批次标红', 60),
  ('INVENTORY', '库存与销售联动',          '验证销售订单确认时库存预扣, 配送后正式扣减', 70),
  ('INVENTORY', '库存报表（批次看板）',    '验证批次Dashboard：总量/可用/临期/已过期分组', 80),
  ('INVENTORY', '库存操作审计日志',        '验证所有入库/出库/调整操作记录到 sys_operation_logs', 90),
  ('INVENTORY', '库存数据导出',            '验证库存明细、批次台账导出权限与格式', 100)
) AS t(module_code, item_name, item_description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'INVENTORY');

-- 审批流程 (APPROVAL)
INSERT INTO uat_checklists (module_code, item_name, item_description, sort_order)
SELECT * FROM (VALUES
  ('APPROVAL', '审批规则配置',            '验证按模块/金额区间/公司配置审批规则', 10),
  ('APPROVAL', '销售低价审批',            '验证低价订单自动发起审批，不可绕过', 20),
  ('APPROVAL', '采购订单审批',            '验证 PO 金额超阈值时多级审批触发', 30),
  ('APPROVAL', '付款审批流程',            '验证付款申请的 CFO/CEO 双重审批', 40),
  ('APPROVAL', '销售退货审批',            '验证退货单需销售主管批准', 50),
  ('APPROVAL', 'SLA 超时自动提醒',        '验证审批超 48h 触发提醒通知，3次上限', 60),
  ('APPROVAL', '审批工作台（待办）',       '验证 /workflow/todos 显示当前用户待审批列表', 70),
  ('APPROVAL', '审批历史与轨迹',          '验证每步操作人/时间/意见记录完整', 80),
  ('APPROVAL', '审批拒绝与重新提交',      '验证拒绝后单据可修改重新发起审批', 90),
  ('APPROVAL', '审批通知推送（站内）',    '验证审批操作触发站内消息实时通知', 100)
) AS t(module_code, item_name, item_description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'APPROVAL');

-- ── 确认 ──────────────────────────────────────────────────────────
DO $$
DECLARE
  cl_count INT;
BEGIN
  SELECT COUNT(*) INTO cl_count FROM uat_checklists;
  RAISE NOTICE '✅ DDL 26 UAT Runtime tables applied (4 tables, % checklist items)', cl_count;
END$$;

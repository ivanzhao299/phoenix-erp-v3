-- ============================================================
-- Phoenix ERP V3 — Customer Master Migration Phase G2
-- migrate-customers-g2.sql
-- ============================================================
-- 目标：
--   1. 将 ord_customers (16 条) 迁移到 sal_customers
--   2. 将 b2b_customers (5 条) 迁移到 sal_customers
--   幂等：ON CONFLICT (customer_no) DO NOTHING
--   幂等：ON CONFLICT (legacy_customer_code) 通过唯一索引保护
-- 注意：
--   - 不 DROP 旧表
--   - 不删除任何旧数据
--   - 旧表进入封存只读状态
-- ============================================================

DO $$ BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Customer Master Migration G2 — START';
  RAISE NOTICE '==============================================';

  -- ──────────────────────────────────────────────────────────
  -- 迁移前数量统计
  -- ──────────────────────────────────────────────────────────
  RAISE NOTICE '[PRE-MIGRATION] ord_customers: % rows',
    (SELECT COUNT(*) FROM ord_customers);
  RAISE NOTICE '[PRE-MIGRATION] b2b_customers: % rows',
    (SELECT COUNT(*) FROM b2b_customers);
  RAISE NOTICE '[PRE-MIGRATION] sal_customers total: % rows',
    (SELECT COUNT(*) FROM sal_customers);
  RAISE NOTICE '[PRE-MIGRATION] sal_customers ORD- prefix: % rows',
    (SELECT COUNT(*) FROM sal_customers WHERE customer_no LIKE 'ORD-%');
  RAISE NOTICE '[PRE-MIGRATION] sal_customers B2B- prefix: % rows',
    (SELECT COUNT(*) FROM sal_customers WHERE customer_no LIKE 'B2B-%');

  -- 信用守恒预检（迁移前）
  RAISE NOTICE '[CREDIT-CHECK] ord_customers total credit_used: %',
    (SELECT COALESCE(SUM(credit_used), 0) FROM ord_customers);
  RAISE NOTICE '[CREDIT-CHECK] ord_customers BLACKLIST customers: %',
    (SELECT COUNT(*) FROM ord_customers WHERE risk_flag='BLACKLIST' OR blacklist=true);

END $$;

-- ============================================================
-- PHASE 1: ord_customers → sal_customers
-- ============================================================
--
-- customer_type 映射规则：
--   ord.customer_type='B2B'        → DISTRIBUTOR
--   ord.customer_type='KA'         → KEY_ACCOUNT
--   ord.customer_type='SELF_ORDER' → RETAIL
--   ord.tier='A'                   → KEY_ACCOUNT
--   ord.tier='B','C'               → DISTRIBUTOR
--   ord.tier='VIP'                 → KEY_ACCOUNT
--   ord.tier='FARM'                → RETAIL（农场直销）
--   fallback                       → RETAIL
--
-- risk_level 映射：risk_flag='BLACKLIST' OR blacklist=true → BLACKLIST
-- status 映射：blacklist/BLACKLIST → BLACKLIST, else UPPER(status)
-- ============================================================

INSERT INTO sal_customers (
  customer_no,
  customer_name,
  customer_type,
  company_code,
  region_code,
  credit_limit,
  credit_used,
  payment_terms,
  risk_level,
  status,
  contact_name,
  contact_phone,
  delivery_address,
  sales_rep_name,
  protection_status,
  legacy_customer_code,
  remark,
  created_at,
  updated_at
)
SELECT
  -- customer_no: ORD- 前缀保证不与现有 sal 客户冲突
  'ORD-' || oc.customer_code,

  -- customer_name: 直接映射，不允许空
  COALESCE(NULLIF(TRIM(oc.customer_name), ''), 'ORD-' || oc.customer_code),

  -- customer_type: 多字段优先级映射
  CASE
    WHEN UPPER(COALESCE(oc.customer_type,'')) IN ('B2B','DISTRIBUTOR','DEALER')      THEN 'DISTRIBUTOR'
    WHEN UPPER(COALESCE(oc.customer_type,'')) IN ('KA','KEY_ACCOUNT','KEY ACCOUNT')  THEN 'KEY_ACCOUNT'
    WHEN UPPER(COALESCE(oc.customer_type,'')) IN ('SELF_ORDER','SELF ORDER')         THEN 'RETAIL'
    WHEN UPPER(COALESCE(oc.tier,''))          IN ('A','VIP')                         THEN 'KEY_ACCOUNT'
    WHEN UPPER(COALESCE(oc.tier,''))          IN ('B','C')                           THEN 'DISTRIBUTOR'
    WHEN UPPER(COALESCE(oc.tier,''))          = 'FARM'                               THEN 'RETAIL'
    ELSE 'RETAIL'
  END,

  -- company_code: ord_customers 无此字段，填默认值
  COALESCE(NULLIF(TRIM(oc.store_code), 'ALL'), 'DEFAULT'),

  -- region_code: ord_customers 无标准区域编码
  NULL,

  -- credit_limit / credit_used: 直接迁移
  COALESCE(oc.credit_limit, 0),
  COALESCE(oc.credit_used, 0),

  -- payment_terms: account_period 天数
  COALESCE(oc.account_period, 0),

  -- risk_level: risk_flag 或 blacklist 字段
  CASE
    WHEN oc.risk_flag = 'BLACKLIST' OR oc.blacklist = true THEN 'BLACKLIST'
    ELSE 'NORMAL'
  END,

  -- status: 黑名单客户 status=BLACKLIST，其余统一 UPPER 规范化
  CASE
    WHEN oc.risk_flag = 'BLACKLIST' OR oc.blacklist = true THEN 'BLACKLIST'
    WHEN UPPER(COALESCE(oc.status,'')) IN ('INACTIVE','DISABLED','FROZEN')   THEN 'FROZEN'
    ELSE 'ACTIVE'
  END,

  -- contact_name / phone
  NULLIF(TRIM(COALESCE(oc.contact_name, '')), ''),
  NULLIF(TRIM(COALESCE(oc.contact_phone, oc.phone, '')), ''),

  -- delivery_address: delivery_addr 字段
  NULLIF(TRIM(COALESCE(oc.delivery_addr, oc.address, '')), ''),

  -- sales_rep_name
  NULLIF(TRIM(COALESCE(oc.sales_rep, '')), ''),

  -- protection_status: 直接迁移
  COALESCE(NULLIF(TRIM(oc.protection_status), ''), 'INIT'),

  -- legacy_customer_code: 原始 customer_code 保留用于查找
  oc.customer_code,

  -- remark
  NULLIF(TRIM(COALESCE(oc.remark, '')), ''),

  -- timestamps
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP

FROM ord_customers oc

-- 幂等：跳过已迁移的（通过 legacy_customer_code 判断）
WHERE NOT EXISTS (
  SELECT 1 FROM sal_customers sc
  WHERE sc.legacy_customer_code = oc.customer_code
     OR sc.customer_no = 'ORD-' || oc.customer_code
);

-- ============================================================
-- PHASE 2: b2b_customers → sal_customers
-- ============================================================
--
-- customer_type 固定为 DISTRIBUTOR
-- cust_level 映射：
--   '战略客户' → KEY_ACCOUNT
--   '重要客户' → DISTRIBUTOR
--   '普通客户' → DISTRIBUTOR
--   其他       → DISTRIBUTOR
-- customer_name: COALESCE(customer_name, company_name, 'B2B-' || customer_code)
-- ============================================================

INSERT INTO sal_customers (
  customer_no,
  customer_name,
  customer_type,
  company_code,
  region_code,
  credit_limit,
  credit_used,
  payment_terms,
  risk_level,
  status,
  contact_name,
  contact_phone,
  delivery_address,
  sales_rep_id,
  protection_status,
  legacy_customer_code,
  remark,
  created_at,
  updated_at
)
SELECT
  -- customer_no: B2B- 前缀
  'B2B-' || bc.customer_code,

  -- customer_name: b2b 数据 customer_name 可能为空，回退 company_name
  COALESCE(
    NULLIF(TRIM(bc.customer_name), ''),
    NULLIF(TRIM(bc.company_name), ''),
    'B2B-' || bc.customer_code
  ),

  -- customer_type: cust_level 影响分类
  CASE
    WHEN bc.cust_level IN ('战略客户') THEN 'KEY_ACCOUNT'
    ELSE 'DISTRIBUTOR'
  END,

  -- company_code
  COALESCE(NULLIF(TRIM(bc.store_code), 'ALL'), 'DEFAULT'),

  -- region_code
  NULLIF(TRIM(COALESCE(bc.area_code, '')), ''),

  -- credit_limit / credit_used (b2b 无 credit_used，默认 0)
  COALESCE(bc.credit_limit, 0),
  0,

  -- payment_terms: credit_days
  COALESCE(bc.credit_days, 30),

  -- risk_level: b2b 无黑名单字段，默认 NORMAL
  'NORMAL',

  -- status
  UPPER(COALESCE(NULLIF(TRIM(bc.status), ''), 'ACTIVE')),

  -- contact_name
  NULLIF(TRIM(COALESCE(bc.contact_name, bc.contact_person, '')), ''),

  -- contact_phone
  NULLIF(TRIM(COALESCE(bc.contact_phone, bc.phone, '')), ''),

  -- delivery_address
  NULLIF(TRIM(COALESCE(bc.address, '')), ''),

  -- sales_rep_id
  bc.sales_rep_id,

  -- protection_status: b2b 无此字段，默认 INIT
  'INIT',

  -- legacy_customer_code
  bc.customer_code,

  -- remark
  bc.cust_level,

  -- timestamps
  COALESCE(bc.created_at, CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP

FROM b2b_customers bc

-- 幂等：跳过已迁移的
WHERE NOT EXISTS (
  SELECT 1 FROM sal_customers sc
  WHERE sc.legacy_customer_code = bc.customer_code
     OR sc.customer_no = 'B2B-' || bc.customer_code
);

-- ============================================================
-- 迁移后校验
-- ============================================================

DO $$ BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'POST-MIGRATION VALIDATION';
  RAISE NOTICE '==============================================';

  RAISE NOTICE '[POST] sal_customers total: %',
    (SELECT COUNT(*) FROM sal_customers);
  RAISE NOTICE '[POST] ORD- prefix migrated: %',
    (SELECT COUNT(*) FROM sal_customers WHERE customer_no LIKE 'ORD-%');
  RAISE NOTICE '[POST] B2B- prefix migrated: %',
    (SELECT COUNT(*) FROM sal_customers WHERE customer_no LIKE 'B2B-%');
  RAISE NOTICE '[POST] BLACKLIST migrated: %',
    (SELECT COUNT(*) FROM sal_customers WHERE risk_level='BLACKLIST');
  RAISE NOTICE '[POST] FROZEN migrated: %',
    (SELECT COUNT(*) FROM sal_customers WHERE status='FROZEN');
  RAISE NOTICE '[POST] legacy_customer_code populated: %',
    (SELECT COUNT(*) FROM sal_customers WHERE legacy_customer_code IS NOT NULL);
  RAISE NOTICE '[POST] protection_status PROTECTED: %',
    (SELECT COUNT(*) FROM sal_customers WHERE protection_status='PROTECTED');

  -- 信用守恒检查
  RAISE NOTICE '[CREDIT-POST] ord → sal credit_limit total: %',
    (SELECT COALESCE(SUM(credit_limit),0) FROM sal_customers WHERE customer_no LIKE 'ORD-%');
  RAISE NOTICE '[CREDIT-POST] ord → sal credit_used total: %',
    (SELECT COALESCE(SUM(credit_used),0) FROM sal_customers WHERE customer_no LIKE 'ORD-%');
  RAISE NOTICE '[CREDIT-POST] original ord credit_limit total: %',
    (SELECT COALESCE(SUM(credit_limit),0) FROM ord_customers);
  RAISE NOTICE '[CREDIT-POST] original ord credit_used total: %',
    (SELECT COALESCE(SUM(credit_used),0) FROM ord_customers);

  -- 黑名单完整性
  RAISE NOTICE '[BLACKLIST-CHECK] ord BLACKLIST count: %',
    (SELECT COUNT(*) FROM ord_customers WHERE risk_flag='BLACKLIST' OR blacklist=true);
  RAISE NOTICE '[BLACKLIST-CHECK] sal BLACKLIST (from ORD) count: %',
    (SELECT COUNT(*) FROM sal_customers WHERE customer_no LIKE 'ORD-%' AND risk_level='BLACKLIST');

  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Customer Master Migration G2 — COMPLETE';
  RAISE NOTICE '==============================================';
END $$;

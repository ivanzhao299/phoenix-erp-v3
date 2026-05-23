-- ═══════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — v14: prc_purchase_requests 字段补全
--
-- 问题: v3 建表时只有基础字段，v13 仅补了 store_code/requester_id/reviewer_name
-- 本次补全采购申请全链路所需的所有字段
-- ═══════════════════════════════════════════════════════════════

-- 业务字段
ALTER TABLE prc_purchase_requests
  ADD COLUMN IF NOT EXISTS item          VARCHAR(256),         -- 采购物品名称
  ADD COLUMN IF NOT EXISTS qty           VARCHAR(64),          -- 数量（含单位，如"500kg"）
  ADD COLUMN IF NOT EXISTS urgency       VARCHAR(20) DEFAULT 'NORMAL', -- NORMAL/URGENT/CRITICAL
  ADD COLUMN IF NOT EXISTS budget_amount DECIMAL(18,2) DEFAULT 0,      -- 预算金额
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10)  DEFAULT 'LAK',   -- 货币
  ADD COLUMN IF NOT EXISTS expected_date DATE,                 -- 期望到货日期
  ADD COLUMN IF NOT EXISTS reason        TEXT,                 -- 申请原因
  ADD COLUMN IF NOT EXISTS category      VARCHAR(50)  DEFAULT 'OTHER',  -- 采购分类
  ADD COLUMN IF NOT EXISTS applicant     VARCHAR(100);         -- 申请人姓名（realNameZh）

-- 审批/转换字段
ALTER TABLE prc_purchase_requests
  ADD COLUMN IF NOT EXISTS po_no         VARCHAR(64),          -- 转换后回写的采购单号
  ADD COLUMN IF NOT EXISTS reject_note   TEXT,                 -- 拒绝原因
  ADD COLUMN IF NOT EXISTS approved_by   VARCHAR(100),         -- 审批人 userId
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMP;            -- 审批时间

-- 索引
CREATE INDEX IF NOT EXISTS idx_prc_req_po_no ON prc_purchase_requests (po_no) WHERE po_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc_req_created_at ON prc_purchase_requests (created_at DESC);

-- 验证
DO $$
DECLARE col_count INT;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'prc_purchase_requests'
    AND column_name IN ('item','qty','urgency','budget_amount','currency_code',
                        'expected_date','reason','category','applicant',
                        'po_no','reject_note','approved_by','approved_at',
                        'store_code','requester_id','reviewer_name');
  IF col_count < 16 THEN
    RAISE WARNING 'prc_purchase_requests 字段可能不完整，当前有效字段数=%', col_count;
  ELSE
    RAISE NOTICE 'v14: prc_purchase_requests 字段验证通过，共 % 个目标字段就绪', col_count;
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════════
-- G41 · 应收往来余额台账 fin_ar_ledger（应收总账）+ 菜单 + 授权
-- ════════════════════════════════════════════════════════════════════════════
-- 背景：刘杰（集团财务总监 / ROLE_FINANCE_REVIEW_MANAGER）需"应收总账"——按往来单位/
--   客户的期初/本期应收/本期已收/期末余额快照（凤凰鸡场=老挝基普原币+本币CNY折算；
--   东鹏鸡场=本币CNY）。现有 fin_ar_invoices 是发票级，无法容纳此余额台账，故新建本表。
-- 本表为"只读报表台账"，由导入/对账生成，不参与发票收款状态机。
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fin_ar_ledger (
  id                  BIGSERIAL      PRIMARY KEY,
  -- 场 / 公司维度
  farm_code           VARCHAR(32)    NOT NULL,            -- PHOENIX(凤凰鸡场) / DONGPENG(东鹏鸡场)
  farm_name           VARCHAR(64)    NOT NULL,
  company_code        VARCHAR(64),                        -- best-effort：DONGPENG→COMP-LAO-XINGCHI；PHOENIX→COMP-LAO-AGRI
  -- 往来单位 / 客户
  counterparty_code   VARCHAR(64),                        -- 东鹏有编码(如 0010001)，凤凰可空
  counterparty_name   VARCHAR(256)   NOT NULL,            -- 结算往来单位 / 结算客户
  -- 期间（单据日期 / 区间末日，按日快照）
  period_date         DATE           NOT NULL,
  -- 金额（原币三段 + 期末本币折算）
  currency_code       VARCHAR(8)     NOT NULL DEFAULT 'LAK',
  opening_amount      NUMERIC(20,2)  NOT NULL DEFAULT 0,  -- 期初余额（原币）
  period_charge       NUMERIC(20,2)  NOT NULL DEFAULT 0,  -- 本期应收
  period_received     NUMERIC(20,2)  NOT NULL DEFAULT 0,  -- 本期已收
  closing_amount      NUMERIC(20,2)  NOT NULL DEFAULT 0,  -- 期末余额（原币）
  closing_amount_base NUMERIC(20,2),                      -- 期末余额（本币CNY，凤凰有；东鹏本身即CNY）
  base_currency       VARCHAR(8)     DEFAULT 'CNY',
  -- 来源 / 状态：OCR_PENDING_VERIFY（图片识别待财务核对）/ VERIFIED / RECON
  source              VARCHAR(32)    NOT NULL DEFAULT 'OCR_PENDING_VERIFY',
  remark              TEXT,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT uq_fin_ar_ledger UNIQUE (farm_code, counterparty_name, period_date)
);
CREATE INDEX IF NOT EXISTS idx_fin_ar_ledger_farm_period ON fin_ar_ledger(farm_code, period_date);
CREATE INDEX IF NOT EXISTS idx_fin_ar_ledger_counterparty ON fin_ar_ledger(counterparty_name);

-- ── 菜单：应收总账（挂 FINANCE 域，路由 /finance2/ar-ledger）──────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order, route)
VALUES ('MENU_FIN2_AR_LEDGER', '应收总账', 'FINANCE', 67, '/finance2/ar-ledger')
ON CONFLICT (menu_code) DO NOTHING;

-- ── 授权：镜像 MENU_FIN2_REPORT 的财务角色（含刘杰 ROLE_FINANCE_REVIEW_MANAGER）─
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.perms
FROM (VALUES
  ('ROLE_ADMIN',                  'MENU_FIN2_AR_LEDGER', 'V,X'),
  ('ROLE_CEO',                    'MENU_FIN2_AR_LEDGER', 'V,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_AR_LEDGER', 'V,X'),
  ('ROLE_FINANCE_ANALYST',        'MENU_FIN2_AR_LEDGER', 'V,X'),
  ('ROLE_HQ_FINANCE',             'MENU_FIN2_AR_LEDGER', 'V,X'),
  ('ROLE_GROUP_FINANCE',          'MENU_FIN2_AR_LEDGER', 'V,X'),
  ('ROLE_FIN_CFO',                'MENU_FIN2_AR_LEDGER', 'V,X'),
  ('ROLE_FIN_AR',                 'MENU_FIN2_AR_LEDGER', 'V'),
  ('ROLE_AUDITOR',                'MENU_FIN2_AR_LEDGER', 'V,X')
) AS v(role_code, menu_code, perms)
JOIN sys_role r ON r.role_code = v.role_code
JOIN sys_menu m ON m.menu_code = v.menu_code
ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

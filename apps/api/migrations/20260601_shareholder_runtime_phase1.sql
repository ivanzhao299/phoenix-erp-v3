-- ============================================================
-- Shareholder Runtime Phase 1 — 股东权益与出资台账
-- 幂等：CREATE TABLE IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING
-- 5 表：shr_projects / shr_shareholders / shr_project_equity /
--        shr_capital_contributions / shr_shareholder_scopes
-- 初始化：3 项目 + 7 股东 + 3 项目股权结构 + 股东查看范围
-- ============================================================
BEGIN;

-- ── 1. 股东项目 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shr_projects (
  id            BIGSERIAL PRIMARY KEY,
  project_code  VARCHAR(64)  NOT NULL UNIQUE,
  project_name  VARCHAR(256) NOT NULL,
  company_code  VARCHAR(64),
  site_code     VARCHAR(64),
  project_type  VARCHAR(32)  NOT NULL DEFAULT 'OTHER',   -- LAYER_FARM/BROILER_FARM/SLAUGHTER/FOOD_FACTORY/ORGANIC_FERTILIZER/OTHER
  capital_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_CONFIRMATION', -- PAID_IN_FULL/PARTIALLY_PAID/PENDING_CONFIRMATION
  status        VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
  remark        TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shr_projects_company ON shr_projects(company_code);

-- ── 2. 股东档案 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shr_shareholders (
  id               BIGSERIAL PRIMARY KEY,
  shareholder_code VARCHAR(64)  NOT NULL UNIQUE,
  shareholder_name VARCHAR(128) NOT NULL,
  linked_user_id   BIGINT,
  phone            VARCHAR(32),
  id_no_masked     VARCHAR(64),
  status           VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
  remark           TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── 3. 项目股权结构 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shr_project_equity (
  id                   BIGSERIAL PRIMARY KEY,
  project_code         VARCHAR(64) NOT NULL,
  shareholder_code     VARCHAR(64) NOT NULL,
  equity_ratio         NUMERIC(10,4) NOT NULL,            -- 百分比，如 59.8
  subscribed_capital   NUMERIC(18,2),                     -- 应缴
  paid_in_capital      NUMERIC(18,2) NOT NULL DEFAULT 0,  -- 实缴
  unpaid_capital       NUMERIC(18,2) GENERATED ALWAYS AS  -- 未缴差额（计算列）
                         (COALESCE(subscribed_capital,0) - COALESCE(paid_in_capital,0)) STORED,
  capital_status       VARCHAR(32) NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  is_voting_shareholder BOOLEAN NOT NULL DEFAULT TRUE,
  remark               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_code, shareholder_code)
);
CREATE INDEX IF NOT EXISTS idx_shr_equity_project ON shr_project_equity(project_code);

-- ── 4. 出资台账 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shr_capital_contributions (
  id                BIGSERIAL PRIMARY KEY,
  contribution_no   VARCHAR(64)  NOT NULL UNIQUE,
  project_code      VARCHAR(64)  NOT NULL,
  shareholder_code  VARCHAR(64)  NOT NULL,
  amount            NUMERIC(18,2) NOT NULL,
  currency          VARCHAR(8)   NOT NULL DEFAULT 'CNY',
  contribution_date DATE,
  payment_method    VARCHAR(64),
  source_type       VARCHAR(32)  NOT NULL DEFAULT 'BANK_TRANSFER', -- BANK_TRANSFER/CASH/DIVIDEND_OFFSET/SHAREHOLDER_ADVANCE/OTHER
  source_reference  VARCHAR(256),
  bank_account      VARCHAR(128),
  status            VARCHAR(32)  NOT NULL DEFAULT 'DRAFT',   -- DRAFT/CONFIRMED/CANCELLED
  remark            TEXT,
  created_by        BIGINT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shr_contrib_project ON shr_capital_contributions(project_code, shareholder_code);

-- ── 5. 股东查看范围（按项目/公司/场区授权，非单一角色）──────────────────
CREATE TABLE IF NOT EXISTS shr_shareholder_scopes (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL,
  shareholder_code   VARCHAR(64),
  scope_type         VARCHAR(32) NOT NULL,   -- GROUP/BU/COMPANY/SITE/PROJECT
  scope_code         VARCHAR(64),
  project_code       VARCHAR(64),
  can_view_finance   BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_operation BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_dividend  BOOLEAN NOT NULL DEFAULT TRUE,
  can_approve        BOOLEAN NOT NULL DEFAULT FALSE,
  status             VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shr_scope_user ON shr_shareholder_scopes(user_id);

-- ════════════════ 初始化数据 ════════════════

-- 项目
INSERT INTO shr_projects (project_code, project_name, company_code, site_code, project_type, capital_status, remark) VALUES
  ('SHR-DONGPENG-LAYER','东鹏蛋鸡养殖场','COMP-LAO-XINGCHI','SITE-DONGPENG-LAYER','LAYER_FARM','PAID_IN_FULL','出资已基本到位'),
  ('SHR-MENGSAI-LAYER','孟赛蛋鸡养殖场','COMP-LAO-AGRI','SITE-MENGSAI-LAYER','LAYER_FARM','PARTIALLY_PAID','未完全按比例出资到位'),
  ('SHR-VTE-FOOD','万象食品厂','COMP-LAO-FOOD','SITE-VTE-SLAUGHTER','FOOD_FACTORY','PARTIALLY_PAID','未完全按比例出资到位')
ON CONFLICT (project_code) DO NOTHING;

-- 股东（linked_user_id 经 username 解析，无对应用户则 NULL）
INSERT INTO shr_shareholders (shareholder_code, shareholder_name, linked_user_id, remark)
SELECT v.code, v.name, u.user_id, v.remark
FROM (VALUES
  ('SHR-ZHU-ZHAOCUN','朱兆存','zhuzhaocun',NULL),
  ('SHR-ZHAO-YONGWEI','赵永伟','zhaoyongwei',NULL),
  ('SHR-SONG-LEI','宋雷','songlei',NULL),
  ('SHR-FU-QIANG','伏强','fuqiang',NULL),
  ('SHR-ZHU-ZHAOAN','朱召安','zhuzhaoan',NULL),
  ('SHR-CHEN-YIFEI','陈逸飞',NULL,'无系统用户，仅建股东档案'),
  ('SHR-XUE-GANG','薛刚',NULL,'万象食品厂股东；实收资本表来源')
) AS v(code, name, username, remark)
LEFT JOIN sys_user u ON u.username = v.username
ON CONFLICT (shareholder_code) DO NOTHING;

-- 项目股权结构（equity_ratio 百分比；DONGPENG=PAID_IN_FULL，其余 PARTIALLY_PAID）
INSERT INTO shr_project_equity (project_code, shareholder_code, equity_ratio, capital_status) VALUES
  ('SHR-DONGPENG-LAYER','SHR-ZHU-ZHAOCUN',59.8,'PAID_IN_FULL'),
  ('SHR-DONGPENG-LAYER','SHR-ZHAO-YONGWEI',17.5,'PAID_IN_FULL'),
  ('SHR-DONGPENG-LAYER','SHR-SONG-LEI',7.5,'PAID_IN_FULL'),
  ('SHR-DONGPENG-LAYER','SHR-FU-QIANG',6.5,'PAID_IN_FULL'),
  ('SHR-DONGPENG-LAYER','SHR-ZHU-ZHAOAN',4.35,'PAID_IN_FULL'),
  ('SHR-DONGPENG-LAYER','SHR-CHEN-YIFEI',4.35,'PAID_IN_FULL'),
  ('SHR-MENGSAI-LAYER','SHR-ZHU-ZHAOCUN',50,'PARTIALLY_PAID'),
  ('SHR-MENGSAI-LAYER','SHR-ZHAO-YONGWEI',25,'PARTIALLY_PAID'),
  ('SHR-MENGSAI-LAYER','SHR-SONG-LEI',25,'PARTIALLY_PAID'),
  ('SHR-VTE-FOOD','SHR-ZHU-ZHAOCUN',30,'PARTIALLY_PAID'),
  ('SHR-VTE-FOOD','SHR-ZHAO-YONGWEI',30,'PARTIALLY_PAID'),
  ('SHR-VTE-FOOD','SHR-XUE-GANG',40,'PARTIALLY_PAID')
ON CONFLICT (project_code, shareholder_code) DO NOTHING;

-- 股东查看范围（按项目/公司/场区授权；无系统用户者不建 scope）
INSERT INTO shr_shareholder_scopes (user_id, shareholder_code, scope_type, scope_code, project_code, can_approve, status)
SELECT u.user_id, v.shr_code, v.scope_type, v.scope_code, v.project_code, FALSE, 'ACTIVE'
FROM (VALUES
  ('zhaoyongwei','SHR-ZHAO-YONGWEI','GROUP','ORG-GROUP',NULL),                              -- 赵永伟：全集团（持股3项目）
  ('zhuzhaocun', 'SHR-ZHU-ZHAOCUN','GROUP','ORG-GROUP',NULL),                               -- 朱兆存：GROUP（待确认是否全集团查看）
  ('songlei',    'SHR-SONG-LEI','PROJECT','SITE-MENGSAI-LAYER','SHR-MENGSAI-LAYER'),         -- 宋雷：孟赛
  ('songlei',    'SHR-SONG-LEI','PROJECT','SITE-DONGPENG-LAYER','SHR-DONGPENG-LAYER'),       -- 宋雷：东鹏 7.5%
  ('fuqiang',    'SHR-FU-QIANG','PROJECT','SITE-DONGPENG-LAYER','SHR-DONGPENG-LAYER'),       -- 符强：东鹏
  ('zhuzhaoan',  'SHR-ZHU-ZHAOAN','PROJECT','SITE-DONGPENG-LAYER','SHR-DONGPENG-LAYER')      -- 朱召安：东鹏
) AS v(username, shr_code, scope_type, scope_code, project_code)
JOIN sys_user u ON u.username = v.username
WHERE NOT EXISTS (
  SELECT 1 FROM shr_shareholder_scopes s
  WHERE s.user_id = u.user_id AND s.scope_type = v.scope_type
    AND COALESCE(s.project_code,'') = COALESCE(v.project_code,'')
    AND s.shareholder_code = v.shr_code
);

-- ── 6. 菜单注册（sys_menu）+ 角色授权（前端侧边栏可见性）──────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order, route) VALUES
  ('MENU_SHAREHOLDER_DASHBOARD',   '股东驾驶舱', 'SHAREHOLDER', 609, '/shareholders/dashboard'),
  ('MENU_SHAREHOLDER_VIEW',        '股东项目',   'SHAREHOLDER', 610, '/shareholders/projects'),
  ('MENU_SHAREHOLDER_MANAGE',      '股东权益管理','SHAREHOLDER', 611, '/shareholders/projects'),
  ('MENU_SHAREHOLDER_CONTRIBUTION','出资台账',   'SHAREHOLDER', 612, '/shareholders/contributions'),
  ('MENU_SHAREHOLDER_SCOPE',       '股东查看范围','SHAREHOLDER', 613, '/shareholders/scopes')
ON CONFLICT (menu_code) DO NOTHING;

-- 角色授权（与静态矩阵 rbac.matrix.ts 一致；幂等 ON CONFLICT DO NOTHING）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.perms
FROM (VALUES
  ('ROLE_ADMIN','MENU_SHAREHOLDER_VIEW','V,C,E,D,A,X'),
  ('ROLE_ADMIN','MENU_SHAREHOLDER_MANAGE','V,C,E,D,A,X'),
  ('ROLE_ADMIN','MENU_SHAREHOLDER_CONTRIBUTION','V,C,E,D,A,X'),
  ('ROLE_ADMIN','MENU_SHAREHOLDER_SCOPE','V,C,E,D,A,X'),
  ('ROLE_ADMIN','MENU_SHAREHOLDER_DASHBOARD','V,X'),
  ('ROLE_CEO','MENU_SHAREHOLDER_VIEW','V,X'),
  ('ROLE_CEO','MENU_SHAREHOLDER_MANAGE','V,C,E,A,X'),
  ('ROLE_CEO','MENU_SHAREHOLDER_CONTRIBUTION','V,A,X'),
  ('ROLE_CEO','MENU_SHAREHOLDER_SCOPE','V,C,E,D,X'),
  ('ROLE_CEO','MENU_SHAREHOLDER_DASHBOARD','V,X'),
  ('ROLE_HQ_FINANCE','MENU_SHAREHOLDER_VIEW','V,X'),
  ('ROLE_HQ_FINANCE','MENU_SHAREHOLDER_MANAGE','V,C,E,X'),
  ('ROLE_HQ_FINANCE','MENU_SHAREHOLDER_CONTRIBUTION','V,C,E,A,X'),
  ('ROLE_HQ_FINANCE','MENU_SHAREHOLDER_SCOPE','V,C,E,D,X'),
  ('ROLE_HQ_FINANCE','MENU_SHAREHOLDER_DASHBOARD','V,X'),
  ('ROLE_FIN_ACCT','MENU_SHAREHOLDER_VIEW','V,X'),
  ('ROLE_FIN_ACCT','MENU_SHAREHOLDER_CONTRIBUTION','V,C,X'),
  ('ROLE_FIN_ACCT','MENU_SHAREHOLDER_DASHBOARD','V,X'),
  ('ROLE_AUDITOR','MENU_SHAREHOLDER_VIEW','V,X'),
  ('ROLE_AUDITOR','MENU_SHAREHOLDER_DASHBOARD','V,X'),
  ('ROLE_FACTORY_MGR','MENU_SHAREHOLDER_DASHBOARD','V,X'),
  ('ROLE_CASH','MENU_SHAREHOLDER_DASHBOARD','V,X')
) AS v(role_code, menu_code, perms)
JOIN sys_role r ON r.role_code = v.role_code
JOIN sys_menu m ON m.menu_code = v.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

COMMIT;

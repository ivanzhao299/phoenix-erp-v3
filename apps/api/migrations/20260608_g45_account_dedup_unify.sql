-- ════════════════════════════════════════════════════════════════════════════
-- G45 · 资金账户去重 + 统一公司显示名（刘杰↔王玮华 核对治理 G44 后续）
-- ════════════════════════════════════════════════════════════════════════════
-- 用户决策（G44）：① 账户去重——以刘杰全量账户(FH-/DP-)为主档，王玮华 WWH-* 重复账户
--   的 93 笔流水重指向对应 FH-/DP-，再停用 WWH-* 空账户；② 统一公司显示名；
--   ③ 万象仓库归凤凰农业(COMP-LAO-AGRI，已是现状)；④ 对账按时间(另起只读视图)。
--
-- 安全要点（"不要搞错"）：映射严格 1:1；流水 txn_date/amount/balance_after/direction 不动，
--   仅改账户指向；重指向后按"最后一笔流水 balance_after"回填目标账户 current_balance。
-- 内联映射（不用 TEMP TABLE，避免 psql 自动提交丢表）；全幂等。
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 重指向流水 WWH-* → FH-/DP-（17 个 1:1；保留日期/金额/余额）─────────────
UPDATE fin_cash_transactions t
SET account_id   = a.id,
    account_code = a.account_code,
    account_name = a.account_name,
    company_name = a.company_name
FROM (VALUES
  ('WWH-FH-PAB-CNY','FH-10201'),
  ('WWH-FH-CASH-CNY','FH-101'),
  ('WWH-FH-CASH-LAK','FH-102'),
  ('WWH-FH-SL-LDB-LAK','FH-10206'),
  ('WWH-FH-SL-BCEL-LAK','FH-10207'),
  ('WWH-FH-SL-BCEL-CNY','FH-10208'),
  ('WWH-FH-BCEL-LAK','FH-10202'),
  ('WWH-FH-BCEL-CNY','FH-10203'),
  ('WWH-FH-BCEL-THB','FH-10204'),
  ('WWH-FH-BCEL-USD','FH-10205'),
  ('WWH-FH-LDB-LAK','FH-10209'),
  ('WWH-FH-LDB-CNY','FH-10212'),
  ('WWH-FH-LDB-THB','FH-10211'),
  ('WWH-FH-LDB-USD','FH-10210'),
  ('WWH-XC-CASH-CNY','DP-01'),
  ('WWH-XC-LDB-LAK','DP-10'),
  ('WWH-XC-BCEL-LAK','DP-11')
) AS m(old_code, new_code)
JOIN fin_cash_accounts a ON a.account_code = m.new_code
WHERE t.account_code = m.old_code;

-- ── 2. 回填目标账户 current_balance = 最后一笔流水的 balance_after ──────────────
UPDATE fin_cash_accounts a
SET current_balance = sub.bal, updated_at = now()
FROM (
  SELECT DISTINCT ON (account_code) account_code, balance_after AS bal
  FROM fin_cash_transactions
  WHERE account_code IN ('FH-10201','FH-101','FH-102','FH-10206','FH-10207','FH-10208',
                         'FH-10202','FH-10203','FH-10204','FH-10205','FH-10209','FH-10212',
                         'FH-10211','FH-10210','DP-01','DP-10','DP-11')
  ORDER BY account_code, txn_date DESC, txn_no DESC
) sub
WHERE a.account_code = sub.account_code;

-- ── 3. 停用重复的 WWH-* 账户（流水已迁出）──────────────────────────────────────
UPDATE fin_cash_accounts
SET status = 'INACTIVE', updated_at = now(),
    remark = COALESCE(remark,'') || ' ｜[G45 已并入刘杰主档(FH-/DP-)，停用]'
WHERE account_code LIKE 'WWH-%' AND status <> 'INACTIVE';

-- ── 4. 统一公司显示名（账户 + 流水）────────────────────────────────────────────
UPDATE fin_cash_accounts SET company_name = '凤凰农业', updated_at = now()
 WHERE company_code = 'COMP-LAO-AGRI' AND COALESCE(company_name,'') <> '凤凰农业';
UPDATE fin_cash_accounts SET company_name = '东鹏星驰', updated_at = now()
 WHERE company_code = 'COMP-LAO-XINGCHI' AND COALESCE(company_name,'') <> '东鹏星驰';
UPDATE fin_cash_transactions SET company_name = '凤凰农业'
 WHERE company_code = 'COMP-LAO-AGRI' AND COALESCE(company_name,'') <> '凤凰农业';
UPDATE fin_cash_transactions SET company_name = '东鹏星驰'
 WHERE company_code = 'COMP-LAO-XINGCHI' AND COALESCE(company_name,'') <> '东鹏星驰';

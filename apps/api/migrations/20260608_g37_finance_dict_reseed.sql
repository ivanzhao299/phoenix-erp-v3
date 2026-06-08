-- ════════════════════════════════════════════════════════════════════════════
-- G37 · 财务字典补种（修复 G34/F5 暴露的「顶级 migrations/ 未部署」遗漏）
-- ════════════════════════════════════════════════════════════════════════════
-- 根因：FIN_CONTRIBUTION_TYPE（股东资金记录·资金类型）与 FIN_RECEIPT_METHOD
--       （收款单·收款方式）的种子仅存在于顶级 migrations/20260604_g4a_finance_dict_seed.sql。
--       而生产 Deploy 只跑 apps/api/migrations/2026*.sql（G36 已锁定确认），顶级目录从未执行
--       → 生产 sys_dict 缺这两类 → 前端 <DictSelect> 渲染为空（如「资金类型」下拉无选项）。
--
-- 注：FIN_EXPENSE_TYPE / FIN_FUND_NATURE 已由 apps/api/migrations 内的 G2 种子覆盖（生产已有），
--     本迁移不重复；PRC_PAYER_TYPE / PRC_PAYMENT_METHOD 同理。
--
-- 列范式与冲突保护沿用 G2（已在生产成功执行的范式）：
--   仅幂等 INSERT（WHERE NOT EXISTS），绝不 DELETE / UPDATE sys_dict 已有记录。
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
SELECT v.dict_type, v.dict_code, v.dict_label_zh, v.dict_label_en, v.dict_code, v.sort_no, 'ACTIVE'
FROM (VALUES
  -- 股东出资 / 资金类型（股东资金记录抽屉「资金类型 *」）
  ('FIN_CONTRIBUTION_TYPE','INVESTMENT','股权投资','Equity Investment',1),
  ('FIN_CONTRIBUTION_TYPE','LOAN','借款','Loan',2),
  ('FIN_CONTRIBUTION_TYPE','ADVANCE','垫资','Advance',3),
  ('FIN_CONTRIBUTION_TYPE','GUARANTEE','担保金','Guarantee',4),
  ('FIN_CONTRIBUTION_TYPE','PAYMENT_ON_BEHALF','代付','Payment On Behalf',5),
  -- 收款方式（收款单 / AR 收款）
  ('FIN_RECEIPT_METHOD','BANK','银行转账','Bank Transfer',1),
  ('FIN_RECEIPT_METHOD','CHECK','支票','Check',2),
  ('FIN_RECEIPT_METHOD','CASH','现金','Cash',3),
  ('FIN_RECEIPT_METHOD','ONLINE','线上支付','Online Payment',4),
  ('FIN_RECEIPT_METHOD','OTHER','其他','Other',9)
) AS v(dict_type, dict_code, dict_label_zh, dict_label_en, sort_no)
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict d WHERE d.dict_type = v.dict_type AND d.dict_code = v.dict_code
);

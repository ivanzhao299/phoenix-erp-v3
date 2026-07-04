# Chanjet Finance Card System Confirmation Audit

Generated at: 2026-07-04T13:49:52.743Z
Decision: GO_WITH_CONDITIONS

## Summary

- Checks: 6/6
- Cards: 8
- System confirmed authority: 2
- System confirmed readonly: 3
- System blocked from authority: 3
- Manual finance confirmation required: 0
- Next gate: CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT

## Checks

|Check|Result|Severity|Evidence|
|---|---|---|---|
|System confirmation runtime method exists|PASS|P0|Service exposes system-side confirmation matrix.|
|System confirmation endpoint exists|PASS|P0|GET /api/chanjet/integration/finance-card-system-confirmation exists behind read permission.|
|All required cards are system-confirmed|PASS|P0|8/8 cards have review evidence.|
|No manual finance confirmation remains|PASS|P0|All confirmation decisions are system-side ERP semantic decisions.|
|Only AR/AP are promoted to Chanjet authority|PASS|P0|Cash, today receipt/payment, subject balance, and statements are not silently promoted.|
|Write boundaries remain closed|PASS|P0|System confirmation is readonly and does not write Chanjet/ERP business facts.|

## Confirmation Matrix

|Card|Status|Primary source|Authority allowed|System decision|
|---|---|---|---|---|
|应收待收款|SYSTEM_CONFIRMED_AUTHORITY|CHANJET|YES|好业财应收统计作为应收待收主卡片权威；ERP 发票/收款明细作为辅助差异。|
|应付待付款|SYSTEM_CONFIRMED_AUTHORITY|CHANJET|YES|好业财应付统计作为应付待付主卡片权威；ERP 采购/付款明细作为辅助差异。|
|现金账户余额|SYSTEM_BLOCKED_FROM_AUTHORITY|ERP|NO|好业财资金账户镜像尚未证明余额字段、币种和余额时点，ERP 资金余额继续作为主值。|
|今日收款|SYSTEM_BLOCKED_FROM_AUTHORITY|ERP|NO|好业财收款单日期/状态/方向口径未完全证明，ERP 当日现金流继续作为今日收款主值。|
|今日付款|SYSTEM_BLOCKED_FROM_AUTHORITY|ERP|NO|好业财付款单日期/状态/方向口径未完全证明，ERP 当日现金流继续作为今日付款主值。|
|科目余额|SYSTEM_CONFIRMED_READONLY|CHANJET_READONLY|NO|好业财科目余额表作为只读报表/对账来源，不写 ERP 业务表，不作为运营主卡片金额。|
|资产负债表关键项|SYSTEM_CONFIRMED_READONLY|CHANJET_READONLY|NO|好业财资产负债表作为只读财务报表来源，经营数据不能拼装替代法定报表。|
|利润表关键项|SYSTEM_CONFIRMED_READONLY|CHANJET_READONLY|NO|好业财利润表作为只读财务报表来源，ERP 运营数据只做辅助解释。|

## Boundaries

- Chanjet write/delete/modify: false
- Voucher push: false
- ERP business overwrite: false
- Migration / DB write / deploy / push from this audit: false

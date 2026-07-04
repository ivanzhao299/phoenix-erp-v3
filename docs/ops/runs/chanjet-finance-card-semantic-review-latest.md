# Chanjet Finance Card Semantic Review Audit

Generated at: 2026-07-04T13:32:45.090Z
Decision: GO_WITH_CONDITIONS

## Summary

- Checks: 6/6
- Cards: 8
- Approved for authority: 2
- Ready for finance confirmation: 6
- Blocked: 0
- Next gate: CHANJET_P3_FINANCE_CARD_SEMANTIC_CONFIRMATION

## Checks

|Check|Result|Severity|Evidence|
|---|---|---|---|
|Semantic review runtime method exists|PASS|P0|Service exposes structured finance card semantic review matrix.|
|Semantic review endpoint exists|PASS|P0|GET /api/chanjet/integration/finance-card-semantic-review is available behind MENU_FIN2_AR_LEDGER V.|
|All required cards have review items|PASS|P0|8/8 cards generated.|
|Unsafe promotions remain blocked|PASS|P0|Non-authority cards remain blocked or finance-confirmation-only.|
|Finance confirmation questions are present|PASS|P1|Every card has explicit questions for finance/business confirmation.|
|Write boundaries remain explicit|PASS|P0|Review does not write Chanjet, push vouchers, or overwrite ERP business facts.|

## Review Matrix

|Card|Read Model|Status|Samples|Instruction|
|---|---|---|---:|---|
|应收待收款|AR_OPEN|APPROVED_FOR_AUTHORITY|71|可保留权威接线；继续展示 ERP 辅助差异。|
|应付待付款|AP_OPEN|APPROVED_FOR_AUTHORITY|43|可保留权威接线；继续展示 ERP 辅助差异。|
|现金账户余额|CASH_BALANCE|READY_FOR_FINANCE_CONFIRMATION|47|进入财务字段口径确认；确认前不得升权为主卡片。|
|今日收款|TODAY_RECEIPT|READY_FOR_FINANCE_CONFIRMATION|171|进入财务字段口径确认；确认前不得升权为主卡片。|
|今日付款|TODAY_PAYMENT|READY_FOR_FINANCE_CONFIRMATION|109|进入财务字段口径确认；确认前不得升权为主卡片。|
|科目余额|SUBJECT_BALANCE|READY_FOR_FINANCE_CONFIRMATION|3|进入财务字段口径确认；确认前不得升权为主卡片。|
|资产负债表关键项|BALANCE_SHEET|READY_FOR_FINANCE_CONFIRMATION|3|进入财务字段口径确认；确认前不得升权为主卡片。|
|利润表关键项|INCOME_STATEMENT|READY_FOR_FINANCE_CONFIRMATION|3|进入财务字段口径确认；确认前不得升权为主卡片。|

## Boundaries

- Chanjet write/delete/modify: false
- Voucher push: false
- ERP business overwrite: false
- Migration / DB write / deploy / push from this audit: false

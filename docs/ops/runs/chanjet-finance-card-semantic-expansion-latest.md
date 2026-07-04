# Chanjet Finance Card Semantic Expansion Audit

Generated at: 2026-07-04T13:06:43.332Z
Decision: GO_WITH_CONDITIONS

## Summary

- Checks: 7/7
- Card endpoint coverage: 8/8
- Next gate: CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW

## Checks

|Check|Result|Severity|Evidence|
|---|---|---|---|
|Semantic expansion runtime method exists|PASS|P0|ChanjetIntegrationService exposes financeCardSemanticLockExpansionOverview with structured card expansion items.|
|Semantic expansion endpoint exists|PASS|P0|GET /api/chanjet/integration/finance-card-semantic-expansion is available behind MENU_FIN2_AR_LEDGER V.|
|All eight finance cards are covered by expansion definitions|PASS|P0|arOpen/AR_OPEN, apOpen/AP_OPEN, cashBalance/CASH_BALANCE, todayInflow/TODAY_RECEIPT, todayOutflow/TODAY_PAYMENT, subjectBalance/SUBJECT_BALANCE, balanceSheet/BALANCE_SHEET, incomeStatement/INCOME_STATEMENT|
|Promotion remains guarded|PASS|P0|Expansion distinguishes current authority, readonly candidates, promotion candidates, and finance confirmation requirements.|
|Chanjet write boundaries remain explicit|PASS|P0|The new expansion endpoint is read-only and keeps Chanjet write/voucher push disabled.|
|Latest readonly sync artifact covers finance card endpoints|PASS|P1|8/8 card endpoints have readonly mirror evidence.|
|Previous authority QA passed|PASS|P1|8/8 checks, decision=GO_WITH_CONDITIONS|

## Card Endpoint Evidence

|Card|Read Model|Covered|Rows|Amount Sum|Latest Pulled At|
|---|---|---|---:|---:|---|
|应收待收款|AR_OPEN|yes|71|-10936306.32|2026-07-04T07:40:11.677Z|
|应付待付款|AP_OPEN|yes|43|-7084274.34|2026-07-04T07:40:10.629Z|
|现金账户余额|CASH_BALANCE|yes|47|0|2026-07-03T13:05:55.027Z|
|今日收款|TODAY_RECEIPT|yes|171|5763304971|2026-07-04T10:07:58.371Z|
|今日付款|TODAY_PAYMENT|yes|109|9003331626.45|2026-07-04T10:07:51.593Z|
|科目余额|SUBJECT_BALANCE|yes|3|0|2026-07-04T10:08:07.427Z|
|资产负债表关键项|BALANCE_SHEET|yes|3|0|2026-07-04T10:08:07.921Z|
|利润表关键项|INCOME_STATEMENT|yes|3|0|2026-07-04T10:08:08.411Z|

## Boundaries

- Chanjet write/delete/modify: false
- Voucher push: false
- ERP business overwrite: false
- Migration / DB write / deploy / push from this audit: false

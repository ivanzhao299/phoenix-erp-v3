# Chanjet Finance Card Source Switch Audit

Generated at: 2026-07-04T14:34:11.430Z
Decision: GO_WITH_CONDITIONS

## Summary

- Checks: 7/7
- Switch ready: 2
- Readonly report ready: 3
- Switch blocked: 3
- Unsafe switches prevented: 6
- Next gate: CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_UI_QA

## Checks

|Check|Result|Severity|Evidence|
|---|---|---|---|
|Source switch audit runtime method exists|PASS|P0|ChanjetIntegrationService exposes structured source switch audit.|
|Source switch audit endpoint exists|PASS|P0|GET /api/chanjet/integration/finance-card-source-switch-audit exists behind MENU_FIN2_AR_LEDGER:V.|
|Finance report primary value path is guarded by system confirmation|PASS|P0|FinancialReportsService now requires both read-model AUTHORITY_READY and SYSTEM_CONFIRMED_AUTHORITY before using Chanjet authoritativeValue.|
|Only AR/AP are allowed to feed primary finance cards|PASS|P0|System-confirmed primary switch set is AR_OPEN and AP_OPEN only.|
|Blocked and readonly cards cannot feed primary finance cards|PASS|P0|Cash, today receipt/payment, subject balance, balance sheet, and income statement are not primary-card switches.|
|Finance UI displays source, ERP auxiliary, diff, and no silent overwrite warning|PASS|P0|Finance report page visibly exposes source and difference context.|
|Write boundaries remain closed|PASS|P0|Source switch audit is readonly and does not write Chanjet or ERP business facts.|

## Source Switch Matrix

|Card|Expected status|Primary source|Can feed primary card|Confirmation status|
|---|---|---|---|---|
|应收待收款|SWITCH_READY|CHANJET|YES|SYSTEM_CONFIRMED_AUTHORITY|
|应付待付款|SWITCH_READY|CHANJET|YES|SYSTEM_CONFIRMED_AUTHORITY|
|现金账户余额|SWITCH_BLOCKED|ERP|NO|SYSTEM_BLOCKED_FROM_AUTHORITY|
|今日收款|SWITCH_BLOCKED|ERP|NO|SYSTEM_BLOCKED_FROM_AUTHORITY|
|今日付款|SWITCH_BLOCKED|ERP|NO|SYSTEM_BLOCKED_FROM_AUTHORITY|
|科目余额|READONLY_REPORT_READY|CHANJET_READONLY_REPORT|NO|SYSTEM_CONFIRMED_READONLY|
|资产负债表关键项|READONLY_REPORT_READY|CHANJET_READONLY_REPORT|NO|SYSTEM_CONFIRMED_READONLY|
|利润表关键项|READONLY_REPORT_READY|CHANJET_READONLY_REPORT|NO|SYSTEM_CONFIRMED_READONLY|

## Boundaries

- Chanjet write/delete/modify: false
- Voucher push: false
- ERP business overwrite: false
- Migration / DB write / deploy / push from this audit: false

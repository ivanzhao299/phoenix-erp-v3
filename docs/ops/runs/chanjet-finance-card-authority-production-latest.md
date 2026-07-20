# Chanjet Finance Card Authority Production Audit

Generated: 2026-07-20T03:07:04.674Z

Decision: GO_WITH_CONDITIONS

Next Gate: CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION

|Check|Result|Evidence|
|---|---|---|
|eight_card_contract|PASS|cards=8|
|ar_ap_authority_enabled|PASS|arOpen, apOpen|
|ar_ap_business_source_chanjet|PASS|arOpen:CHANJET_AR_STATISTICS_MIRROR, apOpen:CHANJET_AP_STATISTICS_MIRROR|
|unapproved_cards_fail_closed|PASS|cashBalance, todayInflow, todayOutflow, subjectBalance, balanceSheet, incomeStatement|
|today_cards_use_erp_fallback|PASS|todayInflow:ERP_FALLBACK, todayOutflow:ERP_FALLBACK|
|authority_wiring_verified|PASS|authorityWiringVerified=true|
|next_gate_advanced|PASS|nextGate=CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION|
|external_write_disabled|PASS|CHANJET_AUTHORITY_READY_ONLY_FOR_FINANCIAL_CARDS|

## Card State

|Card|Read model|Authority|Source|Status|
|---|---|---|---|---|
|arOpen|AR_OPEN|ENABLED|CHANJET_AR_STATISTICS_MIRROR|MISMATCH|
|apOpen|AP_OPEN|ENABLED|CHANJET_AP_STATISTICS_MIRROR|MISMATCH|
|cashBalance|CASH_BALANCE|BLOCKED|ERP_FALLBACK|BLOCKED_MAPPING|
|todayInflow|TODAY_RECEIPT|BLOCKED|ERP_FALLBACK|NEED_MANUAL_REVIEW|
|todayOutflow|TODAY_PAYMENT|BLOCKED|ERP_FALLBACK|NEED_MANUAL_REVIEW|
|subjectBalance|SUBJECT_BALANCE|BLOCKED|ERP_FALLBACK|READONLY_READY|
|balanceSheet|BALANCE_SHEET|BLOCKED|ERP_FALLBACK|READONLY_READY|
|incomeStatement|INCOME_STATEMENT|BLOCKED|ERP_FALLBACK|READONLY_READY|

## Guardrails

- Chanjet write/delete/modify: disabled.
- Voucher push: disabled.
- ERP business overwrite: disabled.
- Today receipt/payment cumulative mirror totals stay blocked until daily filtering and status reconciliation pass.


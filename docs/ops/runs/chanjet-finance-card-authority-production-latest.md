# Chanjet Finance Card Authority Production Audit

Generated: 2026-07-21T01:30:56.534Z

Decision: GO_WITH_CONDITIONS

Next Gate: CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW

|Check|Result|Evidence|
|---|---|---|
|eight_card_contract|PASS|cards=8|
|five_authority_cards_enabled|PASS|arOpen, apOpen, cashBalance, todayInflow, todayOutflow|
|authority_business_sources_locked|PASS|arOpen:CHANJET_AR_STATISTICS_MIRROR, apOpen:CHANJET_AP_STATISTICS_MIRROR, cashBalance:CHANJET_GL_CASH_BALANCE_MIRROR, todayInflow:CHANJET_AR_RECEIPT_DAILY_EFFECTIVE_MIRROR, todayOutflow:CHANJET_AP_PAYMENT_DAILY_EFFECTIVE_MIRROR|
|readonly_report_cards_fail_closed|PASS|subjectBalance:READONLY_READY, balanceSheet:READONLY_READY, incomeStatement:READONLY_READY|
|daily_cards_use_effective_business_date_contract|PASS|todayInflow:CHANJET_AR_RECEIPT_DAILY_EFFECTIVE_MIRROR, todayOutflow:CHANJET_AP_PAYMENT_DAILY_EFFECTIVE_MIRROR|
|authority_wiring_verified|PASS|authorityWiringVerified=true|
|next_gate_advanced|PASS|nextGate=CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW|
|external_write_disabled|PASS|CHANJET_AUTHORITY_READY_ONLY_FOR_FINANCIAL_CARDS|

## Card State

|Card|Read model|Authority|Source|Status|
|---|---|---|---|---|
|arOpen|AR_OPEN|ENABLED|CHANJET_AR_STATISTICS_MIRROR|MISMATCH|
|apOpen|AP_OPEN|ENABLED|CHANJET_AP_STATISTICS_MIRROR|MISMATCH|
|cashBalance|CASH_BALANCE|ENABLED|CHANJET_GL_CASH_BALANCE_MIRROR|MISMATCH|
|todayInflow|TODAY_RECEIPT|ENABLED|CHANJET_AR_RECEIPT_DAILY_EFFECTIVE_MIRROR|OK|
|todayOutflow|TODAY_PAYMENT|ENABLED|CHANJET_AP_PAYMENT_DAILY_EFFECTIVE_MIRROR|OK|
|subjectBalance|SUBJECT_BALANCE|BLOCKED|ERP_FALLBACK|READONLY_READY|
|balanceSheet|BALANCE_SHEET|BLOCKED|ERP_FALLBACK|READONLY_READY|
|incomeStatement|INCOME_STATEMENT|BLOCKED|ERP_FALLBACK|READONLY_READY|

## Guardrails

- Chanjet write/delete/modify: disabled.
- Voucher push: disabled.
- ERP business overwrite: disabled.
- Today receipt/payment cumulative mirror totals stay blocked until daily filtering and status reconciliation pass.


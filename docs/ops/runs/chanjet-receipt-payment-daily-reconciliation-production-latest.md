# Chanjet Receipt Payment Daily Reconciliation Production Audit

Generated: 2026-07-21T01:08:32.149Z

Business date: 2026-07-21

Decision: HOLD

Next Gate: CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION_REPAIR

|Check|Result|Evidence|
|---|---|---|
|daily_contract_two_metrics|PASS|metrics=2|
|daily_authority_ready|PASS|authorityReady=2|
|exact_source_fields|PASS|bizDate + voucherStatusEnum + totalAmount + entity contract|
|effective_only_guardrail|PASS|{"effectiveStatus":"EFFECTIVE","excludedStatuses":"SUBMITTED_and_all_non_EFFECTIVE"}|
|today_cards_authority_enabled|PASS|todayInflow:true, todayOutflow:true|
|today_cards_use_daily_amount|PASS|todayInflow:0/0, todayOutflow:0/0|
|business_pages_use_daily_source|PASS|todayInflow:CHANJET_AR_RECEIPT_DAILY_EFFECTIVE_MIRROR, todayOutflow:CHANJET_AP_PAYMENT_DAILY_EFFECTIVE_MIRROR|
|next_gate_advanced|FAIL|nextGate=CHANJET_P2_MASTER_DATA_MAPPING_REVIEW|
|external_write_disabled|PASS|{"chanjetWrite":false,"dbWrite":false}|

## Daily Metrics

|Metric|Entity|Business date|Effective rows|Excluded rows|Amount|Authority|
|---|---|---|---:|---:|---:|---|
|TODAY_RECEIPT|AR_RECEIPT|2026-07-21|0|0|0|READY|
|TODAY_PAYMENT|AP_PAYMENT|2026-07-21|0|0|0|READY|

## Guardrails

- Chanjet write/delete/modify: disabled.
- Voucher push: disabled.
- ERP business overwrite: disabled.
- Daily totals use only rawData.bizDate + EFFECTIVE + rawData.totalAmount.
- SUBMITTED and every non-EFFECTIVE status remain excluded.


# Chanjet P2 Master Data Mapping Review Production Audit

Generated: 2026-07-21T01:31:08.453Z
Decision: GO_WITH_CONDITIONS
Next Gate: CHANJET_P2_EXACT_MAPPING_APPROVAL_GATE

|Check|Result|Evidence|
|---|---|---|
|review_payload_available|PASS|candidates=1009|
|invalid_failure_rows_excluded|PASS|fake=0, excluded=6|
|counterparty_rejected_debt_excluded|PASS|status=READY, rejected=72|
|project_target_is_canonical|PASS|["biz_projects.project_code","sys_user_projects"]|
|cash_exact_candidates_present|PASS|exact=37, total=49|
|cash_conflict_free|PASS|conflicts=0|
|no_fuzzy_matching|PASS|{"exactOnly":true,"subjectReferencePolicy":"好业财科目作为只读账套科目基准，不伪造 ERP 科目主数据，也不进入映射批准队列。","normalizedExactNameAllowed":true,"companyScopeRequired":true,"currencyMatchRequiredForCashAccount":true,"fuzzyAutoMatch":false,"crossCompanyMatch":false,"chanjetWrite":false,"erpBusinessTableWrite":false,"middleLayerWrite":false}|
|external_and_business_writes_disabled|PASS|{"exactOnly":true,"subjectReferencePolicy":"好业财科目作为只读账套科目基准，不伪造 ERP 科目主数据，也不进入映射批准队列。","normalizedExactNameAllowed":true,"companyScopeRequired":true,"currencyMatchRequiredForCashAccount":true,"fuzzyAutoMatch":false,"crossCompanyMatch":false,"chanjetWrite":false,"erpBusinessTableWrite":false,"middleLayerWrite":false}|

## Domain Review

|Domain|Source rows|Exact|Need mapping|Conflicts|Waiting valid source|
|---|---:|---:|---:|---:|---|
|DEPARTMENT|31|0|0|0|no|
|PROJECT|6|0|0|0|no|
|CASH_ACCOUNT|49|37|0|0|no|
|SUBJECT|919|0|0|0|no|
|CURRENCY|4|4|0|0|no|

## Guardrails

- Chanjet write/delete/modify: disabled.
- ERP business-table write: disabled.
- Middle-layer write: disabled by this audit.
- Fuzzy and cross-company auto matching: disabled.


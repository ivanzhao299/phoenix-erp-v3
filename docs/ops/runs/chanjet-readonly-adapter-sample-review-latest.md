# Chanjet Readonly Adapter Sample Review

- generated_at: 2026-07-08T10:19:04.759Z
- source: docs/ops/runs/chanjet-readonly-field-adapter-audit-latest.json
- decision: GO_WITH_CONDITIONS
- semantic_coverage: 73.3%
- next_gate: CHANJET_READONLY_ADAPTER_PATCH_DEPLOY_AND_AUTHENTICATED_RERUN
- chanjet_write: false
- voucher_push: false
- erp_business_overwrite: false

## Domain Summary

|domain|sourceStatus|sampleRows|lockedFields|openFields|
|---|---|---|---|---|
|CHANJET_VOUCHER_HEADER|PARTIAL|60|voucherId, voucherNo, voucherDate|status|
|CHANJET_VOUCHER_LINE|PARTIAL|160|lineNo, debitAmount, creditAmount, currency|subjectCode, subjectName|
|CHANJET_COUNTERPARTY|PARTIAL|120|externalId, externalCode, externalName, mappingReviewStatus|roleCandidate|

## Field Coverage

|domain|field|coverage|samples|locked|
|---|---|---|---|---|
|CHANJET_VOUCHER_HEADER|voucherId|100%|3611637449493450, 3611635439633978, 3611634362482782, 3611633422962196, 3611631278884341, 3608481047518031, 3605799513753808, 3604676513240958|yes|
|CHANJET_VOUCHER_HEADER|voucherNo|100%|005, 004, 003, 002, 001, 042, 041, 040|yes|
|CHANJET_VOUCHER_HEADER|voucherDate|100%|2026-07-02, 2026-07-01, 2026-06-30, 2026-06-29, 2026-06-28, 2026-06-27, 2026-06-25, 2026-06-24|yes|
|CHANJET_VOUCHER_HEADER|status|0%|none|no|
|CHANJET_VOUCHER_LINE|lineNo|100%|1, 2, 3, 4, 5, 6, 7|yes|
|CHANJET_VOUCHER_LINE|subjectCode|0%|none|no|
|CHANJET_VOUCHER_LINE|subjectName|0%|none|no|
|CHANJET_VOUCHER_LINE|debitAmount|100%|1701000, 0, 1000, 800000, 371000, 10000000, 400000, 5558000|yes|
|CHANJET_VOUCHER_LINE|creditAmount|100%|0, 1701000, 10987000, 371000, 10000000, 6167000, 4902000, 5558000|yes|
|CHANJET_VOUCHER_LINE|currency|100%|RMB|yes|
|CHANJET_COUNTERPARTY|externalId|100%|3539743453873655, 3551319199067377, 3610461032941530, 3610461032941523, 3610460227634677, 3610460227634653, 3610458613220343, 3610458613220331|yes|
|CHANJET_COUNTERPARTY|externalCode|100%|RETAIL_CUSTOMER, 00030001, 00020011, 00020010, 00020009, 00020008, 00020007, 00020006|yes|
|CHANJET_COUNTERPARTY|externalName|100%|零散客户, 老挝星驰农业发展有限公司（沙耶武里）, 丁, 依金, 同, 娜娜, 向老头, 老刘|yes|
|CHANJET_COUNTERPARTY|roleCandidate|1.7%|CUSTOMER|no|
|CHANJET_COUNTERPARTY|mappingReviewStatus|100%|PENDING|yes|

## Conditions

- voucher_status_semantics_require_authenticated_rerun_after_adapter_patch
- subject_code_name_semantics_require_glAccount_adapter_patch_deployed_and_verified

## Blockers

- none

## Guardrails

Sample review is read-only and only promotes fields after explicit semantic coverage evidence.

# Chanjet Readonly Adapter Sample Review

- generated_at: 2026-07-08T10:33:15.839Z
- source: docs/ops/runs/chanjet-readonly-field-adapter-audit-latest.json
- decision: GO_WITH_CONDITIONS
- semantic_coverage: 93.3%
- next_gate: CHANJET_READONLY_ADAPTER_PATCH_DEPLOY_AND_AUTHENTICATED_RERUN
- chanjet_write: false
- voucher_push: false
- erp_business_overwrite: false

## Domain Summary

|domain|sourceStatus|sampleRows|lockedFields|openFields|
|---|---|---|---|---|
|CHANJET_VOUCHER_HEADER|READY|60|voucherId, voucherNo, voucherDate, status|none|
|CHANJET_VOUCHER_LINE|READY|160|lineNo, subjectCode, subjectName, debitAmount, creditAmount, currency|none|
|CHANJET_COUNTERPARTY|PARTIAL|120|externalId, externalCode, externalName, mappingReviewStatus|roleCandidate|

## Field Coverage

|domain|field|coverage|samples|locked|
|---|---|---|---|---|
|CHANJET_VOUCHER_HEADER|voucherId|100%|3611637449493450, 3611635439633978, 3611634362482782, 3611633422962196, 3611631278884341, 3608481047518031, 3605799513753808, 3604676513240958|yes|
|CHANJET_VOUCHER_HEADER|voucherNo|100%|005, 004, 003, 002, 001, 042, 041, 040|yes|
|CHANJET_VOUCHER_HEADER|voucherDate|100%|2026-07-02, 2026-07-01, 2026-06-30, 2026-06-29, 2026-06-28, 2026-06-27, 2026-06-25, 2026-06-24|yes|
|CHANJET_VOUCHER_HEADER|status|100%|POSTED_LOCKED, ADJUSTED|yes|
|CHANJET_VOUCHER_LINE|lineNo|100%|1, 2, 3, 4, 5, 6, 7|yes|
|CHANJET_VOUCHER_LINE|subjectCode|100%|100102, 400101, 660204, 660303, 100101, 400104, 660205, 112302|yes|
|CHANJET_VOUCHER_LINE|subjectName|100%|老挝币, 朱兆存（老挝币）, 开办费, 银行手续费（老挝币）, 人民币, 赵永伟（人民币）, 差旅费, 张鹏（万象装修）|yes|
|CHANJET_VOUCHER_LINE|debitAmount|100%|1701000, 0, 1000, 800000, 371000, 10000000, 400000, 5558000|yes|
|CHANJET_VOUCHER_LINE|creditAmount|100%|0, 1701000, 10987000, 371000, 10000000, 6167000, 4902000, 5558000|yes|
|CHANJET_VOUCHER_LINE|currency|100%|LAK, RMB|yes|
|CHANJET_COUNTERPARTY|externalId|100%|3539743453873655, 3551319199067377, 3610461032941530, 3610461032941523, 3610460227634677, 3610460227634653, 3610458613220343, 3610458613220331|yes|
|CHANJET_COUNTERPARTY|externalCode|100%|RETAIL_CUSTOMER, 00030001, 00020011, 00020010, 00020009, 00020008, 00020007, 00020006|yes|
|CHANJET_COUNTERPARTY|externalName|100%|零散客户, 老挝星驰农业发展有限公司（沙耶武里）, 丁, 依金, 同, 娜娜, 向老头, 老刘|yes|
|CHANJET_COUNTERPARTY|roleCandidate|1.7%|CUSTOMER|no|
|CHANJET_COUNTERPARTY|mappingReviewStatus|100%|PENDING|yes|

## Conditions

- none

## Blockers

- none

## Guardrails

Sample review is read-only and only promotes fields after explicit semantic coverage evidence.

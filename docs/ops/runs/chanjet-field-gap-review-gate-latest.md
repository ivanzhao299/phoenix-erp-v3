# Chanjet Field Gap Review Gate

Generated at: 2026-07-06T13:53:56.877Z
Decision: GO_WITH_CONDITIONS

## Boundaries

- Chanjet write/delete/modify: no
- Voucher push: no
- ERP business fact overwrite: no
- Migration/deploy: no

## Summary

- Source report: docs/ops/runs/chanjet-remote-readonly-coverage-audit-latest.json
- Endpoint coverage: 100%
- Finance card coverage: 100%
- Field classification coverage: 10.9%
- High/Critical open fields reviewed: 80
- Next gate: CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION

## Review Buckets

|priority|bucket|title|status|mirrorRows|high|target|
|---|---|---|---|---|---|---|
|P0|CHANJET_VOUCHER_HEADER|凭证头只读重现|GO_WITH_CONDITIONS|1247|31|chanjet_voucher_read_model.header|
|P0|CHANJET_VOUCHER_LINE|凭证明细只读重现|GO_WITH_CONDITIONS|1247|49|chanjet_voucher_read_model.lines[]|
|P0|CHANJET_COUNTERPARTY|往来单位映射|READY|292|0|chanjet_master_mapping.CUSTOMER_SUPPLIER|
|P0|CHANJET_AP_AR_AGGREGATE|应收/应付汇总口径|READY|114|0|chanjet_ap_ar_read_model|
|P0|CHANJET_PAYMENT_DOCUMENT|收付款单只读口径|READY|352|0|chanjet_payment_read_model|
|P1|CHANJET_REPORTING|科目余额与财务报表|READY|12|0|chanjet_financial_report_read_model|
|P1|CHANJET_PURCHASE_LINKAGE|采购链路差异对照|READY|42|0|chanjet_procurement_read_model|

## Recommended Execution Order

|gate|title|action|canStart|owner|
|---|---|---|---|---|
|FIELD-GAP-CHANJET_VOUCHER_LINE|凭证明细只读重现|implement_readonly_voucher_line_adapter|true|A3-Backend-Critical-Path + A2-Security-Regression-Gate|
|FIELD-GAP-CHANJET_VOUCHER_HEADER|凭证头只读重现|implement_readonly_voucher_header_adapter|true|A3-Backend-Critical-Path + A2-Security-Regression-Gate|
|FIELD-GAP-CHANJET_COUNTERPARTY|往来单位映射|complete_counterparty_mapping_review|true|A5-Data-Readiness + A2-Security-Regression-Gate|
|FIELD-GAP-CHANJET_AP_AR_AGGREGATE|应收/应付汇总口径|lock_ar_ap_aggregate_read_model|true|A3-Backend-Critical-Path + A2-Security-Regression-Gate|
|FIELD-GAP-CHANJET_PAYMENT_DOCUMENT|收付款单只读口径|lock_receipt_payment_date_status_fields|true|A3-Backend-Critical-Path + A2-Security-Regression-Gate|
|FIELD-GAP-CHANJET_REPORTING|科目余额与财务报表|implement_readonly_financial_statement_rows|true|A3-Backend-Critical-Path + A2-Security-Regression-Gate|
|FIELD-GAP-CHANJET_PURCHASE_LINKAGE|采购链路差异对照|implement_purchase_readonly_reconciliation|true|A3-Backend-Critical-Path + A2-Security-Regression-Gate|

## Sample High-Risk Fields

|bucket|endpoint|field|type|risk|erp|
|---|---|---|---|---|---|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].acctgTransCategoryId.id|number|HIGH|chanjet_master_mapping.id|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].acctgTransCategoryId.longName|string|HIGH|chanjet_master_mapping.longName|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].acctgTransCategoryId.name|string|HIGH|chanjet_master_mapping.name|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].boName|string|HIGH|chanjet_master_mapping.boName|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].createdStamp|string|HIGH|chanjet_master_mapping.createdStamp|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].createdUserId.id|number|HIGH|chanjet_master_mapping.id|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].hasAdjusted|boolean|HIGH|chanjet_master_mapping.hasAdjusted|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].hasEditAuth|boolean|HIGH|chanjet_master_mapping.hasEditAuth|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].basePostedCr|number|HIGH|chanjet_master_mapping.basePostedCr|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].basePostedDr|number|HIGH|chanjet_master_mapping.basePostedDr|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].comments|string|HIGH|chanjet_master_mapping.comments|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].hasQtyAccounting|boolean|HIGH|chanjet_master_mapping.hasQtyAccounting|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].id|number|HIGH|chanjet_master_mapping.id|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].longText|string|HIGH|chanjet_master_mapping.longText|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].postedCr|number|HIGH|chanjet_master_mapping.postedCr|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].postedCrQty|number|HIGH|chanjet_master_mapping.postedCrQty|

## Next

1. 先实现 P0 只读适配，不写好业财。
2. 往来单位映射先由中间层审核，不自动覆盖 ERP 主数据。
3. 凭证写回保持关闭，先做只读重现和人工审核。
4. 收付款与资金余额必须锁定日期、状态、余额字段后才可影响主卡片。

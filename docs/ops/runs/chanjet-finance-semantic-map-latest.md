# Chanjet Finance Semantic Map

Generated at: 2026-07-04T03:27:09.774Z
Decision: GO_WITH_CONDITIONS

## Boundaries

- Chanjet write/delete/modify: no
- Voucher push: no
- ERP business table write: no
- Migration/deploy: no
- Scope: ERP readonly middle-layer semantic mapping only

## Source Summary

- Source report: docs/ops/runs/chanjet-field-mapping-report-latest.json
- Total field candidates: 1677
- Pending fields: 1494
- High/Critical open fields: 1341
- Envelope noise: 0

## Semantic Buckets

|priority|semantic|title|fields|high|target|
|---|---|---|---|---|---|
|P0|CHANJET_VOUCHER_LINE|凭证明细|22|22|chanjet_voucher_read_model.lines[]|
|P0|CHANJET_VOUCHER_HEADER|凭证头|8|8|chanjet_voucher_read_model.header|
|P0|CHANJET_AP_AR_AGGREGATE|应收/应付统计|0|0|chanjet_ap_ar_read_model|
|P0|CHANJET_COUNTERPARTY|往来单位|0|0|chanjet_master_mapping.CUSTOMER_SUPPLIER|
|P1|CHANJET_PAYMENT_DOCUMENT|收付款单|0|0|chanjet_payment_read_model|
|P1|CHANJET_PURCHASE_LINKAGE|采购订单关联|0|0|chanjet_procurement_read_model|

## Endpoint Coverage

|semantic|endpoint|
|---|---|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3537748712226818|
|CHANJET_VOUCHER_LINE|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3539743721526654|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3537748712226818|
|CHANJET_VOUCHER_HEADER|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3539743721526654|
|CHANJET_AP_AR_AGGREGATE|/accounting/gl/statistics/pay/3533914511118750|
|CHANJET_AP_AR_AGGREGATE|/accounting/gl/statistics/pay/3537748712226818|
|CHANJET_AP_AR_AGGREGATE|/accounting/gl/statistics/receive/3533914511118750|
|CHANJET_AP_AR_AGGREGATE|/accounting/gl/statistics/receive/3537748712226818|
|CHANJET_COUNTERPARTY|/accounting/gl/statistics/pay/3533914511118750|
|CHANJET_COUNTERPARTY|/accounting/gl/statistics/pay/3537748712226818|
|CHANJET_COUNTERPARTY|/accounting/gl/statistics/receive/3533914511118750|
|CHANJET_COUNTERPARTY|/accounting/gl/statistics/receive/3537748712226818|
|CHANJET_COUNTERPARTY|/accounting/openapi/cc/party/custvendor/query/3533914511118750|
|CHANJET_COUNTERPARTY|/accounting/openapi/cc/party/custvendor/query/3537748712226818|
|CHANJET_COUNTERPARTY|/accounting/openapi/cc/payment/ar/list/3533914511118750|
|CHANJET_COUNTERPARTY|/accounting/openapi/cc/payment/ar/list/3537748712226818|
|CHANJET_PAYMENT_DOCUMENT|/accounting/openapi/cc/payment/ar/list/3533914511118750|
|CHANJET_PAYMENT_DOCUMENT|/accounting/openapi/cc/payment/ar/list/3537748712226818|
|CHANJET_PURCHASE_LINKAGE|/accounting/openapi/cc/purchaseorder/list/3533914511118750|

## Sample Open Fields

|semantic|field|type|risk|target|
|---|---|---|---|---|
|CHANJET_VOUCHER_LINE|$.result[0].details[0].basePostedCr|number|HIGH|accounting / chanjet_master_mapping / basePostedCr|
|CHANJET_VOUCHER_LINE|$.result[0].details[0].basePostedDr|number|HIGH|accounting / chanjet_master_mapping / basePostedDr|
|CHANJET_VOUCHER_LINE|$.result[0].details[0].comments|string|HIGH|accounting / chanjet_master_mapping / comments|
|CHANJET_VOUCHER_LINE|$.result[0].details[0].hasQtyAccounting|boolean|HIGH|accounting / chanjet_master_mapping / hasQtyAccounting|
|CHANJET_VOUCHER_LINE|$.result[0].details[0].id|number|HIGH|accounting / chanjet_master_mapping / id|
|CHANJET_VOUCHER_LINE|$.result[0].details[0].longText|string|HIGH|accounting / chanjet_master_mapping / longText|
|CHANJET_VOUCHER_LINE|$.result[0].details[0].postedCr|number|HIGH|accounting / chanjet_master_mapping / postedCr|
|CHANJET_VOUCHER_LINE|$.result[0].details[0].postedCrQty|number|HIGH|accounting / chanjet_master_mapping / postedCrQty|
|CHANJET_VOUCHER_HEADER|$.result[0].acctgTransCategoryId.id|number|HIGH|accounting / chanjet_master_mapping / id|
|CHANJET_VOUCHER_HEADER|$.result[0].acctgTransCategoryId.longName|string|HIGH|accounting / chanjet_master_mapping / longName|
|CHANJET_VOUCHER_HEADER|$.result[0].acctgTransCategoryId.name|string|HIGH|accounting / chanjet_master_mapping / name|
|CHANJET_VOUCHER_HEADER|$.result[0].boName|string|HIGH|accounting / chanjet_master_mapping / boName|
|CHANJET_VOUCHER_HEADER|$.result[0].createdStamp|string|HIGH|accounting / chanjet_master_mapping / createdStamp|
|CHANJET_VOUCHER_HEADER|$.result[0].createdUserId.id|number|HIGH|accounting / chanjet_master_mapping / id|
|CHANJET_VOUCHER_HEADER|$.result[0].hasAdjusted|boolean|HIGH|accounting / chanjet_master_mapping / hasAdjusted|
|CHANJET_VOUCHER_HEADER|$.result[0].hasEditAuth|boolean|HIGH|accounting / chanjet_master_mapping / hasEditAuth|

## P0 Implementation Gates

1. `CHANJET_VOUCHER_HEADER` / `CHANJET_VOUCHER_LINE`: 建立只读凭证适配 DTO 和页面，不推送好业财。
2. `CHANJET_COUNTERPARTY`: 往来单位进入人工审核映射，不自动覆盖客户/供应商主数据。
3. `CHANJET_AP_AR_AGGREGATE`: 应收/应付统计只进入总账/报表对账视图，禁止写入 `fin_ar_invoices`。
4. 所有 P0 项进入 A2 安全复核，确认 RBAC/DataScope/审计和敏感字段脱敏。

## Current Conclusion

GO_WITH_CONDITIONS

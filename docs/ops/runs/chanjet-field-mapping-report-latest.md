# Chanjet ERP Field Mapping Report

Generated at: 2026-07-03T15:00:31.032Z
Decision: GO_WITH_CONDITIONS

## Boundaries

- Chanjet write: no
- Chanjet delete/modify: no
- ERP business table write: no
- ERP middle-layer read/report only: yes

## Production Summary

- Total mapped field candidates: 1677
- Matched metadata/business fields: 183
- Pending fields: 1494
- High/Critical open fields: 1341
- API metadata fields safely classified: 183
- Fake counterparty targets: 0
- Envelope business-target noise: 0

## Improvement Backlog

|priority|backlog|title|fields|domains|
|---|---|---|---|---|
|P0|P0-FINANCE-MAPPING|财务核心字段语义映射：往来、金额、科目、凭证|30|accounting|

## Endpoint Coverage Top 12

|endpoint|fields|matched|pending|high|
|---|---|---|---|---|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3537748712226818|166|0|166|166|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|152|0|152|152|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3539743721526654|142|0|142|142|
|/accounting/openapi/cc/party/custvendor/query/3533914511118750|113|1|112|112|
|/accounting/openapi/cc/party/custvendor/query/3537748712226818|112|1|111|111|
|/accounting/openapi/cc/purchaseorder/list/3533914511118750|71|3|68|59|
|/accounting/gl/statistics/pay/3533914511118750|51|0|51|51|
|/accounting/gl/statistics/pay/3537748712226818|51|0|51|51|
|/accounting/gl/statistics/receive/3533914511118750|51|0|51|51|
|/accounting/gl/statistics/receive/3537748712226818|51|0|51|51|
|/accounting/openapi/cc/payment/ar/list/3533914511118750|59|3|56|47|
|/accounting/openapi/cc/payment/ar/list/3537748712226818|59|3|56|47|

## Top Open Fields

|endpoint|field|type|erp|risk|status|
|---|---|---|---|---|---|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].acctgTransCategoryId.id|number|accounting / chanjet_master_mapping / id|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].acctgTransCategoryId.longName|string|accounting / chanjet_master_mapping / longName|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].acctgTransCategoryId.name|string|accounting / chanjet_master_mapping / name|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].boName|string|accounting / chanjet_master_mapping / boName|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].createdStamp|string|accounting / chanjet_master_mapping / createdStamp|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].createdUserId.id|number|accounting / chanjet_master_mapping / id|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].basePostedCr|number|accounting / chanjet_master_mapping / basePostedCr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].basePostedDr|number|accounting / chanjet_master_mapping / basePostedDr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].comments|string|accounting / chanjet_master_mapping / comments|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].hasQtyAccounting|boolean|accounting / chanjet_master_mapping / hasQtyAccounting|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].id|number|accounting / chanjet_master_mapping / id|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].longText|string|accounting / chanjet_master_mapping / longText|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].postedCr|number|accounting / chanjet_master_mapping / postedCr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].postedCrQty|number|accounting / chanjet_master_mapping / postedCrQty|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].postedDr|number|accounting / chanjet_master_mapping / postedDr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].postedDrQty|number|accounting / chanjet_master_mapping / postedDrQty|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].sequenceNum|number|accounting / chanjet_master_mapping / sequenceNum|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].basePostedCr|number|accounting / chanjet_master_mapping / basePostedCr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].basePostedDr|number|accounting / chanjet_master_mapping / basePostedDr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].comments|string|accounting / chanjet_master_mapping / comments|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].hasQtyAccounting|boolean|accounting / chanjet_master_mapping / hasQtyAccounting|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].id|number|accounting / chanjet_master_mapping / id|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].longText|string|accounting / chanjet_master_mapping / longText|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].postedCr|number|accounting / chanjet_master_mapping / postedCr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].postedCrQty|number|accounting / chanjet_master_mapping / postedCrQty|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].postedDr|number|accounting / chanjet_master_mapping / postedDr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].postedDrQty|number|accounting / chanjet_master_mapping / postedDrQty|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].sequenceNum|number|accounting / chanjet_master_mapping / sequenceNum|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].hasAdjusted|boolean|accounting / chanjet_master_mapping / hasAdjusted|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].hasEditAuth|boolean|accounting / chanjet_master_mapping / hasEditAuth|HIGH|PENDING|

## Next Gate Recommendation

1. P0: 审定财务核心字段语义映射，不直接写好业财，不直接改 ERP 业务表。
2. P1: 固化主数据映射关系，重点部门、项目、客户/供应商、科目、资金账号。
3. P1: 建立报表只读查询模型，三大报表和科目余额先保留快照口径。
4. P2: 未归类字段进入人工分类，确认忽略、元数据或后续 schema Gate。

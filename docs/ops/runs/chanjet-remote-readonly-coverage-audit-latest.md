# Chanjet Remote Readonly Coverage Audit

Generated at: 2026-07-06T14:01:06.279Z
Decision: GO_WITH_CONDITIONS

## Scope

- Remote: ops@47.236.122.224:/opt/phoenix-erp
- Mode: production middle-layer read-only audit
- Chanjet write/delete/modify: no
- ERP DB write: no
- Deploy / push: no

## Coverage

- Endpoint coverage: 100%
- Finance card dependency coverage: 100%
- Field classification coverage: 10.9%
- High/Critical open fields: 1348
- Local/remote mismatch: yes

## Endpoint Coverage

|key|label|covered|snapshots|rows|entities|
|---|---|---|---|---|---|
|ACCOUNT_BOOKS|账套列表|yes|1|3|6|
|BALANCE_SHEET|资产负债表|yes|30|30|3|
|CASH_FLOW|现金流量表|yes|30|30|3|
|CUSTOMER_SUPPLIER|往来单位|yes|13|1731|292|
|DEPARTMENT|部门列表|yes|30|30|3|
|FIN_ACCOUNT|资金账户|yes|4|78|47|
|GL_BALANCE|科目余额表|yes|30|30|3|
|INCOME_STATEMENT|利润表|yes|30|30|3|
|PAYABLE_STATISTICS|应付统计|yes|7|129|43|
|PAYMENT_AP|付款单|yes|30|1000|117|
|PAYMENT_AR|收款单|yes|30|1000|235|
|PROJECT|项目列表|yes|30|60|6|
|PURCHASE_ORDER|采购订单|yes|30|420|42|
|RECEIVABLE_STATISTICS|应收统计|yes|7|213|71|
|SUBJECT|科目列表|yes|30|30|3|
|VOUCHER_SEARCH|凭证列表|yes|5|2092|1247|

## Entity Summary

|entity|rows|books|amount|latest|
|---|---|---|---|---|
|ACCOUNT_BOOK|6|1|0.00|2026-07-05 06:18:35.831292+00|
|AP_PAYMENT|117|2|9089599662.45|2026-07-05 06:18:45.475522+00|
|AP_STATISTICS|43|2|-7084274.34|2026-07-05 06:18:41.592985+00|
|AR_RECEIPT|235|2|6267908725.00|2026-07-05 06:18:52.891927+00|
|AR_STATISTICS|71|2|-10936306.32|2026-07-05 06:18:42.530132+00|
|BALANCE_SHEET|3|3|0.00|2026-07-05 06:19:01.300402+00|
|CASH_ACCOUNT|47|3|0.00|2026-07-05 06:18:40.849901+00|
|CASH_FLOW|3|3|0.00|2026-07-05 06:19:02.308554+00|
|CUSTOMER_SUPPLIER|292|3|0.00|2026-07-05 06:18:38.899437+00|
|DEPARTMENT|3|3|0.00|2026-07-05 06:18:36.32415+00|
|GL_BALANCE|3|3|0.00|2026-07-05 06:19:00.531083+00|
|INCOME_STATEMENT|3|3|0.00|2026-07-05 06:19:01.810379+00|
|PROJECT|6|2|0.00|2026-07-05 06:18:39.849938+00|
|PURCHASE_ORDER|42|2|0.00|2026-07-05 06:18:53.812808+00|
|SUBJECT|3|3|0.00|2026-07-05 06:18:39.307096+00|
|VOUCHER|1247|3|0.00|2026-07-05 06:18:59.852376+00|

## Field Risk Summary

|status|risk|count|
|---|---|---|
|PENDING|MEDIUM|57|
|MATCHED|LOW|183|
|PENDING|LOW|96|
|PENDING|HIGH|1348|

## Top Gaps

|endpoint|field|erp|risk|status|
|---|---|---|---|---|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].acctgTransCategoryId.id|accounting/chanjet_master_mapping/id|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].acctgTransCategoryId.longName|accounting/chanjet_master_mapping/longName|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].acctgTransCategoryId.name|accounting/chanjet_master_mapping/name|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].boName|accounting/chanjet_master_mapping/boName|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].createdStamp|accounting/chanjet_master_mapping/createdStamp|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].createdUserId.id|accounting/chanjet_master_mapping/id|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].basePostedCr|accounting/chanjet_master_mapping/basePostedCr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].basePostedDr|accounting/chanjet_master_mapping/basePostedDr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].comments|accounting/chanjet_master_mapping/comments|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].hasQtyAccounting|accounting/chanjet_master_mapping/hasQtyAccounting|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].id|accounting/chanjet_master_mapping/id|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].longText|accounting/chanjet_master_mapping/longText|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].postedCr|accounting/chanjet_master_mapping/postedCr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].postedCrQty|accounting/chanjet_master_mapping/postedCrQty|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].postedDr|accounting/chanjet_master_mapping/postedDr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].postedDrQty|accounting/chanjet_master_mapping/postedDrQty|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[0].sequenceNum|accounting/chanjet_master_mapping/sequenceNum|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].basePostedCr|accounting/chanjet_master_mapping/basePostedCr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].basePostedDr|accounting/chanjet_master_mapping/basePostedDr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].comments|accounting/chanjet_master_mapping/comments|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].hasQtyAccounting|accounting/chanjet_master_mapping/hasQtyAccounting|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].id|accounting/chanjet_master_mapping/id|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].longText|accounting/chanjet_master_mapping/longText|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].postedCr|accounting/chanjet_master_mapping/postedCr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].postedCrQty|accounting/chanjet_master_mapping/postedCrQty|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].postedDr|accounting/chanjet_master_mapping/postedDr|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].postedDrQty|accounting/chanjet_master_mapping/postedDrQty|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].details[1].sequenceNum|accounting/chanjet_master_mapping/sequenceNum|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].hasAdjusted|accounting/chanjet_master_mapping/hasAdjusted|HIGH|PENDING|
|/accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750|$.result[0].hasEditAuth|accounting/chanjet_master_mapping/hasEditAuth|HIGH|PENDING|

## Next Tasks

|priority|task|title|
|---|---|---|
|P0|CHANJET-FIELD-GAP-REVIEW-GATE|把 HIGH/CRITICAL 字段映射从 PENDING 拆成 ERP 字段适配或人工确认清单|
|P0|CHANJET-LOCAL-PROD-MIRROR-STATE-RECONCILE|把本地/生产好业财镜像审计口径拆开，避免本地 0 覆盖误判生产已同步状态|
|P1|CHANJET-FINANCE-CARD-AUTHORITY-VERIFY|逐卡复核 AUTHORITY_READY 语义锁，允许好业财权威口径的卡片升权|

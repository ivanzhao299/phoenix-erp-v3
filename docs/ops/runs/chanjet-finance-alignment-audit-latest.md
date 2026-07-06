# Chanjet Finance Alignment Audit

Generated at: 2026-07-06T11:39:32.354Z
Decision: GO_WITH_CONDITIONS

## Boundaries

- Chanjet write: no
- Chanjet delete/modify: no
- Voucher push: no
- ERP business table write: no
- Migration: no
- Deploy / push: no

## Conditions

- chanjet_sync_jobs is unavailable in this database; endpoint job status is marked UNAVAILABLE and coverage is computed from readonly mirror tables.

## Coverage Summary

- Endpoint coverage: 0%
- Finance card coverage: 0%
- Field coverage: 0%
- Missing endpoints: ACCOUNT_BOOKS, DEPARTMENT, CUSTOMER_SUPPLIER, SUBJECT, PROJECT, FIN_ACCOUNT, PAYABLE_STATISTICS, RECEIVABLE_STATISTICS, PAYMENT_AP, PAYMENT_AR, PURCHASE_ORDER, VOUCHER_SEARCH, GL_BALANCE, BALANCE_SHEET, INCOME_STATEMENT, CASH_FLOW
- High/Critical open fields: 0

## Endpoint Coverage

|key|label|covered|snapshots|rows|entities|job|
|---|---|---|---|---|---|---|
|ACCOUNT_BOOKS|账套列表|no|0|0|0|UNAVAILABLE|
|DEPARTMENT|部门列表|no|0|0|0|UNAVAILABLE|
|CUSTOMER_SUPPLIER|往来单位|no|0|0|0|UNAVAILABLE|
|SUBJECT|科目列表|no|0|0|0|UNAVAILABLE|
|PROJECT|项目列表|no|0|0|0|UNAVAILABLE|
|FIN_ACCOUNT|资金账户|no|0|0|0|UNAVAILABLE|
|PAYABLE_STATISTICS|应付统计|no|0|0|0|UNAVAILABLE|
|RECEIVABLE_STATISTICS|应收统计|no|0|0|0|UNAVAILABLE|
|PAYMENT_AP|付款单|no|0|0|0|UNAVAILABLE|
|PAYMENT_AR|收款单|no|0|0|0|UNAVAILABLE|
|PURCHASE_ORDER|采购订单|no|0|0|0|UNAVAILABLE|
|VOUCHER_SEARCH|凭证列表|no|0|0|0|UNAVAILABLE|
|GL_BALANCE|科目余额表|no|0|0|0|UNAVAILABLE|
|BALANCE_SHEET|资产负债表|no|0|0|0|UNAVAILABLE|
|INCOME_STATEMENT|利润表|no|0|0|0|UNAVAILABLE|
|CASH_FLOW|现金流量表|no|0|0|0|UNAVAILABLE|

## Finance Card Coverage

|card|covered|status|endpoints|
|---|---|---|---|
|应收待收|no|NEED_SYNC_OR_MAPPING|RECEIVABLE_STATISTICS|
|应付待付|no|NEED_SYNC_OR_MAPPING|PAYABLE_STATISTICS|
|现金 / 银行余额|no|NEED_SYNC_OR_MAPPING|FIN_ACCOUNT, GL_BALANCE|
|今日收款|no|NEED_SYNC_OR_MAPPING|PAYMENT_AR|
|今日付款|no|NEED_SYNC_OR_MAPPING|PAYMENT_AP|
|科目余额|no|NEED_SYNC_OR_MAPPING|GL_BALANCE|
|资产负债表关键项|no|NEED_SYNC_OR_MAPPING|BALANCE_SHEET|
|利润表关键项|no|NEED_SYNC_OR_MAPPING|INCOME_STATEMENT|
|客户 / 供应商往来余额|no|NEED_SYNC_OR_MAPPING|CUSTOMER_SUPPLIER, RECEIVABLE_STATISTICS, PAYABLE_STATISTICS|

## Top Field Gaps

_none_

## Next Improvement Tasks

|priority|task|title|owner|
|---|---|---|---|
|P0|CHANJET-P0-READONLY-SYNC-GAPS|补齐未覆盖的好业财只读端点|A3-Backend-Critical-Path + A5-Data-Readiness|
|P1|CHANJET-P1-SYNC-JOB-AUDIT-EVIDENCE|补齐好业财同步任务审计证据或接入生产 job evidence|A1-CI-Runtime-Gate + A3-Backend-Critical-Path|
|P1|CHANJET-P1-FINANCE-CARD-SOURCE-BADGES|财务卡片继续补来源、差异与待同步状态|A4-Frontend-UIUX-UAT + A1-CI-Runtime-Gate|

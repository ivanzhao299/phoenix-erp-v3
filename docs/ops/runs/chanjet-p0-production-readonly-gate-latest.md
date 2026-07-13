# Chanjet P0 Production Readonly Gate Audit

- generated_at: 2026-07-13T05:01:33.879Z
- decision: HOLD
- api_base: https://erp.eggslao.com/api
- request_methods: GET only
- chanjet_write: false
- mapping_auto_approve: false

## Summary

- baseline: HOLD
- fresh_targets: 0/16
- stale_targets: 1
- missing_targets: 15
- account_book_gate: HOLD
- cached_books: 0
- valid_book_company_mappings: 0
- counterparty_gate: GO_WITH_CONDITIONS
- counterparty_candidates: 381
- matched / pending / conflict / unknown: 51 / 330 / 0 / 0
- next_gate: CHANJET_MIRROR_BASELINE_REPAIR

## Scope Readiness

|endpointKey|bookId|status|rowCount|entityCount|ageHours|latestJobStatus|
|---|---|---|---|---|---|---|
|ACCOUNT_BOOKS|enterprise|STALE|3|6|190.72|SUCCESS|
|DEPARTMENT|enterprise|MISSING|0|0|—|MISSING|
|CUSTOMER_SUPPLIER|enterprise|MISSING|0|0|—|MISSING|
|SUBJECT|enterprise|MISSING|0|0|—|MISSING|
|PROJECT|enterprise|MISSING|0|0|—|MISSING|
|FIN_ACCOUNT|enterprise|MISSING|0|0|—|MISSING|
|PAYABLE_STATISTICS|enterprise|MISSING|0|0|—|MISSING|
|RECEIVABLE_STATISTICS|enterprise|MISSING|0|0|—|MISSING|
|PAYMENT_AP|enterprise|MISSING|0|0|—|MISSING|
|PAYMENT_AR|enterprise|MISSING|0|0|—|MISSING|
|PURCHASE_ORDER|enterprise|MISSING|0|0|—|MISSING|
|VOUCHER_SEARCH|enterprise|MISSING|0|0|—|MISSING|
|GL_BALANCE|enterprise|MISSING|0|0|—|MISSING|
|BALANCE_SHEET|enterprise|MISSING|0|0|—|MISSING|
|INCOME_STATEMENT|enterprise|MISSING|0|0|—|MISSING|
|CASH_FLOW|enterprise|MISSING|0|0|—|MISSING|

## Errors

- none

## Boundary

This audit reads three Phoenix ERP governance endpoints with GET only. It does not write, delete, or modify Chanjet data; does not push vouchers; does not approve mappings; and does not overwrite ERP business facts.

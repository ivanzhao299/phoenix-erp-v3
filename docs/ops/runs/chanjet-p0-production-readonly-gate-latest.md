# Chanjet P0 Production Readonly Gate Audit

- generated_at: 2026-07-13T04:58:08.457Z
- decision: HOLD
- api_base: https://erp.eggslao.com/api
- request_methods: GET only
- chanjet_write: false
- mapping_auto_approve: false

## Summary

- baseline: UNAVAILABLE
- fresh_targets: 0/0
- stale_targets: 0
- missing_targets: 0
- account_book_gate: UNAVAILABLE
- cached_books: 0
- valid_book_company_mappings: 0
- counterparty_gate: UNAVAILABLE
- counterparty_candidates: 0
- matched / pending / conflict / unknown: 0 / 0 / 0 / 0
- next_gate: HOLD

## Scope Readiness

_none_

## Errors

- Missing PHOENIX_ADMIN_TOKEN / PHOENIX_AUTH_TOKEN; authenticated audit failed closed.

## Boundary

This audit reads three Phoenix ERP governance endpoints with GET only. It does not write, delete, or modify Chanjet data; does not push vouchers; does not approve mappings; and does not overwrite ERP business facts.

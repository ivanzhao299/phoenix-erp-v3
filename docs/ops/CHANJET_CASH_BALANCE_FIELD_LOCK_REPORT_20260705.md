# Chanjet Cash Balance Field Lock Report

Date: 2026-07-05

## Goal

Lock the Chanjet cash / bank balance semantics so ERP finance cards cannot treat `amountSum = 0` from the Chanjet readonly mirror as a real cash balance.

## Root Cause

The Chanjet cash account mirror can contain rows while its generic aggregate `amountSum` is `0`. That value is not proof of the actual bank / cash balance unless the raw balance fields, currency, account status, and balance date are locked. Showing it as a true balance would mislead operations.

## Changes

- Added `financeCashBalanceFieldLockOverview()` to the Chanjet integration service.
- Added readonly endpoint `GET /api/chanjet/integration/cash-balance-field-lock`.
- Updated finance read model logic so `CASH_BALANCE` with `amountSum=0` is blocked as `blocked_cash_balance_amountSum_zero_not_business_balance`.
- Added audit script `scripts/ops/chanjet-cash-balance-field-lock-audit.mjs`.
- Updated runtime memory for the next Chanjet integration gate.

## Runtime Behavior

- `amountSum=0` is never treated as business cash balance.
- Cash / bank balance remains ERP-primary until Chanjet raw balance fields are locked.
- The new endpoint only reads local ERP Chanjet mirror tables.
- No Chanjet write, delete, modify, or voucher push is enabled.

## Validation

- `node --check scripts/ops/chanjet-cash-balance-field-lock-audit.mjs`
- `node scripts/ops/chanjet-cash-balance-field-lock-audit.mjs --output-dir docs/ops/runs`
- API typecheck
- Web typecheck
- W5 closeout gate

## Boundaries

- Chanjet write: No
- DB write: No
- Migration: No
- Deploy during implementation: No
- Push during implementation: No

## Decision

GO WITH CONDITIONS.

Next gate: continue Chanjet receipt / payment date, status, direction lock and subject balance readonly report wiring. Cash / bank balance must remain ERP-primary until raw balance semantics are proven.

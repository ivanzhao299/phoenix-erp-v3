# Chanjet Receipt / Payment Date Status Lock Continue Report

Date: 2026-07-05

## Goal

Continue locking Chanjet receipt / payment semantics for `TODAY_RECEIPT` and `TODAY_PAYMENT`, so ERP finance cards cannot use Chanjet payment mirror totals until date, status, direction, and amount rules are proven.

## Root Cause

Chanjet payment and receipt mirror rows can provide useful readonly evidence, but "today receipt" and "today payment" require strict interpretation of:

- business date
- posted date
- approved / audited status
- void / cancel / reversal status
- receipt vs payment direction
- actual receipt / payment amount

Without these dimensions, a list total or generic `amountSum` can overstate, understate, or reverse the daily finance card value.

## Changes

- Extended `ReceiptPaymentDateStatusLock` with system-side confirmation status.
- Added safe query filter metadata for business date, posted date, approval status, void status, direction, and amount.
- Explicitly kept `readyForCardAuthority=false` and `amountSumSafeForTodayCard=false`.
- Added audit script `scripts/ops/chanjet-receipt-payment-lock-audit.mjs`.
- Generated latest audit artifacts under `docs/ops/runs`.
- Updated runtime memory for the next Chanjet integration gate.

## Runtime Behavior

- `GET /api/chanjet/integration/receipt-payment-locks` remains readonly and menu-guarded.
- `TODAY_RECEIPT` and `TODAY_PAYMENT` can become system-confirmed lock candidates when all dimensions are found.
- They still cannot feed finance card primary authority in this gate.
- ERP finance cards must continue to show ERP primary values unless a later authority wiring gate passes.

## Guardrails

- Chanjet write: No
- Chanjet delete: No
- Chanjet modify: No
- Voucher push: No
- ERP business overwrite: No
- DB write: No
- Migration: No
- Deploy during implementation: No

## Validation

- `node --check scripts/ops/chanjet-receipt-payment-lock-audit.mjs`
- `node scripts/ops/chanjet-receipt-payment-lock-audit.mjs --output-dir docs/ops/runs`
- API typecheck
- Web typecheck
- W5 closeout gate

## Decision

GO WITH CONDITIONS.

Next gate: expose subject balance and financial statements as readonly reports, while keeping write-back and voucher push on HOLD.

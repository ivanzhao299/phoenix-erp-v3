# Chanjet Finance Read Model Blocker Surfacing

Date: 2026-07-04

## Goal

Make Phoenix ERP finance cards and finance report pages clearly distinguish between:

- Chanjet data that is eligible to become a primary finance card value.
- Chanjet data that is only available as readonly reconciliation evidence.
- Chanjet data that is blocked by missing field, date, status, direction, or report semantics.

## Root Cause

The backend finance alignment endpoint and the frontend finance pages still treated the older `NEEDS_MAPPING` state as the primary blocker state.

The current Chanjet read model emits additional states:

- `AUTHORITY_READY`
- `READONLY_READY`
- `BLOCKED_MAPPING`
- `NEED_MANUAL_REVIEW`
- `WAITING_SAMPLE`
- `HOLD`

Because the old display logic did not fully recognize these states, blocked or readonly-only metrics could be rendered too neutrally, making users think a finance card number was already authorized as a Chanjet primary value.

## Changes

1. Backend alignment summary now counts blocker states:
   - `NEEDS_MAPPING`
   - `BLOCKED_MAPPING`
   - `NEED_MANUAL_REVIEW`
   - `WAITING_SAMPLE`
   - `HOLD`

2. Backend alignment decision now stays `GO_WITH_CONDITIONS` when any blocker state exists.

3. Backend response now exposes:
   - `blockedCount`
   - `readonlyReadyCount`
   - `authorityReadyCount`

4. Backend recommended actions now explain the new states.

5. Finance overview page now renders all Chanjet read-model statuses with explicit labels and warning/danger tones.

6. Finance reports page summary badge now treats `HOLD`, `BLOCKED_MAPPING`, `NEED_MANUAL_REVIEW`, and `WAITING_SAMPLE` as blockers instead of showing a generic available state.

## Guardrails

- No Chanjet write.
- No DB write.
- No migration.
- No production deploy command was run locally.
- ERP values remain visible when Chanjet read model is not `AUTHORITY_READY`.
- `READONLY_READY` is evidence only and must not override primary finance cards.

## Validation

Pending local validation:

- API typecheck
- Web typecheck
- W5 closeout gate
- Git diff check

## Next Step

Proceed to `CHANJET_CASH_BALANCE_FIELD_LOCK`:

1. Lock the precise Chanjet cash/bank balance fields.
2. Prevent `amountSum = 0` or empty rows from being treated as an authoritative zero.
3. Make ERP finance cards show explicit source and reconciliation status for cash/bank balances.

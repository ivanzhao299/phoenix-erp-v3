# Chanjet Receipt / Payment Direction Lock Gate

Date: 2026-07-20  
Decision: GO WITH CONDITIONS

## Root Cause

The provider payload does not expose one stable raw `direction` field. Treating receipt/payment direction as a direct field therefore left both daily cards in a permanent partial state.

## Implemented Lock

Direction is now derived from the authenticated endpoint/entity contract: the receipt entity is receipt direction and the payment entity is payment direction. The lock does not infer direction from amount signs, free text, or counterparty roles.

| Check | Result |
| --- | --- |
| Direction locks | 2/2 `LOCKED` |
| Partial locks | 0 |
| Ready for semantic review | 2 |
| Ready for card authority | 0 |
| Chanjet mutation | None |

Commit `0dd5e7c1` passed CI/CD run `29713243393` and production health verification. Daily card authority remains blocked because provider totals are cumulative and still require business-date/status reconciliation.

## Gate Decision

Direction debt is closed. The next safe step is daily reconciliation; cumulative receipt/payment totals must not be displayed as today's values.


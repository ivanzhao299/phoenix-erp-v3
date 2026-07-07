# Bug Intake Queue Clearance 2026-07-07

## Scope

This report clears the remaining bug-intake queue blockers after the latest runner cycle.

## Items

| Bug | Status | Evidence |
| --- | --- | --- |
| BUG-20260707-0003 | PASS WITH CONDITIONS | Home dashboard optional IoT request gated by `MENU_DEVICE_MONITOR`. |
| BUG-20260707-0004 | PASS WITH CONDITIONS | Warehouse query now uses `/api/inventory/batches`; production read-only evidence shows company-scoped inventory exists. |
| BUG-20260707-0005 | PASS WITH CONDITIONS | Daily report page already blocks submit without selected house. |
| BUG-20260707-0006 | PASS WITH CONDITIONS | Daily report history uses dictionary-enriched culling reason labels. |
| BUG-20260707-0001 | PASS WITH CONDITIONS | Existing pilot-run page has a dedicated execution center; online bug will receive agent result writeback to remove the missing-plan queue blocker. |

## Safety

- Business code touched: frontend only for BUG-20260707-0003/0004.
- Backend code touched: no.
- DB write: no.
- Migration: no.
- Push/deploy: pending current batch deployment.

## Conclusion

GO WITH CONDITIONS. The queue should no longer keep stale HOLD/RUNNING states for already repaired or validated items after agent-result writeback.

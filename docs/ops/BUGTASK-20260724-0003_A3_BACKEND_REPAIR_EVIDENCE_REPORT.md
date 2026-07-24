# BUGTASK-20260724-0003 A3 Backend Repair Evidence

## Source issue

- Bug: `BUG-20260724-0003`
- Task: `BUGTASK-20260724-0003-A3`
- Reported symptom: grading submission returned HTTP 400.
- Captured route: `/system/health`, which does not match the grading workflow.
- Historical attachment: unavailable because this report predates the persistent
  `uploads/bug-reports` storage fix. The missing screenshot is recorded as an
  evidence limitation and is not reconstructed or inferred.

## Root cause

The grading UI treated `received_qty` as the number available for grading, while
the packaging source batch stores it as the gross collected quantity. The API
validates grading against the net quantity after dirty and cracked eggs are
removed. A batch with 200 received, 2 dirty, and 2 cracked eggs therefore has
196 gradable eggs; submitting 200 correctly produced HTTP 400.

## Integrated repair

Integrated commit: `9939274ae294bcc8b20db4d24272a42c8612d5a5`.

- `apps/api/src/modules/bff/bff.controller.ts`
  returns `gradable_qty = total_qty - dirty_qty - cracked_qty`.
- `apps/web/src/lib/grading-source.ts`
  treats the received quantity as gross and uses the server-provided net
  quantity, failing closed to a locally derived net quantity for legacy
  responses.
- `apps/web/src/lib/grading-source.test.ts`
  covers the 200 / 2 / 2 regression and expects 196.

No migration, schema, entity, table, column, or database data change was needed.

## Verification

- Focused grading-source tests: PASS.
- API focused tests and API typecheck: PASS.
- Web focused tests and Web typecheck: PASS.
- W5 closeout gate: PASS.
- CI/CD run `30078650618`: PASS.
- Production deployment of commit `9939274a`: PASS.
- Production health endpoint after deployment: PASS, database connected.

## Release boundary

The implementation is ready for administrator UAT. Business resolution must not
be marked complete until the administrator repeats the grading operation with a
batch containing defects and confirms that the UI submits only the available
net quantity.

## Conclusion

PASS WITH CONDITIONS

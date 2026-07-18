# Mobile and Packaging UAT Blocker Remediation

Date: 2026-07-18

## Decision

Implementation is ready for release validation. Production deployment and the
new packaging schema migration have not been executed in this change set.

## Root Causes and Fixes

### Mobile daily dashboard quantities

- Root cause: the page queried generic daily-log rows and recalculated KPIs in
  the browser. It counted mortality only and omitted elimination/culling, while
  the egg and stock cards could use a different date/source from the selected
  report date.
- Fix: the page now consumes the governed daily hen report endpoint and uses
  its authoritative totals and house rows for eggs, stock, lay rate, dirty
  eggs, broken eggs, feed, and mortality plus elimination.

### Egg count entered but daily hen report shows zero

- Root cause: `deriveOrgScope()` treated a user without the legacy `storeCode`
  field as global even when `DataScopeGuard` supplied a valid restricted farm
  scope. New daily rows could therefore be written without farm/site ownership,
  then be excluded by the restricted report query.
- Fix: guarded DataScope is now authoritative. For historical rows whose scope
  columns are empty, report queries derive ownership from `brd_houses` without
  modifying historical business data.

### Farm manager cannot create a hen house

- Root cause: the same legacy-global misclassification caused the service to
  reject a real farm manager as a group/global administrator.
- Fix: a scoped farm manager remains non-global even when the old `storeCode`
  claim is absent. Existing writable-scope checks still apply.

### Packaging source receiving returns HTTP 500

- Root cause: the terminal endpoint writes `total_qty`, `dirty_qty`, and
  `cracked_qty`, but those columns existed only in an archived SQL file outside
  the production migration chain.
- Fix: a TypeORM migration adds the three non-null quantity columns
  idempotently. Fresh-table bootstrap DDL is aligned. The receive endpoint now
  persists the complete quantity breakdown for both insert and pending-row
  update paths, and rejects inconsistent quantities as a controlled 400 before
  SQL execution.

## Changed Files

- `apps/api/src/modules/farm/farm.service.ts`
- `apps/api/src/modules/farm/farm.service.spec.ts`
- `apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`
- `apps/web/src/lib/mobile-api.ts`
- `apps/api/src/modules/bff/bff.controller.ts`
- `apps/api/src/modules/bff/bff.controller.spec.ts`
- `apps/api/src/modules/generic-crud/generic-crud.service.ts`
- `apps/api/src/database/migrations/1784374615347-AddPackagingSourceBatchQuantities.ts`

## Verification Evidence

- API focused regression: PASS, 3 suites / 26 tests.
- API TypeScript check: PASS.
- Web TypeScript check: PASS.
- TypeORM migration `down()` gate: PASS.
- TypeORM migration no-data-DML gate: PASS.
- W5 closeout: PASS with declared freeze/security touch because this approved
  remediation changes farm DataScope handling and a production schema contract.
- `git diff --check`: PASS.

## Controlled Retest Checklist

1. With a farm-manager account, create a hen house inside the assigned farm;
   verify creation succeeds and another farm remains inaccessible.
2. Enter eggs, mortality, and elimination for one assigned house; verify the
   selected-date mobile dashboard and daily hen report show the same egg total
   and mortality plus elimination total.
3. Open a packaging shift, receive a source batch, and verify total quantity,
   dirty quantity, cracked quantity, and gradable quantity persist.
4. Continue the same batch through grading, packaging, label, and inbound.
5. Recheck medicine inbound/outbound and feed ledger on the released build;
   both are already present in the current production source baseline, but the
   reported UAT scenarios need fresh runtime evidence after this release.
6. Recheck packaging statistics and delivery receipt only after step 4 succeeds.

## Safety Boundaries

- No production migration executed.
- No production database write executed.
- No deployment or push executed by this remediation step.
- No historical daily-log rows were rewritten.

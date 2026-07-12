# BUG-20260708-0006 A3 Backend Critical Path Report

## Source

- Bug: `BUG-20260708-0006`
- Task: `BUGTASK-20260708-0006`
- Route: `/sales2/pricing`
- Acceptance target: delete the price book named `孟赛标准价格册（试运行版）重建`; keep and restore `孟赛标准价格册（试运行版）` to normal in-use status.

## Diagnosis

The local backend had price-book lifecycle endpoints for create, edit, submit, activate, expire, and cancel, but no backend-owned operation for the two actions required by the bug:

- restore a previously cancelled price book back to in-use state;
- delete the duplicate draft rebuild book from the pricing screen.

The captured production evidence also showed `POST /api/v2/sales/pricing/books/363/submit` returning `400 价格册无有效明细，不可提交审批`, which is expected validation for a draft with no active details and is not a safe way to recover the original cancelled price book.

## Root Cause

The pricing backend lifecycle was incomplete for recovery operations. Once a valid price book was moved to `CANCELLED`, the backend exposed no guarded route to restore it. The duplicate draft book could be cancelled but could not be removed through a narrowly scoped backend route.

## Changed Files

- `apps/api/src/modules/sales-v2/controllers/sales-price-books.controller.ts`
- `apps/api/src/modules/sales-v2/services/price-books.service.ts`
- `apps/api/src/modules/sales-v2/services/price-books.service.spec.ts`

## Backend Fix

- Added `POST /api/v2/sales/pricing/books/:id/restore`.
  - Requires `MENU_SALES2_PRICE:A`.
  - Only accepts `CANCELLED` price books.
  - Requires at least one active price item before restoring.
  - Restores status to `ACTIVE` and clears stale `wf_instance_id`.

- Added `DELETE /api/v2/sales/pricing/books/:id`.
  - Requires `MENU_SALES2_PRICE:D`.
  - Only accepts `DRAFT` price books.
  - Blocks deletion if sales orders or order items reference the price book.
  - Deletes price items and the draft price book in one transaction.

No schema, entity, migration, seed, deploy, push, or database write was performed.

## Validation

- `cd apps/api && ./node_modules/.bin/jest src/modules/sales-v2/services/price-books.service.spec.ts --runInBand`
  - Passed: 1 suite, 6 tests.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - Passed: 0 errors.
- `git diff --check -- apps/api/src/modules/sales-v2/controllers/sales-price-books.controller.ts apps/api/src/modules/sales-v2/services/price-books.service.ts apps/api/src/modules/sales-v2/services/price-books.service.spec.ts`
  - Passed.

## Result

PASS WITH CONDITIONS

The backend now provides guarded recovery operations needed by the pricing page. The actual production deletion/restoration of the named records still requires a separately approved runtime/data operation, followed by CI/CD, production smoke, and business acceptance. This report does not claim the production bug is resolved.

# BUG-20260711-0002 A3 Backend Report

## Source

- Bug: `BUG-20260711-0002`
- Task: `BUGTASK-20260711-0002`
- Route: `/breeding/med-stock`
- Failed request: `POST /api/farm/medicine/inbound`
- Symptom: 今日入库提交返回 HTTP 500.

## Diagnosis

Dry-run source review found the farm medicine endpoint still wrote and read the legacy warehouse code `MEDICINE`. The G15 warehouse governance migration seeded the active medicine warehouse as `LPH_MS_MEDICINE` and migrated historical `inv_batches` / `inv_ledger` rows from `MEDICINE` to `LPH_MS_MEDICINE`. The service also inserted new batches without the ownership/source columns used by the historical medicine stock seed (`company_code`, `store_code`, `source_type`, `source_no`), which made new stock vulnerable to DataScope/visibility drift.

The inbound path also accepted `items` as if it were always an array. If the client submitted a malformed or alternate payload shape, the service could throw a raw JS runtime error instead of a controlled 4xx response. Blank dates could also reach SQL instead of defaulting to the "today" action semantics.

Local DB schema introspection was attempted as read-only evidence with `psql -c "\d inv_batches"` / `"\d inv_ledger"` / `"\d brd_medications"`, but the sandbox blocked the local Postgres socket with `Operation not permitted`. No DB writes were attempted.

## Changed Files

- `apps/api/src/modules/farm/farm-medicine.service.ts`
  - Uses governed medicine warehouse code `LPH_MS_MEDICINE`.
  - Reads stock/ledger from both governed and legacy medicine warehouse codes for compatibility.
  - Writes medicine batch ownership/source fields: `company_code`, `store_code`, `source_type`, `source_no`.
  - Normalizes dates, defaulting blank inbound/outbound dates to today.
  - Normalizes item aliases and rejects malformed item payloads with `BadRequestException`.
  - Removes runtime dependency on an unowned `inv_ledger.house_code` column; outbound house context is preserved in the note.
- `apps/api/src/modules/farm/farm-medicine.controller.ts`
  - Accepts `date` or `log_date`.
  - Extracts item arrays from `items`, `lines`, `item`, or a single-row payload.
- `apps/api/src/modules/farm/farm-medicine.service.spec.ts`
  - Added regression coverage for governed warehouse ownership, ownership/source inserts, alias payloads, blank-date defaulting, malformed item rejection, invalid date rejection, and outbound ledger write shape.

## Validation

- `cd apps/api && pnpm jest src/modules/farm/farm-medicine.service.spec.ts --runInBand`
  - PASS: 8 tests passed.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors.
- `git diff --check -- apps/api/src/modules/farm/farm-medicine.service.ts apps/api/src/modules/farm/farm-medicine.controller.ts apps/api/src/modules/farm/farm-medicine.service.spec.ts`
  - PASS.
- Static no-match check:
  - `rg -n "const WAREHOUSE = 'MEDICINE'|warehouse_code = \\$1|l\\.house_code|\\(batch_no, change_type, qty_change, log_date, warehouse_code, house_code" apps/api/src/modules/farm/farm-medicine.*`
  - PASS: no matches.

## Not Executed

- No Web typecheck: forbidden by this backend-only task contract (`apps/web/**` out of scope).
- No DB write, seed, migration, or deploy.
- No production smoke or business acceptance.
- No runtime `scope-audit.sh`: it depends on a running local API and test-account login flow; this task used focused backend tests plus API typecheck.

## Result

PASS WITH CONDITIONS.

This is ready for CI/runtime smoke/business acceptance. Do not mark the source bug resolved until CI/CD, production smoke, and business acceptance confirm inbound increases the medicine stock overview and outbound decreases it.

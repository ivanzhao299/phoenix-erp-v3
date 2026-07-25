# BUG-20260717-0001 A3 Backend Critical Path Report

## Scope

- Source bug: `BUG-20260717-0001`
- Repair task: `BUGTASK-20260717-0001`
- Route: `/procurement2/orders`
- Symptom: the list visibly contains purchase orders while the page header displays `共 0 行`.
- Canonical conclusion: `PASS WITH CONDITIONS`

## Diagnosis and Root Cause

The current backend baseline already implements the correct count contract in
`OrdersService.list`:

1. filters and `DataScopeHelper.applyToQb` are applied to the purchase-order
   QueryBuilder;
2. `getManyAndCount()` returns the current page rows and the total number of
   matching rows;
3. the service returns that count unchanged as the top-level numeric `total`
   property together with `items`, `page`, and `pageSize`.

The reported screenshot therefore does not demonstrate a backend SQL/count
defect in the current baseline. It is consistent with the API response count
not being consumed by the page header, or with a deployed frontend/backend
version differing from this baseline. Frontend inspection or repair is outside
this A3 contract, so no backend production code was changed.

No attachment sync was needed to establish the backend contract: the supplied
page snapshot itself records multiple visible rows and `共 0 行`, while the
local service and focused test establish the API response behavior.

## Changed Files

- `apps/api/src/modules/procurement-v2/services/orders.service.spec.ts`
  - adds focused regression coverage proving a page with two rows and five
    filtered records returns top-level `total: 5`;
  - verifies DataScope is applied before the count query.
- `docs/ops/BUG-20260717-0001_A3_BACKEND_CRITICAL_PATH_REPORT.md`
  - records diagnosis, evidence, validation, and release conditions.

Verified existing backend production files:

- `apps/api/src/modules/procurement-v2/services/orders.service.ts`
- `apps/api/src/modules/procurement-v2/controllers/orders.controller.ts`

## Validation

Commands:

```bash
cd apps/api
./node_modules/.bin/jest src/modules/procurement-v2/services/orders.service.spec.ts --runInBand
./node_modules/.bin/tsc --noEmit
```

Results are recorded after execution below:

- Focused Jest: PASS — 1 suite, 2 tests
- API typecheck: PASS — 0 errors

No database write, migration, schema/entity change, seed, deployment, push, or
production command was performed.

## Conditions

`PASS WITH CONDITIONS` means only that the current backend-owned API count
contract is verified. It is not a claim that the production bug is resolved.
Release acceptance still requires:

1. CI/CD validation of the eventual complete repair;
2. confirmation that the frontend reads the response's top-level `total`;
3. production smoke testing on `/procurement2/orders`;
4. business acceptance that five matching orders display `共 5 行`.

# BUGTASK-20260722-0003 A3 Backend Critical Path Report

## Result

**PASS WITH CONDITIONS — release decision: HOLD**

The local backend repair and focused regression test pass. This is not a claim
that BUG-20260722-0003 is resolved in production. Release remains on hold until
CI/CD, a production smoke test, and business acceptance confirm that an inbound
quantity of `2` is visible both in inventory query and when the inbound task is
opened again.

## Source bug

- Bug: `BUG-20260722-0003`
- Task: `BUGTASK-20260722-0003`
- Symptom: inbound reports success, but the received quantity is not reflected
  when the task is revisited.
- Route reported: `/warehouse/query`

## Reproduction and root cause

Static reproduction of the backend flow showed:

1. `POST /api/inbound/confirm` calls `WmsService.confirmInbound`.
2. The transaction marks `wms_inbound` completed and writes `inv_batches` plus
   `inv_ledger`.
3. `GET /api/inbound/task/:task_no` reloads detail rows directly from
   `wms_inbound_items`.
4. The confirmation transaction did not update the existing
   `wms_inbound_items.actual_qty` or `broken_qty` columns.

Consequently, inventory posting could succeed while reopening the task still
returned the original received quantity (commonly zero). The success state and
reloaded task detail were inconsistent.

## Repair

The existing confirmation transaction now persists `actual_qty` and
`broken_qty` to the matching inbound detail row before posting the inventory
batch and ledger entry. Matching uses `task_no` plus `batch_no`, falling back to
`product_code` when no batch number is supplied.

This is an atomic change in the existing transaction. It introduces no schema,
entity, migration, RBAC, DataScope, audit, or attachment ACL change.

## Changed files

- `apps/api/src/modules/wms/wms.service.ts`
  - Persist confirmed quantities to `wms_inbound_items`.
- `apps/api/src/modules/wms/wms.service.spec.ts`
  - Regression coverage for received quantity `2`, including the detail update
    and inventory batch insert.
- `docs/ops/BUGTASK-20260722-0003_A3_BACKEND_CRITICAL_PATH_REPORT.md`
  - This report.

## Validation

Executed without database writes:

```text
cd apps/api
./node_modules/.bin/jest src/modules/wms/wms.service.spec.ts --runInBand
PASS — 1 suite, 7 tests

./node_modules/.bin/tsc --noEmit
PASS — 0 errors
```

An earlier diagnostic run also passed the combined WMS and generic CRUD
regression suites: 2 suites, 20 tests.

## Conditions before release

1. CI must pass on the repair branch.
2. Deploy through the normal gated pipeline; this task did not deploy or push.
3. Production smoke must confirm quantity `2` appears in inventory query.
4. Reopening the inbound task must show received quantity `2`.
5. Business acceptance is required before the source bug is marked resolved.


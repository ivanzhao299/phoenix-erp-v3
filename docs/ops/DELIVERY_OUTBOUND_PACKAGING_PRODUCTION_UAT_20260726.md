# Delivery / Outbound / Packaging Production UAT

Date: 2026-07-26

## Conclusion

Overall result: **GO**

The three blocking business paths were independently verified in production. The
verification used controlled UAT records, checked API responses and database
effects, and restored reversible business state where possible. The related bug
reports are now `RESOLVED` with repair task status `BUSINESS_VERIFIED`.

## Scope And Controls

- Environment: production Phoenix ERP
- Scope: sales delivery creation, inventory outbound linkage, packaging inbound
  reload
- No migration or seed was executed.
- No schema, entity, table, or column was changed.
- No unrelated business module was changed.
- Authentication used a short-lived dedicated UAT token. No credential or
  connection secret is recorded in this report.

## 1. Sales Delivery Creation

Bug report: `BUG-20260725-0001`

### Root Cause

`DeliveryOrdersService.create()` inserted the delivery order inside a database
transaction and then called `findById()` before the transaction committed.
`findById()` used the application data source and therefore a different database
connection. That connection could not see the uncommitted row, returned
`配送单 1 不存在`, and caused the transaction to roll back.

### Fix

- Transaction now returns the newly inserted delivery ID.
- Detail lookup runs only after the transaction has committed.
- The focused unit test asserts that the detail query cannot run before commit.
- Fix commit: `1e70c4dc fix: query delivery after transaction commit`

### Production UAT Evidence

- Source sales order: `SO-20260717-00001`
- Created delivery: `DV-20260726-0001`, ID `14`
- Create response: HTTP `201`
- Delivery state after create: `PLANNED`
- Delivery item state after create: `PENDING`
- Linked sales order state after create: `ALLOCATED`
- Controlled cancellation response: HTTP `200`
- Delivery state after cancellation: `CANCELLED`
- Delivery item state after cancellation: `RETURNED`
- Source sales order state after cancellation: `APPROVED`

Result: **PASS**. Creation, linkage, detail retrieval, and cancellation/restoration
all behave consistently.

## 2. Inventory Outbound Linkage

Bug report: `BUG-20260724-0004`

### Production UAT Evidence

- Controlled outbound: `UAT-WO-20260726-081316`
- Source batch: `IBN-20260724-HY1Y6S`
- Product: `TEST0724`
- Warehouse: `LPH_MS_EGG_FARM`
- Confirm result: HTTP `201`, business result `200`
- Outbound state: `DONE`
- Batch quantity: `100.000` to `99.000`
- Batch available quantity: `100.000` to `99.000`
- Inventory ledger: exactly one `OUTBOUND` entry
- Ledger quantity change: `-1`
- Ledger reference and batch both match the controlled outbound

Result: **PASS**. Outbound confirmation updates the inventory source of truth and
creates one traceable ledger entry.

## 3. Packaging Inbound Reload

Bug report: `BUG-20260722-0003`

### Root Cause Verification

The historical packing record had a warehouse handover but no inventory batch.
The site inherited `TEMP_PRODUCTION_INBOUND`, so inventory creation was skipped.
The API correctly reported `HANDOVER_ONLY`; a local success display could not be
treated as committed inventory.

### Production UAT Evidence

- Packing record: `PKG-20260725-089829`
- Site: `CS-0001`
- Handover: `WH-20260725-392633`
- Initial state: `HANDOVER_ONLY`, zero inventory batches
- Fail-closed retry in temporary mode: inventory not reported as successful
- Exact-site mode temporarily switched to `PACKAGING_INBOUND` for controlled UAT
- Created batches:
  - `EGG-20260725-00001`, `GRADE_1`, quantity `120`
  - `EGG-20260725-00002`, `GRADE_2`, quantity `60`
- Final state: `COMMITTED`
- Inventory batch count: `2`
- Total inbound quantity: `180`
- Browser reload displayed:
  - `已完成入库`
  - `6 箱 · 180 枚已写入库存台账`
- Exact-site mode was restored to `TEMP_PRODUCTION_INBOUND` after verification.

Result: **PASS**. The committed state is derived from inventory evidence and
survives a production page reload.

## Validation And Deployment

- Focused delivery service Jest test: PASS
- API TypeScript check: PASS
- Authorized W5 closeout gate: PASS
- CI type-check and regression suite: PASS
- Web image build: PASS
- API image build: PASS
- Production full deployment workflow `30180817459`: PASS
- Production health endpoint: HTTP `200`, status `OK`

## Bug Intake Closure

| Bug | Report status | Repair task status |
| --- | --- | --- |
| `BUG-20260725-0001` | `RESOLVED` | `BUSINESS_VERIFIED` |
| `BUG-20260724-0004` | `RESOLVED` | `BUSINESS_VERIFIED` |
| `BUG-20260722-0003` | `RESOLVED` | `BUSINESS_VERIFIED` |

## UAT Data Impact

- Delivery UAT left an auditable cancelled delivery and restored the source sales
  order to `APPROVED`.
- Inventory outbound consumed one unit from the dedicated test batch and retained
  its audit ledger.
- Packaging inbound committed 180 controlled UAT eggs into two inventory batches.
- No destructive cleanup was run.

## Final Decision

The three previously blocking defects are verified as fixed in production and no
longer require the user to repeat technical validation. Business testers may
continue with delivery/mobile receipt, downstream inventory flows, and the next
packaging workflow scenarios.

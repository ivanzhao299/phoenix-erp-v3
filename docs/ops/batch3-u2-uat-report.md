# Batch 3 U2 — Isolated Business UAT

**Baseline:** `2ec1ff30b20ac48cc7665a9e7acebff43f3b5885`
**Environment:** disposable PostgreSQL 16.14, API `:33102`; production was not contacted.

## Evidence

- U1-owned E2E identities authenticated successfully: `E2E_ADMIN`, `E2E_REPLENISH_MANAGER`, `E2E_REPLENISH_WMS`.
- E2E_ADMIN read probes returned HTTP 200 for procurement requests/orders/suppliers, sales orders/inventory, AP/AR invoices, and active supplier/warehouse master data.
- UAT fixture was applied in the same disposable database: `inv_batches=3`, `ord_customers=5`, `fin_accounts=2`.
- E2E_ADMIN could read the UAT inventory rows. E2E_REPLENISH_MANAGER could not see rows with `company_code='ALL'`; its `E2E-COMPANY` scope correctly filtered them. Procurement requests/orders returned 403 because the manager identity lacks those menu permissions.

## Journey matrix

| Journey | Result | DB state evidence |
|---|---|---|
| Procurement request → approval → PO → receipt → AP → payment | NOT RUN | No transaction fixture; manager lacks procurement menu permissions |
| Sales order → allocation → outbound → delivery → receipt → AR | NOT RUN | No transaction fixture; no state transition was attempted |
| Store collection | NOT RUN | No approved store-payment transaction fixture |
| Attachment authorization | NOT RUN | No approved attachment fixture; no upload/download mutation |
| Inventory query | PASS (read-only) | Admin reads UAT rows; scoped manager filtering is enforced |
| Supplier/warehouse/master data | PASS (read-only) | Active lists returned successfully |

The UAT seed rows use `company_code/store_code='ALL'`, while the manager is scoped to `E2E-COMPANY`; this is a fixture alignment gap and expected DataScope behavior, not a product bypass. No create, approval, receipt, payment, dispatch, collection, or upload was issued without a valid workflow fixture and assertion contract.

## Classification

`AUTOMATED_UAT=PARTIAL_READONLY_DATASCOPE_VERIFIED`
`HUMAN_UAT=NOT_CONFIRMED` (no approved human business credentials)
`PRODUCTION_WRITES=0`
`READY_FOR_BATCH3_INTEGRATION=NO`

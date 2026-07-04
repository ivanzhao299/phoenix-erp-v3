# CHANJET_FULL_READONLY_SYNC_AND_ALIGNMENT_P0

## Objective

Implement the first production-grade read-only Chanjet alignment layer so ERP can reproduce Chanjet finance-side data in the middle layer, show finance card source authority clearly, and surface sync/API failures without writing back to Chanjet.

## Scope Implemented

- Expanded P0 finance adapter buckets:
  - account books
  - subjects
  - counterparties
  - departments
  - projects
  - cash / bank accounts
  - receivable statistics
  - payable statistics
  - AR receipts
  - AP payments
  - voucher list
  - GL balance
  - balance sheet
  - income statement
  - cash flow
- Added a read-only coverage endpoint:
  - `GET /api/chanjet/integration/finance-coverage`
- Added coverage dimensions:
  - endpoint coverage
  - finance card source coverage
  - field mapping coverage
  - missing endpoint list
  - latest failed sync jobs
- Added ERP sys_alert generation for Chanjet read-only sync failures:
  - `alert_type = CHANJET_API_SYNC_FAILURE`
  - related path: `/finance2/chanjet-integration`
- Expanded finance card authority:
  - AR open balance
  - AP open balance
  - cash / bank balance
  - today receipt
  - today payment
  - subject balance
  - balance sheet key items
  - income statement key items
- Updated finance dashboard card labels so users can see whether a number is:
  - Chanjet authority
  - ERP auxiliary detail
  - ERP fallback pending Chanjet sync
- Updated `/finance2/chanjet-integration` with a coverage board.

## Source Rules

- If Chanjet read-only mirror data exists, finance cards mark and use Chanjet authority where supported.
- ERP business detail remains auxiliary evidence and is not overwritten.
- If ERP and Chanjet differ, the API exposes the diff; it does not silently cover the mismatch.
- Chanjet data is read-only in this phase.

## Guardrails

- Write Chanjet: no
- Delete Chanjet: no
- Push voucher to Chanjet: no
- Overwrite ERP business tables: no
- Migration executed: no
- Production deploy executed in this change: no

## Field Coverage Policy

Coverage below 90% is not hidden. The coverage board lists:

- missing P0 endpoints
- field mappings still missing in ERP
- fields requiring transformation
- latest failed sync jobs

These items become the P1/P2 backlog for schema or mapping adaptation.

## Validation

- API typecheck: PASS
- Web typecheck: PASS

## Next Steps

1. Run controlled full read-only sync from the production admin session.
2. Review coverage board and require endpoint/card coverage >= 90%.
3. Review high-risk field mappings for finance, subject, counterparty, and voucher domains.
4. Move to P1 finance card reconciliation once live mirror coverage is sufficient.
5. Keep Chanjet write path disabled until the separate ERP-to-Chanjet push gate is approved.

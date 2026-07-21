# Chanjet Readonly Completion Audit

Generated: 2026-07-21T01:08:21.801Z

Decision: GO_WITH_CONDITIONS

|Check|HTTP|Result|Error|
|---|---:|---|---|
|currentState|200|PASS|-|
|productionReadiness|200|PASS|-|
|overview|200|PASS|-|
|baselineReadiness|200|PASS|-|
|accountBookGate|200|PASS|-|
|masterDataAlignment|200|PASS|-|
|masterDataMappingReview|200|PASS|-|
|financeCoverage|200|PASS|-|
|financeReadModel|200|PASS|-|
|financeCardAuthority|200|PASS|-|
|financeReconciliation|200|PASS|-|
|fieldGapReview|200|PASS|-|
|readonlyFieldAdapters|200|PASS|-|
|syncJobs|200|PASS|-|
|voucherDrafts|200|PASS|-|

## Runtime Summary

- Endpoint checks: 15/15
- Mirror targets: 44/56; missing 0
- Master data: exact 41; readonly source references 968; need mapping 0; conflicts 0; invalid excluded 6
- Reconciliation open: 3
- Recent failed sync jobs: 56/100
- Voucher drafts: 0; unsafe push-enabled 0
- Next gate: CHANJET_READONLY_SYNC_FAILURE_REPAIR

## Guardrails

- This audit uses authenticated GET requests only.
- It does not write, modify, or delete Chanjet data.
- It does not confirm ERP mappings, push vouchers, deploy, or run migrations.

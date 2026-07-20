# Chanjet Readonly Gap Closure And Minimal Write Gate Report

Date: 2026-07-20

Decision: **GO WITH CONDITIONS**

## Scope

This Gate closes the remaining deterministic readonly-mapping defects, verifies four expanded readonly domains, and proves one reversible write against the ERP Chanjet integration layer. It does not write, modify, or delete any data in Chanjet and does not overwrite ERP business tables.

## Closed defects

1. The sales-order mirror used the obsolete internal endpoint and returned 404. It now uses the account-book-scoped official readonly endpoint.
2. `SALES_ORDER`, `PURCHASE_APPLY`, `STOCK_IN`, and `SALES_STOCK_OUT` are included in the default readonly mirror scope.
3. Complete Chanjet department, project, and cash-account identities without an ERP peer are recorded as approved `SOURCE_ONLY` references instead of false `NEED_MAPPING` items. They remain unusable for ERP writes.
4. Chanjet master IDs were incorrectly treated as globally unique. Production evidence proves ID `12` means `琅勃拉邦直营店备用金 / LAK` in one book and `泰铢（现金） / THB` in another. The mapping identity is now scoped by `book_id`.
5. The minimal-write canary uniqueness check was updated to the same account-book identity contract.
6. Finance differences now carry explicit diagnosis and treatment instead of being silently overwritten or presented as directly comparable totals.

## Expanded readonly evidence

| Scope | Production result |
|---|---|
| Sales order | SUCCESS; three books returned 2 / 3 / 0 rows |
| Purchase apply | SUCCESS; three books returned 0 rows |
| Stock in | SUCCESS; returned 0 rows |
| Sales stock out | SUCCESS; three books returned 0 rows |

Zero rows are valid provider results, not transport or business failures.

## Master-data evidence

- Valid source rows: 1,005; invalid historical provider envelopes excluded: 6.
- Deterministic review set: 90.
- Exact ERP matches: 41 (37 cash accounts and 4 currencies).
- Approved readonly source identities: 49 (31 departments, 6 projects, 12 cash accounts).
- Subject readonly references: 919.
- Remaining `NEED_MAPPING`: 0; conflicts: 0; confirmation errors: 0.
- Repeated confirmation result: 90 unchanged, proving idempotency.
- Counterparties: 371 source-only identities resolved; pending/conflicts/errors: 0.

## Minimal write precheck

Endpoint: `POST /api/chanjet/integration/minimal-write-precheck/mapping-canary`

Two consecutive production runs passed:

| Audit job | Readback | Idempotency | Compensating rollback | Residue |
|---|---|---|---|---|
| 2815 | PASS | PASS | PASS | 0 |
| 2816 | PASS | PASS | PASS | 0 |

The first diagnostic run, job 2814, correctly returned HOLD because the canary still counted identity without `book_id`; readback and rollback passed. The defect was fixed and deployed before jobs 2815/2816. No test marker remains in `chanjet_master_mapping`.

## Finance differences retained for the next Gate

| Item | Status | Diagnosis |
|---|---|---|
| AR open | MISMATCH | Different grain and lifecycle; Chanjet counterparty-period balance is the finance authority while ERP invoices remain explanatory detail |
| AP open | MISMATCH | Different grain and lifecycle; do not backfill either side from an aggregate delta |
| Cash balance | MISMATCH | Must split by book, company, currency, original/base currency, account mapping, and balance date |
| Today receipt | MISMATCH | Operational posting/status/date gap; reconcile effective documents by identity |
| Today payment | MISMATCH | Operational posting/status/date gap; reconcile effective documents by identity |

Subject balance, balance sheet, income statement, cash flow, and voucher list remain readonly Chanjet reports without a fabricated ERP statutory-report peer. These are WARN, not failures and not fake matches.

## Verification

- API typecheck: PASS.
- Focused Chanjet Jest: 68/68 PASS.
- W5 closeout static gate: PASS.
- Migration down/no-DML/entity-drift gates: PASS in CI.
- CI/CD run `29744366181`: SUCCESS for account-book identity migration.
- CI/CD run `29745034623`: SUCCESS for canary identity verification.
- Production health: PASS.
- Production unique constraint: `(mapping_type, book_id, erp_code, chanjet_id)`.

## Guardrails

- Chanjet external write: **disabled / not executed**.
- Chanjet delete or modify: **not executed**.
- Voucher push: **disabled / not executed**.
- ERP business-table write: **not executed**.
- ERP integration-layer canary: executed and fully compensated.
- Push to main and production deployment: completed for the approved ERP fixes.

## Next Gate

`CHANJET_P3_FIELD_SEMANTIC_LOCK` is ready. It must decompose the five real finance differences by account book, company, currency, accounting/business date, document status, and document identity. External Chanjet minimal write remains a separate approval Gate and is not enabled by this result.

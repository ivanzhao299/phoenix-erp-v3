# Chanjet Cash Balance Field Lock Report

Date: 2026-07-20

Decision: **GO WITH CONDITIONS**

Next Gate: `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`

## 1. Deployment Error Root Cause And Repair

The deployment blockage preceding this Gate was caused by the CI security i18n debt check, not by SSH, Docker, the production host, or the Chanjet provider. Nine hard-coded literals on the Chanjet administration page caused repeated security-gate failures, and docs-only Bug Intake audit commits retriggered the same application pipeline.

The repair was completed in `665d3fcc fix: clear Chanjet i18n security gate debt`:

- i18n coverage restored to `3266/3266`;
- locale quality debt restored to zero;
- docs-only ops artifacts no longer retrigger application security/deploy jobs;
- deploy run `29719878204` passed.

## 2. Cash Balance Authority Contract

Commit `cee62b47 feat: lock Chanjet cash balance authority` removed the former placeholder/directory interpretation and locked the production rule to valid readonly `GL_BALANCE` evidence:

1. Evaluate every enabled account book independently.
2. Use that book's latest valid `YYYYMM` accounting period.
3. Include only cash/bank leaf subjects matching `1001*` or `1002*`.
4. Reject summary and total rows.
5. Use `rawData.baseEndingBalance` for the CNY group total.
6. Preserve `rawData.endingBalance` and `rawData.currency` only as original-currency breakdown evidence.
7. Reject missing fields, duplicate book/period/subject rows, missing enabled books, and mirrors older than 24 hours.
8. Treat an exact zero as valid only when the complete contract evidence exists.
9. Keep `FIN_ACCOUNT` as account-directory evidence only; it must never be interpreted as account balance.

The finance report source is now `CHANJET_GL_CASH_BALANCE_MIRROR`. ERP operational values remain auxiliary evidence and are never silently overwritten.

## 3. Verification Before Deployment

- API typecheck: PASS.
- Focused Chanjet unit tests: 41/41 PASS.
- Cash balance static contract audit: 5/5 PASS.
- W5 closeout gate: 20/20 PASS with the recorded freeze/security boundary flags.
- `git diff --check`: PASS.

Focused tests cover latest-period aggregation, valid exact-zero balances, duplicate-row rejection, and missing-book rejection.

## 4. CI/CD And Deployment Result

Application commit: `cee62b47576ccb570451f133d2b17330487b999e`

- AI Delivery CI Security `29722818582`: PASS.
- CI Web Unit Tests `29722818596`: PASS.
- AI Delivery CI Build `29722818689`: PASS.
- CI/CD Build & Deploy `29722818642`: PASS.

Production verification:

- `/opt/phoenix-erp` HEAD: `cee62b47`.
- deployed API/Web image revision: `cee62b47576ccb570451f133d2b17330487b999e`.
- API container: healthy.
- production Node runtime: `v20.20.2`.

The first production-audit transfer attempt failed because the host-side audit output path was assumed to exist after running the script in a different runtime context. No application deploy or financial data failed. The audit was rerun locally against the deployed authenticated readonly endpoints with a short-lived production audit token, and its artifacts were written directly into the repository.

## 5. Authenticated Production Audit

Artifacts:

- `docs/ops/runs/chanjet-cash-balance-field-lock-production-latest.json`
- `docs/ops/runs/chanjet-cash-balance-field-lock-production-latest.md`

Result: **12/12 PASS**

| Evidence | Result |
|---|---:|
| Enabled account books covered | 3/3 |
| Eligible latest-period leaf rows | 29 |
| Accounting period | 202607 |
| Base currency | CNY |
| Authoritative cash/bank balance | 3,017,798.61 |
| Invalid contract rows | 0 |
| Duplicate contract rows | 0 |
| Mirror freshness | PASS |
| Finance authority card match | PASS |
| Business report source/value match | PASS |

No account number, storage secret, token, or other sensitive provider data is included in the audit report.

## 6. Safety Boundary

- Chanjet write/delete/modify: **not executed**.
- Voucher push: **not executed**.
- ERP business-table overwrite: **not executed**.
- ERP database write: **not executed**.
- Migration: **not executed**.
- Production deploy: executed only for the reviewed application code at `cee62b47`.

## 7. Gate Decision

`CHANJET_P3_CASH_BALANCE_FIELD_LOCK` is closed with **GO WITH CONDITIONS**. Cash/bank balance can now be shown as Chanjet readonly authority with a visible source and ERP auxiliary difference.

The next Gate is `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`: verify deterministic company, account-book, counterparty, subject, project and cash-account mappings before expanding ordinary-user financial fusion. Chanjet writeback and voucher push remain blocked.

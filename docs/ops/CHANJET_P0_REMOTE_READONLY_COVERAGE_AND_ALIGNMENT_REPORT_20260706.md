# Chanjet P0 Remote Readonly Coverage and Alignment Report

Date: 2026-07-06

Decision: GO WITH CONDITIONS

## Objective

Continue the Chanjet / 好业财 readonly integration work by verifying production-side mirror coverage, separating local empty-mirror audit noise from production evidence, and aligning ERP finance card runtime reads with the current readonly mirror model.

## Boundary

- Chanjet write: no
- Chanjet delete / modify: no
- Voucher push: no
- ERP DB write: no
- Migration: no
- Deploy: not in this report
- Push: not in this report

## What Changed

1. Added remote readonly coverage audit:
   - `scripts/ops/chanjet-remote-readonly-coverage-audit.mjs`
   - `docs/ops/runs/chanjet-remote-readonly-coverage-audit-latest.json`
   - `docs/ops/runs/chanjet-remote-readonly-coverage-audit-latest.md`
2. Fixed finance AR alignment runtime:
   - `apps/api/src/modules/finance-v2/services/financial-reports.service.ts`
   - AR cards now read `chanjet_entity_snapshots` / `AR_STATISTICS` first.
   - Legacy `chanjet_ar_snapshot` remains as fallback only.
   - `AUTHORITY_READY` / system confirmation guardrails remain in place.

## Remote Readonly Audit Result

Source: production ERP middle-layer mirror tables, read-only over SSH.

| Metric | Result |
|---|---:|
| Endpoint coverage | 100% |
| Finance card dependency coverage | 100% |
| Field classification coverage | 10.9% |
| HIGH / CRITICAL open fields | 1348 |
| Local / production mirror mismatch | yes |

The production mirror contains evidence for all P0 readonly scopes:

- Account books
- Departments
- Customer / supplier counterparties
- Subjects
- Projects
- Cash accounts
- AR / AP statistics
- AR / AP payments
- Purchase orders
- Vouchers
- GL balance
- Balance sheet
- Income statement
- Cash flow

## Entity Evidence

The latest production mirror evidence includes:

- `AR_STATISTICS`: 71 rows
- `AP_STATISTICS`: 43 rows
- `AR_RECEIPT`: 235 rows
- `AP_PAYMENT`: 117 rows
- `VOUCHER`: 1247 rows
- `CUSTOMER_SUPPLIER`: 292 rows
- `CASH_ACCOUNT`: 47 rows
- `PROJECT`: 6 rows

## Interpretation

P0 data acquisition is no longer the primary blocker. The data has been pulled into the ERP-owned readonly middle layer on production.

The remaining blocker is semantic alignment:

1. Many Chanjet fields are still marked `PENDING`.
2. Voucher detail fields dominate the HIGH open field list.
3. Local audit currently shows 0% coverage because the local database does not contain the production mirror rows.
4. Future audits must explicitly distinguish:
   - local development mirror state
   - production middle-layer mirror evidence

## Finance Card Alignment

The old AR runtime path still read `chanjet_ar_snapshot`, while the current mirror model stores normalized AR rows in `chanjet_entity_snapshots` as `AR_STATISTICS`.

This report fixes that mismatch:

- AR card comparison now uses `CHANJET_AR_STATISTICS_MIRROR`.
- AP card comparison already used `CHANJET_AP_STATISTICS_MIRROR`.
- ERP card values are still not silently overwritten.
- Only `AUTHORITY_READY` plus system confirmation can become primary card authority.

## Next Tasks

| Priority | Task | Purpose |
|---|---|---|
| P0 | `CHANJET-FIELD-GAP-REVIEW-GATE` | Convert HIGH / CRITICAL pending fields into ERP mapping, transform, ignore, or manual-review decisions. |
| P0 | `CHANJET-LOCAL-PROD-MIRROR-STATE-RECONCILE` | Prevent local empty DB audits from incorrectly implying production Chanjet sync failure. |
| P1 | `CHANJET-FINANCE-CARD-AUTHORITY-VERIFY` | Verify which finance cards may now safely use Chanjet as the primary display authority. |
| P1 | `CHANJET-VOUCHER-DETAIL-READMODEL` | Normalize voucher header/detail fields into a stable readonly report model before any draft generation. |

## Current Conclusion

GO WITH CONDITIONS.

The ERP has production evidence that Chanjet readonly data is broadly available. The next work should not keep expanding raw fetch scope blindly; it should close field semantics and finance-card authority one metric at a time while keeping Chanjet write-back on HOLD.

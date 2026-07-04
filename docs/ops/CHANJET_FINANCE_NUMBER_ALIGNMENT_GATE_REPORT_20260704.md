# CHANJET Finance Number Alignment Gate Report

Date: 2026-07-04
Agent: Codex-Orchestrator
Decision: GO WITH CONDITIONS

## Objective

Move Phoenix ERP finance dashboard numbers toward Chanjet-first financial authority. The immediate production-safe target is to align AP/AR financial cards with Chanjet readonly mirror data whenever available, while preserving ERP operational detail tables and avoiding any Chanjet write-back.

## Implemented

### Backend

- Added Chanjet-first authority resolution inside `FinancialReportsService.getOverview()`.
- Added readonly alignment endpoint:
  - `GET /api/v2/finance/reports/chanjet-alignment`
- AP open amount now uses this priority:
  1. Chanjet `AP_STATISTICS` mirror in `chanjet_entity_snapshots`
  2. ERP fallback `fin_ap_invoices`
- AR open amount now uses this priority:
  1. Chanjet `chanjet_ar_snapshot` latest-period `endbalance`
  2. ERP fallback `fin_ar_invoices + fin_ar_ledger`
- Added fail-soft behavior: if Chanjet mirror tables are unavailable in an environment, the dashboard falls back to ERP and exposes coverage as incomplete rather than throwing 500.

### Frontend

- Finance reports overview cards now show data source for AR/AP:
  - `好业财口径` when Chanjet mirror covers the metric.
  - `ERP回退` when Chanjet mirror is not available.
- Finance overview now displays Chanjet coverage rate and AP/AR difference hints.

## Guardrails

- Chanjet write: no
- Chanjet delete: no
- Chanjet modification: no
- Voucher push: no
- ERP business-table overwrite: no
- Migration: no
- Production DB write by this gate: no
- `fin_ar_invoices` remains operational invoice detail and is not populated from Chanjet aggregate data.

## Current Alignment Scope

| Finance Metric | Authority Rule | Status |
|---|---|---|
| AR open | Chanjet latest AR snapshot if available, otherwise ERP fallback | Implemented |
| AP open | Chanjet AP statistics mirror if available, otherwise ERP fallback | Implemented |
| Cash balance | ERP cash account ledger | Pending Chanjet cash/account balance field proof |
| Expense pending | ERP workflow | Not a Chanjet accounting aggregate |
| Reimbursement pending | ERP workflow | Not a Chanjet accounting aggregate |
| Shareholder balance | ERP shareholder ledger | Not currently covered by Chanjet mirror |

## Why Not Overwrite ERP Tables

Chanjet AP/AR statistics are aggregate financial balances. ERP invoice/payment tables are operational detail sources. This gate aligns dashboard display and comparison logic to Chanjet authority where Chanjet has data, but does not overwrite ERP detail records. This avoids losing operational fields such as due date, approval state, attachment, data-scope owner, and workflow status.

## Validation

- API typecheck: PASS
- Web typecheck: PASS
- Local environment Chanjet AR table availability check: table missing, handled by fail-soft fallback.

## Remaining Work

1. Complete Chanjet cash/account balance field proof and decide whether cash cards should also become Chanjet-first.
2. Add a side-by-side finance alignment view for AP/AR by counterparty, company, book, and period.
3. Continue mapping voucher header/line fields into readonly voucher detail reconstruction.
4. Review high-risk field mappings where Chanjet types and ERP types differ.
5. Keep voucher push disabled until a separate write-back gate is explicitly approved.

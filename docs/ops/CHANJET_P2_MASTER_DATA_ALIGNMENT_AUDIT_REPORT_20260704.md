# Chanjet P2 Master Data Alignment Audit Report

Date: 2026-07-04
Agent: Codex-Orchestrator
Decision: GO WITH CONDITIONS

## Objective

Advance Chanjet integration from readonly data collection and finance-card source labelling into a reusable master-data alignment layer. The goal is to make ERP know which Chanjet objects can be mapped, which mappings still need review, and which domains block later reconciliation or write-back preparation.

## Implemented

### Backend

- Added `GET /api/chanjet/integration/master-data-alignment`.
- The endpoint reads only ERP Chanjet middle-layer tables:
  - `chanjet_entity_snapshots`
  - `chanjet_master_mapping`
  - `chanjet_erp_field_mapping`
  - `chanjet_account_books`
- The endpoint returns domain-level alignment status for:
  - company / account book
  - customer / supplier / counterparty
  - subject
  - project
  - cash account
  - department / organization
  - currency
- Each domain includes mirror evidence, mapping counts, approved rate, field-gap counts, status, authority rule, and next action.

### Ops Runner

- Added `scripts/ops/chanjet-master-data-alignment-audit.mjs`.
- The runner uses latest production readonly-sync artifacts as primary evidence and avoids treating an empty local DB as production truth.
- Outputs:
  - `docs/ops/runs/chanjet-master-data-alignment-latest.json`
  - `docs/ops/runs/chanjet-master-data-alignment-latest.md`

## Current Evidence

- Mirror domain coverage: 100%
- Total scoped Chanjet mirror rows: 5959
- Field mapping candidates: 1677
- Pending semantic mappings: 1494

## P2 Domain Results

| Domain | Status | Mirror rows | Entity rows | High-risk open fields | Action |
|---|---:|---:|---:|---:|---|
| Company / account book | READY_FOR_MAPPING_REVIEW | 3 | 6 | 0 | Review and approve mapping before any write-back usage. |
| Customer / supplier / counterparty | NEED_REVIEW | 1668 | 406 | 334 | Split customer/supplier/dual-role counterparties and review mappings. |
| Subject | NEED_REVIEW | 135 | 15 | 1037 | Lock subject code, hierarchy, balance direction, and statement semantics. |
| Project | READY_FOR_MAPPING_REVIEW | 432 | 48 | 0 | Review mapping before using in procurement/payment alignment. |
| Cash account | NEED_REVIEW | 1847 | 327 | 1037 | Review fund account ownership, currency, balance authority, and active state. |
| Department / organization | READY_FOR_MAPPING_REVIEW | 27 | 3 | 0 | Review before DataScope usage. |
| Currency | READY_FOR_MAPPING_REVIEW | 1847 | 327 | 0 | Normalize into `SYS_CURRENCY`; do not mix base/original currency. |

## Guardrails

- Chanjet write: no
- Chanjet delete: no
- Chanjet modification: no
- Voucher push: no
- ERP business-table overwrite: no
- Migration: no
- Deploy in this implementation step: no

## Validation

- `node --check scripts/ops/chanjet-master-data-alignment-audit.mjs`: PASS
- `node scripts/ops/chanjet-master-data-alignment-audit.mjs --output-dir docs/ops/runs`: PASS
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`: PASS

## Current Result

P2 is now available as both runtime API and repeatable ops report. The data is read sufficiently for master-data alignment, but three P0 domains still require semantic review before ERP can treat them as stable authority:

1. counterparty
2. subject
3. cash account

## Next Gate

`CHANJET_P3_RECONCILIATION_CENTER`

Recommended scope:

1. Build visible ERP vs Chanjet reconciliation rows with `OK / WARN / MISMATCH / HOLD / NEED_MAPPING`.
2. Start with AP/AR, cash account balance, subject balance, receipt/payment, and key report figures.
3. Keep Chanjet writes and voucher push blocked until P2/P3 are stable and a separate P4 write-back approval gate is opened.

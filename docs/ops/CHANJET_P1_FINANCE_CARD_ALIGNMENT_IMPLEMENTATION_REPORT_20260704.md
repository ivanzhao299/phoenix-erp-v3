# Chanjet P1 Finance Card Alignment Implementation Report

Date: 2026-07-04
Agent: Codex-Orchestrator
Decision: GO WITH CONDITIONS

## Objective

Advance Chanjet integration from full readonly evidence collection into visible ERP finance-card alignment. The goal is not only to read Chanjet data, but to make ERP finance pages state which numbers use Chanjet authority, which numbers are ERP fallback, and which numbers are blocked pending semantic field proof.

## Implemented

### Backend

- `FinancialReportsService` now separates:
  - `covered`: Chanjet mirror data exists.
  - `authorityEligible`: the Chanjet field semantics are safe to use as the displayed authority.
- Finance alignment metrics now include:
  - `chanjetSource`
  - `chanjetValue`
  - `authorityEligible`
  - `authorityReason`
  - `NEEDS_MAPPING` status
  - `recommendedAction`
- `todayInflow` and `todayOutflow` no longer silently use Chanjet payment mirrors as authority.
  - Reason: payment mirrors are currently full/period datasets; the business-day field is not yet semantically locked to ERP's "today" cash-flow definition.
  - Display remains ERP current-day cash transactions.
  - Chanjet payment mirrors are retained as comparison evidence with `NEEDS_MAPPING`.
- `GET /api/v2/finance/reports/chanjet-alignment` now surfaces `needsMappingCount` and more precise card-level conditions.

### Frontend

- `/finance2/reports` now shows a "好业财财务口径对齐" panel with eight metrics:
  - 应收待收
  - 应付待付
  - 现金 / 银行余额
  - 今日收款
  - 今日付款
  - 科目余额
  - 资产负债表
  - 利润表
- Each metric shows:
  - display source
  - status badge
  - Chanjet value
  - ERP auxiliary value
  - difference
  - authority reason
- KPI card subtitles now expose status labels instead of making the figures look like local ad-hoc aggregation.

## Guardrails

- Chanjet write: no
- Chanjet delete: no
- Chanjet modification: no
- Voucher push: no
- ERP business-table overwrite: no
- Migration: no
- Deploy in this local implementation step: no

## Validation

- API typecheck: PASS
- Web typecheck: PASS

## Current Result

P1 is now implemented at runtime surface level. Finance users can see whether a card is Chanjet-authoritative, ERP fallback, mismatched, or waiting for semantic mapping.

The current decision remains `GO WITH CONDITIONS` because:

1. Today receipt/payment cards still need Chanjet business-day field proof.
2. Pending semantic mappings remain large from P0 sync evidence.
3. The next durable business value is P2 master-data and account-subject mapping, followed by P3 reconciliation center.

## Next Gate

`CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`

Recommended scope:

1. ERP company_code to Chanjet account book / organization.
2. ERP supplier/customer to Chanjet counterparty.
3. ERP project_code to Chanjet project.
4. ERP cash_account to Chanjet fund account.
5. ERP expense_type and finance card dimensions to Chanjet subject codes.
6. Produce mapping confidence and manual review queues.


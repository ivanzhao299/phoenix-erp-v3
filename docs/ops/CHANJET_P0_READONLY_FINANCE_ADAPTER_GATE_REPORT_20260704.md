# CHANJET P0 Readonly Finance Adapter Gate Report

Date: 2026-07-04
Agent: Codex-Orchestrator
Decision: GO WITH CONDITIONS

## Goal

Implement the next readonly Chanjet integration step after the finance semantic mapping gate: expose a P0 finance adapter overview that reorganizes existing ERP-side Chanjet mirror data into business-readable finance buckets.

## Scope Completed

- Added backend readonly adapter summary endpoint:
  - `GET /api/chanjet/integration/finance-adapter/p0`
- Added service aggregation over existing middle-layer tables:
  - `chanjet_read_snapshots`
  - `chanjet_entity_snapshots`
  - `chanjet_erp_field_mapping`
  - `chanjet_account_books`
- Added frontend tab on the Chanjet middle-layer page:
  - `财务管理 / 好业财中间层 / P0 财务适配`
- No new migration.
- No Chanjet write.
- No voucher push.
- No ERP business table write.

## Adapter Buckets

| Bucket | Priority | Meaning | ERP Target |
|---|---:|---|---|
| CHANJET_VOUCHER_HEADER | P0 | Voucher header readonly reconstruction | chanjet_voucher_drafts.header_snapshot |
| CHANJET_VOUCHER_LINE | P0 | Voucher line readonly reconstruction | chanjet_voucher_drafts.voucher_lines |
| CHANJET_COUNTERPARTY | P0 | Customer / supplier counterparties | chanjet_master_mappings |
| CHANJET_AP_AR_AGGREGATE | P0 | AP / AR aggregate readonly mirror | chanjet_entity_snapshots + finance review input |
| CHANJET_PAYMENT_DOCUMENT | P1 | AP payment / AR receipt readonly candidates | finance-v2 readonly adapter |
| CHANJET_PURCHASE_LINKAGE | P1 | Purchase order readonly reconciliation input | procurement-v2 readonly reconciliation input |

## Guardrails

- Chanjet write: no
- Chanjet delete: no
- Chanjet modify: no
- Voucher push: no
- ERP business table write: no
- Migration: no
- Deployment action from script: no
- `fin_ar_invoices` link to Chanjet aggregate data: forbidden

## Files Changed

- `apps/api/src/modules/chanjet/chanjet-integration.service.ts`
- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
- `apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx`
- `docs/ops/CHANJET_P0_READONLY_FINANCE_ADAPTER_GATE_REPORT_20260704.md`

## Validation

Pending local validation in this commit:

- API typecheck
- Web typecheck
- W5 closeout gate

## Current Conditions

- P0 adapter depends on existing readonly mirror snapshots and field mapping results.
- High-risk or critical field gaps still require finance/A2 review before ERP schema/DTO/UI adaptation.
- The adapter is a review/read model only; it does not create vouchers or push to Chanjet.

## Next Recommended Gate

`CHANJET_P0_READONLY_FINANCE_ADAPTER_REVIEW`

Recommended next work:

1. Use the P0 adapter tab to review voucher, counterparty, and AP/AR aggregate readiness.
2. Approve or hold high-risk field mappings.
3. Build read-only difference views for ERP business modules versus Chanjet middle-layer mirror.
4. Keep Chanjet write-back and voucher push disabled until a separate approval gate.

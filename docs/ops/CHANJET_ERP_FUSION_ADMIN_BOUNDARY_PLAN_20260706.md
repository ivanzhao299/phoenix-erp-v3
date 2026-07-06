# Chanjet / ERP Fusion Admin Boundary Plan - 2026-07-06

## 1. Architecture Decision

Chanjet / 好业财 middle-layer data is integration infrastructure. It is not a normal business module and must not be exposed to ordinary users.

Ordinary users should use Phoenix ERP business pages without seeing mirror tables, field catalogs, raw snapshots, probe jobs, proxy calls, or voucher-draft plumbing. They may see business results that are already fused into ERP pages, such as finance cards, AR/AP balances, reconciliation warnings, and source badges.

Administrators and integration operators may use the Chanjet middle-layer console to inspect sync jobs, account books, field coverage, semantic locks, mapping candidates, reconciliation evidence, and voucher draft preparation.

## 2. Role Boundary

| Layer | Primary User | Visible UI | Permission |
| --- | --- | --- | --- |
| Business consumption | Finance / procurement / manager users | Finance reports, AR/AP, cash, purchasing, sales, dashboards | Business menu codes such as `MENU_FIN2_REPORT`, `MENU_FIN2_AR`, `MENU_FIN2_AP` |
| Reconciliation evidence | Finance leads / auditors | AR reconciliation, AP reconciliation, visible source and diff badges | Finance ledger/report menu codes |
| Integration operations | System admin / integration operator | `/finance2/chanjet-sync`, `/finance2/chanjet-integration` | `MENU_SETTINGS_CHANJET` |
| External write-back | Not enabled | No public UI until a dedicated Gate | HOLD until explicit approval |

## 3. Implementation Completed In This Pass

1. Backend Chanjet proxy and integration-control endpoints now use `MENU_SETTINGS_CHANJET`.
2. Sidebar entries for `好业财同步` and `好业财中间层` now require `MENU_SETTINGS_CHANJET`.
3. Finance module cards for `好业财同步` and `好业财中间层` now require `MENU_SETTINGS_CHANJET`.
4. `/finance2/chanjet-integration` now presents itself as a system-admin governance console, not a finance business page.
5. `/finance2/chanjet-sync` now requires `MENU_SETTINGS_CHANJET` at the UI entry.

This pass does not write Chanjet, does not push vouchers, does not run migration, and does not overwrite ERP business data.

## 4. Fusion Rule For Ordinary Users

Ordinary users should see:

1. Business labels, not integration jargon.
2. Finance cards with clear value source:
   - `好业财口径` when the metric is authority-ready.
   - `ERP 口径` when the metric is not safe to promote.
   - visible diff / blocker when the two sides disagree.
3. No raw `chanjet_*` table names.
4. No field catalog, raw payload, API path, token, proxy, or sync-job controls.
5. No buttons for refresh token, probe, mirror sync, field mapping analysis, voucher draft creation, or proxy calls.

## 5. Admin Console Responsibilities

The admin-only Chanjet console remains responsible for:

1. Readonly mirror sync.
2. Account-book cache review.
3. API field catalog and masked samples.
4. ERP ↔ Chanjet mapping candidates.
5. Field semantic lock review.
6. Reconciliation evidence.
7. Voucher draft preparation only.
8. Sync / probe job audit.

## 6. Ordered Implementation Plan

### P0 - Boundary Lock

Status: implemented in this pass.

Acceptance:

- Ordinary finance users without `MENU_SETTINGS_CHANJET` cannot see `好业财同步` or `好业财中间层`.
- Direct API access to `/api/chanjet/integration/*` requires `MENU_SETTINGS_CHANJET`.
- Business finance cards still work through existing finance report APIs.

### P1 - Business-Facing Fusion

Goal: make business pages consume fused finance data without exposing middle-layer internals.

Tasks:

1. Add a reusable `financeSourceBadge` display model:
   - `CHANJET_AUTHORITY`
   - `ERP_PRIMARY`
   - `DIFF_WARNING`
   - `NEEDS_MAPPING`
2. Replace raw Chanjet wording in normal business pages with business-language source labels.
3. Keep `/finance2/reports` and dashboard cards as the main ordinary-user fusion surface.
4. Ensure AR/AP pages show reconciliation state without linking to middle-layer details.

### P2 - Admin Review Workflow

Goal: admin can classify field gaps and mappings without users seeing the workflow.

Tasks:

1. Implement readonly voucher line adapter.
2. Implement readonly voucher header adapter.
3. Implement counterparty mapping review queue.
4. Add review status transitions:
   - `PENDING`
   - `APPROVED`
   - `REJECTED`
   - `NEEDS_MANUAL_REVIEW`
5. Keep all approved mappings in middle-layer tables.

### P3 - Reconciliation Center For Finance Leads

Goal: finance leads see diff and action, but not raw middle-layer mechanics.

Tasks:

1. AR/AP comparison rows.
2. Cash / bank balance comparison rows after semantic lock.
3. Subject balance readonly report.
4. Statement report readonly pages.
5. Diff states:
   - `OK`
   - `WARN`
   - `MISMATCH`
   - `NEED_MAPPING`
   - `HOLD`

### P4 - Write-Back Preparation

Goal: prepare ERP voucher drafts but keep Chanjet write-back closed.

Tasks:

1. Draft voucher generation from ERP business events.
2. Human review workflow.
3. Duplicate push guard.
4. Push simulation.
5. Audit log.

Write-back remains HOLD until a separate user-approved Gate.

## 7. Guardrails

1. Do not expose middle-layer console to ordinary users.
2. Do not write Chanjet without a dedicated approval Gate.
3. Do not silently overwrite ERP business facts with Chanjet values.
4. Do not treat zero values from unclassified Chanjet fields as real business zero.
5. Do not use raw payload samples in ordinary UI.
6. Do not give finance business users proxy/probe/sync controls unless they also have `MENU_SETTINGS_CHANJET`.
7. Keep ERP as business-operation system and Chanjet as accounting-authority source for approved finance metrics.

## 8. Next Gate

`CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION`

First batch:

1. `FIELD-GAP-CHANJET_VOUCHER_LINE`
2. `FIELD-GAP-CHANJET_VOUCHER_HEADER`
3. `FIELD-GAP-CHANJET_COUNTERPARTY`

The implementation must remain readonly and admin-reviewed. Ordinary users should only see final fused business output.


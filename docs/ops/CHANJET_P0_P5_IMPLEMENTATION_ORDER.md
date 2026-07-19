# Chanjet P0-P5 Implementation Order

## Fixed sequence

1. **P0 - Full readonly mirror baseline**
   - Cover account books, subjects, counterparties, departments, projects, accounts, receivables, payables, receipts, payments, vouchers and statements.
   - A stale or missing required target is `HOLD`; later phases may collect evidence but cannot promote authority.
2. **P1 - Finance Read Model and card authority**
   - Only `AUTHORITY_READY` metrics may become a primary ERP value.
   - ERP detail remains auxiliary evidence. Differences are visible and never silently overwritten.
3. **P2 - Semantic and master-data mapping**
   - Lock company/book, customer/supplier, subject, project, department, currency and cash-account identities.
   - Exact deterministic mappings may be system-confirmed. Conflicts and fuzzy candidates remain isolated.
4. **P3 - Ordinary business UI fusion**
   - Ordinary users consume ERP finance endpoints with source, fallback and difference contracts.
   - The Chanjet middle-layer console remains admin-only behind `MENU_SETTINGS_CHANJET`.
5. **P4 - Synchronization reliability and drift alerts**
   - Four-hour readonly alignment uses an advisory lock, bounded retry, idempotent reconciliation and current-state alerts.
   - API shape changes, stale mirrors, failed jobs and unresolved differences must be visible.
6. **P5 - Voucher writeback preparation**
   - ERP may create, validate and review balanced voucher candidates.
   - `PUSH_READY` means internal writeback candidate only. Chanjet push remains disabled until a separate explicit approval Gate.

## Decision source

`GET /api/chanjet/integration/current-state` is the only runtime authority for the current P0-P5 decision. Historical files under `docs/ops/runs/` retain audit value but cannot override newer runtime evidence.

## Hard boundaries

- No Chanjet write, update or delete.
- No automatic voucher push.
- No silent ERP business-table overwrite.
- No production migration, deploy or push in this implementation package.
- No ordinary-user access to the integration console.

## Validation

```bash
node --check scripts/ops/chanjet-current-state-audit.mjs
node scripts/ops/chanjet-current-state-audit.mjs --dry-run
cd apps/api && ./node_modules/.bin/tsc --noEmit
cd apps/web && ./node_modules/.bin/tsc --noEmit
node scripts/ci/check-w5-closeout-gate.mjs
```

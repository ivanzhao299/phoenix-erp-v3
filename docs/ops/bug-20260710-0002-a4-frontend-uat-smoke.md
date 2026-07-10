# BUG-20260710-0002 A4 Frontend UI/UX UAT Report

## 1. Changed Files

- `apps/web/src/app/(admin)/finance2/ar/page.tsx`
- `docs/ops/bug-20260710-0002-a4-frontend-uat-smoke.md`

## 2. Page / Component List

- Route: `/finance2/ar`
- Component: `Finance2ArPage`
- Component: `CreateReceiptModal`
- Selector: `CashAccountSelector`

## 3. UI/UX Adjustment Summary

- Fixed the top-level "录入收款" path so submit no longer only creates a receipt draft.
- Added required validation for "收款账户"; if no account is selected, the modal blocks submission with "请选择收款账户".
- After receipt creation, the frontend now calls `/api/v2/finance/ar/receipts/:id/confirm` for all receipt submissions.
- Invoice-specific receipt flow still sends the original allocation payload, so invoice balance refresh behavior is preserved.
- General receipt flow sends an empty allocation list, which is the frontend trigger needed for the account receipt confirmation path.

## 4. Permission Visibility Notes

- No permission bypass was added.
- Existing button visibility remains governed by `usePermission('MENU_FIN2_AR')`.
- The confirm endpoint remains backend-authoritative for RBAC/audit/DataScope enforcement.
- Security review note: finance receipt confirmation is a money-moving action; A2 should retain review ownership for RBAC action granularity.

## 5. Responsive Behavior Notes

- No layout, spacing, breakpoint, drawer, table, or mobile behavior was changed.
- The change is limited to modal validation and submit sequencing.

## 6. UAT Smoke Result

Status: HOLD

Validation performed:

- `pwd` -> `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`
- `git branch --show-current` -> `w5-a4-frontend-uat-smoke`
- `git status --short` before work -> clean
- `git log --oneline --decorate -8` reviewed
- `cd apps/web && ./node_modules/.bin/tsc --noEmit` -> PASS
- `cd apps/api && ./node_modules/.bin/tsc --noEmit` -> PASS
- Targeted scope audit:
  - `rg -n "<input[^>]*(companyCode|companyName|customerCode|customerName|receivedAccountCode)" apps/web/src/app/(admin)/finance2/ar/page.tsx` -> no raw master-data input matches
  - `rg -n "CompanySelector|CustomerSelector|CashAccountSelector|receivedAccountCode" apps/web/src/app/(admin)/finance2/ar/page.tsx` -> selectors present for company/customer/cash account

Not performed:

- Production smoke on `https://erp.eggslao.com/finance2/ar`.
- DB write validation of actual account balance mutation.
- Deployment or migration.

Reason: A4 guardrails prohibit deployment, DB writes, migration execution, and direct production actions.

## 7. A2 Security Review Required

Yes.

Reason: the repaired path triggers receipt confirmation and cash account balance mutation. A2 should verify `MENU_FIN2_AR` action mapping, audit trace, DataScope, and finance approval semantics.

## 8. A1 Validation Required

Yes.

Reason: acceptance requires end-to-end confirmation that selecting a receipt account and confirming receipt changes the corresponding account balance. That needs integrated API/runtime validation after backend and frontend are deployed together.

## 9. Blockers And Next Recommendation

Blockers:

- Local commit could not be created because `git add` failed with `Operation not permitted` while writing `/Users/mac/phoenix-erp/.git/worktrees/a4-frontend-uat-smoke/index.lock`; the Git metadata path is outside the writable sandbox.
- Local agent did not perform production smoke or DB mutation verification by contract.
- If backend rejects `allocations: []` for standalone receipt confirmation, A3 must expose/confirm the supported no-allocation confirmation payload.

Next recommendation:

- Run A1 integrated smoke: create or use a test customer receipt with a selected cash account, confirm it, then verify `/finance2/cash-accounts` current balance and transaction ledger changed by the receipt amount.

## 10. Result

HOLD

Implementation and local validation are complete, but the required local commit could not be created from this sandbox.

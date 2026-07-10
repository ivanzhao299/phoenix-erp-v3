# BUG-20260710-0002 A3 Backend Critical Path Report

## Result

- Conclusion: PASS_WITH_CONDITIONS
- Repair gate: GO
- Source bug: BUG-20260710-0002
- Source task: BUGTASK-20260710-0002
- Agent: A3-Backend-Critical-Path
- Route: `/finance2/ar`
- Issue: 账户收款后，余额不变

## Dry-run Diagnosis

- Frontend create payload saves the selected cash account as `receivedAccountCode`.
- The immediate confirm request posts only `allocations` and does not send `receiveAccountId`.
- Backend `ArReceiptsService.confirm()` supports this flow by reading `rec.received_account_code`, but `assertReceiptOwnership()` did not select `received_account_code`.
- Result: AR invoice allocation could complete while the cash-account posting branch was skipped, so `fin_cash_accounts.current_balance` and `fin_cash_transactions` were not updated for that UI path.

## Changed Files

- `apps/api/src/modules/finance-v2/services/ar-receipts.service.ts`
  - Added `exchange_rate` and `received_account_code` to the receipt lookup used by confirm.
- `apps/api/src/modules/finance-v2/services/ar-receipts.service.spec.ts`
  - Added a regression test for confirm without `receiveAccountId`, verifying it posts to the saved `received_account_code`.
- `docs/ops/BUG-20260710-0002-A3-BACKEND-CRITICAL-PATH-REPORT.md`
  - This report.

## APIs Covered

- Existing API repaired: `POST /api/v2/finance/ar/receipts/:id/confirm`
- No new API route was added.
- No request/response contract change was introduced.

## RBAC / DataScope / Audit Coverage

- RBAC preserved: controller remains `@RequireMenu('MENU_FIN2_AR', 'A')` for receipt confirm.
- DataScope preserved: receipt ownership and AR invoice/company checks remain unchanged; cash account company/scope checks still run before posting.
- Audit/accounting trail preserved: cash posting still writes an `AR_RECEIPT` row through `CashTransactionsService.writeTransaction()` with `sourceId`, `sourceNo`, amount, and `balanceAfter`.
- Attachment ACL not touched.

## Validation Commands

- `cd apps/api && ./node_modules/.bin/jest src/modules/finance-v2/services/ar-receipts.service.spec.ts --runInBand`
  - PASS: 1 test suite, 1 test passed.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors.

## Frozen Items Statement

- No migrations created or executed.
- No schema/entity/table/column changes.
- No database writes performed.
- No production deploy performed.
- No push or merge performed.
- No frontend files modified.
- No unrelated business modules modified.

## Blockers / Conditions

- Commit was attempted but could not be created in this sandbox:
  - `git add apps/api/src/modules/finance-v2/services/ar-receipts.service.ts apps/api/src/modules/finance-v2/services/ar-receipts.service.spec.ts docs/ops/BUG-20260710-0002-A3-BACKEND-CRITICAL-PATH-REPORT.md`
  - Failed with: `fatal: Unable to create '/Users/mac/phoenix-erp/.git/worktrees/a3-backend-critical-path/index.lock': Operation not permitted`
  - Cause: the worktree files are writable, but this session cannot write the external git index directory.
- Production smoke was not performed by this agent because deploy/push/production actions are forbidden by this task.
- Local screenshot attachment was unavailable in the task context, but code-path evidence was sufficient for this backend repair.

## Next Review Request

- A1/CI should run the normal backend gate on the resulting commit.
- Business/UAT should verify in production after approved release: choose a收款账户 on `/finance2/ar`, confirm receipt, then verify the corresponding资金账户余额 increases by the收款金额 and an `AR_RECEIPT` cash transaction exists.

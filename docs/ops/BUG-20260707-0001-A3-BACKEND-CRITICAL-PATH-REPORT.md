# BUG-20260707-0001 A3 Backend Critical Path Report

## Source

- Source bug: `BUG-20260707-0001`
- Source repair task: `BUGTASK-20260707-0001`
- Route: `/finance2/cash-accounts`
- Acceptance: users without account filing permission must be denied when creating a cash account, with message `当前角色无权限新建账户`.

## Diagnosis

`POST /api/v2/finance/cash/accounts` was guarded by `MENU_FIN2_CASH_MASTER:C`. Historical RBAC data copied broad finance cash permissions into `MENU_FIN2_CASH_MASTER`, so a role that should not own account filing could still satisfy the backend create guard.

The sensitive account filing authority already exists as master-data permission `MENU_MD_CASH_ACCOUNT:C` and is also used by the master-data runtime for `cash-account`. The backend create route needed to require that authority directly and return the task-specific denial message.

## Changed Files

- `apps/api/src/common/guards/menu.guard.ts`
  - Added optional `denialMessage` metadata to `RequireMenu`.
  - Preserved default `MENU_PERMISSION_DENIED` behavior for all existing routes.
- `apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts`
  - Changed only `POST /api/v2/finance/cash/accounts` from `MENU_FIN2_CASH_MASTER:C` to `MENU_MD_CASH_ACCOUNT:C`.
  - Added denial message `当前角色无权限新建账户`.
- `apps/api/src/modules/finance-v2/controllers/fin-cash.controller.spec.ts`
  - Added focused regression metadata test for the create-account guard.

## Validation

- Focused Jest command attempted:
  - `cd apps/api && pnpm test -- fin-cash.controller.spec.ts --runInBand`
  - Result: blocked before executing tests because `apps/api/node_modules` is missing and `jest` is not installed in this worktree.
- API typecheck attempted:
  - `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - Result: blocked because `apps/api/node_modules/.bin/tsc` is missing.
- Offline dependency hydration attempted:
  - `pnpm install --frozen-lockfile --offline`
  - Result: blocked because the local pnpm store is missing `concurrently-8.2.2` and network download is not allowed.
- Static verification completed:
  - Node script confirmed the guard, controller, and spec files exist and contain the required `MENU_MD_CASH_ACCOUNT:C` guard plus denial message.

## Result

`PASS WITH CONDITIONS`

The backend source fix and focused regression spec are present. CI or a dependency-hydrated local environment must still run the focused Jest test and `apps/api` typecheck before this is treated as resolved. No CI/CD, production smoke, database write, migration, deploy, push, or business acceptance was performed here.

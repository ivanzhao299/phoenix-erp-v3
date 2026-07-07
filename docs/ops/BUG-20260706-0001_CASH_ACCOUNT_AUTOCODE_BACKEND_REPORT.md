# BUG-20260706-0001 Cash Account Autocode Backend Report

Generated: 2026-07-06 10:33:55 CST

## Result

GO / PASS WITH CONDITIONS

The backend validation block for creating cash accounts was repaired so a blank account number is treated as omitted. Existing service behavior then generates `CA-YYYYMM-xxxxx` automatically.

Condition: no production deploy, database write, migration, push, or local commit was completed in this task.

## Source

- Bug: `BUG-20260706-0001`
- Repair task: `BUGTASK-20260706-0001`
- Route: `/finance2/cash-accounts`
- API: `POST /api/v2/finance/cash/accounts`
- Symptom: leaving account number blank returned `提交的数据有误:「accountCode」必须是文本`
- Acceptance: leaving account number blank saves with an automatically generated number

## Diagnosis

`CashAccountsService.create()` already supports automatic numbering:

- `dto.accountCode ?? await this.genAccountCode()`
- generated format: `CA-YYYYMM-xxxxx`

The failure occurred before the service layer because `CreateCashAccountDto.accountCode` was required and had `@IsString()`. When the UI submitted a blank value as `null` or omitted the field, global `ValidationPipe` rejected the request before the service could generate a code.

## Changed Files

- `apps/api/src/modules/finance-v2/dto/cash-account.dto.ts`
  - Changed `accountCode` to optional.
  - Added transform to normalize `null`, `''`, and whitespace-only strings to `undefined`.
- `apps/api/src/modules/finance-v2/dto/cash-account.dto.spec.ts`
  - Added DTO regression coverage for omitted, null, and blank account number values.
- `docs/ops/BUG-20260706-0001_CASH_ACCOUNT_AUTOCODE_BACKEND_REPORT.md`
  - This report.

## APIs Implemented / Changed

- No new API was added.
- `POST /api/v2/finance/cash/accounts` now accepts blank/omitted `accountCode` and falls through to the existing backend auto-number generation path.

## RBAC / DataScope / Audit Coverage

- RBAC preserved: controller remains guarded by `@UseGuards(MenuGuard, DataScopeGuard)` and `@RequireMenu(MENU_FIN2_CASH_MASTER, 'C')`.
- DataScope preserved: create still calls `this.accSvc.create(dto, this.scopedUser)`, and service still executes `assertOwnership(dto.companyCode, user)`.
- Audit/creator fields preserved: service still sets `createdBy` and `updatedBy` from `user.username`.
- Attachment ACL: not applicable; no attachment endpoint or ACL path changed.

## Validation Commands

- `pwd`
  - `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`
- `git branch --show-current`
  - `w5-a3-backend-critical-path`
- `git status --short`
  - clean before repair
- `git log --oneline --decorate -8`
  - inspected before repair
- `cd apps/api && pnpm test -- cash-account.dto.spec.ts --runInBand`
  - PASS: 2 tests passed
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors
- `git add apps/api/src/modules/finance-v2/dto/cash-account.dto.ts apps/api/src/modules/finance-v2/dto/cash-account.dto.spec.ts docs/ops/BUG-20260706-0001_CASH_ACCOUNT_AUTOCODE_BACKEND_REPORT.md`
  - HOLD: failed because Git attempted to create `/Users/mac/phoenix-erp/.git/worktrees/a3-backend-critical-path/index.lock`, which is outside the writable sandbox root.

## Frozen Items Statement

- No migrations created or executed.
- No schema/entity/table/column changes.
- No database reads or writes for validation.
- No production deploy.
- No push.
- No local commit; staging was blocked by filesystem sandbox permissions before any commit could be created.
- No frontend changes.
- No unrelated business module changes.

## Blockers

Backend repair is complete. Local commit is blocked by the current filesystem sandbox because the worktree Git index lock lives outside `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`.

## Next Review Request

Request A2/A4/A1 review the backend DTO repair in normal sequence:

- A2: confirm RBAC/DataScope unchanged.
- A4: smoke the UI create flow with blank account number.
- A1: run broader CI/runtime gate if required.

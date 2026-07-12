# BUGTASK-20260711-0004 A4 Frontend AP Status Report

## Source

- Bug: `BUG-20260711-0004`
- Task: `BUGTASK-20260711-0004`
- Route: `/finance2/ap`
- Issue: 应付账款未付发票状态显示为“未收款”，应显示“未付款”。

## Dry-Run Diagnosis

- The AP page used the shared `StatusBadge` directly for invoice `status`.
- Shared design tokens map `OPEN` to “未收款”, which is correct for AR but incorrect for AP.
- This is a frontend display-label issue. No API, schema, entity, migration, database write, RBAC, DataScope, audit, or attachment ACL change is required.

## Frontend Change

- Added AP-specific status label helper:
  - `apps/web/src/lib/finance-ap-status.ts`
- Added focused regression coverage:
  - `apps/web/src/__tests__/finance-ap-status.test.ts`
- Updated AP invoice table and detail drawer to render `OPEN` as “未付款” while keeping shared `StatusBadge` color/shape:
  - `apps/web/src/app/(admin)/finance2/ap/page.tsx`

The global shared `OPEN: 未收款` token remains unchanged so `/finance2/ar` keeps AR semantics.

## State / Permission Preservation

- RBAC visibility is unchanged. Existing `usePermission('MENU_FIN2_AP')` create-gate remains untouched.
- DataScope is unchanged. Existing API calls and query parameters remain untouched.
- Loading, empty, and error states are unchanged.
- Attachment ACL is not involved in this UI-only status-label change.

## Validation

- Focused regression test:
  - `cd apps/web && ./node_modules/.bin/vitest run src/__tests__/finance-ap-status.test.ts`
  - Result: PASS, 4 tests passed.
- Web typecheck:
  - `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - Result: PASS, 0 errors.
- Source verification:
  - `rg -n "未收款|<StatusBadge status=\\{(detail|r)\\.status\\}" apps/web/src/app/(admin)/finance2/ap/page.tsx`
  - Result: PASS, no matches.
- Diff whitespace:
  - `git diff --check -- apps/web/src/app/'(admin)'/finance2/ap/page.tsx apps/web/src/lib/finance-ap-status.ts apps/web/src/__tests__/finance-ap-status.test.ts`
  - Result: PASS.

## Desktop / Mobile Check

- Attempted to start local Web route for browser viewport checks:
  - `cd apps/web && ./node_modules/.bin/next dev -p 3000`
  - `cd apps/web && ./node_modules/.bin/next dev -H 127.0.0.1 -p 3000`
- Both attempts failed before serving the app with sandbox `listen EPERM`.
- Because the fix only changes badge text from three Chinese characters to three Chinese characters and preserves the existing `StatusBadge` component, table scroll wrapper, drawer layout, and `whitespace-nowrap` badge styling, no responsive layout code path was changed.
- Real desktop/mobile route smoke remains required in CI/staging or another environment that allows local port binding.

## Result

`PASS WITH CONDITIONS`

Conditions:
- Do not claim production resolution until CI/CD, production or staging smoke, and business acceptance confirm `/finance2/ap`.
- Real desktop/mobile browser smoke was blocked by local sandbox port-listen `EPERM` and must be completed outside this restricted runtime.

No deploy, push, migration, database write, or task-board mutation was performed.

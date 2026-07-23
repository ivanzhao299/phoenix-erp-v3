# BUGTASK-20260723-0006 A4 Frontend UAT Report

## Canonical conclusion

**PASS WITH CONDITIONS**

This is a local frontend repair result only. It does not claim production
resolution. CI/CD, runner browser smoke against the deployed API, and business
acceptance are still mandatory.

## Source bug

- Bug: `BUG-20260723-0006`
- Task: `BUGTASK-20260723-0006`
- Title: 采购管理-收货管理，创建收货单不展示数据
- Reported route: `/workflow/todos`
- Affected route confirmed from the attachment:
  `/procurement2/receipts` (采购管理 → 收货管理)
- Reproduction identity shown in the attachment: shadow user 钱涛（采购专员）

## Diagnosis and root cause

The create request succeeded and displayed “收货单创建成功”, but the list
remained at zero rows for the scoped procurement user.

The receipt list is filtered by company/project/warehouse DataScope. The
frontend already loads the selected purchase order detail, including its
company and project ownership, but previously discarded that ownership and
submitted only the PO identifiers, warehouse, receiver, date, and item rows.
The newly created receipt therefore did not inherit the PO company/project
scope and was not returned to the non-global user's scoped list.

No frontend RBAC bypass or broadening was added. The API remains authoritative
for `MENU_PRC2_RECEIPT` action permissions, writable ownership, and warehouse
scope checks.

## Changed files

- `apps/web/src/app/(admin)/procurement2/receipts/page.tsx`
  - retain company/project ownership from the loaded PO;
  - submit that ownership with the receipt;
  - clear stale ownership when the PO ID changes;
  - synchronize the displayed PO number from the loaded PO;
  - remove two unused icon imports and make initial loading satisfy the React
    effect lint rule without changing loading/error/empty behavior.
- `apps/web/src/lib/procurement-receipt-submit.ts`
  - focused scope-inheritance helper.
- `apps/web/src/__tests__/procurement-receipt-submit.test.ts`
  - regression coverage for company + project scope and company-only scope.

## State and permission preservation

- Loading state remains “加载中...”.
- Empty state remains “暂无数据”.
- Non-2xx list/create responses still surface through the existing error toast.
- Create, view, confirm, and cancel UI behavior is unchanged.
- Authorization headers are unchanged.
- API RBAC, DataScope, audit behavior, and attachment ACL are not altered.
- No API, migration, schema, entity, table, column, database, deploy, or push
  operation was performed.

## Desktop and mobile checks

- Desktop: the existing `RightDrawer` keeps the requested 880 px width and the
  receipt table remains inside the shared horizontal-scroll container.
- Mobile (≤768 px): the shared drawer CSS forces `100vw × 100dvh`; the receipt
  item table retains its own horizontal scrolling and the page list retains
  shared horizontal scrolling.
- The repair adds no layout markup or styles, so responsive behavior is
  unchanged.
- Live browser rendering could not run because the managed sandbox rejected
  the local Next.js listener with `listen EPERM: operation not permitted
  0.0.0.0:3000`. Per the task contract, this is recorded as a condition because
  typecheck, focused lint, and focused regression tests pass.

## Verification

From `apps/web`:

```text
./node_modules/.bin/vitest run src/__tests__/procurement-receipt-submit.test.ts
PASS: 1 file, 3 tests

./node_modules/.bin/tsc --noEmit
PASS: 0 errors

./node_modules/.bin/eslint \
  'src/app/(admin)/procurement2/receipts/page.tsx' \
  src/lib/procurement-receipt-submit.ts \
  src/__tests__/procurement-receipt-submit.test.ts
PASS: 0 errors, 0 warnings

git diff --check
PASS

./node_modules/.bin/next dev -p 3000
CONDITION: listen EPERM from the managed sandbox
```

## Remaining mandatory gates

1. CI must repeat Web typecheck, lint, and the focused test.
2. Runner browser smoke must create a receipt as a non-global procurement user
   and verify that the new receipt appears immediately in the unfiltered list.
3. Smoke must also verify a scoped warehouse, company-only PO, and
   company-plus-project PO.
4. Production smoke and procurement business acceptance must pass before the
   source bug is marked resolved.

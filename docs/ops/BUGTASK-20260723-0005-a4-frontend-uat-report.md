# BUGTASK-20260723-0005 A4 Frontend UI/UX UAT Report

## Canonical conclusion

**PASS WITH CONDITIONS**

This is a local frontend repair/verification conclusion only. It does not claim
that BUG-20260723-0005 is resolved in production. CI/CD, production semantic
smoke, and business acceptance remain mandatory.

## Source bug

- Bug: `BUG-20260723-0005`
- Task: `BUGTASK-20260723-0005`
- Route: `/packaging`
- Symptom: both “进入作业台” entries were reported to navigate incorrectly.
- Expected target: `/terminal/packaging/dashboard`

## Diagnosis and root cause

The checked-out baseline already contains the correct target for both
frontend-owned entry points:

1. `/packaging` page-header action;
2. the “生产管理” sidebar “进入包装作业台” action.

Both resolve to the existing terminal dashboard route
`/terminal/packaging/dashboard`. The reported production behavior therefore
does not reproduce from the current frontend source baseline and may reflect a
previous deployed bundle or an environment/runtime gate.

The page-header link opened a new tab without `rel="noopener noreferrer"`.
That omission was not the navigation root cause, but it was repaired as part of
the owned link contract.

## Changed files

- `apps/web/src/app/(admin)/packaging/page.tsx`
  - preserves `/terminal/packaging/dashboard`;
  - adds `rel="noopener noreferrer"` to the new-tab action.
- `apps/web/src/__tests__/bug-20260723-0005-packaging-workbench-navigation.test.ts`
  - locks both entry points to the same dashboard route;
  - verifies the target page exists;
  - verifies `MENU_PKG_OP` and `MENU_PKG_MGR` visibility gates remain present.
- `docs/ops/BUGTASK-20260723-0005-a4-frontend-uat-report.md`
  - records diagnosis, evidence, and release conditions.

## State and permission preservation

- RBAC visibility is unchanged: the sidebar workbench entry remains visible to
  `MENU_PKG_OP`, with `MENU_PKG_MGR` as the alternate permission.
- DataScope, audit behavior, attachment ACL, API calls, loading, empty, and
  error states are unchanged.
- The target terminal layout continues to redirect unauthenticated users to
  `/login?return=<terminal route>`.

## Desktop and mobile checks

- Static desktop check: the `/packaging` page-header action points directly to
  the terminal dashboard in a new tab.
- Static responsive/mobile check: the destination is encoded directly in the
  anchor and has no viewport-dependent branch; the sidebar action uses the same
  route. No responsive CSS or layout behavior was changed.
- Interactive browser verification could not run because the Codex sandbox
  rejected the local Next.js listener with
  `listen EPERM: operation not permitted 0.0.0.0:3000`.

## Verification

Passed:

```text
cd apps/web && ./node_modules/.bin/tsc --noEmit
# exit 0

cd apps/web && ./node_modules/.bin/vitest run \
  src/__tests__/bug-20260723-0005-packaging-workbench-navigation.test.ts
# 1 file passed; 3 tests passed
```

Focused ESLint was also run against the two route/navigation sources and the
new test. It found two pre-existing `react-hooks/set-state-in-effect` errors:

- `src/app/(admin)/packaging/page.tsx:74`
- `src/components/layout/Sidebar.tsx:36`

The new regression test has no reported lint finding. The existing findings are
outside this link-target repair and were not suppressed or expanded into an
unrelated refactor.

## Conditions

1. CI must pass for the resulting branch.
2. A runner with permission to bind a local port must perform desktop and
   mobile semantic click smoke for both entry points.
3. Production smoke must confirm both links arrive at
   `/terminal/packaging/dashboard` under `MENU_PKG_OP` and `MENU_PKG_MGR`
   users, without an unexpected 403 or redirect.
4. Business acceptance is required before closing the source bug.
5. Existing focused ESLint findings must be dispositioned by the owning lint
   cleanup task or confirmed as accepted baseline.

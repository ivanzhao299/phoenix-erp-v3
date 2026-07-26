# BUGTASK-20260726-0002 A4 Frontend UAT Smoke

## Conclusion

**PASS WITH CONDITIONS**

This is a local frontend repair conclusion only. CI/CD, runner production
semantic smoke, and business acceptance remain mandatory; this report does not
claim that BUG-20260726-0002 is resolved in production.

## Source

- Bug: `BUG-20260726-0002`
- Repair task: `BUGTASK-20260726-0002`
- Route: `/sales2/delivery`
- Acceptance criterion: after a successful operation, the status and available
  action buttons refresh without a manual page reload.

## Diagnosis and root cause

The delivery action handlers waited for subsequent detail, list, and statistics
GET requests before changing any rendered state. A delayed, cached, or failed
follow-up request therefore left `selected.status` and the matching action button
visibly stale even though the POST action had succeeded.

The failed POST requests supplied with the bug remain error cases and are not
treated as successful transitions. Their current inline error behavior is
preserved.

## Repair

After a successful action POST, the page now:

1. prefers the status returned by the mutation response;
2. otherwise resolves the documented next status from the successful endpoint;
3. updates the selected detail and its list row together, immediately replacing
   the status badge and action buttons;
4. retains the existing detail/list/statistics refetch as server reconciliation.

No optimistic change occurs before success, so a rejected operation preserves
the prior status and displays the API error.

## Changed files

- `apps/web/src/app/(admin)/sales2/delivery/page.tsx`
- `apps/web/src/lib/delivery-status-transition.ts`
- `apps/web/src/lib/delivery-status-transition.test.ts`
- `docs/ops/BUGTASK-20260726-0002-a4-frontend-uat-smoke.md`

## Verification

- `./node_modules/.bin/vitest run src/lib/delivery-status-transition.test.ts`
  — PASS, 8/8 tests.
- `./node_modules/.bin/tsc --noEmit`
  — PASS, zero TypeScript errors.
- `./node_modules/.bin/eslint src/lib/delivery-status-transition.ts src/lib/delivery-status-transition.test.ts`
  — PASS.
- Focused route lint was executed. It reports 13 errors and 5 warnings already
  present in the legacy route (primarily `no-explicit-any` and effect rules);
  none are in the added helper or regression test.
- Local Next startup:
  `./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3000`
  — environment condition: `listen EPERM`, so interactive Playwright rendering
  could not run in this sandbox.
- Desktop and mobile source-path review — PASS WITH CONDITIONS. Both viewports
  use the same delivery component and the repaired action handler. The change is
  data-only and does not alter existing layout or responsive CSS. Status,
  action, loading, empty, and inline error render branches remain present.
- Permission visibility — preserved. The repair adds no controls and changes no
  RBAC/DataScope logic, request credentials, audit behavior, or attachment ACL.

## Remaining conditions

- CI must rerun Web typecheck and focused regression tests.
- A runner with a permitted local listener must exercise the route at desktop
  and mobile widths against controlled successful and rejected action responses.
- Production smoke must confirm that each successful delivery transition changes
  the badge and next action immediately.
- Business acceptance is required before the source bug can be closed.

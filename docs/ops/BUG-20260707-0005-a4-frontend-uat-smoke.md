# BUG-20260707-0005 A4 Frontend UAT Smoke

## Result

- Repair status: PASS WITH CONDITIONS
- Release gate: HOLD until web dependency links are restored and `tsc --noEmit` / browser smoke can run.
- Bug: 日生产日报不选择鸡舍也能提交成功
- Route: `/breeding/daily`
- Task: BUGTASK-20260707-0005

## Changed Files

- `apps/web/src/app/(admin)/breeding/daily/page.tsx`
- `docs/ops/BUG-20260707-0005-a4-frontend-uat-smoke.md`

## Page / Component List

- Page: `/breeding/daily`
- Component usage: `HouseSelector`
- Submit handler: `handleSubmit`

## UI / UX Adjustment Summary

- Added a submit-time guard before any other validation or network request.
- When `selectedHouse` is empty, the page shows: `请先选择鸡舍后再提交`.
- Marked the chicken house field as required with a red `*`.
- Kept the submit button clickable so users receive the required prompt instead of a silent disabled state.
- Kept existing RBAC-controlled visibility for submit/export/device actions unchanged.

## Permission Visibility Notes

- No permission logic changed.
- Existing `usePermission('MENU_FARM_DAILY')` gates remain unchanged.
- No RBAC bypass, DataScope bypass, attachment ACL change, or hidden shortcut was added.

## Responsive Behavior Notes

- The required marker is inline with the existing label and does not alter the flex layout.
- The `HouseSelector` width and wrapping behavior remain unchanged.
- No mobile-specific layout files were changed.

## UAT Smoke Result

- Static route diagnosis: PASS
  - Confirmed `/breeding/daily` implementation is `apps/web/src/app/(admin)/breeding/daily/page.tsx`.
  - Confirmed global users may initialize `selectedHouse` as `''`.
  - Confirmed new guard returns before `fetch('/api/v3/farm/daily-logs')`.
- UI/browser smoke: HOLD
  - Not executed because this worktree has incomplete frontend dependency links.
- Web typecheck: HOLD
  - `cd apps/web && ./node_modules/.bin/tsc --noEmit` failed: `no such file or directory`.
  - `pnpm exec tsc --noEmit` failed: `packages field missing or empty`.
  - `pnpm install --offline` failed because the local store is missing required tarballs.
- Forbidden scope check: PASS
  - No `apps/api/**`, migration, schema, entity, table, column, deployment, or database files changed.

## Validation Commands

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
cd apps/web && ./node_modules/.bin/tsc --noEmit
pnpm exec tsc --noEmit
pnpm install --offline
pnpm install --offline --filter web
git diff --name-only
```

## A2 / A1 Notes

- A2 security review required: Yes, if release policy requires authoritative server-side rejection of empty `house_code`. A4 added only the frontend guard and did not change backend validation.
- A1 validation required: Yes. Web typecheck and browser smoke are still blocked by local dependency state.

## Blockers And Next Recommendation

- Blocker: frontend dependencies are not fully linked in this worktree; `tsc` and app runtime are unavailable.
- Recommendation: restore/install web dependencies, then run web typecheck and browser smoke on `/breeding/daily?action=create&date=today`.
- Expected UAT check after dependencies are restored: leave chicken house as `请选择鸡舍` / `加载中…`, enter any daily data, click `提交日报`, confirm toast `请先选择鸡舍后再提交`, and confirm no POST to `/api/v3/farm/daily-logs` is sent.

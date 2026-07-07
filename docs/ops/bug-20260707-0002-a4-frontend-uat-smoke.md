# BUG-20260707-0002 A4 Frontend UAT Smoke Report

## Result

HOLD

Reason: frontend repair is implemented and static guard validation passed, but this worktree has no `node_modules`, so Web typecheck and browser UAT smoke could not be completed locally.

## Changed Files

- `apps/web/src/app/(admin)/warehouse/page.tsx`
- `docs/ops/bug-20260707-0002-a4-frontend-uat-smoke.md`

## Page / Component List

- Route: `/warehouse`
- Page: `WarehouseDashboard`
- Components involved: `PageHeader`, `NavCard`, `ZoneCard`

## UI/UX Adjustment Summary

- Kept `/warehouse` available for users with `MENU_WMS_VIEW:V`.
- Stopped the page from requesting `wms_zones`, `wms_inbound`, and `wms_outbound` unless the user also has `MENU_WMS_INOUT:V`.
- Preserved read-only inventory overview by loading `inv_batches` for stock and expiry KPIs.
- Added a permission-aware info message when out/inbound operational data is hidden.
- Replaced restricted in/outbound KPI and monthly summary values with `— / 受限` instead of showing misleading zeroes.

## Permission Visibility Notes

- Sidebar visibility remains unchanged and continues to use `MENU_WMS_VIEW` for `库存总览`.
- Quick entry cards remain filtered by each card permission through `hasPermission(q.perm, "V")`.
- This change does not bypass RBAC. It narrows frontend API calls to avoid requesting endpoints the current role is not allowed to read.
- No DataScope behavior was changed.
- No attachment ACL behavior was changed.

## Responsive Behavior Notes

- No layout breakpoints or grid sizing were changed.
- Existing responsive grids remain:
  - KPI cards: `repeat(auto-fit,minmax(200px,1fr))`
  - content area: `minmax(0,2fr) minmax(320px,1fr)`
  - quick entries: `repeat(auto-fit,minmax(240px,1fr))`

## UAT Smoke Result

- Static API-call guard check: PASS
  - `wms_zones`: guarded by `canViewInout`
  - `wms_inbound`: guarded by `canViewInout`
  - `wms_outbound`: guarded by `canViewInout`
- Browser UAT smoke: NOT RUN
  - Blocker: local dependency tree is absent, so the web dev server/typecheck toolchain cannot start in this worktree.
- Production URL was not opened or modified.
- No deployment was executed.
- No database write was executed.
- No migration was executed.
- Local commit: NOT CREATED
  - Blocker: sandbox denied writing git worktree metadata at `/Users/mac/phoenix-erp/.git/worktrees/a4-frontend-uat-smoke/index.lock`.

## Validation Commands

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
git diff --check
node - <<'NODE'
const fs = require('fs');
const src = fs.readFileSync('apps/web/src/app/(admin)/warehouse/page.tsx','utf8');
const lines = src.split(/\n/);
let ok = true;
for (const target of ['wms_zones','wms_inbound','wms_outbound']) {
  const matches = [];
  lines.forEach((line, i) => {
    if (line.includes(`"${target}"`)) matches.push(i + 1);
  });
  for (const lineNo of matches) {
    const context = lines.slice(Math.max(0, lineNo - 4), lineNo).join('\n');
    const guarded = context.includes('canViewInout');
    console.log(`${target}: line ${lineNo}, guarded=${guarded}`);
    ok &&= guarded;
  }
}
process.exit(ok ? 0 : 1);
NODE
cd apps/web && ./node_modules/.bin/tsc --noEmit
pnpm --filter web typecheck
git add 'apps/web/src/app/(admin)/warehouse/page.tsx' docs/ops/bug-20260707-0002-a4-frontend-uat-smoke.md
git commit -m "fix: guard warehouse dashboard inout requests" -m "Co-Authored-By: Codex Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Validation Output Summary

- Directory: `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`
- Branch: `w5-a4-frontend-uat-smoke`
- Initial worktree: clean
- `git diff --check`: PASS
- Static guard check: PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: FAIL, `./node_modules/.bin/tsc` not found
- `pnpm --filter web typecheck`: FAIL, `tsc: command not found`; pnpm reported local `node_modules` missing
- `git add ... && git commit ...`: FAIL, sandbox could not create git `index.lock` outside writable root

## A2 Security Review Required

Yes. The source plan flagged RBAC/DataScope risk, and this repair changes permission-aware frontend data loading. Review should confirm that `MENU_WMS_VIEW` users may view `/warehouse` while `MENU_WMS_INOUT` data remains hidden.

## A1 Validation Required

Yes. A1 should run Web typecheck and browser UAT smoke in an environment with dependencies installed.

## Blockers And Next Recommendation

- Blocker: missing frontend dependencies in this worktree prevented Web typecheck and browser smoke.
- Blocker: local commit could not be created because git metadata is outside the writable sandbox.
- Recommendation: run `pnpm install --frozen-lockfile` in an approved environment, then run `pnpm --filter web typecheck` and smoke `/warehouse` with a user that has `MENU_WMS_VIEW` but not `MENU_WMS_INOUT`.

# RBAC Frontend Menu Gate Remediation - 2026-06-26

## Goal

Close the gap where a user could see a parent center, dashboard card, or shortcut but land on a child page that the role cannot actually use.

## Findings

1. Sidebar leaf items were already filtered by menu permission, but the logic was private to `Sidebar.tsx`.
2. Home page CTA and business-center cards kept separate route logic.
3. A user with a broad procurement permission could see "采购中心" and be sent to `/procurement2/dashboard`, even when the actual first permitted procurement leaf was a different page.
4. Known menu URLs could still be manually visited and then render page-level "no permission" states.

## Remediation

Updated frontend menu authorization to use one shared resolver:

- `getVisibleMenu`
- `getFirstAccessiblePath`
- `findMenuItemByPath`
- `canAccessPath`

Updated `AdminLayout`:

- If the current URL matches a registered menu leaf and the user lacks permission, the layout redirects to the first permitted path.
- Profile pages remain login-only and are exempt.
- Unknown utility routes remain untouched.

Updated the operations workbench:

- Role CTA uses `getFirstAccessiblePath`.
- Procurement, finance, sales, inventory, and approval shortcut cards now resolve to the first visible leaf in their own group.
- The approval shortcut no longer points to `/workflow` root.

Added CI gate:

- `scripts/ci/check-frontend-menu-gates.mjs`
- W5 closeout now includes frontend menu gate alignment.
- W5 closeout also includes the sensitive menu guard gate.

## User Impact

- No-permission submenus should no longer be shown.
- Parent/group cards route to usable child pages instead of default pages the user may not have.
- Users with narrow procurement permissions can still enter the correct procurement subpage.
- Manual URL access to a registered but unauthorized menu route is redirected instead of exposing confusing no-permission UI.

## Validation

- API typecheck: PASS
- Web typecheck: PASS
- Frontend menu gate: PASS
- W5 closeout with current remediation authorization: PASS

## Boundaries

- Business code changed: yes, frontend permission routing only.
- Backend API changed: no.
- Migration added: no.
- DB write executed: no.
- Deploy required: yes, after push via CI/CD.

## Residual Risk

Some pages still contain local page-level permission warnings. Those remain useful as defense-in-depth, but the main navigation and known-menu route entry now prevent normal users from seeing unauthorized menu surfaces.

## Next Recommended Batch

1. Inventory / WMS write DataScope hardening.
2. Approval action flow consistency on PC and mobile.
3. Protected attachment convergence for remaining upload/download surfaces.

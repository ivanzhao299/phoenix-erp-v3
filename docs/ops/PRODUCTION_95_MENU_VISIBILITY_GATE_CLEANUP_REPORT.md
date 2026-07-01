# Production 95 Menu Visibility Gate Cleanup Report

## Scope

This cleanup targets the recurring issue where users can see parent menus, child menus, home shortcuts, or center cards even when they do not have view permission for the destination page.

## Root Cause

Some frontend navigation checks treated any permission bit on a menu code as enough to show an entry. For example, a user with a non-view action bit could see a menu/card, then hit a route/API-level permission denial after opening it.

This produced the business symptom reported by users:

- no-permission submenus were visible;
- center cards were visible for roles that could not actually enter the page;
- the visible navigation tree did not fully match the role permission matrix.

## Changes

Changed files:

- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/web/src/app/(admin)/home/page.tsx`

Behavior changes:

- Sidebar and route navigation now require `V` by default for visibility.
- Menu entries with explicit `requiredPerm` continue to require that action bit.
- Home page CTA, business overview cards, shortcut cards, and farm KPI widgets now use explicit `V` checks.
- Alternate compatibility menu codes also require `V` for navigation visibility.

## Security Impact

This is a frontend gate hardening change. It does not replace backend authorization. Backend `MenuGuard` / `RequireMenu` remains the source of enforcement for data and actions.

Expected result:

- users should not see menus/cards they cannot view;
- authorized role entries remain visible when the role has the corresponding `MENU_*:V`;
- action-only pages remain controlled by explicit `requiredPerm`.

## Non-Changes

- No database write.
- No migration.
- No seed.
- No deployment logic change.
- No API business logic change.

## Validation Plan

- API typecheck.
- Web typecheck.
- i18n key check.
- W5 closeout gate with allowed security/freeze touch flags.
- Runtime smoke after push/deploy.

## Conclusion

GO WITH CONDITIONS.

This closes the current frontend menu/card visibility leakage class. Remaining role-matrix debt should be handled by auditing actual role grants and ensuring every role has `V` wherever a user is expected to see an entry.

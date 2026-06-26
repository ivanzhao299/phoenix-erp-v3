# Frontend Menu Tree Permission Gate Remediation

Date: 2026-06-26

## Objective

Tighten the frontend navigation gate so users do not see unauthorized parent menus, unauthorized child menus, or dashboard shortcut entries that lead to no-permission pages.

## Problem

Some users saw left-menu or dashboard entries that were not usable for their actual permission set. The visible entry then led to a no-permission page, an old workflow path, or a 404-like navigation result.

Known examples:

- Procurement shortcut could point to `/procurement2/dashboard` even when the user only had a procurement child permission.
- Some center dashboard cards were rendered without checking the same menu code used by the sidebar.
- Legacy workflow links still pointed to `/workflow/tasks/todo`, while the registered menu entry is `/workflow/todos`.
- Profile avatar click pointed to `/profile`, while the registered profile route is `/settings/profile`.

## Root Cause

The sidebar already had partial leaf-level filtering, but several non-sidebar entry points used static paths:

- dashboard quick links
- center page module cards
- daily work shortcuts
- old workflow links
- top-right avatar route

Those entry points could bypass the visible menu tree and expose routes that should not be shown to the current user.

## Changes

### Sidebar and Layout

- Added path aliases for legacy workflow routes:
  - `/workflow/tasks/todo` -> `MENU_WORKFLOW_TODO`
  - `/workflow/tasks/done` -> `MENU_WORKFLOW_HISTORY`
- `findMenuItemByPath()` now considers aliases.
- `pathTitle()` now considers aliases.
- Profile avatar route now goes to `/settings/profile`.

### Dashboard and Workbench Entrances

- Dashboard quick links now use `getFirstAccessiblePath()` for grouped business centers.
- Procurement center shortcut no longer hard-codes `/procurement2/dashboard` when the user lacks that child permission.
- Daily work "我的待办" now uses `/workflow/todos`.
- Home todo detail link now uses `/workflow/todos`.

### Center Page Module Cards

Cards now hide when the current user lacks the corresponding menu permission:

- Finance center cards
- Sales center cards
- Warehouse center cards

This aligns visible frontend entries with the same menu-code granularity used by the sidebar.

## Permission Gate Policy

- Parent group is visible only when at least one child is visible.
- Child menu is visible only when its own menu permission matches.
- Dashboard cards and shortcuts must resolve to an accessible child path.
- No-permission entries should not be exposed as clickable frontend navigation.
- Backend RBAC remains the source of truth; frontend gate is a user-experience and least-privilege visibility layer.

## Validation

Planned validation:

- API typecheck
- Web typecheck
- `git diff --check`
- W5 closeout gate

## Safety

- Business code changed: frontend navigation only.
- DB write: no.
- Migration: no.
- Deploy: via normal CI/CD after commit and push.


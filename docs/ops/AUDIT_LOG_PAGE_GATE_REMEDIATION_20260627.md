# Audit Log Page Gate Remediation - 2026-06-27

## Scope

Tightened the audit log page so direct page access is gated by the audit-log atomic menu permission before any audit CRUD request is sent.

## Problem

The sidebar and backend were already aligned to `MENU_SETTINGS_AUDIT`, but the page component could still render and call `/api/crud/sys_approval_log` directly. Users without audit permission would then see API-level denial or empty/error states instead of the page being hidden cleanly.

## Changes

- `apps/web/src/app/(admin)/settings/audit-log/page.tsx`
  - Added `usePermission("MENU_SETTINGS_AUDIT")`.
  - Added an early `PermissionDeniedState` when `MENU_SETTINGS_AUDIT:V` is missing.
  - Prevented audit CRUD requests from firing when the user lacks audit-log view permission.
- `scripts/ci/check-menu-permission-atomicity.mjs`
  - Added a regression guard requiring audit-log page rendering and data loading to be gated by `MENU_SETTINGS_AUDIT`.
  - Added a guard preventing `MENU_SYS_MONITOR` fallback in the audit-log page.

## Validation Plan

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- W5 closeout gate with existing security/freeze allow flags.

## Production Risk

Low. This is a frontend page-level permission guard plus CI rule only. It does not change database schema, migrations, deployment scripts, or business write logic.


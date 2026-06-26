# Data Quality Atomic Permission Remediation - 2026-06-27

## Scope

This batch tightens data-quality cockpit visibility and API access so users do not see a governance entry that the backend will later reject.

## Problem

- The frontend still referenced `MENU_DATA_QUALITY`, which is not registered in the backend menu registry.
- The data-quality API also allowed `MENU_SYS_MONITOR` as an alternate menu, which made system-operations visibility broader than the data-governance role matrix.
- `/data-quality` loaded data immediately without its own frontend permission gate.

## Changes

- `apps/api/src/modules/data-quality/data-quality.controller.ts`
  - Data-quality APIs now require `MENU_MD_QUALITY:V`, with only `MENU_MASTER_DATA` as the master-data super fallback.
  - Removed `MENU_SYS_MONITOR` fallback.

- `apps/web/src/app/(admin)/home/page.tsx`
  - Data-quality shortcut and cockpit visibility now use `MENU_MD_QUALITY`, with `MENU_MASTER_DATA` as super fallback.
  - Removed unregistered `MENU_DATA_QUALITY`.

- `apps/web/src/app/(admin)/master-data/page.tsx`
  - Data-quality tile visibility now uses `MENU_MD_QUALITY` or `MENU_MASTER_DATA`.

- `apps/web/src/app/(admin)/data-quality/page.tsx`
  - Added frontend gate before loading `/data-quality/*` APIs.

- `scripts/ci/check-menu-permission-atomicity.mjs`
  - Added guards against restoring `MENU_DATA_QUALITY` or `MENU_SYS_MONITOR` access to data-quality surfaces.

## Result

- Data-governance users keep access through `MENU_MD_QUALITY`.
- Master-data super users keep access through `MENU_MASTER_DATA`.
- System-monitor users no longer receive data-quality access implicitly.
- Users without the proper menu no longer trigger noisy forbidden API requests from the data-quality page.

## Risk

Medium-low. This is a permission tightening. Roles that previously relied only on `MENU_SYS_MONITOR` or the unregistered frontend code must be granted `MENU_MD_QUALITY` if they legitimately own data-governance work.

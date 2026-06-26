# Master Data Hub Atomic Visibility Remediation - 2026-06-27

## Scope

This batch closes a remaining frontend RBAC leak in the master-data hub page. The page previously rendered child action tiles for operations, governance, pending approvals, and data quality as fixed links. Users who could reach a narrow master-data child area could still see links to gated child pages and then hit a 403/no-permission page.

## Changes

- `apps/web/src/app/(admin)/master-data/page.tsx`
  - Added atomic visibility checks for:
    - `MENU_MD_CENTER` / `MENU_MASTER_DATA` for operations center and global search.
    - `MENU_MD_QUALITY` / `MENU_MASTER_DATA` for governance cockpit.
    - per-type master-data leaf permissions for pending approvals.
    - `MENU_MD_QUALITY` / `MENU_DATA_QUALITY` / `MENU_MASTER_DATA` for data quality center.
  - Hidden global master-data search unless the user can call `/master-data/operations/search`.
  - Filtered center member links by the matching `MENU_MD_*` permission, with `MENU_MASTER_DATA` retained only as super permission.

- `scripts/ci/check-menu-permission-atomicity.mjs`
  - Added checks to prevent fixed gated links from returning to the master-data hub.
  - Added checks that the hub keeps explicit center/governance/pending/data-quality visibility gates.

## Result

- Users no longer see master-data child entries they cannot access.
- Per-type master-data users still see the child entries they are entitled to use.
- `MENU_MASTER_DATA` remains a true super permission for master-data administrators.

## Risk

Low. This is a frontend visibility tightening plus CI guard. Backend API permissions are not weakened.

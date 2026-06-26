# Master Data Hub Atomic Permission Remediation - 2026-06-27

## Scope

This batch tightens the master-data hub frontend visibility so child entries are not exposed through the coarse parent `MENU_MASTER_DATA` permission.

## Problem

The master-data hub still allowed several page sections to render when a user only had the legacy parent permission:

- operations center tile
- governance tile
- data quality tile
- pending approval tile
- center member links

That could show child routes or module hints to users who did not hold the corresponding atomic `MENU_MD_*` or `MENU_SETTINGS_DATA` permission.

## Changes

- `apps/web/src/app/(admin)/master-data/page.tsx`
  - `MENU_MD_CENTER` now controls the operations center and global search.
  - `MENU_MD_QUALITY` now controls governance and data-quality entries.
  - master-data pending entry now requires at least one relevant atomic master-data menu.
  - center member links now require each member's exact atomic menu.
  - removed `MENU_MASTER_DATA` fallback from hub visibility checks.

- `scripts/ci/check-menu-permission-atomicity.mjs`
  - added a regression guard preventing the master-data hub from using `MENU_MASTER_DATA` to reveal child tiles or member links.

## Boundary

- Business code touched: frontend permission visibility only.
- API behavior changed: no.
- Database migration: no.
- DB write: no.
- Deployment: via normal CI/CD after commit.

## Validation Plan

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- migration gates
- W5 closeout gate
- production smoke after deployment


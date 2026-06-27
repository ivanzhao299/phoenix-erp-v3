# Finance Cash Atomic Permission Remediation - 2026-06-27

## Scope

This batch removes the legacy `MENU_FIN2_CASH` frontend fallback from high-frequency finance cash entry points.

## Problem

Several frontend entries still treated `MENU_FIN2_CASH` as a broad fallback for cash-account and fund-transfer visibility:

- finance center module cards
- finance sidebar child entries
- home finance shortcut
- home business overview cash card
- dashboard finance shortcut

That could expose child finance entries to a role that did not hold the corresponding atomic menu permission.

## Atomic Permission Mapping

- Cash account list and center visibility: `MENU_FIN2_CASH_VIEW`
- Cash transfer visibility: `MENU_FIN2_CASH_TRANSFER`
- Cash receipt/payment create actions: `MENU_FIN2_CASH_TXN:C`

## Changes

- `apps/web/src/app/(admin)/finance2/page.tsx`
  - removed `MENU_FIN2_CASH` alt fallback from cash module cards
  - filtered module cards by exact `perm`

- `apps/web/src/components/layout/Sidebar.tsx`
  - removed `MENU_FIN2_CASH` alt fallback from cash account and fund transfer menu children

- `apps/web/src/app/(admin)/home/page.tsx`
  - removed `MENU_FIN2_CASH` from finance shortcut alternatives
  - removed `MENU_FIN2_CASH` from cash CTA and business overview cash card

- `apps/web/src/app/(admin)/dashboard/page.tsx`
  - removed `MENU_FIN2_CASH` from finance shortcut alternatives

- `scripts/ci/check-menu-permission-atomicity.mjs`
  - added regression guards for finance cash frontend fallbacks.

## Boundary

- API behavior changed: no.
- Database migration: no.
- DB write: no.
- Deployment: normal CI/CD after commit.

## Validation Plan

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- migration gates
- W5 closeout gate
- production smoke after deployment


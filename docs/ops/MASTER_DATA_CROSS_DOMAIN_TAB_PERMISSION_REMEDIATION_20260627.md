# Master Data Cross-Domain Tab Permission Remediation

Date: 2026-06-27

## Scope

This remediation tightens frontend visibility for cross-domain tabs on master-data detail pages.

## Issue

Customer and supplier detail pages are primarily master-data pages, but they also show related downstream business tabs:

- Customer detail: sales orders and accounts receivable.
- Supplier detail: purchase orders and accounts payable.

Backend APIs already enforce their own menu permissions. The frontend, however, still rendered the tabs and attempted requests even when the user only had the master-data permission. This created noisy "empty" or unauthorized user experiences and made roles appear broader than intended.

## Change

Customer detail page:

- Sales order tab now requires `MENU_SALES2_ORDER:V`.
- AR tab now requires `MENU_FIN2_AR:V`.
- Without those permissions, the tabs are hidden and their API requests are not sent.

Supplier detail page:

- Purchase order tab now requires `MENU_PRC2_ORDER:V`.
- AP tab now requires `MENU_FIN2_AP:V`.
- Without those permissions, the tabs are hidden and their API requests are not sent.

## Permission Principle

Master-data visibility does not imply downstream transaction visibility. Cross-domain read panels must follow their own module-level atomic permissions.

## Risk

Risk level: LOW.

The backend security boundary is unchanged. This remediation only aligns frontend visibility and request behavior with existing backend guards.

## Validation

Required validation:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`

## Production Boundary

- Business code changed: yes, frontend permission visibility only.
- Database schema changed: no.
- Migration added or executed: no.
- DB write performed: no.
- Deployment required after merge: yes, web-only deployment is expected.


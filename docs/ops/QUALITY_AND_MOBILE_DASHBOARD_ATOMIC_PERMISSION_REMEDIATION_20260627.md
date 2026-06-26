# Quality and Mobile Dashboard Atomic Permission Remediation - 2026-06-27

## Scope

This batch removes remaining legacy quality and logistics permission fallbacks from the mobile dashboard and quality API controller.

## Changes

- `apps/api/src/modules/quality/quality.controller.ts`
  - Trace forward/backward now require `MENU_QA_MGR:V`.
  - Inspection list/detail now require `MENU_QA_OP:V`.
  - Inspection create now requires `MENU_QA_OP:C`.
  - Non-conformance list/create now require `MENU_QA_MGR:V/C`.
  - Quality standards now require `MENU_QA_MASTER:V`.
- `apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`
  - Quality cards no longer use legacy `MENU_QA`.
  - Delivery cards no longer use legacy `MENU_LOGISTICS`.
  - Mobile visibility now follows atomic `MENU_QA_*`, `MENU_MD_QUALITY`, `MENU_MOBILE_DELIVERY`, and `MENU_SALES2_DELIVERY`.
- `scripts/ci/check-menu-permission-atomicity.mjs`
  - Added regression checks to block legacy `MENU_QA` and `MENU_LOGISTICS` in the mobile dashboard.
  - Added regression check to block direct `MENU_QA` guards on quality APIs.

## Production Risk

- No database migration.
- No DB write.
- No deployment script change.
- No schema/entity/table/column change.
- API access is intentionally tightened from legacy broad quality access to atomic quality operation/manager/master codes.

## Verification Plan

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`


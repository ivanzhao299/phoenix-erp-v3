# Production 95 Cleanup Batch - UAT Checklist And Readiness Repair

Date: 2026-07-01
Owner: Codex-Orchestrator
Scope: UAT checklist update API and UAT readiness/checklist frontend display

## Objective

Fix the production-facing UAT issues reported from screenshots:

1. `PATCH /api/uat/checklists/:id` returned HTTP 500 with PostgreSQL error `inconsistent types deduced for parameter $2`.
2. The `/uat` go-live readiness/checklist page could appear empty or broken because checklist API data used snake_case while the frontend rendered camelCase fields.
3. Readiness dimensions with no checklist rows showed confusing `0 / 0` rather than a clear operational state.

## Root Cause

1. `UatChecklistService.update()` used a `WITH payload` query and reused the status parameter across multiple expressions. PostgreSQL could infer inconsistent parameter types in runtime execution paths.
2. `listGrouped()` returned database column names such as `item_name`, `item_description`, `tested_at`, while the frontend expected `itemName`, `itemDescription`, `testedAt`.
3. The readiness UI treated dimensions with no checklist rows as ordinary scores, making the page look like missing content instead of an unconfigured checklist dimension.

## Changes

### Backend

File: `apps/api/src/modules/uat/services/uat-checklist.service.ts`

- Added safe checklist ID validation.
- Added safe tester ID parsing so string usernames cannot be written to a bigint column.
- Replaced the payload CTE update with explicit typed parameters:
  - `$1::bigint`
  - `$2::varchar`
  - `$3::bigint`
  - `$4::varchar`
  - `$5::text`
- Used a typed `ANY (ARRAY[...]::varchar[])` status transition expression to avoid PostgreSQL parameter inference ambiguity.

### Frontend

File: `apps/web/src/app/(admin)/uat/page.tsx`

- Added `normalizeChecklistItem()` and `normalizeChecklistGroups()`.
- Checklist rendering now accepts both snake_case and camelCase payloads.
- Checklist rows now show item description when item code is not present.
- Readiness dimensions with no checklist rows now display `未配置清单`; stability displays `运行指标`.

## Validation

| Command | Result |
|---|---|
| Local rollback SQL smoke for checklist update | PASS |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |
| `ALLOW_SECURITY_TOUCH=true ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS |

## Production Safety

| Item | Result |
|---|---|
| DB migration executed | No |
| Production DB write executed by this batch | No |
| Local DB validation write | Transaction rollback only |
| Business data changed | No |
| Deploy required | Yes, code path changes require normal CI/CD deploy |
| Push required | Yes, after local verification |

## Conclusion

GO WITH CONDITIONS.

The UAT checklist update 500 and readiness/checklist display mismatch have been fixed locally and are ready for push/deploy. After deployment, run production runtime smoke and verify `/uat` loads plus unauthenticated API endpoints remain protected.

## Next Cleanup Candidate

Continue production debt cleanup with the next P0/P1 item after this deploy:

1. UAT readiness content strategy: seed/maintain meaningful checklist dimensions so production readiness score reflects actual operational gates.
2. Alert center productization: make the empty state explain what should create alerts and link to system monitor delivery health.
3. Continue RBAC/DataScope atomicity hardening for remaining high-risk center pages.

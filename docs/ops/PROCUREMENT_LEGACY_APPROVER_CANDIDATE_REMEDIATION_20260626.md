# Procurement Legacy Approver Candidate Remediation

Date: 2026-06-26

## Scope

This batch fixes the legacy procurement approver candidate endpoint without changing procurement business flow, schema, migration, or frontend behavior.

## Problem

`GET /api/procurement/approvers` previously returned approvers by hard-coded roles:

- `ROLE_ADMIN`
- `ROLE_REGION_MGR`
- `ROLE_CEO`
- `ROLE_FIN_CFO`

That made the approver list role-name driven instead of permission driven. It could show users who should not be selectable for the current procurement approval context and could hide valid business approvers if their role code was not in the static list.

## Changes

Modified files:

- `apps/api/src/modules/procurement/procurement.controller.ts`
- `apps/api/src/modules/procurement/procurement.service.ts`

## Backend Gate Alignment

The legacy approver endpoint now has method-level menu protection:

- Caller must hold `MENU_PRC2_ORDER:E`.

The approver candidate query now requires candidates to be:

- active users,
- not the current requester,
- holders of approval permission `A` on one of:
  - `MENU_PRC2_ORDER`
  - `MENU_WORKFLOW_TODO`
  - `MENU_WORKFLOW`
- within the requester store scope for legacy store-based procurement pages, unless the requester is global.

## Risk Reduction

Removed hard-coded business role list from candidate selection.

Admin, CEO, CFO, or regional users are no longer selected only because of the role code. They must have the relevant menu approval permission in `sys_role_menu_permission`.

## Not Changed

- No schema change.
- No migration.
- No DB write.
- No frontend change.
- No deployment script change.
- No production data change.

## Validation

Required validation for this batch:

- API typecheck.
- Web typecheck.
- W5 closeout gate.
- CI/CD after push.
- Production API health smoke after deployment.

## Result

Conclusion: GO WITH CONDITIONS.

Condition: legacy procurement remains a compatibility path. New procurement approval flows should continue to prefer the procurement-v2 and approval-engine candidate APIs, which already perform permission and DataScope filtering.

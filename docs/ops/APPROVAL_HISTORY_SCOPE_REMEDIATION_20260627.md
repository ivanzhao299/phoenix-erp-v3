# Approval History Scope Remediation - 2026-06-27

## Objective

Prevent the approval center from exposing completed approval records beyond the current user's role, participation, and DataScope boundaries.

## Problem

`GET /api/approval/history` previously returned all completed approval instances to any user with `MENU_WORKFLOW_HISTORY:V`. This made the approval center look over-permissive and could expose cross-role or cross-company completed approvals.

`GET /api/approval/by-biz/:bizType/:bizId` also returned approval details without reusing the same instance readability check.

## Changes

- `ApprovalEngineService.getHistory()` now filters completed approvals by:
  - current user as starter,
  - current user as actor,
  - current user as assigned approver,
  - current user's roles as assigned approver role,
  - company DataScope for non-global users.
- `ROLE_ADMIN` remains the explicit global review path.
- `ApprovalEngineService.getInstanceByBiz()` now calls `assertInstanceReadable()` before returning details.
- `scripts/ci/check-menu-permission-atomicity.mjs` now guards this behavior.

## Expected Result

- A user with only approval history permission no longer sees global completed approvals.
- Approval history and by-business lookup are aligned with user participation and company scope.
- The approval center should stop showing records that later fail with confusing authorization behavior.

## Validation

The remediation batch is validated by:

- API typecheck
- Web typecheck
- menu permission atomicity gate
- W5 closeout static gate
- production smoke after deploy

## Risk

Risk level: Medium.

Some users may see fewer historical approval records. That is intentional. If a role needs broader review capability, grant the proper role/approval scope explicitly instead of relying on global leakage.


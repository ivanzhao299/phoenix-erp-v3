# BUG-20260724-0001 Workflow Approval Permission Fix

## Issue

In shadow mode, `Bouavanh` could see an assigned `PRICE_BOOK_APPROVAL` task but
submitting approval returned `MENU_PERMISSION_DENIED`.

## Root Cause

The approval candidate was selected from the business permission and DataScope
intersection for `MENU_SALES2_PRICE`. The generic approval endpoint then imposed
a second, unrelated `MENU_WORKFLOW_TODO:A` requirement.

This produced an inconsistent contract: a user could be selected and assigned as
the exact approver, see the task with `MENU_WORKFLOW_TODO:V`, and still be blocked
before the approval service could validate the assignment.

The reporter metadata showed the administrator because the report was submitted
after leaving the shadow session context. The screenshot is the authoritative
runtime evidence and shows the action executing as `Bouavanh`.

## Fix

- Generic approval action endpoints require `MENU_WORKFLOW_TODO:V`, matching the
  visible task entry.
- Approval authority remains fail-closed in the service:
  - exact `approver_user_id` must match; or
  - the assigned approval role must match;
  - an unassigned user still receives `APPROVER_USER_MISMATCH` or
    `APPROVER_ROLE_MISMATCH`.
- The same rule is applied to both approval engines so the duplicate permission
  conflict cannot recur on the legacy workflow task route.

## Changed Files

- `apps/api/src/modules/approval-engine/approval-engine.controller.ts`
- `apps/api/src/modules/workflow/workflow-task.controller.ts`
- `apps/api/src/modules/approval-engine/approval-action-menu-gate.spec.ts`

## Verification

- Approval action gate regression: PASS
- Exact assignee accepted: PASS
- Different user rejected: PASS
- Existing workflow service regression: PASS
- API TypeScript check: PASS

## Safety

- No migration.
- No database write.
- No DataScope bypass.
- No administrator override added.
- No frontend change.

## Conclusion

`PASS WITH CONDITIONS`: source-level and automated regression evidence pass.
The report may move to UAT only after CI/CD succeeds and the deployed production
route is rechecked.

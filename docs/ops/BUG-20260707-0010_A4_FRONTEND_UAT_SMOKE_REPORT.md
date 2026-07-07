# BUG-20260707-0010 A4 Frontend UAT Smoke Report

## Result

GO WITH CONDITIONS

The `/workflow/todos` page now uses the visible returned item count as a defensive fallback when the backend `total` is stale or narrower than the rendered task set.

## Changed Files

- `apps/web/src/app/(admin)/workflow/todos/page.tsx`

## UI Fix

- Page header count now uses `max(api total, visible items length)`.
- Pagination uses the same effective visible total.
- This prevents the reported state where a visible approval task exists but the top counter still shows `0`.

## UAT Scope

- Page: `/workflow/todos`
- Scenario: user has at least one visible ApprovalEngine pending step.
- Expected: top counter is not lower than visible task rows.

## Safety

- No backend write path changed.
- No migration executed.
- No database write executed.
- No deployment was executed by A4.

## Conditions

- Production runtime verification should be performed after CI/CD deploy with a user who has a real ApprovalEngine pending task.


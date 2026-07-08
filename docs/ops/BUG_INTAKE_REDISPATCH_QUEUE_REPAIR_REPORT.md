# Bug Intake Redispatch Queue Repair Report

## Objective

Complete the missing redispatch capability for Bug Intake so an administrator can re-send a previously unsuccessful repair task from the original queue without creating a duplicate bug report.

## Completed Changes

- Added `POST /api/bug-intake/reports/:bugNo/redispatch`.
- Added redispatch history, redispatch count, audit log, and `BUG_INTAKE_REDISPATCH` alert generation.
- Re-dispatch keeps the original `bug_no` and `repair_task_no`.
- Re-dispatch sets the task back to `AGENT_APPROVED` with explicit agent execution approval so the local inbox sync can pick it up again.
- Added optional re-plan mode before re-dispatch.
- Fixed local queue handoff so existing task IDs are reset to `pending` instead of being skipped.
- Tightened queue handoff so existing tasks are reset only when a newer explicit redispatch approval is present; normal approved reports no longer reset an already-running task on every sync cycle.
- Added admin UI buttons in the queue ledger and detail drawer.

## Safety Boundaries

- Business code modified: No.
- Database migration executed: No.
- Database write executed by this change: No.
- Deploy executed by this change: No.
- Push requires normal release flow.
- Closed or resolved bug reports cannot be directly redispatched; they must be reopened first.

## Validation

- API typecheck: PASS.
- Web typecheck: PASS.
- Queue script syntax check: PASS.
- i18n key check: PASS.
- `git diff --check`: PASS.
- Redispatch fixture queue dry-run: PASS, generated A3/A1 task plan from an approved redispatch payload.
- Redispatch apply behavior: PASS in a temporary queue. Existing running task remains running without redispatch; redispatch count increase resets it to pending.
- W5 closeout gate: PASS with code/security/freeze allow flags for this approved feature change.

## Current Conclusion

GO WITH CONDITIONS. The redispatch path is now wired end to end. Production verification should confirm that a failed/HOLD bug report can be redispatched from the admin panel and then picked up by the long-running local runner.

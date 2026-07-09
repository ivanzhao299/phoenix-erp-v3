# Bug Intake Business Verification and Queue Archive Report

## Goal

Fix the false-positive closure path where a local Agent result was written back as complete and the bug report was marked `RESOLVED` before administrator or business verification. Also archive June 2026 legacy natural-language orchestration tasks that were still shown as `pending` in the shared agent queue.

## Root Cause

`BugIntakeService.recordAgentResult()` treated a completed Agent plan as both:

- `repair_task_status = AGENT_COMPLETED`
- `status = RESOLVED`

That collapsed two different meanings:

1. Agent execution finished and wrote back a result.
2. The original business issue was verified as fixed.

The first one can happen while the administrator still reports that the problem is not truly fixed. Therefore `RESOLVED` was too strong and could hide unresolved business issues.

## Fix

1. Agent completion now keeps the report in `IN_PROGRESS` with `repair_task_status = AGENT_COMPLETED`.
2. The resolution note now explicitly says the issue is waiting for administrator or business verification.
3. Redispatch no longer blocks `RESOLVED` reports. It only blocks `CLOSED` and `REJECTED`, so an incorrectly closed or still-problematic item can be re-queued by an administrator.
4. The bug report UI now labels `AGENT_COMPLETED` as `待业务验收` and displays a warning that Agent completion does not mean the problem is truly solved.
5. The UI keeps the re-dispatch actions available for Agent-completed reports.

## June Legacy Queue Cleanup

The agent queue contained 55 stale June 2026 `REQ-NL-202606*` tasks in `pending` state. These were old natural-language orchestration tasks, not current bug-intake repair tasks.

Cleanup action:

- changed status from `pending` to `archived`
- preserved task payloads and contract references
- added `archived_at`
- added `archive_reason`
- added `previous_status_before_archive = pending`

Post-cleanup queue check:

- Total tasks: 180
- June pending tasks: 0
- June archived tasks: 55

## Operational Meaning

From this fix onward:

- `AGENT_COMPLETED` means local automation finished.
- `IN_PROGRESS + AGENT_COMPLETED` means waiting for administrator or business verification.
- `RESOLVED` should be used only after verification passes.
- `CLOSED` remains the final closed state.
- If an administrator says the issue still exists, the same report can be re-dispatched instead of creating a duplicate report.

## Production Historical Status Correction

After the local code fix, production bug reports were checked through the existing bug-intake runner service account. The token was not printed or stored in this report.

Production correction result:

- Resolved reports scanned: 24
- Reports matching `status = RESOLVED` and `repair_task_status = AGENT_COMPLETED`: 24
- Reports changed back to `status = IN_PROGRESS`: 24
- `repair_task_status` preserved as `AGENT_COMPLETED`
- Updated meaning: Agent finished, waiting for administrator/business verification.
- This correction updated bug-intake workflow status only. It did not modify business data.

Affected reports:

- `BUG-20260709-0004`
- `BUG-20260709-0003`
- `BUG-20260709-0002`
- `BUG-20260709-0001`
- `BUG-20260708-0007`
- `BUG-20260708-0006`
- `BUG-20260708-0005`
- `BUG-20260708-0004`
- `BUG-20260708-0003`
- `BUG-20260708-0002`
- `BUG-20260708-0001`
- `BUG-20260707-0010`
- `BUG-20260707-0009`
- `BUG-20260707-0008`
- `BUG-20260707-0007`
- `BUG-20260707-0006`
- `BUG-20260707-0005`
- `BUG-20260707-0004`
- `BUG-20260707-0003`
- `BUG-20260707-0002`
- `BUG-20260707-0001`
- `BUG-20260706-0002`
- `BUG-20260705-0003`
- `BUG-20260705-0001`

## Verification

Executed validation commands:

- `node --check scripts/ops/bug-intake-local-runner.mjs`: PASS
- `cd apps/api && ./node_modules/.bin/tsc --noEmit --pretty false`: PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit --pretty false`: PASS
- queue audit confirming June pending count is 0: PASS

## Risk

- Business code touched: Yes, bug-intake backend and admin UI only.
- DB schema changed: No.
- Migration executed: No.
- Production bug-intake status correction executed: Yes, 24 reports changed from false `RESOLVED` to `IN_PROGRESS`.
- Push executed in this task: Yes, pushed to `origin/main` to deliver the prevention fix.
- Production deploy status: CI/CD queued after push at the time of report update.

## Conclusion

GO WITH CONDITIONS. The workflow now separates Agent completion from business verification, and stale June queue items no longer block or pollute the active queue.

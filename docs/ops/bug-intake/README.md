# ERP Bug Intake & AI Repair Pipeline

## Scope

Phase 1 collects bug reports and runtime context.

Phase 2 adds triage, assignment, repair-task handoff, Agent split planning, and an explicit Agent queue approval gate.

Phase 3 closes the local factory loop: approved reports are pulled into the local repository, screenshots are downloaded into the local inbox, Agent tasks are generated, local workers execute, results are written back to ERP, and successful runs can push `main` to trigger CI/CD when the runner is started with the release flags.

## User Flow

1. The tester clicks the top-right "反馈问题" button from any ERP page.
2. The frontend collects:
   - current route and full URL
   - current user, roles, company and project context when available
   - recent `console.error`, `window.error`, and `unhandledrejection`
   - recent failed API requests with method, URL, status, requestId when present, and a short response excerpt
   - a lightweight page snapshot with visible text and interactive controls
   - manually uploaded screenshots or PDFs
3. The backend creates a `BUG-YYYYMMDD-0001` style bug number.
4. Screenshots are stored under `storage/bug-reports/YYYY/MM/DD/<bug_no>/`.
5. Administrators can review reports at `/bug-reports`.
6. Administrators triage the report with priority, module, assignee, and a handling note.
7. Administrators can generate a guarded repair task package for a later human or AI repair worker.
8. Administrators generate an Agent repair plan and explicitly approve the queue handoff.
9. The local Agent Factory script refuses `--apply` unless the repair task payload contains that approval record.
10. The local runner downloads guarded screenshot attachments into `docs/ops/runs/bug-intake-inbox/<batch>/<bug_no>/attachments/` and injects those paths into the Agent contract.
11. Worker and runner lifecycle results are written back to `repair_task_payload.agentResults`.

## Closed Loop

The expected workflow is:

1. `OPEN`: user submits the issue.
2. `TRIAGED`: administrator confirms the module, priority, and assignee.
3. `IN_PROGRESS`: a repair owner starts reproducing and fixing the issue.
4. `RESOLVED`: repair is complete and verification evidence is attached in the note or downstream report.
5. `CLOSED`: business owner or administrator accepts the fix.
6. `REJECTED`: report is invalid, duplicate, or outside the system scope.

The handoff payload is stored on the same report:

- `priority`
- `module_code`
- `assignee_username`
- `assignee_name`
- `repair_task_no`
- `repair_task_status`
- `repair_task_payload`
- `closed_at`

This keeps the first closed loop inside the ERP database. The agent queue can consume `repair_task_payload` only after the explicit `agentExecutionApproval` gate is recorded.

## Backend API

- `POST /api/bug-intake/reports`
  - Any logged-in user can submit a report.
  - Multipart field `payload` contains the JSON context.
  - Multipart field `screenshots` accepts up to five PNG/JPG/WebP/PDF files.

- `GET /api/bug-intake/reports`
  - Requires `MENU_BUG_REPORT:V`.
  - Supports `page`, `limit`, `status`, and `keyword`.

- `GET /api/bug-intake/reports/:bugNo`
  - Requires `MENU_BUG_REPORT:V`.

- `PATCH /api/bug-intake/reports/:bugNo/status`
  - Requires `MENU_BUG_REPORT:E`.

- `PATCH /api/bug-intake/reports/:bugNo/triage`
  - Requires `MENU_BUG_REPORT:E`.
  - Updates status, priority, module, assignee, and handling note.

- `POST /api/bug-intake/reports/:bugNo/repair-task`
  - Requires `MENU_BUG_REPORT:E`.
  - Generates a `BUGTASK-YYYYMMDD-0001` style repair task package.
  - This does not run AI, does not modify code, and does not deploy.

- `POST /api/bug-intake/reports/:bugNo/agent-plan`
  - Requires `MENU_BUG_REPORT:E`.
  - Splits the repair task into recommended A1-A7 agent responsibilities.
  - Writes the plan into `repair_task_payload.agentPlan`.
  - This still does not execute Codex CLI, does not modify code, and does not deploy.

- `POST /api/bug-intake/reports/:bugNo/agent-approval`
  - Requires `MENU_BUG_REPORT:E`.
  - Requires an existing repair task and Agent plan.
  - Writes `repair_task_payload.agentExecutionApproval`.
  - Sets `repair_task_status = AGENT_APPROVED`.
  - This still does not execute Codex CLI, does not modify code, and does not deploy.

- `POST /api/bug-intake/reports/:bugNo/agent-result`
  - Requires `MENU_BUG_REPORT:E`.
  - Records one Agent subtask result back into `repair_task_payload.agentResults`.
  - Updates `repair_task_status` to `AGENT_RUNNING`, `AGENT_COMPLETED`, or `HOLD`.
  - When every selected Agent has a GO/PASS style result, the report moves to `RESOLVED`.
  - HOLD/FAIL keeps the report in progress and preserves the blocking result.

- `GET /api/bug-intake/reports/:bugNo/attachments/:fileName`
  - Requires `MENU_BUG_REPORT:V`.
  - Serves stored screenshots through a guarded endpoint, not a raw filesystem path.

## Database

The table is `bug_reports`.

Important columns:

- `bug_no`
- `title`
- `description`
- `severity`
- `status`
- `priority`
- `module_code`
- `assignee_username`
- `assignee_name`
- `repair_task_no`
- `repair_task_status`
- `repair_task_payload`
- `route`
- `url`
- `reporter_*`
- `roles`
- `company_code`
- `project_code`
- `console_errors`
- `failed_requests`
- `attachments`
- `client_context`
- `resolution_note`
- `closed_at`

## RBAC

Menu code:

- `MENU_BUG_REPORT`

Submission requires login only. Management list/detail/status update requires `MENU_BUG_REPORT`.

## Audit

Create and status update operations write to `sys_audit_log` with `entity_type = BUG_REPORT`.

## AI Worker Contract

An AI repair worker can read approved repair task packages by:

1. Querying `bug_reports WHERE repair_task_status IN ('READY','ROUTED')`.
2. Reading `repair_task_payload`, `repair_task_payload.agentPlan`, `route`, `console_errors`, `failed_requests`, and guarded attachments.
3. Running the local queue handoff:

   ```bash
   node scripts/ops/bug-task-to-agent-queue.mjs \
     --repair-task-json docs/ops/runs/<bugtask-export>.json \
     --dry-run
   ```

4. Reviewing the generated contracts under `docs/ops/runs/`.
5. Applying the queue handoff only after approval:

   ```bash
   node scripts/ops/bug-task-to-agent-queue.mjs \
     --repair-task-json docs/ops/runs/<bugtask-export>.json \
     --apply
   ```

   The script will HOLD if `repair_task_payload.agentExecutionApproval.approved` is not true.

6. Worker agents claim their own subtasks from `docs/ops/agent-queue/tasks.json`.
7. Worker results are written back to the bug report:

   ```bash
   node scripts/ops/bug-agent-result-to-report.mjs \
     --bug-no BUG-YYYYMMDD-0001 \
     --task-id BUGTASK-YYYYMMDD-0001-01-A4 \
     --agent A4-Frontend-UAT-Smoke \
     --result-file docs/ops/runs/<agent-result>.md \
     --api-base http://localhost:3100 \
     --token <jwt> \
     --dry-run
   ```

   Use `--apply` only when the target API and token are correct.

8. A1/A2 gates verify fixes before merge/deploy.

## Evidence Contract

Every approved Agent task should include:

- original report title, route, URL, reporter and roles
- console errors and unhandled promise rejections
- failed API requests with requestId and response excerpt
- page snapshot: visible labels, controls, scroll position and viewport
- guarded screenshot/PDF metadata from production
- local attachment paths downloaded by `bug-intake-sync-from-api.mjs`

If a visual/UI issue has no usable screenshot or page snapshot, the Agent must HOLD with a clear evidence request instead of guessing.

The worker must not directly mutate business code or deploy without an explicit human approval gate.

## Local Inbox Sync

Production bug reports do not automatically appear in a developer worktree unless the local inbox sync is run.

Use:

- `scripts/ops/bug-intake-sync-from-api.mjs` to pull approved production reports into `docs/ops/runs/bug-intake-inbox/`.
- `scripts/ops/bug-task-to-agent-queue.mjs` to convert approved repair payloads into local Agent queue tasks.
- `scripts/ops/bug-agent-result-to-report.mjs` to write local Agent results back to ERP.

Detailed SOP: `docs/ops/bug-intake/LOCAL_AGENT_INBOX_SYNC.md`.

## Always-on Local Runner

The production-grade handoff is:

- `scripts/ops/bug-intake-local-runner.mjs`
- SOP: `docs/ops/bug-intake/LOCAL_AGENT_RUNNER_SERVICE.md`

It can run locally as a supervised long-running process. It polls ERP for administrator-approved bug reports, applies only approved tasks into the local Agent queue, starts local Agent workers, writes results back to ERP, and can push `main` after successful gates when explicitly started with `--push-after-success`.

When started with `--wait-ci-after-push`, it also attempts to observe GitHub Actions through `gh run list` and writes the CI wait result back to the bug report. If `gh` is unavailable, the runner records that CI observation was skipped instead of pretending it passed.

For always-on mode, install the macOS LaunchAgent with:

- `scripts/ops/install-bug-intake-local-runner-launchagent.mjs`

Default mode is still dry-run. Real execution requires:

- `--execute-approved`
- `--approval-token APPROVE_AGENT_EXECUTION`
- `--apply-queue`

Optional production loop flag:

- `--wait-ci-after-push`

This means the administrator can approve from the ERP page, while the local factory does the repository work without another manual terminal session.

## Split Repair Policy

- Frontend/UI/page issues route to `A4-Frontend-UAT-Smoke` plus `A1`.
- API/500/SQL/backend issues route to `A3-Backend-Critical-Path` plus `A1`.
- RBAC/DataScope/Auth/ACL issues route to `A2-Security-Regression-Gate`.
- Master data/readiness/mapping issues route to `A5-Data-Readiness`.
- Deployment or release issues route to `A6` and `A7`.
- Mixed issues split into multiple subtasks; each task carries its own allowed and forbidden paths from `AGENT_DISPATCH_MAP.json`.

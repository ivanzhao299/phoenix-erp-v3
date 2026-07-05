# ERP Bug Intake & AI Repair Pipeline

## Scope

Phase 1 collects bug reports and runtime context.

Phase 2 adds triage, assignment, and repair-task handoff. It still does not run AI repair, does not auto-modify code, and does not deploy.

## User Flow

1. The tester clicks the top-right "反馈问题" button from any ERP page.
2. The frontend collects:
   - current route and full URL
   - current user, roles, company and project context when available
   - recent `console.error`, `window.error`, and `unhandledrejection`
   - recent failed API requests with method, URL, status, requestId when present, and a short response excerpt
   - manually uploaded screenshots or PDFs
3. The backend creates a `BUG-YYYYMMDD-0001` style bug number.
4. Screenshots are stored under `storage/bug-reports/YYYY/MM/DD/<bug_no>/`.
5. Administrators can review reports at `/bug-reports`.
6. Administrators triage the report with priority, module, assignee, and a handling note.
7. Administrators can generate a guarded repair task package for a later human or AI repair worker.

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

This keeps the first closed loop inside the ERP database. A future agent queue can consume `repair_task_payload` after an explicit approval gate.

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

6. Worker agents claim their own subtasks from `docs/ops/agent-queue/tasks.json`.
7. A1/A2 gates verify fixes before merge/deploy.

The worker must not directly mutate business code or deploy without an explicit human approval gate.

## Split Repair Policy

- Frontend/UI/page issues route to `A4-Frontend-UAT-Smoke` plus `A1`.
- API/500/SQL/backend issues route to `A3-Backend-Critical-Path` plus `A1`.
- RBAC/DataScope/Auth/ACL issues route to `A2-Security-Regression-Gate`.
- Master data/readiness/mapping issues route to `A5-Data-Readiness`.
- Deployment or release issues route to `A6` and `A7`.
- Mixed issues split into multiple subtasks; each task carries its own allowed and forbidden paths from `AGENT_DISPATCH_MAP.json`.

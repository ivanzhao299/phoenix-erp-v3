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

1. Querying `bug_reports WHERE repair_task_status = 'READY'`.
2. Reading `repair_task_payload`, `route`, `console_errors`, `failed_requests`, and guarded attachments.
3. Reproducing the issue locally.
4. Creating a repair plan and implementation branch.
5. Writing progress back to `resolution_note` or a future dedicated AI repair event table.

The worker must not directly mutate business code or deploy without an explicit human approval gate.

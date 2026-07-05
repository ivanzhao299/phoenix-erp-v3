# ERP Bug Intake & AI Repair Pipeline - Phase 1

## Scope

Phase 1 only collects bug reports and runtime context. It does not run AI repair, does not auto-modify code, and does not deploy.

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

## RBAC

Menu code:

- `MENU_BUG_REPORT`

Submission requires login only. Management list/detail/status update requires `MENU_BUG_REPORT`.

## Audit

Create and status update operations write to `sys_audit_log` with `entity_type = BUG_REPORT`.

## Future AI Worker Contract

A future AI repair worker can read open reports by:

1. Querying `bug_reports WHERE status IN ('OPEN','TRIAGED')`.
2. Reading `route`, `console_errors`, `failed_requests`, and `attachments`.
3. Reproducing the issue locally.
4. Creating a repair plan.
5. Writing its proposed plan back to `resolution_note` or a future dedicated AI repair table.

The worker must not directly mutate business code or deploy without an explicit human approval gate.

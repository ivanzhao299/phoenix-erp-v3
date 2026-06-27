# Workflow Approver Default Remediation - 2026-06-26

## Scope

This batch removes unsafe admin/system-role defaults from workflow creation and workflow design paths.

## Fixed Items

### Frontend workflow builder

File: `apps/web/src/app/(admin)/workflow/builder/page.tsx`

- Removed `ROLE_ADMIN` and `ROLE_SYSOPS` from fallback role defaults.
- Normalizes template approval steps so unsafe admin/system defaults become blank.
- Requires every approval step to select an explicit business approver role before generating and publishing.
- Adds a placeholder option: `请选择审批角色`.

### Frontend workflow designer

File: `apps/web/src/app/(admin)/workflow/designer/[id]/page.tsx`

- New approval nodes no longer default to `ROLE_SYSOPS`.
- Route presets use business roles such as finance or manager-style roles instead of system roles.
- Auto-complete only fills a business role when one is available; otherwise it leaves the role blank and publish validation blocks it.
- Publish validation rejects `ROLE_ADMIN` / `ROLE_SYSOPS` as approval assignees.

### Frontend workflow templates and generators

Files:

- `apps/web/src/lib/workflow-templates.ts`
- `apps/web/src/app/(admin)/workflow/definitions/page.tsx`
- `apps/web/src/app/(admin)/workflow/data-sources/page.tsx`

Changes:

- Replaced `ROLE_SYSOPS` template defaults with business-domain roles.
- Auto-generated data-source workflow now uses `ROLE_FIN_CFO` as a safer business fallback instead of `ROLE_ADMIN`.

### Backend workflow generation

File: `apps/api/src/modules/workflow/workflow.service.ts`

- `createDefinitionFromDataSource` now defaults to `ROLE_FIN_CFO`, not `ROLE_ADMIN`.
- Explicit `ROLE_ADMIN` / `ROLE_SYSOPS` approval role input is rejected.
- Built-in industry templates no longer use `ROLE_SYSOPS` as an approval role.

## Safety Boundary

- No DB writes executed.
- No migration added or executed.
- No deployment script changed.
- No production operation during coding.

## Validation

To be executed before commit:

- API typecheck.
- Web typecheck.
- W5 closeout gate.

## Remaining Follow-up

1. Continue review of workflow admin override behavior separately from approver assignment.
2. Continue audit of legacy procurement `getApprovers()` and old workflow APIs.
3. Continue review of shareholder finance DataScope and permission gates.

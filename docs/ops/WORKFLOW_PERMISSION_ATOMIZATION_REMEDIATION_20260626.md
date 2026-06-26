# Workflow Permission Atomization Remediation - 2026-06-26

## Scope

This pass reduces over-visible approval center entries and backend access caused by broad `MENU_WORKFLOW` fallback permissions.

## Changes

- Kept daily approval entries compatible:
  - `MENU_WORKFLOW_TODO`
  - `MENU_WORKFLOW_HISTORY`
  - `MENU_WORKFLOW_NOTIFY`
- Removed parent `MENU_WORKFLOW` fallback from high-risk management entries:
  - `MENU_WORKFLOW_CONFIG`
  - `MENU_WORKFLOW_RULES`
  - `MENU_WORKFLOW_FORM`
  - `MENU_WORKFLOW_METRICS`
- Updated frontend sidebar so ordinary approval users do not see workflow configuration, approval rules, form management, or metrics unless their role has the corresponding atom permission.
- Updated backend controllers so direct API access also requires the corresponding atom permission.

## Risk

Risk level: Medium.

This changes access behavior for workflow administration. It is intentional: users with only daily approval permissions should not see or call administration endpoints.

## Validation

- API typecheck required.
- Web typecheck required.
- W5 closeout gate required.
- CI/CD deploy required.

## Remaining Work

- Continue the same atomization review for settings, monitoring, procurement, inventory, and file/attachment routes.
- Review role assignments for pilot users after this deploy to ensure required business entries remain visible.

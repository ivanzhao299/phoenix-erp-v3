# Agent Inbox Schema

## USER_INTENT.md

Required section:

- `## Current Short Command`

The first non-empty line after that heading is treated as the user intent.

## APPROVALS.md

Approval records use simple `key: value` fields. The runner checks the latest matching active record.

Required fields:

- `approval_id`
- `approved_gate`
- `approved_scope`
- `forbidden_scope`
- `approved_by`
- `approved_at`
- `expires_at`
- `requires_precheck`
- `rollback_required`

## OUTBOX.md

The runner writes:

- current stage;
- inferred Gate;
- expanded request;
- orchestrator mode;
- generated artifacts;
- GO / HOLD / FAIL result;
- whether DB write, migration, deploy, restart, or push occurred;
- next user approval needed.

## Route Plan Fields

The runner emits a JSON run artifact containing:

- `intent`
- `inferred_gate`
- `runtime_stage`
- `hard_constraints`
- `allowed_agents`
- `denied_agents`
- `mode`
- `parallel`
- `orchestrator_command`
- `orchestrator_exit_code`
- `orchestrator_plan_files`
- `result`


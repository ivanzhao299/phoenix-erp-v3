# Agent Inbox Approvals

This file records explicit user approvals. A short command does not become an execution approval unless a matching active approval record exists here.

## Approval Record Template

```yaml
approval_id: NO_ACTIVE_APPROVAL
approved_gate: NONE
approved_scope: NONE
forbidden_scope: DB write, migration, deploy, restart, push, cleanup, reset, production operation
approved_by: user
approved_at: 2026-06-24T00:00:00+08:00
expires_at: 2026-06-24T00:00:00+08:00
requires_precheck: true
rollback_required: true
```

## Active Approvals

No active approval is recorded for the current next Gate.


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

```yaml
approval_id: APPROVE_FULL_PRODUCTION_DEPLOY_20260627
approved_gate: FULL_PRODUCTION_DEPLOY_MAIN
approved_scope: push main + deploy.yml full deploy (build web+api, run TS migrations 1782045-1782052, restart, health/Phase-C verify)
approved_by: user
approved_at: 2026-06-27
executed: true
execution_result: GREEN (run 28277134665, sha 6eba2829)
forbidden_scope_still: 无独立批准不得做的后续——Store Payment 账户激活/QR、historical uploads 写、manual-review 用户纳入 仍各需独立 Gate
note: 用户在多智能体协作下显式授权"通过 A6 自行解决"并完成全量部署。后续部署仍逐次确认。
```

部署后下一步见 `runtime-memory/NEXT_ACTIONS.md` 顶部"2026-06-27 重大状态变更"。


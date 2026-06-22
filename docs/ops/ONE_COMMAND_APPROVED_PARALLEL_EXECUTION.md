# One-Command Approved Parallel Execution

## 1. Phase 6.1 Goal

Phase 6.1 extends `agent-orchestrator.mjs` so `execute-approved` mode can run approved low-risk Agents in parallel.

Allowed real execution is limited to:

1. A1-CI-Runtime-Gate
2. A2-Security-Regression-Gate
3. A5-Data-Readiness

Codex-Orchestrator remains docs/ops planning only. A3, A4, A6, and A7 are not allowed for automatic real execution in this mode.

## 2. execute-approved Mode

`execute-approved` mode requires:

```bash
--approval-token APPROVE_AGENT_EXECUTION
```

Without the correct token, the orchestrator writes a plan and approved-execution result showing that Codex CLI was not executed.

## 3. Why Only A1 / A2 / A5

A1, A2, and A5 are validation or read-only gates. They can produce evidence without implementing product behavior. A3/A4 write product code, A6 touches deployment planning, and A7 produces release decisions, so they remain outside automatic execution.

## 4. Parallel Execution Rule

`--parallel N` limits worker count. It must not create unbounded concurrency.

Parallel execution is allowed only for selected safe Agents. If any selected Agent is outside A1/A2/A5, the plan becomes HOLD.

## 5. Worktree Rebase Rule

In `execute-approved` mode with a correct token, each target worktree may run `git rebase main` if it is behind main. Rebase conflicts stop execution and produce HOLD.

## 6. Rebase Conflict Handling

If rebase fails:

1. Stop all execution.
2. Record the failed Agent and error.
3. Do not continue to later dispatch groups.
4. Do not merge or push.

## 7. Approval Token Rule

The token is checked but never logged. It authorizes only the selected low-risk Agent execution. It does not authorize merge, push, migration, DB write, or deploy.

## 8. Forbidden Actions

The orchestrator still never performs:

1. Merge.
2. Push.
3. Migration execution.
4. Schema/entity/table/column changes.
5. Database writes.
6. Deployment.
7. Production rollback.

## 9. Logs And Results

`execute-approved` mode writes:

1. `<request-id>-approved-execution-result.json`
2. `<request-id>-approved-execution-summary.md`
3. One log file per executed Agent.

## 10. End-to-End Example

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "对 StorePaymentModule AppModule wiring 做安全复核和 CI 验证，只允许 A2 只读审查和 A1 验证，不改业务代码，不执行 migration，不部署" \
  --mode execute-approved \
  --parallel 2 \
  --approval-token APPROVE_AGENT_EXECUTION \
  --output-dir docs/ops/runs
```

This command is not run during Phase 6.1 verification. It requires explicit user approval.

# Bug Intake Local Agent Runner Service

## Purpose

This service closes the operational gap after an administrator approves a bug repair task in ERP.

Target flow:

1. User submits a production bug report.
2. Administrator triages it, generates an Agent plan, and approves Agent execution.
3. A local always-on runner syncs approved reports from ERP.
4. Approved reports enter the local Agent queue.
5. Local Agent workers repair in worktrees, run verification, and baseline merge.
6. Runner writes each Agent result back to the ERP bug report.
7. Runner writes a lifecycle result back to the ERP bug report with local execution, push, and optional CI wait status.
8. If enabled and every local gate succeeds, runner pushes `main` to trigger CI/CD deployment.

The production server does not edit code by itself. Code repair still happens in the controlled local repository and worktrees.

## Runner

Script:

```bash
scripts/ops/bug-intake-local-runner.mjs
```

Default mode is dry-run. Real execution requires both:

- `--execute-approved`
- `--approval-token APPROVE_AGENT_EXECUTION`

Queue writes require `--apply-queue`. Production push requires `--push-after-success`. CI observation after push requires `--wait-ci-after-push` and an authenticated `gh` CLI session.

Low-risk retry requires `--retry-safe-ui-once`. It applies only to bug-intake A4/A1 tasks that do not mention backend, DB, migration, deploy, RBAC, DataScope, Auth, Finance, or Chanjet scope.

## Authentication

The runner supports two safe token modes:

- `PHOENIX_ERP_TOKEN`: use an already issued JWT.
- `PHOENIX_ERP_RUNNER_USER` / `PHOENIX_ERP_RUNNER_PASS`: login at the start of each cycle and refresh the JWT automatically.

The second mode is preferred for long-running operation because JWTs expire.

## Production Operating Command

The intended long-running local command is:

```bash
PHOENIX_ERP_RUNNER_USER=<service-user> \
PHOENIX_ERP_RUNNER_PASS=<service-password> \
node scripts/ops/bug-intake-local-runner.mjs \
  --api-base https://erp.eggslao.com \
  --watch \
  --interval 300 \
  --max-cycles 999999 \
  --max-tasks 3 \
  --apply-queue \
  --execute-approved \
  --approval-token APPROVE_AGENT_EXECUTION \
  --push-after-success \
  --wait-ci-after-push \
  --retry-safe-ui-once
```

For a managed macOS deployment, install it under `launchd`:

```bash
node scripts/ops/install-bug-intake-local-runner-launchagent.mjs --apply
```

This creates:

- `~/Library/LaunchAgents/com.phoenix.erp.bug-intake-runner.plist`
- `~/.phoenix-erp/bug-intake-runner.sh`
- `~/.phoenix-erp/bug-intake-runner.env`
- `~/Library/Logs/phoenix-erp/bug-intake-runner.*.log`

Credentials are intentionally stored outside git in `~/.phoenix-erp/bug-intake-runner.env`.

## Safety Rules

- Only ERP reports with `repairTaskStatus = AGENT_APPROVED` and `agentExecutionApproval.approved = true` can enter the local queue.
- Runner never executes migration directly.
- Runner never writes ERP business data directly.
- Runner never deploys directly.
- Deployment is only triggered indirectly by pushing `main`, and only when `--push-after-success` is enabled.
- CI/CD observation is best-effort. If `gh` is unavailable or unauthenticated, the runner records the skip reason in the bug report.
- Worker execution still requires the fixed approval token.
- Safe retry is limited to one retry and only for low-risk A4/A1 tasks.
- Result writeback uses `--token-env` so the production token does not appear in repo files.

## Outputs

Latest runner summaries:

- `docs/ops/runs/bug-intake-local-runner/latest-summary.json`
- `docs/ops/runs/bug-intake-local-runner/latest-summary.md`

Inbox snapshots:

- `docs/ops/runs/bug-intake-inbox/`

Agent queue:

- `docs/ops/agent-queue/tasks.json`

## Administrator Experience

After this service is running, the administrator does not need to enter the repository manually.

They only need to:

1. Open `/bug-reports`.
2. Review the issue.
3. Generate the repair task and Agent plan.
4. Click the Agent execution approval action.

The local runner picks it up on the next polling cycle.

## Current Boundary

This is still a controlled repair pipeline. High-risk tasks can still HOLD during Agent worktree checks, verification, or baseline autopilot. HOLD is expected behavior when the task needs human review instead of blind automatic deployment.

## What the Administrator Sees

The ERP bug report should show three layers of progress:

- Agent subtask results: A1/A2/A3/A4/A5 worker result reports.
- Local runner lifecycle result: sync, worker, push, and CI observation summary.
- Final report status: `AGENT_RUNNING`, `AGENT_COMPLETED`, or `HOLD`.
- CI/CD result: optional `BugIntakeCICD` result written by `scripts/ops/bug-ci-result-callback.mjs`.
- Route smoke: optional readonly route probe written by `scripts/ops/bug-production-route-smoke.mjs`.

If the report is `HOLD`, the latest Agent result or runner lifecycle result is the source of truth for the reason.

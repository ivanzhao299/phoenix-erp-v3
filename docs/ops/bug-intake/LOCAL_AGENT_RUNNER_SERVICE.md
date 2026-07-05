# Bug Intake Local Agent Runner Service

## Purpose

This service closes the operational gap after an administrator approves a bug repair task in ERP.

Target flow:

1. User submits a production bug report.
2. Administrator triages it, generates an Agent plan, and approves Agent execution.
3. A local always-on runner syncs approved reports from ERP.
4. Approved reports enter the local Agent queue.
5. Local Agent workers repair in worktrees, run verification, and baseline merge.
6. Runner writes the Agent result back to the ERP bug report.
7. If enabled and every local gate succeeds, runner pushes `main` to trigger CI/CD deployment.

The production server does not edit code by itself. Code repair still happens in the controlled local repository and worktrees.

## Runner

Script:

```bash
scripts/ops/bug-intake-local-runner.mjs
```

Default mode is dry-run. Real execution requires both:

- `--execute-approved`
- `--approval-token APPROVE_AGENT_EXECUTION`

Queue writes require `--apply-queue`. Production push requires `--push-after-success`.

## Production Operating Command

The intended long-running local command is:

```bash
PHOENIX_ERP_TOKEN=<jwt> node scripts/ops/bug-intake-local-runner.mjs \
  --api-base https://erp.eggslao.com \
  --token-env PHOENIX_ERP_TOKEN \
  --watch \
  --interval 300 \
  --max-cycles 999999 \
  --max-tasks 3 \
  --apply-queue \
  --execute-approved \
  --approval-token APPROVE_AGENT_EXECUTION \
  --push-after-success
```

For a managed macOS deployment, run it under `launchd` or a supervised process manager. Do not leave an unmanaged interactive terminal as the production runner.

## Safety Rules

- Only ERP reports with `repairTaskStatus = AGENT_APPROVED` and `agentExecutionApproval.approved = true` can enter the local queue.
- Runner never executes migration directly.
- Runner never writes ERP business data directly.
- Runner never deploys directly.
- Deployment is only triggered indirectly by pushing `main`, and only when `--push-after-success` is enabled.
- Worker execution still requires the fixed approval token.
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

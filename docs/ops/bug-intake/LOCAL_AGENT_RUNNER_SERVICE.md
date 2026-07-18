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
7. Runner writes a lifecycle result back to the ERP bug report with local execution and verification status.
8. Backlog consumption and release are separate gates. Push/CI/deploy observation is opt-in and disabled by default for the resident service.

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

Infrastructure failures are classified before retry. Usage capacity and transient network failures may enter `WAITING_CAPACITY`; an incompatible CLI/cache or authentication failure enters `WAITING_RUNNER` and is not retried until the runner is repaired. A task is never retried again in the same cycle.

Runnable work is scheduled fairly: fresh pending tasks precede previously retried work, tasks are FIFO within the same class, and at most one task from the same bug report is attempted in a cycle. `HOLD` tasks are not runnable.

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
  --commit-audit-artifacts \
  --audit-commit-minutes 30
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

The managed service uses the Codex CLI bundled with the desktop app by default. This avoids compatibility failures from stale globally installed CLI builds. Override it only when the replacement has passed a real CLI preflight:

```bash
PHOENIX_ERP_CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex
```

The resident service defaults to `PHOENIX_ERP_RUNNER_AUTO_RELEASE=false`. Set it to `true` only after the branch and release gates are explicitly ready; this adds `--push-after-success`, `--wait-ci-after-push`, and production route smoke. Backlog repair itself does not require release permission.

## Safety Rules

- Only ERP reports with `repairTaskStatus = AGENT_APPROVED` and `agentExecutionApproval.approved = true` can enter the local queue.
- Runner never executes migration directly.
- Runner never writes ERP business data directly.
- Runner never deploys directly.
- Deployment is only triggered indirectly by pushing `main`, and only when `--push-after-success` is enabled.
- CI/CD observation is best-effort. If `gh` is unavailable or unauthenticated, the runner records the skip reason in the bug report.
- Worker execution still requires the fixed approval token.
- `HOLD` and `WAITING_RUNNER` are never consumed as ordinary runnable work.
- Infrastructure failure retries have a bounded budget; exhausting it moves the task to `WAITING_RUNNER` instead of creating an infinite retry loop.
- Audit artifacts are committed at most once per configured time window, with a semantic-content hash preventing duplicate audit-only commits.
- Runtime queue and run artifacts may remain dirty between audit batches; business-code dirtiness still blocks integration.
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

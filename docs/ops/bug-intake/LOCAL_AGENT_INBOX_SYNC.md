# Bug Intake Local Agent Inbox Sync

## Purpose

This closes the missing handoff between production bug reports and the local Agent Factory.

The intended operating model is:

1. A production user submits a bug report from ERP.
2. An administrator reviews it at `/bug-reports`.
3. The administrator creates a repair task, generates an Agent plan, and approves the Agent queue handoff.
4. The local orchestrator syncs approved reports into a local inbox.
5. Approved reports are converted into local Agent queue tasks.
6. Local agents repair in worktrees, run local verification, commit, push, and CI/CD deploys.
7. Agent results are written back to the production bug report.

## Boundary

`bug-intake-sync-from-api.mjs` does not execute Codex CLI, does not modify code, does not deploy, does not write database rows, and does not push.

It only:

- reads production bug reports through the guarded API,
- stores local JSON snapshots under `docs/ops/runs/bug-intake-inbox/`,
- optionally applies approved repair tasks into `docs/ops/agent-queue/tasks.json`.

Only reports with:

- `repairTaskStatus = AGENT_APPROVED`
- `repairTaskPayload.agentExecutionApproval.approved = true`

can be applied to the local queue.

## Commands

Dry-run sync:

```bash
PHOENIX_ERP_TOKEN=<jwt> node scripts/ops/bug-intake-sync-from-api.mjs \
  --api-base https://erp.eggslao.com \
  --token-env PHOENIX_ERP_TOKEN \
  --dry-run
```

Apply approved reports to local Agent queue:

```bash
PHOENIX_ERP_TOKEN=<jwt> node scripts/ops/bug-intake-sync-from-api.mjs \
  --api-base https://erp.eggslao.com \
  --token-env PHOENIX_ERP_TOKEN \
  --apply-queue
```

Write back an Agent result after local repair:

```bash
PHOENIX_ERP_TOKEN=<jwt> node scripts/ops/bug-agent-result-to-report.mjs \
  --bug-no BUG-YYYYMMDD-0001 \
  --task-id BUGTASK-YYYYMMDD-0001-01-A4 \
  --agent A4-Frontend-UAT-Smoke \
  --result-file docs/ops/runs/<agent-result>.md \
  --api-base https://erp.eggslao.com \
  --token-env PHOENIX_ERP_TOKEN \
  --apply
```

## What “Closed Loop” Means

Closed loop means:

- production feedback is visible locally,
- approved repair tasks can enter the local queue,
- local repair results can update the production report,
- CI/CD deploys only after local validation and push.

It does not mean the production server edits code by itself.

## Next Hardening

The next production-grade step is a supervised local daemon or scheduled job:

- runs sync every few minutes,
- applies only `AGENT_APPROVED` tasks,
- starts dry-run workers first,
- requires per-task approval token for real repair,
- writes results back automatically,
- never runs production migration/deploy without an explicit release gate.

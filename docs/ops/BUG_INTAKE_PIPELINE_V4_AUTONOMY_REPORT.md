# Bug Intake Pipeline V4 Autonomy Report

Date: 2026-07-08

## Goal

Upgrade the Bug Intake repair workflow from a manually inspected queue into an operator-visible pipeline with:

1. failure auto-classification;
2. timeout self-recovery;
3. HOLD dispatch recommendation;
4. sys_alerts notification;
5. an admin running panel.

## Changed Files

- `apps/api/src/modules/bug-intake/bug-intake.controller.ts`
- `apps/api/src/modules/bug-intake/bug-intake.service.ts`
- `apps/web/src/app/(admin)/bug-reports/page.tsx`
- `scripts/ops/bug-intake-local-runner.mjs`
- `docs/ops/BUG_INTAKE_PIPELINE_V4_AUTONOMY_REPORT.md`

## Implemented Capabilities

### Failure Auto-classification

`BugIntakeService` now classifies reports into stable operational categories:

- `PG_SQL`
- `API_5XX`
- `RBAC_403`
- `AUTH_401`
- `FRONTEND_RENDER`
- `DATA_READINESS`
- `RUNNER_OR_DEPLOY`
- `UNKNOWN`

The classification writes evidence, confidence, priority, owner recommendation, recommended agents, and suggested fix into `repairTaskPayload.failureClassification`.

### Timeout Self-recovery

Reports stuck in these states are detected:

- `AGENT_RUNNING` older than 45 minutes;
- `AGENT_APPROVED` older than 30 minutes.

The pipeline moves stale items to `HOLD`, records `timeoutRecovery`, and emits a pipeline alert. It does not delete queue state or force execution.

### HOLD Auto-dispatch

When an item is `HOLD`, the system writes a `holdDispatch` candidate with recommended agents and next action. It still requires approval for unsafe categories, DB writes, migration, deploy, or production actions.

### Alert Notification

The pipeline writes append-only `sys_alerts` entries for:

- `BUG_INTAKE_RUNNER_TIMEOUT`
- `BUG_INTAKE_PIPELINE_HOLD`
- `BUG_INTAKE_AUTO_TRIAGE`

Duplicate alerts within 10 minutes are suppressed.

### Running Panel

The admin Bug Intake page now includes an AI repair pipeline panel showing:

- total open items;
- HOLD items;
- stale running items;
- stale approved items;
- pipeline decision;
- active Bug Intake alerts;
- top HOLD dispatch candidates.

The panel can trigger `POST /api/bug-intake/pipeline/auto-triage`.

## Runner Enhancement

`scripts/ops/bug-intake-local-runner.mjs` now adds `failureClassification` to `latest-summary.json/md` for sync, worker, writeback, push, CI, baseline, timeout, and auth failures.

## Boundaries

- No automatic production deploy was added.
- No DB migration was added.
- No schema change was added.
- No force push or destructive cleanup was added.
- Unsafe HOLD items remain gated.

## Validation

- `node --check scripts/ops/bug-intake-local-runner.mjs`: PASS
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`: PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS
- `git diff --check`: PASS
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS
- `node scripts/ops/bug-intake-local-runner.mjs --recover-leases-only --dry-run`: blocked by the active long-running runner lock (`pid 21934`), which is the expected single-runner protection behavior.

## Next Step

Run the production panel endpoint after deployment and verify that admin users can:

1. see zero blocked queue items when the runner is healthy;
2. trigger auto-triage for HOLD items;
3. see generated sys_alerts when a bug repair item times out;
4. use the local runner to pick up approved repair tasks without returning to the shell.

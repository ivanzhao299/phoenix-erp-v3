# Bug Intake AI Repair Pipeline V2 Report

Generated at: 2026-07-05

## Goal

Close the gap between online bug feedback and the local Agent Factory repair loop.

The intended operating model is:

1. User reports a problem in production.
2. Administrator triages and approves Agent execution in ERP.
3. Local always-on runner pulls the approved report.
4. Runner downloads guarded screenshots/PDF evidence into the local inbox.
5. Router generates concrete Agent tasks.
6. Worker Agents repair, validate, and baseline merge locally.
7. Runner writes worker results and lifecycle results back to the ERP bug report.
8. Runner can push `main` after successful gates to trigger CI/CD when explicitly enabled.

## Changed Files

- `apps/web/src/lib/bug-intake-telemetry.ts`
- `apps/web/src/components/bug-intake/BugReportButton.tsx`
- `apps/api/src/modules/bug-intake/bug-intake.service.ts`
- `scripts/ops/bug-intake-sync-from-api.mjs`
- `scripts/ops/bug-task-to-agent-queue.mjs`
- `scripts/ops/bug-intake-local-runner.mjs`
- `docs/ops/bug-intake/README.md`
- `docs/ops/bug-intake/LOCAL_AGENT_RUNNER_SERVICE.md`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`

## V2 Improvements

### Evidence Sync

`bug-intake-sync-from-api.mjs` now downloads guarded bug report attachments into:

`docs/ops/runs/bug-intake-inbox/<batch>/<bug_no>/attachments/`

It injects local attachment paths into the synced report and repair task payload so Agent contracts can reference actual screenshots instead of guessing from text only.

### Page Context

The frontend bug feedback payload now includes a lightweight page snapshot:

- document title
- route
- scroll position
- viewport
- visible text
- interactive controls and disabled states

This gives A4/A3/A2 routing and repair tasks useful context even before opening the screenshot.

### Agent Routing

`bug-task-to-agent-queue.mjs` now applies a bug-intake policy layer after the base router:

- UI/page/card/style/screenshot evidence forces A4 + A1.
- 500/PG/API/backend evidence forces A3 + A1.
- RBAC/DataScope/auth/menu evidence forces A2 + A1.
- data/readiness/mapping/Chanjet evidence forces A5 + A1.
- Low-value Codex-Orchestrator route review is removed when a concrete Agent set is available.

### Result Writeback

`bug-intake-local-runner.mjs` now writes a runner lifecycle result back to ERP after each non-dry-run cycle. The payload includes:

- sync status
- worker result status
- writeback status
- push result
- optional CI observation result
- commit hash
- next action

### CI Observation

The runner supports `--wait-ci-after-push`. When enabled, it polls GitHub Actions through `gh run list` and records PASS/HOLD. If `gh` is unavailable, it records the skip reason rather than reporting a false pass.

## Current Safety Boundary

- Codex CLI is executed only in approved runner mode.
- Queue apply requires ERP-side `agentExecutionApproval.approved = true`.
- Worker execution requires `APPROVE_AGENT_EXECUTION`.
- DB writes and migrations are not performed by the bug runner.
- Production deploy is not run directly by the runner.
- Push is only attempted with `--push-after-success`.
- CI/CD deploy remains the remote pipeline responsibility after push.

## Validation Plan

Required checks:

- `node --check scripts/ops/bug-intake-sync-from-api.mjs`
- `node --check scripts/ops/bug-task-to-agent-queue.mjs`
- `node --check scripts/ops/bug-intake-local-runner.mjs`
- `node --check scripts/ops/bug-agent-result-to-report.mjs`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `node scripts/ci/check-w5-closeout-gate.mjs`

## Remaining Hardening

1. Add an administrator-visible timeline component on `/bug-reports` that separates:
   - user report
   - triage
   - Agent plan
   - local queue
   - worker results
   - runner lifecycle result
   - CI/CD result
2. Add a retry policy for failed but safe A1/A4 UI-only tasks.
3. Add a production deploy callback from CI/CD into bug report results.
4. Add screenshot thumbnail preview in the Agent task contract report.

## Conclusion

Current conclusion: GO WITH CONDITIONS.

The online issue feedback pipeline now has a real local repair bridge. The remaining conditions are primarily presentation and CI/CD callback depth, not the core handoff.

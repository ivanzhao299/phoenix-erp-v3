# Bug Intake Automated Workflow Drain Fix Report

Generated at: 2026-07-07

## Result

GO WITH CONDITIONS

The bug-intake local runner has been hardened so approved production bug reports no longer stall behind a dirty or stale Agent worktree. The queue can now keep draining by auto-attempting baseline cleanup, recording blocked tasks, and continuing with later runnable tasks.

## Problems Found

1. The long-running local runner repeatedly selected the same first three bug tasks.
2. A3 and A4 worktrees were dirty from prior approved work, so `agent-worker.mjs` failed before Codex execution.
3. The runner did not try baseline autopilot before worker execution.
4. The runner did not skip blocked tasks and therefore could not consume later A1/A2/A5 tasks.
5. A command containing both `--dry-run` and `--execute-approved --approval-token` was interpreted as real execution because approval token overrode explicit dry-run.
6. Production API sync/login had no effective timeout at the runner level, so a slow connection could hang the local workflow.
7. The LaunchAgent environment could lose a usable `node` lookup for child processes, causing background runs to fail with `env: node: No such file or directory` even when terminal runs worked.

## Fixes Implemented

- `scripts/ops/bug-intake-local-runner.mjs`
  - Added default `autoUnblockDirtyWorktrees`.
  - Added default `skipBlocked`.
  - Added candidate scanning beyond `maxTasks` so blocked early tasks do not starve the queue.
  - Added dirty worktree preflight and baseline autopilot unblocking.
  - Added failed baseline rebase abort recovery before marking a task blocked.
  - Added blocked/skipped task reporting to JSON and Markdown summaries.
  - Fixed explicit `--dry-run` precedence so it always prevents real Codex execution.
  - Added child process timeout support.
  - Switched internal Node child commands to `process.execPath` and added a stable PATH fallback for LaunchAgent execution.

- `scripts/ops/bug-intake-sync-from-api.mjs`
  - Added API fetch timeout.
  - Added attachment download timeout.
  - Added queue handoff timeout.
  - Switched queue handoff execution to `process.execPath` with a stable PATH fallback.

- `scripts/ops/agent-worker.mjs`
  - Switched `run-agent-task`, baseline autopilot, and local A1 validation Node calls to `process.execPath`.
  - Added stable PATH fallback so Codex CLI and Node-backed scripts behave consistently under LaunchAgent.

## Queue Unblocked

- A3 dirty worktree was baseline-merged successfully.
- A4 dirty worktree was baseline-merged successfully.
- A3 repair for `BUG-20260706-0002` was recovered and merged into local main:
  - `GET /api/v3/iot/devices/all-summary` now computes `feedToday` and `waterToday` from IoT daily aggregate / realtime cumulative data.
- A5 had a stale branch rebase conflict in docs-only runtime-memory files. The in-progress rebase was aborted and the worktree was restored to clean. Future runner cycles will skip it if baseline cannot repair safely.

## Dry-run Verification

Command outcome: PASS

The runner dry-run selected five runnable tasks without real Codex execution:

1. `BUGTASK-20260706-0002-03-A4`
2. `BUGTASK-20260707-0002-02-A3`
3. `BUGTASK-20260707-0002-03-A4`
4. `BUGTASK-20260707-0002-04-A5`
5. `BUGTASK-20260707-0002-05-A1`

Blocked tasks in latest dry-run: 0.

## Safety

- Business code modified by this report task: No.
- Runner/ops scripts modified: Yes.
- DB write: No.
- Migration: No.
- Deploy: No.
- Push: Not performed in this step because local main is behind origin/main and requires controlled baseline alignment first.

## Remaining Conditions

1. Local main must be reconciled with origin/main before pushing the recovered A3/A4 fixes.
2. A5 worktree should be realigned to current main in a dedicated maintenance pass because its branch history contains stale docs/runtime-memory commits.
3. The LaunchAgent should be reloaded after this runner fix is committed so the long-running process uses the hardened logic.

## Current Conclusion

GO WITH CONDITIONS

The queue-drain deadlock is fixed at the runner logic level. Production deployment is intentionally pending controlled main/origin alignment.

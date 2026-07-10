# Bug Intake Queue Truthful Completion Hardening Report

## Conclusion

`GO WITH CONDITIONS`. The queue now fails closed: a bug cannot be released from an Agent response alone, validation cannot run before implementation dependencies, and abnormal workers cannot invoke baseline merge recovery.

## Root Causes

1. Historical route plans were reused even when current evidence described a pure UI issue. This over-routed bugs to unrelated A3/A5/A6/A7 tasks.
2. Generated tasks had empty dependency lists, so A1 or A2 could finish before A3/A4 implementation.
3. Full historical bug payloads, including earlier Agent results and redispatch history, were embedded recursively into every contract. One observed assembled prompt exceeded one million characters and Codex exited without an actionable response.
4. Detached-worker recovery invoked Baseline Autopilot without implementation evidence. It could merge runtime-only or stale Agent branch commits while the task itself remained HOLD.
5. Agent worktrees compared and rebased against a stale local `main` instead of fetched `origin/main`.

## Repairs

1. Bug routing is rebuilt from current title, route, console errors, and failed requests. Pure UI issues route to A4 plus A1; backend, security, data, and release Agents require matching evidence.
   The submitted issue title/description is authoritative; ambient browser errors are secondary evidence and cannot expand a clearly scoped UI issue.
2. Task dependencies are generated as implementation -> A2 review -> A1 validation -> A6/A7 release gates. A5 readiness, when relevant, precedes implementation.
3. Pending tasks with missing or failed dependencies become explicit HOLD instead of remaining pending forever.
4. Contracts contain a bounded evidence snapshot only. Historical Agent result arrays are excluded and large fields are truncated.
5. Superseded route tasks are archived and excluded from release evidence.
6. Detached workers never merge. They write HOLD with a strict-evidence reason.
7. Dirty worktrees containing business files are never auto-cleaned or auto-merged. Only `docs/ops/**` runtime artifacts can be locally preserved before a new run.
8. Bug-intake worktrees fetch and rebase against `origin/main`.
9. Verified Agent commits are integrated by the resident runner with a precise cherry-pick only after the worker evidence gate passes. Cherry-pick conflicts are aborted and the task becomes HOLD.
10. Task IDs use stable Agent suffixes (`-A3`, `-A4`, `-A1`) instead of route-order indexes, preventing a refined route from reusing another Agent's old task state.
11. A3/A4 Bug Intake execution uses dedicated clean worktrees based on current `origin/main`; legacy Agent worktrees are retained for audit but no longer block the repair queue.
12. Production report reads retry transient 429/5xx/network failures three times with backoff. A persistently failing detail is recorded and skipped for that cycle without aborting the remaining queue.

## Verification

- Node syntax checks: PASS for queue planner, resident runner, Agent worker, and task queue.
- Evidence gate self-test: PASS.
- Real historical UI report `BUG-20260705-0001`: refined route is A4 + A1 only.
- Dependency check: A1 depends on the A4 implementation task.
- Compact contract size: approximately 3 KB per Agent instead of more than 1 MB assembled context.
- Queue rebuild: active pending work reduced from 123 unordered tasks to 64 dependency-aware tasks; 201 legacy/superseded tasks are archived and excluded from dispatch.
- Remote non-executable states (`HOLD`, `FIX_READY_FOR_UAT`, closed states) deactivate local pending tasks, preventing stale work from running after the server-side gate changes.
- Push/deploy during hardening: No.
- Migration/DB write: No.

## Remaining Gate

The 25 reconciled historical bugs must complete under the new route and evidence rules. A bug may reach `FIX_READY_FOR_UAT` only after implementation, review, A1 validation, CI/CD, and production route smoke. Administrator business acceptance remains required for `RESOLVED`.

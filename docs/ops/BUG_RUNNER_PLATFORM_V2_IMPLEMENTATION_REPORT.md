# Bug Intake Runner Platform V2 Implementation Report

## Objective

Freeze the known Runner failure modes and upgrade in strict P0-P4 order: correctness first, then throughput, resilience, release safety, and observability. The target is a resident repair pipeline that does not lose queue state, does not report false completion, and does not deploy audit-only changes.

## Frozen Problems

1. Whole-file queue writes could overwrite another Worker result.
2. Terminal tasks could regress after stale snapshots or redispatch.
3. Result writeback depended on one HTTP request and had no durable replay.
4. One Bug could run only one Agent per cycle, leaving A2/A1 gates half-finished.
5. The Runner was globally serial despite independent API/Web/read-only worktrees.
6. CI success was inferred from whichever runs appeared, not the complete required workflow set.
7. `docs/ops` and `scripts/ops` audit-only pushes triggered an unnecessary Web deployment.
8. Production smoke accepted HTTP 200 even when the rendered page contained a load-failure shell.
9. Five-minute polling delayed approved repairs and there was no explicit wake event.
10. Operator visibility lacked queue SLO, false-completion, evidence coverage, and dead-letter health.

## P0 - Correctness

- Added monotonic task state transitions and explicit redispatch semantics.
- Added task-generation idempotency keys and state versions.
- Added a global queue lock, atomic JSON replacement, and append-only task events.
- Wired snapshot merging into task queue, Worker, and Bug-to-Agent queue adapters.
- Added durable Agent-result Outbox with ACK/RETRY replay at the start of every cycle.
- False completion is surfaced as Runner `HOLD`; implementation evidence remains mandatory.

## P1 - Throughput

- Runner selects up to three independent worktrees per batch and up to six tasks per cycle.
- API and Web work may run together; two API writers or two Web writers remain serialized.
- Read-only gates may run with an implementation task.
- Migration/schema/entity/table/column tasks are excluded from automatic parallel dispatch.
- The queue is reread after each batch so A3/A4 can unlock A2/A1 in the same cycle.

## P2 - Resilience

- Poll fallback reduced from 300 seconds to 30 seconds.
- `bug-runner-wakeup.mjs` records an immediate local wake event.
- Runner checks the wake file every second while idle.
- Existing stale-lease recovery remains active.
- Non-success terminal results are copied to an append-only dead-letter stream.
- Pending result Outbox records replay after restart before new work begins.

## P3 - Release Safety

- Exact CI barrier requires Security, Web Unit, Build, and CI/CD workflow success for the pushed SHA.
- Ops-only audit commits use `ops-only` deploy mode and build/deploy no application image.
- Production route smoke rejects known page-error shells and undersized/empty responses even when HTTP is 200.
- Automatic destructive rollback remains prohibited. A failed CI or semantic smoke produces HOLD and rollback evidence; it never force-pushes or rewrites history.

## P4 - Observability and Evolution

- Added JSON/Markdown dashboard with status counts, active queue, queue wait P50/P95, lead time P50/P95, false completions, and terminal evidence coverage.
- Archived tasks are excluded from release evidence coverage. Five terminal tasks completed before the strict-evidence cutover are reported as explicit legacy exemptions rather than fabricated evidence; every post-cutover task remains strictly gated.
- Resident Observer consumes the dashboard and raises HIGH/CRITICAL findings for waiting Runner work or false completion.
- Added a machine-readable policy that freezes concurrency, CI, release, and SLO rules.

## Operating Model

- Resident LaunchAgent: 30-second fallback polling, event wakeup, 3 parallel Workers, 6 tasks per cycle.
- Business code can be released only after implementation evidence, security/CI gates, push, exact CI barrier, and semantic production smoke.
- Administrator verification remains final business acceptance; technical completion does not silently resolve a report.

## Boundaries

- No database write or migration was executed by this platform upgrade.
- No production deployment or push was performed during implementation.
- Migration tasks remain manual Gate work.
- Rollback is fail-closed and evidence-driven; destructive automatic rollback is intentionally disabled.

## Verification Results

- Runner platform and existing local Runner tests: `40/40 PASS`.
- API TypeScript check: `PASS`.
- Web TypeScript check: `PASS`.
- P0-P4 Runner dry-run: `PASS`; no Codex CLI execution, push, or deployment occurred.
- Dashboard decision: `GO`; 356 tracked tasks, 0 active, 0 false completions.
- Governed terminal evidence coverage: `100%`; raw coverage is `96.50%` because five pre-cutover terminal tasks are explicitly recorded as legacy exemptions.
- Deployment workflow YAML parse: `PASS`.
- W5 closeout gate: `PASS`. The repository-wide baseline reports historical frozen/security paths unless the documented review flags are present; the actual P0-P4 change set contains only `.github/workflows/deploy.yml`, `scripts/ops/**`, and `docs/ops/**`.

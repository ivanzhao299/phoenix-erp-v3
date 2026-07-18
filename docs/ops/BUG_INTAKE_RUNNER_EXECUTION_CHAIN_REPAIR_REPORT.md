# Bug Intake Runner Execution Chain Repair Report

## Conclusion

`GO WITH CONDITIONS`

The Runner/Codex CLI execution chain is repaired and controlled queue consumption has resumed. Resident consumption is separated from automatic release: the service may claim and verify approved work, while push and deployment remain disabled by default.

## Root Causes

1. The resident wrapper pinned `/Users/mac/.npm-global/bin/codex` version `0.142.5`. That build could not parse the current `~/.codex/models_cache.json` because `supports_reasoning_summaries` was absent, so workers exited before executing the prompt.
2. Generic process exits were treated as recoverable technical HOLDs. The same failed generation could be redispatched repeatedly and starve fresh tasks.
3. The runner committed `docs/ops/runs` before workers, after every worker, and after integration. Polling cycles therefore produced repeated audit-only commits even when no meaningful state changed.
4. Consumption and release flags were coupled in the LaunchAgent wrapper. Restoring the service could unintentionally push a branch that was not release-ready.
5. A valid source-task report could be rejected when its filename used the source repair task number rather than the Agent suffix. A recovered `IMPLEMENTATION_COMPLETED` task was also missing from the integrated-commit recovery allowlist.
6. Dependency-only HOLD tasks were not requeued after their failed parent recovered, and dedicated Agent worktrees could remain on a divergent historical baseline after a cherry-pick. Both conditions left valid work stranded or generated stale-field conflicts.
7. Inbox details were fetched serially. Production API latency therefore stretched a normal sync cycle beyond one minute even though the API and token were healthy.

## Repairs

- Prefer the Codex CLI bundled with the desktop app and record its binary/version in execution logs.
- Run a CLI version preflight before prompt execution and return a clear error when no usable binary exists.
- Classify cache-schema and authentication failures as non-retryable `WAITING_RUNNER`.
- Keep capacity/network failures in bounded `WAITING_CAPACITY`; after the retry budget they become `WAITING_RUNNER`.
- Exclude `HOLD`, `WAITING_CAPACITY`, and `WAITING_RUNNER` from normal runnable selection.
- Schedule fresh pending tasks before retries, FIFO within each class, and attempt at most one task per bug report per cycle.
- Suppress same-cycle retries. A later cycle may retry only when the stored retry policy allows it.
- Accept task reports named with the source repair task number (for example `BUGTASK-...-frontend-repair.md`) when performing the controlled parent commit. Agent-specific suffixes are no longer required in every valid report filename.
- Allow verified `IMPLEMENTATION_COMPLETED` tasks to use integrated-commit recovery after a parent Runner interruption.
- Requeue only dependency-role HOLD tasks when every dependency later reaches a success state. Business/manual HOLD remains untouched.
- After a verified implementation is integrated, move the clean dedicated Agent worktree to the integrated baseline so the next task cannot develop against stale fields.
- Fetch report details with bounded concurrency (default five); preserve per-request timeout, ordered results, and per-report error isolation.
- Download evidence attachments only for executable candidates and reuse a stable local cache. HOLD/not-ready reports no longer create timestamped attachment copies every cycle.
- Batch audit commits once per configurable window (default 30 minutes) and suppress semantically duplicate commits.
- Permit dirty runner-owned queue/run artifacts during integration while continuing to reject business-code dirtiness.
- Make resident auto-release opt-in through `PHOENIX_ERP_RUNNER_AUTO_RELEASE=true`.

## Verification

- Changed script syntax checks: PASS.
- Runner unit tests: `30/30` PASS.
- Evidence gate self-test: PASS.
- Bundled Codex CLI real read-only probe: PASS (`CODEX_RUNNER_PREFLIGHT_OK`).
- Runner dry-run sync: PASS; 20 reports inspected.
- Dry-run scheduling: three distinct fresh A4 tasks from three distinct bug reports; no HOLD task selected.
- Generation-drift automatic recovery: disabled by default.
- Production inbox sync probe: PASS; bounded-concurrency cycle with candidate attachment caching completed in `10.4s` instead of the previous minute-scale serial cycle.
- Codex CLI execution during runner dry-run: no.
- Push/deploy during repair validation: no.

## Controlled Real Recovery

A one-task real recovery cycle was executed after the infrastructure commit:

| Field | Result |
|---|---|
| Task | `BUGTASK-20260716-0003-A4` |
| Source bug | `BUG-20260716-0003` |
| Codex CLI | `0.145.0-alpha.18` bundled desktop binary |
| Worker exit | `0` |
| Evidence gate | `IMPLEMENTATION_COMPLETED` |
| Final queue status | `COMPLETED_MERGED` |
| Integrated commit | `8089e10a` |
| Same-cycle retry | `0` |
| Push/deploy | skipped |

The Agent produced a real frontend repair for the sales-order draft/list refresh issue, focused tests, Web typecheck evidence, and a task report. This confirms the execution chain now performs work rather than returning an empty process failure or false completion.

## Resident Backlog Recovery

After the controlled task, the resident service consumed additional approved backlog without selecting existing HOLD tasks:

| Task | Result | Integrated commit / evidence |
|---|---|---|
| `BUGTASK-20260716-0003-A1` | `VALIDATION_COMPLETED` | A1 validation evidence |
| `BUGTASK-20260716-0004-A4` | `SKIPPED_NOT_APPLICABLE` | fail-closed scope diagnosis |
| `BUGTASK-20260717-0001-A4` | `COMPLETED_MERGED` | `fb6fb775` |
| `BUGTASK-20260717-0002-A4` | `COMPLETED_MERGED` | `3c6cb67d` |
| `BUGTASK-20260718-0001-A4` | `COMPLETED_MERGED` | `05a0a5ef` after reviewed conflict resolution |
| `BUGTASK-20260718-0001-A1` | `VALIDATION_COMPLETED` | automatically requeued after dependency recovery |
| `BUGTASK-20260718-0003-A4` | `SKIPPED_NOT_APPLICABLE` | evidence gate |
| `BUGTASK-20260718-0004-A4` | `SKIPPED_NOT_APPLICABLE` | evidence gate |
| `BUGTASK-20260718-0005-A4` | `COMPLETED_MERGED` | `6400d55a` |
| `BUGTASK-20260718-0005-A3` | `COMPLETED_MERGED` | `1c8c55bd`; one-time recovery from the confirmed legacy CLI cache failure |
| `BUGTASK-20260718-0005-A1` | `VALIDATION_COMPLETED` | automatically requeued after A3/A4 dependency recovery |

The reviewed conflict was caused by the A4 worktree being based on the old `FarmLog` response while the current branch already used `DailyHenReport.total_loss`. The merge retained the current API contract and accepted only the compatible PC daily-report dead-and-cull aggregation. The A4 worktree was then aligned to the integrated baseline.

## Queue Snapshot Before Recovery

| Status | Count |
|---|---:|
| Total | 356 |
| Archived | 213 |
| Completed/merged/validated | 108 |
| Skipped | 9 |
| Pending | 13 |
| HOLD | 13 |

After resident recovery, the queue contains no pending or running task, 12 HOLD tasks, 62 `COMPLETED_MERGED`, 54 `VALIDATION_COMPLETED`, and 12 `SKIPPED_NOT_APPLICABLE` tasks. Existing HOLD tasks remain preserved for explicit diagnosis and do not compete with new pending work.

The final legacy task recovery was deliberately narrow: the stored A3 worker log proved that global Codex `0.142.5` had exited on the incompatible model-cache schema before any prompt execution. That single task was requeued once after the bundled CLI preflight passed. Generic HOLD tasks were not re-enabled, A3 completed through the bundled CLI, and its dependent A1 validation recovered automatically.

Only one audit-artifact commit was created during the initial recovery window. Subsequent cycles inside the 30-minute cooldown produced no audit-only commit, confirming that the prior commit storm is stopped.

## Safety Boundary

- No migration executed.
- No database write performed by this repair.
- No production deployment performed.
- No push performed.
- The runner infrastructure repair itself modified no business module. The controlled recovery cycle intentionally integrated the approved A4 frontend repair listed above.
- Resident auto-release remains disabled unless explicitly enabled in the external service environment.

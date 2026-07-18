# Bug Intake Runner Execution Chain Repair Report

## Conclusion

`GO WITH CONDITIONS`

The Runner/Codex CLI execution chain is repaired and the queue can resume controlled consumption. Resident consumption is separated from automatic release: the service may claim and verify approved work, while push and deployment remain disabled by default.

## Root Causes

1. The resident wrapper pinned `/Users/mac/.npm-global/bin/codex` version `0.142.5`. That build could not parse the current `~/.codex/models_cache.json` because `supports_reasoning_summaries` was absent, so workers exited before executing the prompt.
2. Generic process exits were treated as recoverable technical HOLDs. The same failed generation could be redispatched repeatedly and starve fresh tasks.
3. The runner committed `docs/ops/runs` before workers, after every worker, and after integration. Polling cycles therefore produced repeated audit-only commits even when no meaningful state changed.
4. Consumption and release flags were coupled in the LaunchAgent wrapper. Restoring the service could unintentionally push a branch that was not release-ready.

## Repairs

- Prefer the Codex CLI bundled with the desktop app and record its binary/version in execution logs.
- Run a CLI version preflight before prompt execution and return a clear error when no usable binary exists.
- Classify cache-schema and authentication failures as non-retryable `WAITING_RUNNER`.
- Keep capacity/network failures in bounded `WAITING_CAPACITY`; after the retry budget they become `WAITING_RUNNER`.
- Exclude `HOLD`, `WAITING_CAPACITY`, and `WAITING_RUNNER` from normal runnable selection.
- Schedule fresh pending tasks before retries, FIFO within each class, and attempt at most one task per bug report per cycle.
- Suppress same-cycle retries. A later cycle may retry only when the stored retry policy allows it.
- Batch audit commits once per configurable window (default 30 minutes) and suppress semantically duplicate commits.
- Permit dirty runner-owned queue/run artifacts during integration while continuing to reject business-code dirtiness.
- Make resident auto-release opt-in through `PHOENIX_ERP_RUNNER_AUTO_RELEASE=true`.

## Verification

- Changed script syntax checks: PASS.
- Runner unit tests: `23/23` PASS.
- Evidence gate self-test: PASS.
- Bundled Codex CLI real read-only probe: PASS (`CODEX_RUNNER_PREFLIGHT_OK`).
- Runner dry-run sync: PASS; 20 reports inspected.
- Dry-run scheduling: three distinct fresh A4 tasks from three distinct bug reports; no HOLD task selected.
- Generation-drift automatic recovery: disabled by default.
- Codex CLI execution during runner dry-run: no.
- Push/deploy during repair validation: no.

## Queue Snapshot Before Recovery

| Status | Count |
|---|---:|
| Total | 356 |
| Archived | 213 |
| Completed/merged/validated | 108 |
| Skipped | 9 |
| Pending | 13 |
| HOLD | 13 |

The pending backlog is eligible for controlled FIFO consumption. Existing HOLD tasks remain preserved for explicit diagnosis and do not compete with pending work.

## Safety Boundary

- No migration executed.
- No database write performed by this repair.
- No production deployment performed.
- No push performed.
- No business module code modified.
- Resident auto-release remains disabled unless explicitly enabled in the external service environment.

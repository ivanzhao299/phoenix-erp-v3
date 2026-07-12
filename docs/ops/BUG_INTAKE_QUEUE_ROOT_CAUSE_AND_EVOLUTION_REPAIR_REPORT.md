# Bug Intake Queue Root Cause and Evolution Repair Report

## Conclusion

The queue was not healthy. Production reports could remain `AGENT_APPROVED` or `HOLD` while the local queue had no runnable tasks. The immediate cause was a runner-owned false dirty-worktree signal, and the platform Evolution components were present but not attached to the resident lifecycle.

## Root Cause

1. `bug-intake-local-runner.mjs` linked the main repository dependency directories into dedicated task worktrees.
2. The same runner read `git status --short` without excluding those runtime links.
3. A worktree containing only `node_modules` links was classified as a dirty implementation worktree.
   The classification existed independently in the resident parent runner, `agent-worker.mjs`, and `run-agent-task.mjs`; all layers must use the same runtime-path filter.
4. The worktree was quarantined and the implementation task entered `HOLD`; dependent A1/A2 tasks then entered dependency `HOLD`.
5. A same-generation sync correctly preserved terminal evidence, so the approved remote report could not become runnable without a new redispatch generation.
6. Observer and Evolution Planner were only manually callable. Their last applied state predated the incident, so repeated quarantine evidence did not trigger an improvement lifecycle.

## Repair

- Ignore only the three dependency links created by the runner: root, API, and Web `node_modules`.
- Apply one shared filter module in the parent runner, child Agent worker, and CLI task runner preflight.
- Apply the same runtime filter when recovering and committing Agent sandbox changes.
- Parse the earliest explicit Agent conclusion so later prose such as `fail fast` cannot override a leading `PASS WITH CONDITIONS`.
- Commit Observer stable reports and `docs/ops/evolution/**` together with queue/run artifacts before implementation integration, so the resident evolution loop cannot dirty-block its own repairs.
- Preserve detection of every real business or ops file modification.
- Detect approved reports whose current local generation is entirely terminal for runner-owned quarantine/dependency reasons.
- Create a bounded new generation automatically, at most twice per report and at most three reports per cycle.
- Never auto-redispatch business/security failures, rejected/closed/resolved reports, or A6/A7 release tasks.
- Run Resident Observer and Evolution Planner every 12 cycles and immediately when a technical generation recovery is found.
- Allow docs-only audit commits to synchronize independently, while any non-doc path still requires complete release evidence.
- Register `PATTERN-PHX-003` and `IMPROVE-BUG-INTAKE-QUEUE-RECOVERY` in Evolution Center.

## Verification

- Runner syntax check: PASS
- Observer syntax check: PASS
- Evolution Planner syntax check: PASS
- Runtime-link regression test: PASS
- Real business-diff visibility regression test: PASS
- Technical-generation redispatch test: PASS
- Business HOLD / A6-A7 exclusion test: PASS
- Existing generation immutability tests: PASS
- API typecheck: PASS

## Safety

- Migration executed: No
- Database written: No
- Production deployment performed by this repair: No
- Automatic A6/A7 execution: No
- Business HOLD bypassed: No

## Evolution State

Observer inspected the current run history and generated a fresh findings report. Evolution Planner applied the new P0 queue-recovery candidate to the improvement backlog. Future recurrence is now both prevented at source and visible to the resident evolution lifecycle.

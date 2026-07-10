# Bug Intake False Completion and Queue Stall Fix Report

## Conclusion

`GO WITH CONDITIONS`. False completion and terminal lease retention have been removed from the automated repair path. A technical repair can advance only to `FIX_READY_FOR_UAT`; it cannot become `RESOLVED` until an administrator records business acceptance.

## Root Causes

1. Redispatch retained prior `agentResults`. A callback from the new run could combine with old callbacks and satisfy the whole Agent plan immediately.
2. Markdown result writeback discarded the queue `evidence_gate`, implementation commit, and changed-file evidence.
3. Terminal tasks kept `claimed_by` and `claimed_at`, so completed or HOLD tasks appeared occupied.
4. Production route smoke treated redirects to `/login` as success and did not send the authentication cookie consumed by Next middleware.
5. Release gating once selected stale redispatch tasks and allowed mixed batches when only part of the release evidence passed. Those runner defects were corrected in the preceding hardening commits.

## Fixes

- Redispatch archives prior results, starts an empty evidence generation, and tags new results with `redispatchCount`.
- Explicit redispatch Agent scope is supported for registered Agents and must include `A1-CI-Runtime-Gate`.
- Agent result writeback reads authoritative queue evidence when the report is Markdown.
- `completed`, `failed`, `HOLD`, archived, and other non-running states release their queue lease and lock.
- The resident runner repairs legacy terminal leases during recovery cycles.
- Route smoke sends the Phoenix auth cookie and accepts only HTTP 2xx; login redirects are no longer PASS.
- Production issues remain `IN_PROGRESS / FIX_READY_FOR_UAT` until business acceptance. No automatic path writes `RESOLVED`.

## Reconciliation Result

- Terminal leases released: 48.
- Remaining claimed/running tasks without a live process: 0.
- Production route smoke: `/home`, `/warehouse/query`, `/breeding/daily`, and `/finance2/cash-accounts` returned HTTP 200.
- Business-role API smoke is not inferred from the least-privilege Bug Intake service account. Role-specific acceptance remains a separate UAT gate.

## Verification

- `node --check` passed for the queue, worker, resident runner, result writeback, route smoke, and token helper scripts.
- Bug Intake service tests: 6/6 PASS, including redispatch generation isolation.
- API TypeScript: PASS.
- Agent result writeback dry-run: implementation commit, changed files, and evidence gate preserved.
- W5 closeout gate: PASS.
- CI/CD and production deployment must pass for the final commit before this report is considered released.

## Safety

- Database write by remediation scripts: No.
- Migration: No.
- Destructive cleanup/reset: No.
- Automatic business acceptance: No.


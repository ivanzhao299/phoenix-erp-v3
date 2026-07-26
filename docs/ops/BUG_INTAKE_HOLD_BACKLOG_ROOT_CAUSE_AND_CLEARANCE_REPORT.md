# Bug Intake HOLD Backlog Root Cause and Clearance Report

Date: 2026-07-26

## Decision

The production queue contained 12 reports whose repair task status was `HOLD`. The
local Agent queue contained no active `HOLD` task. The mismatch was caused by the
release lifecycle, not by an unconsumed local queue.

Current clearance decision: **GO WITH CONDITIONS**. Release the verified fixes,
wait for CI/CD and production smoke, then restore technically verified reports to
`FIX_READY_FOR_UAT`. Business acceptance remains a separate explicit step.

## HOLD Classification

| Class | Count | Treatment |
| --- | ---: | --- |
| Historical rejected report | 1 | Keep rejected; exclude from active repair backlog |
| Existing implementation evidence, later release failure overwrote status | 8 | Reconcile after clean release; do not rerun implementation |
| New business fixes in this release | 3 | Release, run CI/CD and production smoke, then write back evidence |

The three current business defects are:

- `BUG-20260726-0001`: delivery planning used sales order money as goods quantity.
- `BUG-20260726-0002`: delivery page did not present the latest workflow status.
- `BUG-20260726-0003`: packaging inbound rejected temporary production inbound data.

## Root Causes

1. The resident Runner committed volatile `docs/ops` runtime artifacts onto the
   same long-lived branch as business fixes.
2. It pushed that diverged branch directly to `origin/main`, producing repeated
   non-fast-forward failures.
3. A failed Runner-level release was written back to every otherwise successful
   report as `HOLD`, replacing valid implementation evidence.
4. Idle cycles continued to create audit commits, increasing divergence and
   producing an audit commit storm.
5. Result delivery IDs included volatile report text and paths, so logically
   identical evidence could be delivered repeatedly.
6. A later unrelated lifecycle receipt could revoke an already established
   `FIX_READY_FOR_UAT` state.

## Implemented Corrections

- Publish only verified implementation commits from an isolated temporary
  worktree based on the latest `origin/main`.
- Retry a non-fast-forward race at most three times; never merge audit-only
  commits into the release.
- Keep runtime audit commits on the Runner audit branch and suppress commits for
  idle cycles.
- Write the Runner lifecycle result only after push, CI/CD, and production route
  smoke all pass.
- Preserve prior `FIX_READY_FOR_UAT` evidence when a later independent release
  attempt fails.
- Generate stable delivery IDs from task, agent, conclusion, commit, changed
  files, validation evidence, and next action only.
- Correct delivery planned quantity to aggregate `sal_order_items.qty`, never
  `sal_sales_orders.total_amount`.

## Verification

- Runner syntax check: PASS.
- Runner unit tests: 52/52 PASS.
- API focused tests: 17/17 PASS.
- API TypeScript check: PASS.
- Web delivery workflow tests: 8/8 PASS.
- Web TypeScript check: PASS.
- Database migration: not required.
- Database write by this repair: no.

## Production Clearance Gate

The backlog is not considered cleared merely because local tests pass. Completion
requires:

1. verified commits present on `origin/main`;
2. required GitHub Actions workflows successful;
3. production route smoke successful;
4. resident Runner restarted from the clean production baseline;
5. production reports no longer falsely remain `HOLD`;
6. current business defects exposed as `FIX_READY_FOR_UAT` or
   `BUSINESS_VERIFIED`, with evidence retained.


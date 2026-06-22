# Agent Parallel Execution Policy V2

## Allowed Parallel Groups

1. `readonly-validation`: A1, A2, A5 can run in parallel for validation/read-only tasks.
2. `release-planning`: A6 can prepare runbooks after merge readiness; no deploy.
3. `final-readonly-gate`: A7 can review evidence after A1/A2/A4/A6 outputs.

## Code Work

A3 and A4 can only run in parallel when:

1. paths do not overlap;
2. no migration/schema/entity/table/column is involved;
3. A2 high-risk pre-review is complete when Auth/RBAC/DataScope/Finance/Payment/Chanjet is involved;
4. user approval exists.

## Mandatory HOLD

The platform must HOLD for:

1. migration/schema/entity/table/column;
2. DB write;
3. production deploy;
4. push;
5. merge without gate;
6. dirty worktree;
7. rebase conflict;
8. missing Agent result evidence.

## Gate Requirements

1. Merge requires `agent-sync-and-merge.mjs`.
2. Code changes require A1/A2 evidence before merge.
3. Deploy readiness requires A6 runbook and A7 final QA.
4. Production GO remains manual.

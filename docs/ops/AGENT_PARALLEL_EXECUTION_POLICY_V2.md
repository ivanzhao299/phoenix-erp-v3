# Agent Parallel Execution Policy V2

## Allowed Parallel Groups

1. `readonly-validation`: A1, A2, A5 can run in parallel for validation/read-only tasks.
2. `release-planning`: A6 can prepare runbooks after merge readiness; no deploy.
3. `final-readonly-gate`: A7 can review evidence after A1/A2/A4/A6 outputs.

Every generated task in a parallel group has its own immutable task-generation worktree. Parallelism is a scheduling decision, never permission to share a branch or worktree.

## Code Work

A3 and A4 can only run in parallel when:

1. paths do not overlap;
2. no migration/schema/entity/table/column is involved;
3. A2 high-risk pre-review is complete when Auth/RBAC/DataScope/Finance/Payment/Chanjet is involved;
4. user approval exists.
5. A3 and A4 each use their own `task_id + generation + agent` workspace.

## A4 UI/UX Parallel Rules

1. A4 can run in parallel with A3 when:
   - A3 changes `apps/api/**`;
   - A4 changes `apps/web/**`;
   - the API contract is frozen or aligned through mock / API draft.
2. A4 can run in parallel with A1 for static validation planning, but real validation should run after A4 commits.
3. A4 can run in parallel with A2 for UI permission-risk review, but permission-related code or menu display logic requires A2 post-review.
4. A4 must not modify backend, migration, schema/entity/table/column, deployment, or database logic.

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
9. static/canonical Agent worktree used as an execution slot;
10. branch or worktree identity not matching task id and generation.

## Gate Requirements

1. Merge requires `agent-sync-and-merge.mjs`.
2. Code changes require A1/A2 evidence before merge.
3. Deploy readiness requires A6 runbook and A7 final QA.
4. Production GO remains manual.

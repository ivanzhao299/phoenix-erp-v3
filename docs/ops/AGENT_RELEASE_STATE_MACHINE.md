# Agent Release State Machine

## States

1. `REQUESTED`
2. `PLANNED`
3. `TASKS_CREATED`
4. `CLAIMED`
5. `RUNNING`
6. `COMPLETED`
7. `DIAGNOSED`
8. `SECURITY_REVIEW`
9. `CI_VALIDATION`
10. `MERGE_READY`
11. `MERGED`
12. `UAT_READY`
13. `DEPLOY_READY`
14. `PRODUCTION_GO_REQUIRED`
15. `PRODUCTION_DEPLOYED`
16. `HOLD`
17. `FAILED`
18. `ROLLBACK_REQUIRED`

## Script

`scripts/ops/agent-release-state-machine.mjs` records state transitions in:

1. `docs/ops/agent-queue/release-state.json`
2. `docs/ops/agent-queue/release-events.jsonl`

## Dry-Run First

State transition dry-run:

```bash
node scripts/ops/agent-release-state-machine.mjs \
  --request-id REQ-EXAMPLE \
  --to TASKS_CREATED \
  --dry-run
```

## Manual Gate Boundaries

The state machine does not execute deployment, migration, DB writes, push, or rollback. `PRODUCTION_GO_REQUIRED` must be resolved by a human.

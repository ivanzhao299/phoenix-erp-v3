# Agent Task Workspace Isolation V2

## Decision

Phoenix ERP Agent Factory no longer executes tasks in long-lived Agent branches or worktrees. The A1-A7 names describe capabilities and review ownership; they are not reusable execution slots.

Every executable task receives an immutable identity:

```text
task_id + workspace_generation + agent
```

The identity deterministically produces:

```text
branch:   codex/task/<task-id>/g<generation>/<agent>
worktree: /Users/mac/phoenix-erp-worktrees/agent-tasks/<task-id>-g<generation>-<agent>
```

## Root Cause Closed

The previous platform had two conflicting models:

1. `AGENT_DISPATCH_MAP.json` exposed one canonical branch/worktree per Agent.
2. Bug Intake created isolated A3/A4 worktrees in only one dispatch path.

Orchestrator, follow-up dispatch, ordinary queue and direct runner paths could still use the canonical worktree. Old commits, dirty files or an interrupted rebase therefore contaminated later tasks. Cleaning A3/A4 once could not solve a platform model that continued assigning shared execution state.

## New Invariants

1. Canonical Agent worktrees are template/reference worktrees only.
2. `canonical_execution_allowed` is false for every Agent.
3. All generated tasks carry `workspace_policy: task-generation-isolated-v2`.
4. A real execution requires `task_id`, `workspace_generation`, matching branch and matching worktree.
5. A different task always receives a different branch and worktree, even when the Agent is the same.
6. A redispatch increments the generation and receives a new branch and worktree.
7. A stale lease retires its generation before returning to pending.
8. A dirty incomplete worktree is moved to quarantine. It is never cleaned, reset or reused automatically.
9. An existing generation branch without its original worktree is considered retired and cannot be reattached.
10. Automatic merge accepts only a valid task-generation identity.

## Agent Recomposition

Agent names remain stable capability labels, but routing may compose any subset for a task:

- implementation owner: A3 or A4
- risk review: A2
- data evidence: A5
- CI/runtime verification: A1
- release planning: A6
- final decision: A7

Adding, removing or renaming an Agent does not change workspace safety. Isolation is attached to task identity, not to a fixed number of Agents or a permanent branch.

Read-only local validators may inspect the current source tree without modifying it. Any Agent invocation that can write files, including docs or reports, must use its task workspace.

## Lifecycle

```text
task created
  -> allocate g1 identity
  -> create branch/worktree from origin/main
  -> execute
  -> validate evidence
  -> selective safe merge
  -> retire generation

timeout / crash / dirty state
  -> preserve old workspace
  -> quarantine or retire gN
  -> explicit bounded redispatch
  -> allocate gN+1 from origin/main
```

## Failure Rules

- Static Agent worktree supplied to real execution: HOLD.
- Branch/worktree identity mismatch: HOLD.
- Existing detached generation branch: HOLD and increment generation.
- Dirty old generation: quarantine, never reset.
- More than the bounded retry budget: HOLD for platform diagnosis.
- Migration, DB write, deploy and push remain separate Gates.

## Implementation

- Identity and creation manager: `scripts/ops/agent-task-workspace.mjs`
- Task creation: `agent-orchestrator.mjs`, `agent-task-queue.mjs`, `bug-task-to-agent-queue.mjs`, `decide-next-agent.mjs`
- Execution gate: `run-agent-task.mjs`, `agent-worker.mjs`
- Resident recovery: `bug-intake-local-runner.mjs`
- Merge gate: `agent-auto-merge.mjs`, `agent-sync-and-merge.mjs`, `merge-agent-to-main.mjs`
- Read-only recommendations: `plan-next-agent.mjs`

## Regression Coverage

Tests prove:

- two A3 tasks cannot share a workspace;
- A4 redispatch g1/g2 cannot share a workspace;
- explicit release and stale-lease recovery always allocate the next generation;
- a recorded generation cannot move backwards even when older queue metadata is encountered;
- canonical A3/A4 worktrees are rejected;
- canonical and legacy Bug Intake branches cannot be merged directly;
- task branches not owned by an active queue identity cannot be merged;
- branch/worktree identity mismatches are rejected;
- a missing worktree cannot silently reattach a retired generation branch;
- execute-approved removes `--dry-run` even when task identity arguments follow it;
- custom Bug Intake A3/A4 prompts remain compatible with isolated workspaces;
- orchestrator dry-run does not mutate the live queue;
- existing Bug Intake queue and release lifecycle behavior remains green.

The implementation is covered by 96 platform tests. Real entrypoint checks also reject
the legacy A3 branch, an unowned task branch and the canonical A3 worktree before any
Codex execution or merge can start.

# Agent Platform V2 Closed-Loop Delivery

## 1. Goal

Build a closed-loop multi-Agent delivery platform:

natural language request -> requirement understanding -> task pool -> Agent claim -> parallel execution -> diagnosis -> tests -> controlled merge -> state machine -> manual production GO.

This phase builds automation infrastructure only. It does not implement ERP business features.

## 2. Phase 6.1 Gaps

Phase 6.1 can assemble prompts and run approved safe Agents, but it still leaves gaps:

1. No persistent task queue.
2. No Agent claim lock.
3. No worker lifecycle.
4. No result diagnosis layer.
5. No auto-merge controller.
6. No release state machine.
7. No closed-loop mode that connects intake to queue creation.

## 3. V2 Architecture

Core components:

1. `agent-orchestrator.mjs`: understands natural language and creates queue tasks.
2. `agent-task-queue.mjs`: stores tasks, events, and locks.
3. `agent-worker.mjs`: claims work and calls `run-agent-task.mjs`.
4. `parse-agent-result.mjs`: normalizes Agent reports.
5. `agent-diagnose-result.mjs`: evaluates risk and next gates.
6. `agent-auto-merge.mjs`: performs controlled merge dry-run or approved merge.
7. `agent-release-state-machine.mjs`: advances delivery/release states.

## 4. Main Agent And Child Agents

Codex-Orchestrator owns request intake, task generation, routing, and state decisions.

Child Agents own bounded execution:

| Agent | Role |
| --- | --- |
| A1 | CI/runtime validation |
| A2 | security/RBAC/DataScope/audit review |
| A3 | backend implementation after approval |
| A4 | frontend/UAT smoke after backend gates |
| A5 | read-only data readiness |
| A6 | staging runbook only before GO |
| A7 | final QA gate |

## 5. Task Queue Design

Queue files:

1. `docs/ops/agent-queue/tasks.json`
2. `docs/ops/agent-queue/events.jsonl`
3. `docs/ops/agent-queue/locks/`

Task fields include `task_id`, `request_id`, `agent`, `status`, `priority`, `risk_level`, `allowed_paths`, `forbidden_paths`, `prompt_file`, `contract_file`, `worktree`, `branch`, `dependencies`, `claimed_by`, `result_file`, `next_agents`, and `approval_required`.

## 6. Agent Claim / Worker Mechanism

Workers claim pending tasks for one Agent. Lock files prevent two workers from claiming the same task. Dry-run mode prints the task and command without changing product code.

Real execution requires `APPROVE_AGENT_EXECUTION` and still cannot merge, push, deploy, execute migrations, or write databases.

## 7. Parallel Development Rules

Parallel execution is allowed when tasks are read-only or independent validation tasks. Code-writing tasks remain serialized by default unless a user-approved plan proves non-overlap.

## 8. Automatic Diagnosis Rules

Diagnosis checks:

1. Changed file paths.
2. Frozen boundaries.
3. Business code changes.
4. Migration/schema/entity/table/column signals.
5. Auth/RBAC/DataScope/Finance/Payment/Chanjet risk.
6. Verification results.

Output recommendation can be `auto-merge-eligible`, `require-A2`, `require-A1`, `require-A4`, `require-A6`, `require-A7`, or `HOLD`.

## 9. Auto Merge Rules

Auto merge is allowed only for low-risk ops branches or branches that have required A1/A2 evidence. It calls `merge-agent-to-main.mjs` and defaults to dry-run.

Never auto-merge migration/schema/entity/table/column changes, deployment changes, DB writes, Auth/RBAC/DataScope high-risk code, or business code without A1/A2 gates.

## 10. Audit And Test Rules

Every task must produce evidence under `docs/ops/` or `docs/ops/runs/`. A1 validates CI/runtime, A2 validates security, and the orchestrator records decision artifacts.

## 11. Deployment State Machine

Release states progress through planning, task execution, diagnosis, security review, CI validation, merge readiness, UAT, deploy readiness, and production GO.

Production deployment remains manual GO only.

## 12. Human Gate Boundaries

Human approval is mandatory for:

1. Migration/schema/entity/table/column changes.
2. Database writes.
3. Production deploy.
4. Push.
5. High-risk Auth/RBAC/DataScope/Finance/Payment/Chanjet changes.
6. Release GO / rollback decisions.

## 13. Hard Boundaries

This platform must not automate migration execution, DB writes, production deploy, or production rollback. It can prepare evidence and plans only.

## 14. Minimum Roadmap

1. Phase V2-0: queue, worker, diagnosis, auto-merge dry-run.
2. Phase V2-1: safe A1/A2/A5 worker real execution.
3. Phase V2-2: A3/A4 implementation gates with explicit approvals.
4. Phase V2-3: A6/A7 release state reporting.
5. Phase V2-4: human-approved production GO workflow.

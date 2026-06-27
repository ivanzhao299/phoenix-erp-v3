# Codex CLI Orchestration Plan

## 1. Role of Codex CLI in AI Delivery Factory

Codex CLI is the non-interactive execution layer for AI Delivery Factory Agent tasks. It allows the Codex-Orchestrator to turn an approved task contract into a reproducible command that runs in the correct Agent worktree with the correct prompt, branch, and guardrails.

Codex CLI does not replace human approval. It only automates the mechanical handoff after the Orchestrator has produced a structured requirement, risk level, Agent assignment, allowed file scope, forbidden file scope, and acceptance criteria.

## 2. Codex App and Codex CLI Split

| Surface | Responsibility |
| --- | --- |
| Codex App | Human-facing Orchestrator window, requirement intake, clarification, risk classification, task board decisions, final review. |
| Codex CLI | Repeatable Agent execution in a target worktree after approval, using a prompt file and local git checks. |
| Git scripts | Merge checks, branch-state checks, freeze-boundary checks, and post-merge validation. |
| Human operator | Approves L3+ behavior changes, migration/schema gates, production gates, and any Agent launch that can change code. |

## 3. Current Agent Worktree Matrix

| Agent | Worktree | Branch | Prompt |
| --- | --- | --- | --- |
| Codex-Orchestrator | `/Users/mac/phoenix-erp-worktrees/codex-orchestrator` | `w5-codex-orchestrator` | `docs/ops/prompts/CODEX_ORCHESTRATOR_SYSTEM_PROMPT.md` |
| A1-CI-Runtime-Gate | `/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate` | `w5-a1-ci-runtime-gate` | `docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md` |
| A2-Security-Regression-Gate | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` | `w5-a2-security-regression-gate` | `docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md` |
| A3-Backend-Critical-Path | `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path` | `w5-a3-backend-critical-path` | `docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md` |
| A4-Frontend-UAT-Smoke | `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke` | `w5-a4-frontend-uat-smoke` | `docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md` |
| A5-Data-Readiness | `/Users/mac/phoenix-erp-worktrees/a5-data-readiness` | `w5-a5-data-readiness` | `docs/ops/prompts/A5_DATA_READINESS_PROMPT.md` |
| A6-Staging-Deploy-Runbook | `/Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook` | `w5-a6-staging-deploy-runbook` | `docs/ops/prompts/A6_DEPLOY_RUNBOOK_PROMPT.md` |
| A7-Final-QA-Gate | `/Users/mac/phoenix-erp-worktrees/a7-final-qa-gate` | `w5-a7-final-qa-gate` | `docs/ops/prompts/A7_FINAL_QA_GATE_PROMPT.md` |

## 4. Automated Dispatch Flow

1. User provides natural language request in Codex App.
2. Codex-Orchestrator generates structured requirement, risk level, Agent routing, task contract, and acceptance criteria.
3. Codex-Orchestrator updates `docs/ops/AGENT_TASK_BOARD.md`.
4. User approves the next Agent launch when required.
5. Operator runs `scripts/ops/run-agent-task.mjs` from the main repository or approved orchestration repo.
6. Script checks worktree path, git repository status, branch, clean status, and prompt file.
7. In dry-run mode, script prints the planned Codex command only.
8. In execution mode, script invokes `codex exec -C <worktree> -` with the prompt content on stdin.
9. Script writes a run log under `docs/ops/runs/`.
10. Agent commits only within the approved scope and outputs its report.
11. Orchestrator reviews the report, optionally triggers A1/A2/A7, and only merges via the safe merge script after approval.

## 5. Human Gate Boundaries

Human approval is mandatory for:

1. Starting any Agent that can write code.
2. L3+ behavior changes.
3. Auth, RBAC, DataScope, finance, master data, external integrations, and deploy-related work.
4. Migration/schema/entity/table/column changes.
5. DB migration execution.
6. Production deploy, rollback, or production data writes.
7. Merge to main.
8. Push to remote.

## 6. Automatable Steps

1. Read task board and suggest the next ready Agent.
2. Check target worktree exists and is clean.
3. Check the target branch matches the Agent.
4. Load a standardized prompt.
5. Run Codex CLI in a specific worktree.
6. Capture stdout/stderr summaries and exit code.
7. Record run metadata under `docs/ops/runs/`.
8. Run dry-run planning commands.

## 7. Steps Requiring Human Approval

1. Converting proposal-only contracts into executable Agent tasks.
2. Running non-dry-run Codex CLI for code-writing Agents.
3. Accepting PASS WITH CONDITIONS.
4. Merging any Agent branch into main.
5. Creating or running migrations.
6. Running DB writes.
7. Deploying to staging or production.
8. Closing a request as GO / GO WITH CONDITIONS / HOLD / ROLLBACK.

## 8. Migration / DB / Production Deploy Automation Boundary

Phase 5 explicitly forbids automating:

1. Migration creation.
2. Migration execution.
3. Schema/entity/table/column changes.
4. Seed creation or execution.
5. Direct database writes.
6. Production deploy.
7. Production rollback.
8. Remote push.

These gates must remain separate and manually approved.

## 9. Phase 5 Minimal Landing Scope

Phase 5 delivers:

1. Prompt files for Codex-Orchestrator and A1-A7.
2. `scripts/ops/run-agent-task.mjs` for dry-run and controlled Codex CLI execution.
3. `scripts/ops/plan-next-agent.mjs` for task board based next-Agent suggestions.
4. A review document describing current automation capability and limits.
5. Task board registration.

Phase 5 does not continue Store Payment feature development.

## 10. Phase 6 / Phase 7 Expansion Direction

Phase 6 can add structured task contract parsing, request-id based prompt assembly, richer run logs, and automatic A1/A2 follow-up suggestions.

Phase 7 can add a full no-code Orchestrator queue: natural language intake, Requirement Spec generation, task-board updates, dry-run dispatch, Agent execution after approval, merge dry-run, and final GO/HOLD synthesis. Migration execution, DB writes, production deploy, and push remain separate human gates.

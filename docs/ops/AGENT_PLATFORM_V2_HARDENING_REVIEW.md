# Agent Platform V2 Hardening Review

## 1. Stage Goal

Harden the seven-Agent closed-loop delivery platform so the team can stop expanding tooling and return to ERP business delivery.

## 2. Added / Updated Files

1. `docs/ops/AGENT_REGISTRY.md`
2. `docs/ops/AGENT_CAPABILITY_MATRIX.md`
3. `docs/ops/AGENT_WORKTREE_MATRIX.md`
4. `docs/ops/AGENT_ROUTING_RULES_V2.md`
5. `docs/ops/AGENT_PARALLEL_EXECUTION_POLICY_V2.md`
6. `docs/ops/SEVEN_AGENT_PARALLEL_DELIVERY_RUNBOOK.md`
7. `docs/ops/AGENT_PLATFORM_V2_HARDENING_REVIEW.md`
8. `docs/ops/AGENT_DISPATCH_MAP.json`
9. `scripts/ops/agent-orchestrator.mjs`

## 3. P0 Sync / Merge

`agent-sync-and-merge.mjs` already provides dry-run/approved sync, generated run artifact handling, target worktree rebase, merge preflight, W5 closeout gate, and no push/deploy/migration/DB write boundaries.

## 4. P1 Seven-Agent Registration

All seven Agents plus Codex-Orchestrator are registered in `AGENT_DISPATCH_MAP.json` with role, worktree, branch, prompt, allowed paths, forbidden paths, capabilities, parallel group, risk domains, and handoff targets.

## 5. P2 State Machine

The minimum closed-loop scripts now cover request planning, queue creation, worker dry-run, diagnosis HOLD for incomplete tasks, safe merge dry-run, and release state transitions.

## 6. Validation Results

1. `node --check scripts/ops/*.mjs`: PASS.
2. `agent-sync-and-merge.mjs w5-codex-orchestrator --dry-run`: pre-commit safety behavior verified. It reported main `docs/ops/runs/**` artifacts would be auto-committed and refused to rebase the dirty target worktree while this hardening change was in progress.
3. Seven-Agent closed-loop dry-run:
   - Request ID: `REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION`
   - Decision: `PLAN_READY`
   - Selected Agents: A2, A1, A5, A3, A4, A6, A7
   - Dispatch groups: `[A2, A1, A5]`, `[A3]`, `[A4]`, `[A6, A7]`
   - Codex CLI executed: No
4. `agent-task-queue.mjs --list`: showed pending tasks for A1/A2/A5/A3/A4/A6/A7.
5. A1 worker dry-run: worktree check `PASS`; printed `run-agent-task.mjs` dry-run command.
6. A2 worker dry-run: worktree check `PASS`; printed `run-agent-task.mjs` dry-run command.
7. `agent-diagnose-result.mjs` on an unfinished A2 task: `HOLD`.
8. `agent-auto-merge.mjs` on the HOLD task: refused merge.
9. Real Codex CLI execution: No.
10. Real merge / push / DB write / deploy / migration: No.

## 7. Recommendation

Freeze platform expansion after this hardening pass. Resume ERP business delivery using the seven-Agent closed-loop workflow, adding only bug fixes to the platform when real usage exposes a blocker.

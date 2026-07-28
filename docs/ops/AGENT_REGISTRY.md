# Agent Registry

## Purpose

This registry defines the eight capability roles used by Phoenix ERP AI Delivery Factory: Codex-Orchestrator plus A1-A7. Worktree and branch values are templates for discovery and diagnostics, not permanent execution slots.

## Registry

| Agent | Role | Worktree | Branch | Prompt | Parallel Group |
| --- | --- | --- | --- | --- | --- |
| Codex-Orchestrator | 总控、需求理解、任务分发、验收汇总 | `/Users/mac/phoenix-erp-worktrees/codex-orchestrator` | `codex/orchestrator-main-sync-20260701` | `docs/ops/prompts/CODEX_ORCHESTRATOR_SYSTEM_PROMPT.md` | control |
| A1-CI-Runtime-Gate | CI、typecheck、build、startup、post-merge validation | `/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate` | `w5-a1-ci-runtime-gate` | `docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md` | readonly-validation |
| A2-Security-Regression-Gate | RBAC、DataScope、audit、JWT、附件 ACL、日志脱敏、安全回归 | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` | `w5-a2-security-regression-gate` | `docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md` | readonly-validation |
| A3-Backend-Critical-Path | 后端实现、controller/service/module、关键路径 | `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path` | `w5-a3-backend-critical-path` | `docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md` | code-path-exclusive |
| A4-Frontend-UAT-Smoke | A4-Frontend-UIUX-UAT：前端页面开发、UI/UX 优化、样式调整、响应式适配、前端权限可见性、路由菜单显示、UAT smoke | `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke` | `w5-a4-frontend-uat-smoke` | `docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md` | code-path-exclusive |
| A5-Data-Readiness | 主数据、数据基线、灰度数据条件、只读核查 | `/Users/mac/phoenix-erp-worktrees/a5-data-readiness` | `w5-a5-data-readiness` | `docs/ops/prompts/A5_DATA_READINESS_PROMPT.md` | readonly-validation |
| A6-Staging-Deploy-Runbook | staging runbook、环境矩阵、回滚手册、health check | `/Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook` | `w5-a6-staging-deploy-runbook` | `docs/ops/prompts/A6_DEPLOY_RUNBOOK_PROMPT.md` | release-planning |
| A7-Final-QA-Gate | 最终只读验收、GO / GO WITH CONDITIONS / HOLD / ROLLBACK | `/Users/mac/phoenix-erp-worktrees/a7-final-qa-gate` | `w5-a7-final-qa-gate` | `docs/ops/prompts/A7_FINAL_QA_GATE_PROMPT.md` | final-readonly-gate |

Canonical machine-readable config: `docs/ops/AGENT_DISPATCH_MAP.json`.

## Task Workspace Rule

Every routed task is assigned a `task-generation-isolated-v2` workspace under `/Users/mac/phoenix-erp-worktrees/agent-tasks/`. The actual branch and worktree are derived from `task_id + workspace_generation + agent`; no task may execute in the template worktree shown in the registry. A redispatch increments the generation and cannot inherit commits from its predecessor.

## A4 Naming Note

`A4-Frontend-UAT-Smoke` remains the canonical branch and worktree name for compatibility. Its responsibility is upgraded to `A4-Frontend-UIUX-UAT`, covering frontend implementation, UI/UX polish, styling, responsive layout, permission-aware UI, route/menu visibility, and UAT smoke.

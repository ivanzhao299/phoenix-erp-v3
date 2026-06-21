# Agent Task Board

> Purpose: lightweight task board for Delivery Factory coordination. Keep one row per Agent-owned task.

## Status Values

| Status | Meaning |
| --- | --- |
| TODO | Task accepted but not started. |
| dry-run-only | Orchestrator-only simulation; no Agent started and no code changes allowed. |
| intake-drafted | Orchestrator drafted requirement intake and proposal contracts; no Agent started. |
| spec-frozen-draft | Orchestrator froze reviewable spec wording; no Agent started and Schema Gate still pending. |
| IN_PROGRESS | Agent is actively working. |
| BLOCKED | Agent cannot proceed without decision/evidence. |
| REVIEW | Output is ready for review. |
| PASS | Task passed required checks. |
| FAIL | Task failed required checks and remains unresolved. |
| PASS_WITH_CI_CONDITIONS | Local/docs checks passed; CI or external evidence pending. |
| HOLD | Task blocks release. |
| ROLLBACK | Task requires rollback action. |

## Agent Worktrees

| Agent | Path | Branch | Status | Role |
| --- | --- | --- | --- | --- |
| Codex-Orchestrator | `/Users/mac/phoenix-erp-worktrees/codex-orchestrator` | `w5-codex-orchestrator` | active-control | 总控、任务分发、PR 调度、验收汇总 |
| A1-CI-Runtime-Gate | `/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate` | `w5-a1-ci-runtime-gate` | ready-next | 编译、测试、启动、W5 closeout 13 项 CI / Runtime 条件 |
| A2-Security-Regression-Gate | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` | `w5-a2-security-regression-gate` | pending | R0-1 ~ R0-4 安全回归、权限、JWT、SSE、Chanjet、日志脱敏 |
| A3-Backend-Critical-Path | `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path` | `w5-a3-backend-critical-path` | pending | 后端核心路径、登录、菜单、采购入口、财务基础、通知、Chanjet diagnostics |
| A4-Frontend-UAT-Smoke | `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke` | `w5-a4-frontend-uat-smoke` | pending | 前端登录、菜单、页面、权限提示、SSE polling、卡片回归 |
| A5-Data-Readiness | `/Users/mac/phoenix-erp-worktrees/a5-data-readiness` | `w5-a5-data-readiness` | pending | 数据基线、主数据只读核查、孟赛单 site / 直营店单店灰度数据条件 |
| A6-Staging-Deploy-Runbook | `/Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook` | `w5-a6-staging-deploy-runbook` | pending | staging 部署、环境矩阵、发布手册、回滚手册、health check |
| A7-Final-QA-Gate | `/Users/mac/phoenix-erp-worktrees/a7-final-qa-gate` | `w5-a7-final-qa-gate` | pending | 最终只读验收，输出 GO / GO WITH CONDITIONS / HOLD / ROLLBACK |

## Board

| Task ID | Agent | Branch | Status | PR | Risk level | Frozen item touched | Verification result | Blockers | Next step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W5-P0-ADF-00 | Codex-Orchestrator | w5-ai-delivery-factory-setup | IN_PROGRESS | TBD | Low | No | Docs-only setup in progress | None | Complete docs and PR template |
| W5-A1-CI-RUNTIME-GATE | A1-CI-Runtime-Gate | w5-a1-ci-runtime-gate | FAIL | TBD | P0 | No | A1 result: FAIL; use as later go-live repair sample only | Runtime/security blockers remain out of scope for Phase 2 | Do not fix in current task; wait for explicit repair dispatch |
| ADF-P2-NL-DISPATCH-FLOW | Codex-Orchestrator | w5-codex-orchestrator | done | TBD | L1 | No | Natural language dispatch docs completed | None | Use a sample request to dry-run routing |
| ADF-P2-DRYRUN-STORE-PAYMENT-001 | Codex-Orchestrator | w5-codex-orchestrator | dry-run-only | N/A | L5 | No | Output `docs/ops/NL_DISPATCH_DRY_RUN_STORE_PAYMENT_001.md`; Request ID `REQ-STORE-PAYMENT-UNIFIED-CODE-001` | User clarification required before formal spec | 等待用户确认澄清问题后，才允许生成正式 Requirement Spec 与 Agent 任务合同 |
| REQ-STORE-PAYMENT-UNIFIED-CODE-001-INTAKE | Codex-Orchestrator | w5-codex-orchestrator | intake-drafted | N/A | L5 | No | Outputs `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md` and `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_AGENT_CONTRACTS.md` | P0 clarification required; no Agent started | 等待用户回答 P0 澄清问题；未获批准前不得启动 A2-A7 |
| REQ-STORE-PAYMENT-UNIFIED-CODE-001-SPEC-FREEZE | Codex-Orchestrator | w5-codex-orchestrator | spec-frozen-draft | N/A | L5 overall / MVP-1 L4 schema-gated | No | Outputs `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md`, `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_AGENT_CONTRACTS.md`, `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md` | Pilot store and A5 start approval pending | 等待用户指定试点门店，并批准是否启动 A5-Data-Readiness 只读核查。未批准前不得启动任何 Agent |

## Current Ready Task

| Field | Value |
| --- | --- |
| Task ID | W5-A1-CI-RUNTIME-GATE |
| Agent | A1-CI-Runtime-Gate |
| Branch | w5-a1-ci-runtime-gate |
| Path | `/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate` |
| Priority | P0 |
| Status | FAIL |
| Goal | 执行 W5 closeout 13 项 CI / Runtime 条件，确认系统能否编译、测试、启动和通过安全运行时 smoke。 |
| Allowed | CI、测试、启动、最小运行时修复。 |
| Forbidden | migration、schema、业务流程、主数据迁移、生产部署。 |
| Expected Output | `docs/ops/A1_CI_RUNTIME_GATE_REPORT.md` |
| Result | A1 result: FAIL，作为后续上线修复样例，不在本轮处理。 |
| Next Action | 等待用户显式启动 A1 修复或后续自然语言分发样例。 |

## Phase 2 Task

| Field | Value |
| --- | --- |
| Task ID | ADF-P2-NL-DISPATCH-FLOW |
| Agent | Codex-Orchestrator |
| Status | done |
| Goal | 建立自然语言需求自动分发流程 |
| Output | `docs/ops/NATURAL_LANGUAGE_DISPATCH_FLOW.md`; `docs/ops/ORCHESTRATOR_PROMPT.md`; `docs/ops/NATURAL_LANGUAGE_REQUEST_EXAMPLES.md` |
| Frozen items touched | No |
| A1 handling | A1 FAIL is recorded as a future sample and not fixed in this phase. |

## Update Rules

1. Every dispatched task must have an Agent and risk level.
2. `Frozen item touched` must be `No` unless an explicit exception is approved.
3. `PASS_WITH_CI_CONDITIONS` must list the exact pending CI checks.
4. `HOLD` must list owner, blocker, and required decision.
5. Production deploy tasks must remain `HOLD` until `PRODUCTION_GO_NO_GO` records GO or GO WITH CONDITIONS.

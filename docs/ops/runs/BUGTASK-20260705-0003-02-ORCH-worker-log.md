# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260705-0003-02-ORCH |
| Agent | Codex-Orchestrator |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
node scripts/ops/run-agent-task.mjs --agent Codex-Orchestrator --worktree /Users/mac/phoenix-erp-worktrees/codex-orchestrator --prompt docs/ops/prompts/CODEX_ORCHESTRATOR_SYSTEM_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: Codex-Orchestrator
Worktree: /Users/mac/phoenix-erp-worktrees/codex-orchestrator
Branch: codex/orchestrator-main-sync-20260701
Prompt: docs/ops/prompts/CODEX_ORCHESTRATOR_SYSTEM_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-worker-assembled-prompt.md
Assembled prompt chars: 5911
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/codex-orchestrator --sandbox workspace-write -
Codex timeout ms: 180000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-05T14-36-24-657Z-Codex-Orchestrator.md
**Result Report**

Request: `BUG-20260705-0003` / `BUGTASK-20260705-0003`, route `/dashboard`, issue “驾驶舱卡片问题”.

Risk: P2 / MEDIUM. The route likely needs frontend dashboard-card review, but the concrete defect is not diagnosable from local evidence: the referenced screenshot attachment is not present in the worktree, acceptance criteria are empty, and current visual smoke only shows `/dashboard` requires auth.

Agents: `A1-CI-Runtime-Gate` already passed local ops syntax validation. `Codex-Orchestrator` completed dry-run route review only.

Changed files: none by me. Existing dirty file is approved runner-owned runtime state: `docs/ops/agent-queue/tasks.json`.

Verification run:
- `pwd` -> `/Users/mac/phoenix-erp-worktrees/codex-orchestrator`
- branch -> `codex/orchestrator-main-sync-20260701`
- `node --check scripts/ops/run-agent-task.mjs` PASS
- `node --check scripts/ops/agent-worker.mjs` PASS
- `node --check scripts/ops/bug-intake-local-runner.mjs` PASS
- `git diff --name-only` shows only `docs/ops/agent-queue/tasks.json`

Frozen-item statement: no `apps/api/**`, `apps/web/**`, migrations, schema/entity/table/column files, production deploy logic, database state, merge, push, or migration execution touched.

Auto-code decision: HOLD. This orchestrator contract forbids app-code changes, and required visual evidence is missing locally.

Human approval requirement: separate approval and a frontend repair route are required before modifying `apps/web/**`.

Conclusion: **HOLD / PASS WITH CONDITIONS for orchestration only**.

Next step: provide the screenshot/reproduction detail or attach it into the worktree, then route to a frontend repair agent for `/dashboard` with authenticated visual validation plus A1 runtime checks.
Baseline autopilot skipped by caller; caller must run lifecycle hook.

```

## Stderr

```text
2026-07-05T14:35:29.403453Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.codex/plugins/cache/openai-primary-runtime/template-creator/26.630.12135/.codex-plugin/plugin.json
2026-07-05T14:35:29.404617Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.codex/plugins/cache/openai-primary-runtime/template-creator/26.630.12135/.codex-plugin/plugin.json
OpenAI Codex v0.142.5
--------
workdir: /Users/mac/phoenix-erp-worktrees/codex-orchestrator
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: medium
reasoning summaries: none
session id: 019f32b4-accb-7b11-b1b6-fa797bf4a0ff
--------
user
# Base Agent Prompt

# Codex-Orchestrator System Prompt

## Agent Identity

You are `Codex-Orchestrator`, the Phoenix ERP AI Delivery Factory commander.

## Worktree and Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/codex-orchestrator`

Branch: `codex/orchestrator-main-sync-20260701`

## Execution Checks

Run before action:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Stop if the directory or branch is wrong, or if the worktree is not clean unless the user explicitly approves the exact dirty files.

When launched by the local bug-intake runner through `agent-worker.mjs` / `run-agent-task.mjs --allow-ops-runtime-dirty`, runner-owned runtime files are approved dirty files:

- `docs/ops/agent-queue/tasks.json`
- `docs/ops/runs/**`

Any other dirty file still requires HOLD.

## Allowed Scope

`docs/ops/**`, `scripts/ops/**`, and approved orchestration docs/scripts only.

## Forbidden Scope

Do not modify `apps/api/**`, `apps/web/**`, migrations, schema/entity/table/column files, business logic, production deploy logic, or database state.

## Responsibilities

Convert natural language into structured requirements, risk levels, Agent routes, task contracts, acceptance criteria, task board updates, and final GO / GO WITH CONDITIONS / HOLD / ROLLBACK recommendations.

## Output Report Format

Include request, risk, Agents, changed files, verification, frozen-item statement, auto-code decision, human approval requirement, conclusion, and next step.

## Commit Rule

Commit only after checking `git diff --name-only` and `git status --short`. Use the user-provided commit message.

## Failure Rule

Stop immediately on wrong worktree, wrong branch, dirty unexpected files, forbidden path changes, or missing required evidence.

---

# Agent Task Contract

# Bug Repair Agent Contract

Source bug: BUG-20260705-0003
Source repair task: BUGTASK-20260705-0003
Assigned agent: Codex-Orchestrator

## Issue

驾驶舱卡片问题

## Route

/dashboard

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/dashboard",
  "bugNo": "BUG-20260705-0003",
  "route": "/dashboard",
  "title": "驾驶舱卡片问题",
  "taskNo": "BUGTASK-20260705-0003",
  "context": {
    "attachments": [
      {
        "sha256": "81ff1839bff3238bd205113e5716023f2add4c4615eef7532eb6177ac513cc4a",
        "fileName": "01-1783258328672-32c6fb39.png",
        "mimeType": "image/png",
        "sizeBytes": 1072280,
        "originalName": "page-screenshot-2026-07-05T13-31-29-674Z.png",
        "relativePath": "storage/bug-reports/2026/07/05/BUG-20260705-0003/01-1783258328672-32c6fb39.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260705-0003/attachments/01-1783258328672-32c6fb39.png"
      }
    ],
    "clientContext": {
      "language": "en",
      "timezone": "Asia/Shanghai",
      "viewport": {
        "width": 1512,
        "height": 862
      },
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      "capturedAt": "2026-07-05T13:32:08.673Z",
      "devicePixelRatio": 2
    },
    "consoleErrors": [],
    "failedRequests": []
  },
  "priority": "P2",
  "reporter": {
    "name": "赵永伟",
    "roles": [
      "ROLE_ADMIN",
      "ROLE_CEO",
      "ROLE_REGION_MGR"
    ],
    "username": "zhaoyongwei",
    "companyCode": "",
    "projectCode": ""
  },
  "severity": "MEDIUM",
  "agentPlan": {
    "source_bug_no": "BUG-20260705-0003",
    "route_decision": "ROUTE_REVIEW",
    "split_strategy": [
      {
        "agent": "A1-CI-Runtime-Gate",
        "reasons": [
          "required validation after repair"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "Codex-Orchestrator",
        "reasons": [
          "low-confidence route review required"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      }
    ],
    "selected_agents": [
      "A1-CI-Runtime-Gate",
      "Codex-Orchestrator"
    ],
    "hard_constraints": [
      "no automatic production deploy",
      "no automatic DB write",
      "no automatic migration",
      "human approval required before code repair execution"
    ],
    "source_repair_task_no": "BUGTASK-20260705-0003"
  },
  "createdAt": "2026-07-05T13:34:07.517Z",
  "createdBy": "zhaoyongwei",
  "moduleCode": "",
  "suggestedOwner": "",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "",
  "agentPlanGeneratedAt": "2026-07-05T13:34:10.095Z",
  "agentPlanGeneratedBy": "zhaoyongwei",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-05T13:34:19.055Z",
    "approvedBy": "zhaoyongwei",
    "approvalScope": "仅允许按当前 Agent 修复计划写入本地任务队列；不自动部署、不写数据库、不执行 migration。",
    "forbiddenActions": [
      "production deploy without separate approval",
      "database write without separate gate",
      "migration execution without separate gate",
      "push without release approval",
      "force push"
    ]
  }
}
```

---

# Execution Guardrails

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write to any database.
6. Do not modify the task board from inside the Agent task.
7. Stop immediately if the task requires files outside the allowed contract.
8. Stop immediately if migration/schema/entity/table/column changes are needed but not explicitly approved.
9. Report PASS / FAIL / PASS WITH CONDITIONS with exact evidence.

2026-07-05T14:35:29.630188Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime/plugins/template-creator/.codex-plugin/plugin.json
2026-07-05T14:35:29.660781Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/mac/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json
2026-07-05T14:35:29.673120Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.673130Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.673748Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.673754Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.674029Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.674033Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.674314Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.674318Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.674590Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.674593Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.675188Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:29.675194Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:30.710670Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.codex/plugins/cache/openai-primary-runtime/template-creator/26.630.12135/.codex-plugin/plugin.json
2026-07-05T14:35:30.711574Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.codex/plugins/cache/openai-primary-runtime/template-creator/26.630.12135/.codex-plugin/plugin.json
2026-07-05T14:35:30.817591Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/mac/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json
2026-07-05T14:35:30.819133Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/mac/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json
2026-07-05T14:35:31.467122Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime/plugins/template-creator/.codex-plugin/plugin.json
2026-07-05T14:35:31.474039Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/mac/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json
2026-07-05T14:35:31.488203Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.488226Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.488872Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.488881Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.489225Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.489233Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.489573Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.489581Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.489923Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.489928Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.490623Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-05T14:35:31.490627Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
codex
I’ll run the required preflight first and only continue if the worktree, branch, and dirty files match the orchestrator contract.
exec
/bin/zsh -lc pwd in /Users/mac/phoenix-erp-worktrees/codex-orchestrator
exec
/bin/zsh -lc 'git branch --show-current' in /Users/mac/phoenix-erp-worktrees/codex-orchestrator
 succeeded in 0ms:
/Users/mac/phoenix-erp-worktrees/codex-orchestrator

 succeeded in 0ms:
codex/orchestrator-main-sync-20260701

exec
/bin/zsh -lc 'git log --oneline --decorate -8' in /Users/mac/phoenix-erp-worktrees/codex-orchestrator
 succeeded in 0ms:
1c7527cc (HEAD -> codex/orchestrator-main-sync-20260701) fix(ops): skip baseline merge for bug route review
d2b6a557 docs(ops): record bug intake runner artifacts
dfdb71da docs(ops): record generated ops artifacts
cd0c5319 fix(ops): commit bug runner artifacts in active worktree
d9abe5cc fix(ops): persist bug runner artifacts between workers
8ea15b68 fix(ops): run bug intake A1 validation locally
15d72b95 fix(ops): prevent validation agents from blocking bug runner merges
1ea74943 fix(ops): add timeout guard for bug runner agents

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/codex-orchestrator
 succeeded in 0ms:
 M docs/ops/agent-queue/tasks.json

2026-07-05T14:35:37.670018Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime/plugins/template-creator/.codex-plugin/plugin.json
2026-07-05T14:35:37.675630Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/mac/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json
codex
Preflight is acceptable: correct directory and branch, with only `docs/ops/agent-queue/tasks.json` dirty, which is runner-owned and explicitly approved in the prompt. I’m staying in diagnosis/orchestration scope and will not touch the task board, app code, database, migrations, deploy, or push.
exec
/bin/zsh -lc 'rg --files docs/ops scripts/ops | head -200' in /Users/mac/phoenix-erp-worktrees/codex-orchestrator
 succeeded in 0ms:
scripts/ops/audit-sys-dict-duplicates.mjs
scripts/ops/agent-finalize.mjs
scripts/ops/chanjet-finance-semantic-map.mjs
scripts/ops/agent-task-queue.mjs
scripts/ops/chanjet-cash-balance-field-lock-audit.mjs
scripts/ops/agent-baseline-autopilot.mjs
scripts/ops/agent-evolution-planner.mjs
scripts/ops/chanjet-field-mapping-report.mjs
scripts/ops/chanjet-receipt-payment-lock-audit.mjs
scripts/ops/normalize-agent-result.mjs
scripts/ops/agent-route-request.mjs
scripts/ops/chanjet-master-data-alignment-audit.mjs
scripts/ops/chanjet-finance-alignment-audit.mjs
scripts/ops/agent-orchestrator.mjs
scripts/ops/chanjet-finance-card-authority-qa.mjs
scripts/ops/role-business-smoke.mjs
scripts/ops/install-bug-intake-local-runner-launchagent.mjs
scripts/ops/execute-approved-follow-up.mjs
scripts/ops/browser-visual-smoke.mjs
scripts/ops/agent-release-state-machine.mjs
scripts/ops/repair-role-permission-matrix.mjs
scripts/ops/bug-intake-sync-from-api.mjs
scripts/ops/authenticated-business-smoke.mjs
scripts/ops/alert-human-reachability-smoke.mjs
scripts/ops/decide-next-agent.mjs
scripts/ops/mint-production-admin-token-over-ssh.mjs
scripts/ops/agent-diagnose-result.mjs
scripts/ops/plan-next-agent.mjs
scripts/ops/agent-sync-and-merge.mjs
scripts/ops/dispatch-follow-up-plan.mjs
scripts/ops/agent-doctor.mjs
scripts/ops/bug-intake-local-runner.mjs
scripts/ops/parse-agent-result.mjs
scripts/ops/chanjet-readonly-mirror-sync.mjs
scripts/ops/backup-runner.sh
scripts/ops/agent-auto-merge.mjs
scripts/ops/restore-runner.sh
scripts/ops/agent-inbox-runner.mjs
scripts/ops/merge-agent-to-main.mjs
scripts/ops/chanjet-finance-card-semantic-expansion-audit.mjs
scripts/ops/audit-role-permission-matrix.mjs
scripts/ops/agent-acceptance-drill.mjs
scripts/ops/runtime-smoke-check.mjs
scripts/ops/agent-worker.mjs
scripts/ops/bug-agent-result-to-report.mjs
scripts/ops/chanjet-finance-card-source-switch-audit.mjs
scripts/ops/chanjet-reconciliation-center-audit.mjs
scripts/ops/agent-observer.mjs
scripts/ops/agent-goal-to-queue.mjs
scripts/ops/audit-dedupe-sys-dict.mjs
scripts/ops/product-page-smoke.mjs
scripts/ops/update-task-board-from-result.mjs
scripts/ops/chanjet-finance-card-semantic-review-audit.mjs
scripts/ops/chanjet-finance-card-system-confirmation-audit.mjs
scripts/ops/bug-task-to-agent-queue.mjs
scripts/ops/run-agent-task.mjs
docs/ops/STORE_PAYMENT_STAGING_CONTROLLED_PILOT_DEPLOY_REPORT.md
docs/ops/PRODUCTION_READINESS_P1_005_STORE_PAYMENT_REMOTE_SMOKE_REFRESH_REPORT.md
docs/ops/SALES_BFF_GENERIC_RBAC_ATOMICITY_REMEDIATION_20260627.md
docs/ops/A6_STORE_PAYMENT_STAGING_DEPLOY_RUNBOOK.md
docs/ops/APPROVAL_HISTORY_SCOPE_REMEDIATION_20260627.md
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md
docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_PREP_REPORT.md
docs/ops/PRODUCTION_READINESS_P1_001_UNRESOLVED_UPLOADS_REVIEW_PACKAGE.md
docs/ops/TENCENT_TEST_ISSUE_FIX_REPORT_20260705.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_ROADMAP.md
docs/ops/PRODUCTION_READINESS_UPLOAD_RESPONSE_COMPAT_FIX_REPORT.md
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md
docs/ops/STAGING_TARGET_DERIVATION_FROM_SERVER_CARD.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_METADATA_CLAIM_DRY_RUN_REPORT.md
docs/ops/CHANJET_FIELD_MAPPING_PHASE2_REPORT_20260703.md
docs/ops/RBAC_PASSWORD_ROLE_CONFLICT_AND_SYS_DICT_DUPLICATE_REVIEW_20260703.md
docs/ops/CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING_REPORT_20260704.md
docs/ops/A3_STORE_PAYMENT_APP_MODULE_WIRING_REPORT.md
docs/ops/AI_DELIVERY_PHASE5_1_NL_TO_CODEX_CLI_REVIEW.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_ACTION_BIT_COMPATIBILITY_PLAN.md
docs/ops/AGENT_ROUTER_V1_REVIEW.md
docs/ops/ENVIRONMENT_MATRIX.md
docs/ops/RBAC_FRONTEND_GATE_ALIGNMENT_BATCH_20260626.md
docs/ops/RBAC_PARENT_PERMISSION_CLEARANCE_AUDIT_20260627.md
docs/ops/CHANJET_P3_FINANCE_CARD_DIFF_VISUAL_QA_REPORT_20260704.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R1_MIGRATION_STATE_AUDIT_REPORT.md
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_TEST_PLAN.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R1_SCHEMA_REPAIR_SEQUENCE_PLAN.md
docs/ops/QUALITY_AND_MOBILE_DASHBOARD_ATOMIC_PERMISSION_REMEDIATION_20260627.md
docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md
docs/ops/PRODUCTION_READINESS_P1_005_STORE_PAYMENT_REMOTE_SMOKE_REPORT.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MASTER_DATA_DIAGNOSIS_REPORT.md
docs/ops/A3_STORE_PAYMENT_PROTECTED_STREAMING_GATE_REPORT.md
docs/ops/CHANJET_HANDSHAKE_TOKEN_HEALTH_CHECK_20260703.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R4_INITIAL_DATA_IMPORT_REPAIR_PLAN.md
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md
docs/ops/MULTI_AGENT_PARALLEL_CLOSED_LOOP_RUNBOOK.md
docs/ops/AI_DELIVERY_PHASE3_1_SPEC_FREEZE_REVIEW.md
docs/ops/STORE_PAYMENT_PROTECTED_ATTACHMENT_PLAN.md
docs/ops/SERVER_CARD_STAGING_TARGET_INTAKE_REPORT.md
docs/ops/PROCUREMENT_CONTRACT_OCR_AUTOFILL_PLAN.md
docs/ops/AGENT_ROUTING_RULES.md
docs/ops/PROCUREMENT_PAYMENT_PROJECT_LOOKUP_FALLBACK_20260626.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_DEPLOY_CHAIN_HARDENING_REVIEW.md
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md
docs/ops/PRODUCTION_DEPLOY_CHAIN_HARDENING_DRY_RUN_REPORT.md
docs/ops/CHANJET_FINANCE_NUMBER_ALIGNMENT_GATE_REPORT_20260704.md
docs/ops/PROCUREMENT_DATASCOPE_WRITE_REMEDIATION_20260626.md
docs/ops/PRODUCTION_READINESS_RESCORE_AND_BOOST_PLAN_20260702.md
docs/ops/NEXT_AGENT_DECISION_ENGINE.md
docs/ops/LOOKUP_AND_ORG_DATASCOPE_ATOMICITY_REMEDIATION_20260627.md
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_STATE_MACHINE.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R1_MIGRATION_REPAIR_PLAN.md
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md
docs/ops/AGENT_AUTONOMOUS_BASELINE_LIFECYCLE.md
docs/ops/CHANJET_P0_READONLY_FINANCE_ADAPTER_GATE_REPORT_20260704.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R1_REMOTE_CODE_ALIGNMENT_PRECHECK.md
docs/ops/PROCUREMENT_RBAC_ATOMIC_REQUIREMENU_REMEDIATION_20260625.md
docs/ops/AUTOMATED_WORKTREE_SYNC_AND_SAFE_MERGE.md
docs/ops/CHANJET_FINANCE_CARD_ALIGNMENT_P1_REPORT_20260704.md
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_RUNTIME_SMOKE.md
docs/ops/I18N_FULL_DELIVERY_PLAN_20260702.md
docs/ops/PRODUCTION_LEGACY_UPLOAD_RUNTIME_VERIFICATION_PLAN.md
docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_PACKAGE.md
docs/ops/CHANJET_P3_RECONCILIATION_CENTER_AUDIT_REPORT_20260704.md
docs/ops/REQ-NL-20260622-194339-STORE-PAYMENT-MODULE-APPMODULE-WIRING-CI-A2-A1-M_A2-Security-Regression-Gate_REPORT.md
docs/ops/LOOKUP_SHAREHOLDER_SELECTOR_DATASCOPE_REMEDIATION_20260626.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_A7_STAGE_SUMMARY_GATE.md
docs/ops/CHANJET_P3_FINANCE_CARD_SEMANTIC_REVIEW_REPORT_20260704.md
docs/ops/agent-inbox/SHORT_COMMAND_EXAMPLES.md
docs/ops/agent-inbox/APPROVALS.md
docs/ops/agent-inbox/README.md
docs/ops/agent-inbox/OUTBOX.md
docs/ops/agent-inbox/USER_INTENT.md
docs/ops/agent-inbox/INBOX_SCHEMA.md
docs/ops/AGENT_RELEASE_STATE_MACHINE.md
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_DATA_MODEL_DRAFT.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R1_STORE_PAYMENT_SCHEMA_DRIFT_PRECHECK.md
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_DATASCOPE.md
docs/ops/AGENT_ROUTER_SPEC.md
docs/ops/AGENT_PLATFORM_V2_A5_ROUTING_FIX_REVIEW.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_UPLOADS_FILE_SECURITY_REMEDIATION_PLAN.md
docs/ops/AGENT_ROUTER_RULES.json
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260702_PG_ALERTS_RBAC.md
docs/ops/RELEASE_RUNBOOK.md
docs/ops/WORKFLOW_APPROVAL_ACTION_UX_REMEDIATION_20260626.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_BACKLOG.md
docs/ops/AGENT_PLATFORM_V2_CLOSED_LOOP_DELIVERY.md
docs/ops/PRODUCTION_READINESS_P0_004_LEGACY_UPLOAD_LOCAL_COMPAT_FIX_REPORT.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_REPORT.md
docs/ops/STORE_PAYMENT_S1_APP_001_MIGRATION_EXECUTION_REPORT.md
docs/ops/CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK_REPORT_20260704.md
docs/ops/STORE_PAYMENT_READINESS_A1_A2_A5_APPROVED_EXECUTION_REPORT.md
docs/ops/PRODUCTION_DEPLOY_CHAIN_HARDENING_PLAN.md
docs/ops/PROCUREMENT_MATERIAL_QUICK_CREATE_REMEDIATION_20260626.md
docs/ops/FINANCE_CASH_ATOMIC_PERMISSION_REMEDIATION_20260627.md
docs/ops/CHANJET_CASH_BALANCE_FIELD_LOCK_REPORT_20260705.md
docs/ops/MASTER_DATA_PENDING_ATOMIC_VISIBILITY_REMEDIATION_20260627.md
docs/ops/A2_STORE_PAYMENT_PILOT_GATE_S1_REVIEW.md
docs/ops/AI_DELIVERY_IMPLEMENTATION_PLAN_STORE_PAYMENT_001_REVIEW.md
docs/ops/CHANJET_RECEIPT_PAYMENT_DATE_STATUS_LOCK_CONTINUE_REPORT_20260705.md
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_MONITORING_UAT_PAGES.md
docs/ops/PERMISSION_SET_ROUTE_DEDUP_REMEDIATION_20260627.md
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260702_ALERT_HUMAN_REACHABILITY.md
docs/ops/CHANJET_FULL_READONLY_SYNC_AND_ALIGNMENT_P0_REPORT.md
docs/ops/AI_DELIVERY_PHASE6_ONE_COMMAND_ORCHESTRATOR_REVIEW.md
docs/ops/POST_DEPLOY_5USER_SMOKE_CHECKLIST_20260627.md
docs/ops/STORE_PAYMENT_BUSINESS_CLOSED_LOOP_READY_REPORT.md
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_BACKEND_S2_TASK_PACKAGE.md
docs/ops/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS_A1-CI-Runtime-Gate_REPORT.md
docs/ops/ROLE_PERMISSION_MATRIX_REPAIR_DRY_RUN_20260627.md
docs/ops/MASTER_DATA_CROSS_DOMAIN_TAB_PERMISSION_REMEDIATION_20260627.md
docs/ops/PRODUCTION_READINESS_P0_004_LEGACY_UPLOAD_RUNTIME_VERIFICATION_REPORT.md
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_FRONTEND_DRAFT.md
docs/ops/runtime-memory/NEXT_ACTIONS.md
docs/ops/runtime-memory/DECISION_LOG.md
docs/ops/runtime-memory/CODEX_ORCHESTRATOR_MEMORY.md
docs/ops/runtime-memory/GUARDRAILS.md
docs/ops/runtime-memory/PROJECT_STATE.json
docs/ops/runtime-memory/STORE_PAYMENT_STATE.md
docs/ops/STORE_PAYMENT_STAGING_BUSINESS_UAT_GUIDE.md
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_UNRESOLVED_UPLOADS_OWNER_DIAGNOSIS_REPORT.md
docs/ops/MASTER_DATA_AGGREGATE_API_ATOMIC_PERMISSION_REMEDIATION_20260627.md
docs/ops/RBAC_MENU_VISIBILITY_ATOMICITY_AUDIT_20260625.md
docs/ops/USER_LIFECYCLE_FREEZE_ARCHIVE_RESTORE_REVIEW_20260703.md
docs/ops/PRODUCTION_READINESS_P0_001_INITIAL_DATA_REFRESH_REPORT.md
docs/ops/AI_DELIVERY_PHASE2_NL_DISPATCH_REVIEW.md
docs/ops/NATURAL_LANGUAGE_DISPATCH_FLOW.md
docs/ops/A3_BACKEND_S2_STORE_PAYMENT_001_REPORT.md
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md
docs/ops/WORKFLOW_BIZ_REGISTRY_ATOMIC_MODULE_REMEDIATION_20260627.md
docs/ops/SHAREHOLDER_DATASCOPE_HARDCODE_REMEDIATION_20260626.md
docs/ops/PROCUREMENT_PAYMENT_PROJECT_SELECTOR_FIX_20260626.md
docs/ops/ROLE_PERMISSION_MATRIX_ATOMICITY_APPLY_20260627.md
docs/ops/A1_STORE_PAYMENT_PILOT_GATE_S1_VALIDATION.md
docs/ops/MASTER_DATA_HUB_ATOMIC_PERMISSION_REMEDIATION_20260627.md
docs/ops/PRODUCTION_READINESS_P1_002_ACTION_BIT_CLEANUP_EXECUTION_PACKAGE.md
docs/ops/AGENT_PLATFORM_V2_95_FINAL_READINESS_REPORT.md
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260702_BROWSER_VISUAL_SMOKE.md
docs/ops/CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REPORT_20260704.md
docs/ops/AGENT_PLATFORM_V2_HARDENING_REVIEW.md
docs/ops/AGENT_TASK_CONTRACT.md
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260702_ALERT_SOURCE_COVERAGE_GATE.md
docs/ops/CHANJET_FINANCE_ALIGNMENT_AUDIT_P2_REPORT_20260704.md

exec
/bin/zsh -lc 'rg -n "BUG-20260705-0003|BUGTASK-20260705-0003|驾驶舱卡片|dashboard" docs/ops scripts/ops' in /Users/mac/phoenix-erp-worktrees/codex-orchestrator
 succeeded in 0ms:
docs/ops/CHANJET_P3_RECONCILIATION_CENTER_AUDIT_REPORT_20260704.md:42:| 利润表关键项 | NEED_MAPPING | Income statement rows: 3, amountSum: 0 | Map revenue/cost/expense/profit rows before dashboard display. |
scripts/ops/browser-visual-smoke.mjs:25:  { name: 'dashboard', route: '/dashboard', mustContain: ['系统仪表盘'], authOk: true },
docs/ops/I18N_CLEANUP_REPORT_20260704.md:15:1. Added the 19 missing runtime translation keys used by dashboard, user archive, role picker, and mobile notification pages.
scripts/ops/repair-role-permission-matrix.mjs:22:  ['MENU_PRC2_DASHBOARD', '采购看板', 'PRC', 'MENU_PRC2_MASTER', 58, 'LayoutDashboard', '/procurement2/dashboard'],
docs/ops/RBAC_FRONTEND_GATE_ALIGNMENT_BATCH_20260626.md:25:### 2. Admin dashboard quick navigation now hides unauthorized module entries
docs/ops/RBAC_FRONTEND_GATE_ALIGNMENT_BATCH_20260626.md:27:File: `apps/web/src/app/(admin)/dashboard/page.tsx`
docs/ops/RBAC_FRONTEND_GATE_ALIGNMENT_BATCH_20260626.md:29:Before this batch, the dashboard quick navigation rendered static module cards, which could expose entries the user could not actually access.
docs/ops/RBAC_FRONTEND_GATE_ALIGNMENT_BATCH_20260626.md:33:- Page-level access now uses `MENU_DASHBOARD:V`, with finance fallback to `/finance2` when the user has finance access but not dashboard access.
docs/ops/TENCENT_TEST_ISSUE_FIX_REPORT_20260705.md:23:| 3 | Warehouse dashboard | Menu visible but page reports insufficient permission. | Frontend sidebar already hides child menus without permission; remaining risk is old shortcut/deep-link access. | Verified code path. No child menu should be displayed without permission. Deep-link still returns 403 by design. |
docs/ops/QUALITY_AND_MOBILE_DASHBOARD_ATOMIC_PERMISSION_REMEDIATION_20260627.md:5:This batch removes remaining legacy quality and logistics permission fallbacks from the mobile dashboard and quality API controller.
docs/ops/QUALITY_AND_MOBILE_DASHBOARD_ATOMIC_PERMISSION_REMEDIATION_20260627.md:15:- `apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`
docs/ops/QUALITY_AND_MOBILE_DASHBOARD_ATOMIC_PERMISSION_REMEDIATION_20260627.md:20:  - Added regression checks to block legacy `MENU_QA` and `MENU_LOGISTICS` in the mobile dashboard.
scripts/ops/authenticated-business-smoke.mjs:43:  { name: 'finance:dashboard', path: '/api/v2/finance/dashboard', expect: [200, 403] },
docs/ops/CHANJET_FINANCE_NUMBER_ALIGNMENT_GATE_REPORT_20260704.md:9:Move Phoenix ERP finance dashboard numbers toward Chanjet-first financial authority. The immediate production-safe target is to align AP/AR financial cards with Chanjet readonly mirror data whenever available, while preserving ERP operational detail tables and avoiding any Chanjet write-back.
docs/ops/CHANJET_FINANCE_NUMBER_ALIGNMENT_GATE_REPORT_20260704.md:24:- Added fail-soft behavior: if Chanjet mirror tables are unavailable in an environment, the dashboard falls back to ERP and exposes coverage as incomplete rather than throwing 500.
docs/ops/CHANJET_FINANCE_NUMBER_ALIGNMENT_GATE_REPORT_20260704.md:57:Chanjet AP/AR statistics are aggregate financial balances. ERP invoice/payment tables are operational detail sources. This gate aligns dashboard display and comparison logic to Chanjet authority where Chanjet has data, but does not overwrite ERP detail records. This avoids losing operational fields such as due date, approval state, attachment, data-scope owner, and workflow status.
scripts/ops/runtime-smoke-check.mjs:53:    route: '/dashboard',
scripts/ops/runtime-smoke-check.mjs:54:    file: 'apps/web/src/app/(admin)/dashboard/page.tsx',
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260702_PG_ALERTS_RBAC.md:23:- `apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts`
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_DATASCOPE.md:17:- dashboard counters and monthly spend now apply the same store scope used by existing request/order lists
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_DATASCOPE.md:23:- outbound dashboard counts
scripts/ops/product-page-smoke.mjs:34:    name: 'dashboard',
scripts/ops/product-page-smoke.mjs:35:    route: '/dashboard',
scripts/ops/product-page-smoke.mjs:36:    file: 'apps/web/src/app/(admin)/dashboard/page.tsx',
docs/ops/PRODUCTION_READINESS_RESCORE_AND_BOOST_PLAN_20260702.md:48:| Frontend / Performance / i18n | 68 / 76 | **80** | B | Web tsc PASS; i18n key parity PASS; runtime smoke covers dashboard, health, alerts, UAT, mobile device, procurement payment, and protected upload probes. | UX/style fixes remain issue-driven; no Playwright visual regression baseline; authenticated business-flow smoke is not yet broad enough; user-reported page polish issues still appear. |
docs/ops/PRODUCTION_READINESS_RESCORE_AND_BOOST_PLAN_20260702.md:154:- Playwright screenshot smoke for dashboard aggregation cards, system monitor, alert center, UAT readiness, inventory turnover, device monitor, procurement payment/material/OCR, approval center, shareholder funds.
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_RUNTIME_SMOKE.md:48:- `/dashboard` has a static page gate for the system dashboard entry.
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_RUNTIME_SMOKE.md:75:4. Extend runtime smoke to procurement order OCR, approval action modal, mobile reimbursement upload, and finance dashboard.
docs/ops/CHANJET_FULL_READONLY_SYNC_AND_ALIGNMENT_P0_REPORT.md:45:- Updated finance dashboard card labels so users can see whether a number is:
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260702_BROWSER_VISUAL_SMOKE.md:7:Add a real browser-level smoke gate for the pages that have repeatedly produced visual or runtime issues in screenshots: dashboard aggregate cards, system monitor, system alerts, UAT readiness, inventory turnover, IoT device monitor, procurement payment/order pages, approval todo, shareholder capital, and mobile operational surfaces.
docs/ops/runtime-memory/NEXT_ACTIONS.md:323:   - Align ERP financial dashboard/card figures to Chanjet readonly mirror口径.
docs/ops/PRODUCTION_SERVER_REMEDIATION_BACKLOG.md:47:| P3-001 | Improve public health remediation dashboard | ops | API health is available | Better visibility | Add docs/runbook for recurring checks | false | false | false | false | A1 | 19 | proposed |
docs/ops/FINANCE_CASH_ATOMIC_PERMISSION_REMEDIATION_20260627.md:15:- dashboard finance shortcut
docs/ops/FINANCE_CASH_ATOMIC_PERMISSION_REMEDIATION_20260627.md:38:- `apps/web/src/app/(admin)/dashboard/page.tsx`
docs/ops/runtime-memory/DECISION_LOG.md:1412:- Cash balance, today receipt, and today payment remain ERP-primary because using Chanjet mirrored list totals or unproven zero amounts would recreate the bad dashboard-number problem.
docs/ops/MASTER_DATA_FRONTEND_ATOMIC_PERMISSION_REMEDIATION_20260627.md:11:- Governance and data-quality dashboards now require `MENU_MD_QUALITY`.
docs/ops/ROLE_BUSINESS_SMOKE_MATRIX.json:37:        { "name": "finance:dashboard", "path": "/api/v2/finance/dashboard", "allowed_status": [200, 403] },
docs/ops/QUALITY_MOBILE_MENU_REGISTRY_REMEDIATION_20260627.md:14:  - Used by the mobile delivery API and mobile dashboard visibility.
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_2_20260627.md:9:- Procurement dashboard backend gates.
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_2_20260627.md:10:- Finance dashboard backend gates.
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_2_20260627.md:41:- Procurement dashboard removed `MENU_PRC2` parent fallback.
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_2_20260627.md:42:- Finance dashboard removed `MENU_FIN2` parent fallback.
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_2_20260627.md:74:- Procurement dashboard using `MENU_PRC2` as fallback.
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_2_20260627.md:75:- Finance dashboard using `MENU_FIN2` as fallback.
docs/ops/SHAREHOLDER_DATASCOPE_HARDCODE_REMEDIATION_20260626.md:19:In addition, `GET /api/shareholders/projects` and `GET /api/shareholders/projects/:projectCode` did not pass the current user into service-level scope filtering, so a user with shareholder view permission could receive the full project list even if dashboard and capital endpoints were scoped.
docs/ops/SHAREHOLDER_DATASCOPE_HARDCODE_REMEDIATION_20260626.md:48:- Project list, project detail, equity, contribution, dashboard, capital, beneficial-equity, and finance bridge now share the same project-scope basis.
docs/ops/RBAC_MENU_VISIBILITY_ATOMICITY_AUDIT_20260625.md:67:- Procurement dashboard: `MENU_PRC2_DASHBOARD`, fallback `MENU_PRC2`
docs/ops/MOBILE_DASHBOARD_SALES_PERMISSION_ATOMICITY_REMEDIATION_20260627.md:9:`apps/web/src/app/(mobile)/mobile/dashboard/page.tsx` 的销售 KPI 加载条件曾包含：
docs/ops/MOBILE_DASHBOARD_SALES_PERMISSION_ATOMICITY_REMEDIATION_20260627.md:30:3. `scripts/ci/check-menu-permission-atomicity.mjs` 增加门禁，禁止移动端 dashboard 回退到 `MENU_SALES2` 父码。
docs/ops/PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md:97:| PRD-P2-005 | P2 | Production health dashboard plan | Production remediation backlog | A6, A1 | `APPROVE_PRODUCTION_HEALTH_DASHBOARD_PLAN` | Proposed | Define dashboard checks for app health, DB health, migration state, queue health, auth/security smoke, and file exposure smoke. |
docs/ops/DASHBOARD_STOCK_KPI_SOURCE_FIX_20260703.md:18:后端 `/api/dashboard/kpi` 的数值来源是真实库存唯一台账：
docs/ops/DASHBOARD_STOCK_KPI_SOURCE_FIX_20260703.md:52:- `apps/web/src/app/(admin)/dashboard/_components/DashboardKPIs.tsx`
docs/ops/MOBILE_DELIVERY_SCOPE_GATE_REMEDIATION_20260626.md:10:- `apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`
docs/ops/MOBILE_DELIVERY_SCOPE_GATE_REMEDIATION_20260626.md:19:2. Mobile daily dashboard delivery section now recognizes `MENU_MOBILE_DELIVERY:V` in addition to sales/logistics menu entries.
docs/ops/CHANJET_P0_READONLY_SYNC_GAPS_EXECUTION_REPORT_20260704.md:88:1. Replace ERP finance dashboard/card figures with Chanjet-backed口径 where Chanjet is the authority.
docs/ops/MASTER_DATA_AGGREGATE_API_ATOMIC_PERMISSION_REMEDIATION_20260627.md:31:Users who only hold the coarse parent `MENU_MASTER_DATA` will no longer access master-data aggregate dashboards. They must be granted `MENU_MD_CENTER` or `MENU_MD_QUALITY` as appropriate.
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_NEXT.md:114:   - BFF dashboard
docs/ops/PRODUCTION_STANDARD_RESCORE_AND_HARDENING_PLAN_20260701.md:187:1. Add Playwright smoke for dashboard, system health, alerts, UAT, procurement order/payment, shareholder funds, mobile device, approval center.
docs/ops/PRODUCTION_STANDARD_RESCORE_AND_HARDENING_PLAN_20260701.md:204:### P2-2: Observability dashboard cleanup
docs/ops/PRODUCTION_STANDARD_RESCORE_AND_HARDENING_PLAN_20260701.md:208:- Convert system dashboard/health/alerts pages from placeholder-looking cards into actionable operator views.
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:54:本批消除 WMS 高频页面的前端角色硬编码残留，使前端操作门禁与动态菜单权限矩阵对齐。后续仍需继续审计移动端 dashboard、终端页和老页面中的角色硬编码展示逻辑。
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_20260626.md:5:This batch continues the global RBAC/menu-gate cleanup for high-risk entrances. The goal is to stop exposing child menus, cockpit cards, and dashboard APIs through coarse parent permissions, while keeping limited backend transition fallbacks where old role grants may still exist.
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_20260626.md:43:- `apps/web/src/app/(admin)/dashboard/page.tsx`
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_20260626.md:74:- `apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts`
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_20260626.md:75:  - Procurement dashboard endpoints now prefer `MENU_PRC2_DASHBOARD:V`.
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_20260626.md:81:    - dashboard: `MENU_PRC2_DASHBOARD:V`
docs/ops/ATOMIC_PERMISSION_ALIGNMENT_BATCH_20260626.md:90:  - Finance dashboard now prefers `MENU_FIN2_DASHBOARD:V`.
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_CONTROLLER_GATES.md:7:Close the next P0/P1 production-readiness item from the audit backlog: sensitive API controllers must not rely on login-only access when they expose user, procurement, dashboard, audit, pricing, wholesale, packaging terminal, or data quality operations.
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_CONTROLLER_GATES.md:13:   - dashboard: `MENU_DASHBOARD:V`
docs/ops/agent-queue/tasks.json:1818:    "task_id": "BUGTASK-20260705-0003-01-A1",
docs/ops/agent-queue/tasks.json:1819:    "request_id": "BUGTASK-20260705-0003",
docs/ops/agent-queue/tasks.json:1820:    "title": "Repair BUG-20260705-0003: 驾驶舱卡片问题 (A1-CI-Runtime-Gate)",
docs/ops/agent-queue/tasks.json:1821:    "source_bug_no": "BUG-20260705-0003",
docs/ops/agent-queue/tasks.json:1822:    "source_repair_task_no": "BUGTASK-20260705-0003",
docs/ops/agent-queue/tasks.json:1840:    "contract_file": "docs/ops/runs/BUGTASK-20260705-0003-01-A1-contract.md",
docs/ops/agent-queue/tasks.json:1848:    "result_file": "docs/ops/runs/BUGTASK-20260705-0003-01-A1-worker-log.md",
docs/ops/agent-queue/tasks.json:1864:    "task_id": "BUGTASK-20260705-0003-02-ORCH",
docs/ops/agent-queue/tasks.json:1865:    "request_id": "BUGTASK-20260705-0003",
docs/ops/agent-queue/tasks.json:1866:    "title": "Repair BUG-20260705-0003: 驾驶舱卡片问题 (Codex-Orchestrator)",
docs/ops/agent-queue/tasks.json:1867:    "source_bug_no": "BUG-20260705-0003",
docs/ops/agent-queue/tasks.json:1868:    "source_repair_task_no": "BUGTASK-20260705-0003",
docs/ops/agent-queue/tasks.json:1885:    "contract_file": "docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md",
docs/ops/CHANJET_P3_FIELD_SEMANTIC_LOCK_IMPLEMENTATION_REPORT_20260704.md:53:4. Fields that require manual finance confirmation before impacting dashboards.
docs/ops/WORKFLOW_RBAC_ATOMIC_PERMISSION_REMEDIATION_20260625.md:17:| `MENU_WORKFLOW_METRICS` | Approval health/metrics dashboards | `V/X` |
docs/ops/WORKFLOW_RBAC_ATOMIC_PERMISSION_REMEDIATION_20260625.md:34:| Workflow auditor/manager | History + metrics, using `MENU_WORKFLOW_METRICS:X` for dashboards |
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:7:Tighten the frontend navigation gate so users do not see unauthorized parent menus, unauthorized child menus, or dashboard shortcut entries that lead to no-permission pages.
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:11:Some users saw left-menu or dashboard entries that were not usable for their actual permission set. The visible entry then led to a no-permission page, an old workflow path, or a 404-like navigation result.
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:15:- Procurement shortcut could point to `/procurement2/dashboard` even when the user only had a procurement child permission.
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:16:- Some center dashboard cards were rendered without checking the same menu code used by the sidebar.
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:24:- dashboard quick links
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:46:- Procurement center shortcut no longer hard-codes `/procurement2/dashboard` when the user lacks that child permission.
docs/ops/PRODUCTION_95_AUTONOMOUS_CLEANUP_QUEUE.md:26:| P1 | PROD95-UI-PRODUCT-POLISH | Browser-driven UI cleanup for dashboard, health, alerts, UAT, inventory, IoT | A4/A1 | screenshot before/after evidence | pending |
docs/ops/MOBILE_PERMISSION_MENU_MATRIX_REMEDIATION_20260627.md:39:- dashboard
docs/ops/MOBILE_DEVICE_ALERT_PERMISSION_ALIGNMENT_20260627.md:5:Remove a frontend permission drift where the mobile dashboard showed device alert content to users with broad farm permissions or legacy `MENU_IOT`, while backend device endpoints are now guarded by atomic `MENU_DEVICE_MONITOR`.
docs/ops/MOBILE_DEVICE_ALERT_PERMISSION_ALIGNMENT_20260627.md:9:- `apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`
docs/ops/MOBILE_DEVICE_ALERT_PERMISSION_ALIGNMENT_20260627.md:11:  - The mobile dashboard no longer fetches or displays device alerts solely because a user has `MENU_FARM_DATA` or legacy `MENU_IOT`.
docs/ops/MOBILE_DEVICE_ALERT_PERMISSION_ALIGNMENT_20260627.md:18:Users without device monitoring authority will not see device alert cards or trigger alert API requests from the mobile dashboard. Users with `MENU_DEVICE_MONITOR:V` keep normal device alert visibility.
docs/ops/MOBILE_DEVICE_ALERT_PERMISSION_ALIGNMENT_20260627.md:31:GO WITH CONDITIONS. This closes one frontend source of "visible but unauthorized" menu/card exposure in the mobile dashboard.
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260702_AUTH_VISUAL_SMOKE_FOUNDATION.md:34:  - finance dashboard/shareholder summary,
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260702_AUTH_VISUAL_SMOKE_FOUNDATION.md:56:- `/dashboard`
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_RBAC_ATOMICITY.md:156:   - Make `/uat`, `/system-monitor`, alert center, dashboard cards, mobile device monitor, approval center, procurement payment project selector, and upload flows part of repeatable smoke checks.
docs/ops/RBAC_EXTERNAL_INTERFACE_REMEDIATION_BATCH_20260626.md:8:2. Mobile daily dashboard module visibility still used hard-coded role arrays.
docs/ops/RBAC_EXTERNAL_INTERFACE_REMEDIATION_BATCH_20260626.md:23:### Mobile dashboard atom gate
docs/ops/RBAC_EXTERNAL_INTERFACE_REMEDIATION_BATCH_20260626.md:25:File: `apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`
docs/ops/RBAC_EXTERNAL_INTERFACE_REMEDIATION_BATCH_20260626.md:27:- Removed hard-coded role arrays for dashboard sections.
docs/ops/RBAC_EXTERNAL_INTERFACE_REMEDIATION_BATCH_20260626.md:36:- This avoids leaking mobile dashboard sub-sections by role-name assumptions.
docs/ops/RBAC_EXTERNAL_INTERFACE_REMEDIATION_BATCH_20260626.md:62:- Users without atom permissions should no longer see historical initialization actions or mobile dashboard sub-sections by accidental role matches.
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:3:Source bug: BUG-20260705-0003
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:4:Source repair task: BUGTASK-20260705-0003
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:9:驾驶舱卡片问题
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:13:/dashboard
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:27:  "url": "https://erp.eggslao.com/dashboard",
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:28:  "bugNo": "BUG-20260705-0003",
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:29:  "route": "/dashboard",
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:30:  "title": "驾驶舱卡片问题",
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:31:  "taskNo": "BUGTASK-20260705-0003",
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:40:        "relativePath": "storage/bug-reports/2026/07/05/BUG-20260705-0003/01-1783258328672-32c6fb39.png",
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:41:        "previewEndpoint": "/api/bug-intake/reports/BUG-20260705-0003/attachments/01-1783258328672-32c6fb39.png"
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:72:    "source_bug_no": "BUG-20260705-0003",
docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-contract.md:102:    "source_repair_task_no": "BUGTASK-20260705-0003"
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625.md:34:  - inbound dashboard
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_HOME_PERMISSION_ENTRY.md:11:The operation workbench hero CTA still selected some target pages primarily from role strings. A user whose role name looked like procurement could be sent to the procurement dashboard even when their effective menu permissions only allowed a more specific procurement page.
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_HOME_PERMISSION_ENTRY.md:17:  - procurement dashboard
docs/ops/RBAC_FRONTEND_MENU_GATE_REMEDIATION_20260626.md:5:Close the gap where a user could see a parent center, dashboard card, or shortcut but land on a child page that the role cannot actually use.
docs/ops/RBAC_FRONTEND_MENU_GATE_REMEDIATION_20260626.md:11:3. A user with a broad procurement permission could see "采购中心" and be sent to `/procurement2/dashboard`, even when the actual first permitted procurement leaf was a different page.
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_DASHBOARD_KPI_SEMANTICS.md:5:Scope: system dashboard KPI aggregation and presentation
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_DASHBOARD_KPI_SEMANTICS.md:9:Fix the confusing system dashboard aggregate cards reported from production screenshots. The page should clearly explain what each card means, avoid mixed units, and avoid presenting empty operational data as broken UI.
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_DASHBOARD_KPI_SEMANTICS.md:32:- Added dashboard `meta` fields for frontend explanation:
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_DASHBOARD_KPI_SEMANTICS.md:40:File: `apps/web/src/app/(admin)/dashboard/_components/DashboardKPIs.tsx`
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_DASHBOARD_KPI_SEMANTICS.md:61:| Business code changed | Yes, approved dashboard BFF/UI cleanup |
docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_DASHBOARD_KPI_SEMANTICS.md:69:The system dashboard aggregate cards now have clearer business meaning. The remaining production-grade improvement is to align the dashboard data model with a formal KPI catalog and add authenticated visual smoke coverage for dashboard cards.
docs/ops/runs/a1-runtime-security-remediation-20260624/api-jest-result.json:1:{"numFailedTestSuites":0,"numFailedTests":0,"numPassedTestSuites":5,"numPassedTests":52,"numPendingTestSuites":0,"numPendingTests":0,"numRuntimeErrorTestSuites":0,"numTodoTests":0,"numTotalTestSuites":5,"numTotalTests":52,"openHandles":[],"snapshot":{"added":0,"didUpdate":false,"failure":false,"filesAdded":0,"filesRemoved":0,"filesRemovedList":[],"filesUnmatched":0,"filesUpdated":0,"matched":0,"total":0,"unchecked":0,"uncheckedKeysByFile":[],"unmatched":0,"updated":0},"startTime":1782285837047,"success":true,"testResults":[{"assertionResults":[{"ancestorTitles":["permissions-resolver","parseCodes"],"duration":1,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver parseCodes returns empty Set for null/empty","invocations":1,"location":null,"numPassingAsserts":4,"retryReasons":[],"startAt":1782285838231,"status":"passed","title":"returns empty Set for null/empty"},{"ancestorTitles":["permissions-resolver","parseCodes"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver parseCodes expands \"*\" to all 6 codes V/C/E/D/A/X","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838232,"status":"passed","title":"expands \"*\" to all 6 codes V/C/E/D/A/X"},{"ancestorTitles":["permissions-resolver","parseCodes"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver parseCodes parses comma-separated codes with whitespace","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838232,"status":"passed","title":"parses comma-separated codes with whitespace"},{"ancestorTitles":["permissions-resolver","parseCodes"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver parseCodes uppercases lowercase input","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838232,"status":"passed","title":"uppercases lowercase input"},{"ancestorTitles":["permissions-resolver","parseCodes"],"duration":1,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver parseCodes ignores invalid codes silently","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838232,"status":"passed","title":"ignores invalid codes silently"},{"ancestorTitles":["permissions-resolver","formatCodes"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver formatCodes returns codes in fixed order V/C/E/D/A/X","invocations":1,"location":null,"numPassingAsserts":2,"retryReasons":[],"startAt":1782285838233,"status":"passed","title":"returns codes in fixed order V/C/E/D/A/X"},{"ancestorTitles":["permissions-resolver","formatCodes"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver formatCodes returns empty string for empty set","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838233,"status":"passed","title":"returns empty string for empty set"},{"ancestorTitles":["permissions-resolver","resolvePermissions — basic"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — basic returns empty array for no sources","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838233,"status":"passed","title":"returns empty array for no sources"},{"ancestorTitles":["permissions-resolver","resolvePermissions — basic"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — basic single source single menu — passthrough","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838233,"status":"passed","title":"single source single menu — passthrough"},{"ancestorTitles":["permissions-resolver","resolvePermissions — basic"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — basic skips menus that end with empty grants","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838233,"status":"passed","title":"skips menus that end with empty grants"},{"ancestorTitles":["permissions-resolver","resolvePermissions — multi-source union"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — multi-source union two sources same menu union grants","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838233,"status":"passed","title":"two sources same menu union grants"},{"ancestorTitles":["permissions-resolver","resolvePermissions — multi-source union"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — multi-source union multiple menus listed separately","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838233,"status":"passed","title":"multiple menus listed separately"},{"ancestorTitles":["permissions-resolver","resolvePermissions — multi-source union"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — multi-source union wildcard * union","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838234,"status":"passed","title":"wildcard * union"},{"ancestorTitles":["permissions-resolver","resolvePermissions — DENY overrides GRANT"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — DENY overrides GRANT deny E removes E even if multiple sources grant it","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838234,"status":"passed","title":"deny E removes E even if multiple sources grant it"},{"ancestorTitles":["permissions-resolver","resolvePermissions — DENY overrides GRANT"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — DENY overrides GRANT deny * wipes all grants on that menu","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838234,"status":"passed","title":"deny * wipes all grants on that menu"},{"ancestorTitles":["permissions-resolver","resolvePermissions — DENY overrides GRANT"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — DENY overrides GRANT deny on one menu does not affect another","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838234,"status":"passed","title":"deny on one menu does not affect another"},{"ancestorTitles":["permissions-resolver","resolvePermissions — DENY overrides GRANT"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — DENY overrides GRANT deny without grant is no-op","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838234,"status":"passed","title":"deny without grant is no-op"},{"ancestorTitles":["permissions-resolver","resolvePermissions — priority ordering"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — priority ordering higher approval_level processed first (but final result still respects DENY)","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838234,"status":"passed","title":"higher approval_level processed first (but final result still respects DENY)"},{"ancestorTitles":["permissions-resolver","resolvePermissions — priority ordering"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — priority ordering approval_level decides order of processing, not outcome semantics","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838234,"status":"passed","title":"approval_level decides order of processing, not outcome semantics"},{"ancestorTitles":["permissions-resolver","resolvePermissions — 4-layer model integration"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — 4-layer model integration merges role + role_set + user_set sources","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838234,"status":"passed","title":"merges role + role_set + user_set sources"},{"ancestorTitles":["permissions-resolver","resolvePermissions — 4-layer model integration"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — 4-layer model integration user_set DENY 也能覆盖 role grant","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838234,"status":"passed","title":"user_set DENY 也能覆盖 role grant"},{"ancestorTitles":["permissions-resolver","resolvePermissions — RACI red-line scenarios"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"permissions-resolver resolvePermissions — RACI red-line scenarios 某用户同时持 MENU_ORDER_MGR + MENU_FIN_AUDIT（红线 BLOCK）会在 perms 里都出现","invocations":1,"location":null,"numPassingAsserts":2,"retryReasons":[],"startAt":1782285838234,"status":"passed","title":"某用户同时持 MENU_ORDER_MGR + MENU_FIN_AUDIT（红线 BLOCK）会在 perms 里都出现"}],"endTime":1782285838235,"message":"","name":"/Users/mac/phoenix-erp-worktrees/codex-orchestrator/apps/api/src/auth/permissions-resolver.spec.ts","startTime":1782285837176,"status":"passed","summary":""},{"assertionResults":[{"ancestorTitles":["InventoryService"],"duration":4,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"InventoryService atomicDecrement rejects qty <= 0","invocations":1,"location":null,"numPassingAsserts":2,"retryReasons":[],"startAt":1782285838447,"status":"passed","title":"atomicDecrement rejects qty <= 0"},{"ancestorTitles":["InventoryService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"InventoryService atomicDecrement throws when balance not found","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838451,"status":"passed","title":"atomicDecrement throws when balance not found"},{"ancestorTitles":["InventoryService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"InventoryService atomicDecrement blocks when available qty insufficient","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838452,"status":"passed","title":"atomicDecrement blocks when available qty insufficient"},{"ancestorTitles":["InventoryService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"InventoryService atomicDecrement deducts and writes ledger on success","invocations":1,"location":null,"numPassingAsserts":2,"retryReasons":[],"startAt":1782285838452,"status":"passed","title":"atomicDecrement deducts and writes ledger on success"},{"ancestorTitles":["InventoryService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"InventoryService atomicDecrement converts OptimisticLockVersionMismatchError to BadRequest","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838452,"status":"passed","title":"atomicDecrement converts OptimisticLockVersionMismatchError to BadRequest"}],"endTime":1782285838452,"message":"","name":"/Users/mac/phoenix-erp-worktrees/codex-orchestrator/apps/api/src/modules/wms/inventory/inventory.service.spec.ts","startTime":1782285838239,"status":"passed","summary":""},{"assertionResults":[{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService createPurchaseOrder generates po_no + applies LAK currency on amount > 50000","invocations":1,"location":null,"numPassingAsserts":4,"retryReasons":[],"startAt":1782285838527,"status":"passed","title":"createPurchaseOrder generates po_no + applies LAK currency on amount > 50000"},{"ancestorTitles":["ProcurementService"],"duration":1,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService createPurchaseOrder defaults currency to CNY on amount <= 50000","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838527,"status":"passed","title":"createPurchaseOrder defaults currency to CNY on amount <= 50000"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService createPurchaseOrder honors explicit currency_code override","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838528,"status":"passed","title":"createPurchaseOrder honors explicit currency_code override"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService createPurchaseOrder sets contract_no in HT-YYYY-NNNNN format","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838528,"status":"passed","title":"createPurchaseOrder sets contract_no in HT-YYYY-NNNNN format"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService isGlobalUser returns true when storeCode is ALL","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838528,"status":"passed","title":"isGlobalUser returns true when storeCode is ALL"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService isGlobalUser returns false when storeCode is a specific farm code","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838528,"status":"passed","title":"isGlobalUser returns false when storeCode is a specific farm code"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService getOrders calls query without store_code filter for global users","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838528,"status":"passed","title":"getOrders calls query without store_code filter for global users"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService getOrders adds store_code filter for farm-scoped users","invocations":1,"location":null,"numPassingAsserts":2,"retryReasons":[],"startAt":1782285838528,"status":"passed","title":"getOrders adds store_code filter for farm-scoped users"},{"ancestorTitles":["ProcurementService"],"duration":1,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService getPurchaseRequests returns empty array on DB error","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838528,"status":"passed","title":"getPurchaseRequests returns empty array on DB error"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService getPurchaseRequests passes store_code param for non-global users","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838529,"status":"passed","title":"getPurchaseRequests passes store_code param for non-global users"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService createPurchaseRequest inserts record and returns req_no","invocations":1,"location":null,"numPassingAsserts":4,"retryReasons":[],"startAt":1782285838529,"status":"passed","title":"createPurchaseRequest inserts record and returns req_no"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService rejectRequest updates status to REJECTED","invocations":1,"location":null,"numPassingAsserts":4,"retryReasons":[],"startAt":1782285838529,"status":"passed","title":"rejectRequest updates status to REJECTED"},{"ancestorTitles":["ProcurementService"],"duration":6,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService convertRequestToPO throws BadRequestException if request not found","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838529,"status":"passed","title":"convertRequestToPO throws BadRequestException if request not found"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService convertRequestToPO throws if request status is not PENDING","invocations":1,"location":null,"numPassingAsserts":1,"retryReasons":[],"startAt":1782285838535,"status":"passed","title":"convertRequestToPO throws if request status is not PENDING"},{"ancestorTitles":["ProcurementService"],"duration":1,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService convertRequestToPO creates PO and marks request CONVERTED","invocations":1,"location":null,"numPassingAsserts":3,"retryReasons":[],"startAt":1782285838535,"status":"passed","title":"convertRequestToPO creates PO and marks request CONVERTED"},{"ancestorTitles":["ProcurementService"],"duration":0,"failing":false,"failureDetails":[],"failureMessages":[],"fullName":"ProcurementService BadRequestException is the expected error class
```

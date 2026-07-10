# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260705-0001-02-A4 |
| Agent | A4-Frontend-UAT-Smoke |
| Dry run | No |
| Exit code | 0 |
| Evidence gate | HOLD |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A4-Frontend-UAT-Smoke --worktree /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke --prompt docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260705-0001-02-A4-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260705-0001-02-A4-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A4-Frontend-UAT-Smoke
Worktree: /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
Branch: w5-a4-frontend-uat-smoke
Prompt: docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260705-0001-02-A4-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260705-0001-02-A4-worker-assembled-prompt.md
Assembled prompt chars: 11222
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-10T04-43-09-049Z-A4-Frontend-UAT-Smoke.md
Baseline autopilot skipped by caller; caller must run lifecycle hook.

```

## Stderr

```text
OpenAI Codex v0.142.5
--------
workdir: /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: high
reasoning summaries: none
session id: 019f4a55-ca8c-7d00-ad41-e6aac317517f
--------
user
# Base Agent Prompt

# A4 Frontend Task Prompt

## Agent Identity

You are `A4-Frontend-UIUX-UAT`.

The canonical branch/worktree name remains `A4-Frontend-UAT-Smoke` for compatibility, but your responsibility is expanded to frontend implementation, UI/UX polish, styling, responsive layout, permission-aware UI, and UAT smoke.

## Worktree And Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`

Branch: `w5-a4-frontend-uat-smoke`

## Responsibility

You own:

1. frontend page development;
2. UI/UX optimization;
3. style adjustment;
4. form, list, detail page, modal, drawer, and filter area polish;
5. button, menu, tag, status color, icon, spacing, and layout improvements;
6. PC and mobile responsive adaptation;
7. frontend permission visibility;
8. frontend routes and menu display;
9. frontend UAT smoke validation.

## Execution Checks

Run before work:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Stop if directory, branch, or worktree cleanliness is invalid.

## Allowed Scope

1. `apps/web/**`
2. `docs/ops/**`

## Forbidden Scope

1. `apps/api/**`
2. migrations
3. schema/entity/table/column changes
4. deployment scripts or production deploy logic
5. database writes
6. permission bypass or hidden security shortcuts

## Required Output Report

Write a report under `docs/ops/**` containing:

1. changed file list;
2. page/component list;
3. UI/UX adjustment summary;
4. permission visibility notes;
5. responsive behavior notes;
6. UAT smoke result;
7. whether A2 security review is required;
8. whether A1 validation is required;
9. blockers and next recommendation.

## Commit Rule

Commit only approved frontend files and the required report.

## Failure Rule

Stop on backend dependency missing, forbidden scope, unverified UI path, unexpected dirty files, permission ambiguity, migration need, DB write need, or deployment requirement.

## Hard Boundaries

1. Do not deploy.
2. Do not execute migrations.
3. Do not write databases.
4. Do not modify backend code.
5. Do not modify schema/entity/table/column.

---

# Agent Task Contract

# Bug Repair Agent Contract

Source bug: BUG-20260705-0001
Source repair task: BUGTASK-20260705-0001
Assigned agent: A4-Frontend-UAT-Smoke

## Issue

验收试运行里面试运行项目页面奇丑无比

## Route

/pilot-run

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/pilot-run",
  "bugNo": "BUG-20260705-0001",
  "route": "/pilot-run",
  "title": "验收试运行里面试运行项目页面奇丑无比",
  "taskNo": "BUGTASK-20260705-0001",
  "context": {
    "attachments": [],
    "clientContext": {
      "language": "zh-CN",
      "timezone": "Asia/Shanghai",
      "viewport": {
        "width": 1526,
        "height": 956
      },
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0",
      "capturedAt": "2026-07-05T07:48:56.765Z",
      "devicePixelRatio": 1
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
    "source_bug_no": "BUG-20260705-0001",
    "route_decision": "PLAN_READY",
    "split_strategy": [
      {
        "agent": "A3-Backend-Critical-Path",
        "reasons": [
          "failure classification PG_SQL"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A4-Frontend-UAT-Smoke",
        "reasons": [
          "frontend/UI route or wording matched"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A5-Data-Readiness",
        "reasons": [
          "data readiness/master data signal matched"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A1-CI-Runtime-Gate",
        "reasons": [
          "failure classification PG_SQL",
          "required validation after repair"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      }
    ],
    "selected_agents": [
      "A3-Backend-Critical-Path",
      "A4-Frontend-UAT-Smoke",
      "A5-Data-Readiness",
      "A1-CI-Runtime-Gate"
    ],
    "failure_category": "PG_SQL",
    "hard_constraints": [
      "no automatic production deploy",
      "no automatic DB write",
      "no automatic migration",
      "human approval required before code repair execution"
    ],
    "route_confidence": 0.92,
    "source_repair_task_no": "BUGTASK-20260705-0001"
  },
  "createdAt": "2026-07-05T07:49:14.177Z",
  "createdBy": "zhaoyongwei",
  "moduleCode": "",
  "agentResults": [
    {
      "agent": "Codex-Orchestrator",
      "taskId": "BUGTASK-20260705-0001-ORCH",
      "summary": "Pilot-run page queue blocker reconciled into the current bug-intake clearance batch. No DB write or migration was performed.",
      "commitHash": "cc80f59762ff279cf2d65b4fca2a69c25a2aa25e",
      "conclusion": "PASS_WITH_CONDITIONS",
      "nextAction": "Business user verifies /pilot-run in production; reopen with a new bug report if still reproducible.",
      "recordedAt": "2026-07-07T20:26:01.838Z",
      "recordedBy": "bug_intake_runner",
      "resultFile": "docs/ops/BUG_INTAKE_QUEUE_CLEARANCE_20260707_REPORT.md",
      "changedFiles": [],
      "validationResults": {
        "dbWrite": "NO",
        "i18nGate": "PASS",
        "migration": "NO",
        "apiTypecheck": "PASS",
        "webTypecheck": "PASS",
        "w5CloseoutGate": "PASS",
        "productionDeploy": "PASS"
      }
    }
  ],
  "suggestedOwner": "",
  "redispatchCount": 1,
  "timeoutRecovery": {},
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "latestAgentResult": {
    "agent": "Codex-Orchestrator",
    "taskId": "BUGTASK-20260705-0001-ORCH",
    "summary": "Pilot-run page queue blocker reconciled into the current bug-intake clearance batch. No DB write or migration was performed.",
    "commitHash": "cc80f59762ff279cf2d65b4fca2a69c25a2aa25e",
    "conclusion": "PASS_WITH_CONDITIONS",
    "nextAction": "Business user verifies /pilot-run in production; reopen with a new bug report if still reproducible.",
    "recordedAt": "2026-07-07T20:26:01.838Z",
    "recordedBy": "bug_intake_runner",
    "resultFile": "docs/ops/BUG_INTAKE_QUEUE_CLEARANCE_20260707_REPORT.md",
    "changedFiles": [],
    "validationResults": {
      "dbWrite": "NO",
      "i18nGate": "PASS",
      "migration": "NO",
      "apiTypecheck": "PASS",
      "webTypecheck": "PASS",
      "w5CloseoutGate": "PASS",
      "productionDeploy": "PASS"
    }
  },
  "redispatchHistory": [
    {
      "mode": "REPLAN_AND_REQUEUE",
      "note": "Re-dispatch after strict-evidence workflow hardening. Require owned business diff, task report, commit, A1 validation, CI/CD, production smoke, then business UAT before RESOLVED.",
      "redispatchNo": 1,
      "approvalScope": "User approved strict-evidence repair of reconciled false completions. Business code only within generated Agent contract; no migration, DB write, force push, or direct deploy outside CI/CD.",
      "previousStatus": "IN_PROGRESS",
      "redispatchedAt": "2026-07-10T04:38:18.222Z",
      "redispatchedBy": "bug_intake_runner",
      "selectedAgents": [
        "A3-Backend-Critical-Path",
        "A4-Frontend-UAT-Smoke",
        "A5-Data-Readiness",
        "A1-CI-Runtime-Gate"
      ],
      "previousRepairTaskStatus": "HOLD"
    }
  ],
  "acceptanceCriteria": "",
  "agentPlanGeneratedAt": "2026-07-10T04:38:18.222Z",
  "agentPlanGeneratedBy": "redispatch:bug_intake_runner",
  "failureClassification": {
    "category": "PG_SQL",
    "evidence": [
      "数据库/PG/SQL 信号"
    ],
    "priority": "P1",
    "severity": "HIGH",
    "confidence": 0.92,
    "suggestedFix": "定位 SQL/ORM 查询并补充类型、别名、字段或迁移门禁验证。",
    "autoFixEligible": true,
    "recommendedAgents": [
      "A3-Backend-Critical-Path",
      "A1-CI-Runtime-Gate"
    ],
    "requiresHumanGate": true,
    "ownerRecommendation": "A3-Backend-Critical-Path"
  },
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-10T04:38:18.222Z",
    "approvedBy": "bug_intake_runner",
    "redispatch": true,
    "approvalScope": "User approved strict-evidence repair of reconciled false completions. Business code only within generated Agent contract; no migration, DB write, force push, or direct deploy outside CI/CD.",
    "redispatchCount": 1,
    "forbiddenActions": [
      "production deploy without separate approval",
      "database write without separate gate",
      "migration execution without separate gate",
      "push without release approval",
      "force push"
    ]
  },
  "evidenceReconciliation": {
    "reason": "legacy AGENT_COMPLETED did not prove implementation commit, acceptance validation, CI/CD, and production smoke",
    "reconciledAt": "2026-07-10T03:29:30.485Z",
    "reconciledBy": "bug_intake_runner",
    "previousStatus": "IN_PROGRESS",
    "previousRepairTaskStatus": "AGENT_COMPLETED"
  },
  "failureClassificationUpdatedAt": "2026-07-10T04:38:18.222Z",
  "previousAgentResultsBeforeRedispatch": [
    {
      "agent": "Codex-Orchestrator",
      "taskId": "BUGTASK-20260705-0001-ORCH",
      "summary": "Pilot-run page queue blocker reconciled into the current bug-intake clearance batch. No DB write or migration was performed.",
      "commitHash": "cc80f59762ff279cf2d65b4fca2a69c25a2aa25e",
      "conclusion": "PASS_WITH_CONDITIONS",
      "nextAction": "Business user verifies /pilot-run in production; reopen with a new bug report if still reproducible.",
      "recordedAt": "2026-07-07T20:26:01.838Z",
      "recordedBy": "bug_intake_runner",
      "resultFile": "docs/ops/BUG_INTAKE_QUEUE_CLEARANCE_20260707_REPORT.md",
      "changedFiles": [],
      "validationResults": {
        "dbWrite": "NO",
        "i18nGate": "PASS",
        "migration": "NO",
        "apiTypecheck": "PASS",
        "webTypecheck": "PASS",
        "w5CloseoutGate": "PASS",
        "productionDeploy": "PASS"
      }
    }
  ]
}
```

## Local Evidence

- No local attachment downloaded. If screenshot evidence is required, HOLD and request evidence sync.

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

codex
I’ll do the required preflight first and stop if the worktree or branch is not in the contracted state.
exec
/bin/zsh -lc pwd in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke

exec
/bin/zsh -lc 'git branch --show-current' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
w5-a4-frontend-uat-smoke

exec
/bin/zsh -lc 'git log --oneline --decorate -8' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
c564cf36 (HEAD -> w5-a4-frontend-uat-smoke, w5-a3-backend-critical-path, main) docs(ops): record baseline lifecycle report
c1c7bbad fix(api): repair pilot-run backend scope
138ae04d docs(ops): record baseline lifecycle report
acc8001f fix(web): repair BUG-20260710-0002
52ee0be6 docs(ops): record bug 20260710 0001 a4 redispatch verification
c8440b27 docs(ops): record baseline lifecycle report
49c1342f fix(api): repair BUG-20260710-0002
417bf155 docs(ops): record baseline lifecycle report

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
codex
Preflight is valid: correct worktree, correct branch, and a clean status. I’m locating the `/pilot-run` implementation and its styling surface before touching files.
exec
/bin/zsh -lc "find apps/web -maxdepth 3 -type f \\( -name 'package.json' -o -name 'tsconfig.json' -o -name 'next.config.*' \\)" in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
apps/web/.next/package.json
apps/web/.next/build/package.json
apps/web/package.json
apps/web/tsconfig.json
apps/web/next.config.ts

exec
/bin/zsh -lc "rg --files apps/web | rg 'pilot|Pilot|uat|trial|run'" in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
apps/web/src/components/uat/FeedbackWidget.tsx
apps/web/src/app/(admin)/workflow/forms/runtime/page.tsx
apps/web/public/runtime-design-system.css
apps/web/src/app/(admin)/pilot-run/page.tsx
apps/web/src/app/(admin)/uat/page.tsx

exec
/bin/zsh -lc 'rg -n "pilot-run|PilotRun|试运行|验收试运行|pilot" apps/web docs/ops' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
docs/ops/RBAC_SETTINGS_AND_MENU_GATE_REMEDIATION_20260626.md:149:3. Review role matrix for Wang Lejin and other pilot users.
docs/ops/PROCUREMENT_DATASCOPE_WRITE_REMEDIATION_20260626.md:134:- Some legacy/global roles may still see broad menus if role permissions are intentionally broad; the next batch should run targeted role matrix audit against pilot users.
docs/ops/PROCUREMENT_DATASCOPE_WRITE_REMEDIATION_20260626.md:138:1. Role matrix pilot audit for Wang Lejin and high-frequency procurement/finance users.
docs/ops/STORE_PAYMENT_CONTROLLED_PILOT_RELEASE_DECISION.md:9:Store Payment is allowed to enter controlled pilot readiness and may request a staging deployment approval Gate.
docs/ops/STORE_PAYMENT_CONTROLLED_PILOT_RELEASE_DECISION.md:24:The controlled pilot is limited to:
docs/ops/STORE_PAYMENT_CONTROLLED_PILOT_RELEASE_DECISION.md:83:7. Approve business pilot users for UAT.
docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_PACKAGE.md:19:1. Store Payment controlled pilot is allowed with conditions.
docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_PACKAGE.md:31:The controlled pilot is limited to:
docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_PACKAGE.md:106:| 10 | Controlled pilot business UAT | L3 | A4 + A5 + A2 + A1 | Yes | No |
docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_PACKAGE.md:121:| Business UAT | Pause pilot, disable menu/roles/accounts, preserve evidence |
docs/ops/STORE_PAYMENT_STAGING_CONTROLLED_PILOT_DEPLOY_REPORT.md:130:6. corresponding pilot role grants only.
docs/ops/PRODUCTION_READINESS_P1_005_STORE_PAYMENT_REMOTE_SMOKE_REFRESH_REPORT.md:9:Refresh the Store Payment remote readiness smoke after `PRD-P0-001` inserted three disabled/inactive pilot account placeholders.
docs/ops/REQ-NL-20260622-194339-STORE-PAYMENT-MODULE-APPMODULE-WIRING-CI-A2-A1-M_A2-Security-Regression-Gate_REPORT.md:64:Required remediation: register approved menu codes, grant only approved pilot roles, and smoke-test unprivileged 403 plus privileged in-scope access.
docs/ops/A6_STORE_PAYMENT_STAGING_DEPLOY_RUNBOOK.md:37:Prepare a controlled staging deployment path for the Store Payment pilot so a later approved Gate can validate the Laos direct-store unified collection workflow in a staging environment before any production GO decision.
docs/ops/A6_STORE_PAYMENT_STAGING_DEPLOY_RUNBOOK.md:112:3. Store Payment fast-track pilot execution commit.
docs/ops/A6_STORE_PAYMENT_STAGING_DEPLOY_RUNBOOK.md:344:8. Return to disabled state: disable Store Payment accounts and block new payment record creation if pilot must pause.
docs/ops/bug-20260708-0006-a3-backend-critical-path.md:11:1. Restore `PB-MENGSE-2026-STD` / `孟赛标准价格册（试运行版）`.
docs/ops/bug-20260708-0006-a3-backend-critical-path.md:12:2. Delete the empty duplicate draft `PB-20260708-00001` / `孟赛标准价格册（试运行版）重建`, if it still has no details.
docs/ops/bug-20260708-0006-a3-backend-critical-path.md:42:  - First row: `PB-20260708-00001`, name `孟赛标准价格册（试运行版）重建`, status `草稿`.
docs/ops/bug-20260708-0006-a3-backend-critical-path.md:43:  - Second row: `PB-MENGSE-2026-STD`, name `孟赛标准价格册（试运行版）`, status `已取消`.
docs/ops/bug-20260708-0006-a3-backend-critical-path.md:44:- Historical pilot launch report records `PB-MENGSE-2026-STD` as the intended `ACTIVE` price book for `2026-05-30 ~ 2026-12-31`.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_PLAN.md:7:Prepare a repair plan for remote Store Payment menu, role, permission, DataScope, and pilot user scope readiness. This document is a plan only. It does not authorize DB writes.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_PLAN.md:15:5. Generate a dry-run pilot user organization/store-scope script.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_PLAN.md:47:Target pilot matrix:
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_PLAN.md:65:Target pilot scope:
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_PLAN.md:72:Do not reuse pilot users with `PILOT-MS`, `STORE-MS-01`, or unrelated store codes for Vientiane UAT unless the user explicitly maps them.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_PLAN.md:76:Current code uses `allowedSiteCodes` as the Store Payment store-scope source. Repair dry-run should add or validate `sys_data_scopes` rows for the Store Payment modules and role codes, then confirm login tokens / permission resolver materialize the expected `allowedSiteCodes` for pilot users.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_PLAN.md:97:5. Read `sys_user_orgs` for pilot users.
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:21:The user approved fast-track pilot execution in the local/dev `phoenix_erp` database only.
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:28:4. `STORE-VTE-001` as canonical pilot store code.
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:30:6. Store Payment pilot payment-account placeholder initialization.
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:75:- Enabled pilot payment accounts: `0`.
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:139:The runtime previously showed some endpoints using `C` / `A` action bits. This fast-track execution followed the user-approved `V/E/X` pilot matrix. A2 should re-check exact runtime action-bit compatibility before broad UAT.
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:145:Canonical pilot store code:
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:168:Compatibility policy for the pilot:
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:172:3. A3/DataScope implementation must normalize or explicitly map `ST-VTE-001 -> STORE-VTE-001` for Store Payment access checks if pilot users still carry `ST-VTE-001`.
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:216:| Canonical pilot store | PASS, `STORE-VTE-001` |
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:222:A5 HOLD can be lifted for schema/menu/role/account-placeholder readiness, but pilot operation remains conditional on account activation, DataScope alias handling, and protected attachment implementation.
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:264:| DB written | Yes, local `phoenix_erp` only, approved Store Payment pilot scope |
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md:295:Store Payment is now ready to enter the next implementation gates in the local pilot environment, with conditions:
docs/ops/A4_STORE_PAYMENT_PROTECTED_PREVIEW_DOWNLOAD_UI_DRAFT_REPORT.md:145:- W5 closeout gate: to be run again by Baseline Autopilot after commit/merge.
docs/ops/agent-inbox/OUTBOX.md:59:baseline autopilot will run after agent completion
docs/ops/PRODUCTION_SERVER_REMEDIATION_ROADMAP.md:75:3. Verify pilot account placeholders.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:58:| `docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md` | Prior A5 baseline | Previous A5 already marked pilot store/company/users/account/QR/menu/attachment items pending or partial. |
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:82:rg --files docs/ops docs apps/api/src apps/web/src | rg "(store|payment|pay|readiness|ops|gray|grey|pilot|master-data|data-readiness)"
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:125:| Store Payment service uses scoped data assumptions | PASS WITH CONDITIONS | Service filters non-admin/non-finance users by `allowedSiteCodes` plus `user.storeCode`; pilot must prove the selected store code appears in that namespace. |
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:134:| Pilot store row | UNKNOWN / BLOCKER | Must verify exact `mst_stores.store_code` and matching org/site namespace for the chosen pilot store. |
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:138:| Role grants | UNKNOWN / BLOCKER | Need DB proof that pilot roles have only approved V/C/E/A permissions. |
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:139:| Collection account/code | UNKNOWN / BLOCKER | S1 has no seed; finance/admin must have at least one active company collection account for the pilot store before record creation. |
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:141:| Currency data | UNKNOWN / CONDITION | Need active currency proof for pilot currencies. |
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:146:1. **DB read-only proof is missing.** Local `psql` access was blocked by `Operation not permitted`, so A5 cannot verify actual table presence, seed state, pilot store rows, role grants, or menu rows.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:148:3. **Pilot store and store-code namespace are not proven.** Store Payment service uses `store_code` and runtime scope uses `allowedSiteCodes`/`user.storeCode`; these must match exactly for the pilot store.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:151:6. **Protected attachment access remains incomplete for pilot UI.** Backend rejects raw URLs, but proof/QR preview/download readiness is still conditional per A2.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:155:1. Select the exact single pilot store and canonical code to use for Store Payment pilot.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:156:2. Confirm whether store scope may use `DataScope.allowedSiteCodes` as the pilot transition model, or require a dedicated store-scope model before pilot.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:157:3. Confirm final company mapping for the pilot store.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:160:6. Approve how the first pilot collection account/code and protected QR/proof attachment references will be created in a separate allowed data-prep flow.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:162:8. Decide whether clerk visibility is own-store or own-record-only before pilot exposure.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:166:**HOLD for Store Payment pilot data readiness.**
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:171:2. The selected pilot store exists and its company/scope mapping is unambiguous.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md:173:4. At least one active pilot collection account/code exists with matching store/company/currency/payment method.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A2-Security-Regression-Gate_REPORT.md:21:Read-only Store Payment pilot readiness review for RBAC, DataScope/store scope, JWT/session guard path, attachment ACL, audit/log redaction, status transitions, SSE/WebSocket exposure, third-party interface exposure, and sensitive data handling.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A2-Security-Regression-Gate_REPORT.md:47:Before enabling proof/QR preview in pilot, route access through an authenticated endpoint that checks `MENU_STORE_PAYMENT:V` or `MENU_STORE_PAYMENT_ACCOUNT:V` plus the same store/finance/admin scope rules. If deferred, keep Store Payment proof/QR preview disabled in UI and API.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A2-Security-Regression-Gate_REPORT.md:68:Use fresh A1/CI logs for this exact commit/branch, or rerun API/Web typecheck in a dependency-complete workspace before pilot release.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A2-Security-Regression-Gate_REPORT.md:86:Keep Store Payment pilot validation low-risk/read-only until A1 blockers are resolved or explicitly accepted through the release process.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A2-Security-Regression-Gate_REPORT.md:116:A5 must still confirm pilot-store rows, company mapping, user/role grants, collection account, currency/payment method, and attachment policy in data. This A2 task did not query or write any database.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A2-Security-Regression-Gate_REPORT.md:158:4. A5 confirmation of pilot store, company mapping, users/roles, collection account, currency, payment method, and attachment policy.
docs/ops/REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A2-Security-Regression-Gate_REPORT.md:166:Store Payment pilot readiness is acceptable for low-risk parallel validation only. It is not a full release PASS until attachment read ACL, current-commit CI/typecheck evidence, A5 data confirmation, and broader A1 release-blocking security conditions are complete or formally accepted.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_METADATA_CLAIM_DRY_RUN_REPORT.md:78:- W5 gate must be run by Baseline Autopilot after this report is committed.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_DATA_MODEL_DRAFT.md:45:3. Store clerks can only select ACTIVE accounts/codes allowed for their pilot store.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_DATA_MODEL_DRAFT.md:74:| store_code | Required pilot/store scope. |
docs/ops/AGENT_ROUTER_SPEC.md:83:For Store Payment pilot readiness with security review, CI validation, and data readiness, the router must select:
docs/ops/AGENT_PLATFORM_V2_A5_ROUTING_FIX_REVIEW.md:33:English: data readiness, readiness, master data, store mapping, company mapping, account mapping, role mapping, organization mapping, data check, data validation, pilot readiness.
docs/ops/AGENT_PLATFORM_V2_A5_ROUTING_FIX_REVIEW.md:43:3. English/mixed Store Payment pilot data readiness request dry-run.
docs/ops/AGENT_ROUTER_STORE_PAYMENT_CLOSED_LOOP_FIX_REVIEW.md:72:- Baseline autopilot will run after Agent completion.
docs/ops/SETTINGS_HUB_SECURITY_PAGE_PERMISSION_REMEDIATION_20260627.md:43:| 系统初始化 / 试运行项目 | `MENU_UAT:V` |
docs/ops/AGENT_ROUTER_RULES.json:459:      "pilot-data",
docs/ops/AGENT_ROUTER_RULES.json:495:      "pilot readiness",
docs/ops/AGENT_ROUTER_RULES.json:496:      "pilot data"
docs/ops/AGENT_ROUTER_RULES.json:511:      "pilot-readiness"
docs/ops/AGENT_ROUTER_RULES.json:522:      "pilot-data",
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_REPORT.md:171:- W5 gate remains required through Baseline Autopilot;
docs/ops/SERVER_CARD_STAGING_TARGET_INTAKE_REPORT.md:53:- W5 gate must be run by Baseline Autopilot after commit.
docs/ops/AGENT_ROUTER_V1_REVIEW.md:49:| 1 | Store Payment pilot readiness with A2 security, A1 CI, A5 data readiness | A2 + A1 + A5 | A2 + A1 + A5 | PASS |
docs/ops/AGENT_ROUTER_V1_REVIEW.md:53:| 5 | Check store/company/account/role mapping for pilot | A5 | A5 | PASS |
docs/ops/AGENT_ROUTER_V1_REVIEW.md:58:The previous gap was that `readiness` and data mapping could select A1/A2 without A5. Router V1 now forces A5 when the request mentions data readiness, master data, store/company/account/role/organization mapping, dictionary, pilot readiness, or explicit A5 wording.
docs/ops/AGENT_ROUTER_V1_REVIEW.md:83:After baseline autopilot became the default lifecycle hook, Router V1 was revalidated with the six required natural-language cases:
docs/ops/AGENT_ROUTER_V1_REVIEW.md:96:- `baseline autopilot will run after agent completion`
docs/ops/AGENT_ROUTER_V1_REVIEW.md:105:Store Payment closed-loop routing was tightened so menu code, role authorization, protected preview/download, protected attachment, API draft, service/controller/module, and attachment ACL wording routes to A2 and A3. This prevents closed-loop pilot-readiness tasks from selecting only A1/A4/A5/A6/A7 while missing backend and security review.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_TEST_PLAN.md:27:1. Clerk can create only for assigned pilot store.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_TEST_PLAN.md:81:2. Menus enabled only for pilot roles.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_TEST_PLAN.md:82:3. Non-pilot stores cannot create records.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md:39:| S6 | Single-store pilot | Pilot store, users, data, staging evidence | Pilot runbook and GO/HOLD decision package | A6 + A7 | No in this plan | Yes |
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md:48:4. User pilot-store decision.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md:202:2. Missing pilot data.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md:215:1. Single-store pilot runbook.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md:221:Code allowed: No during pilot execution unless separate fix task is approved.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md:227:1. User has not approved pilot.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md:233:1. Disable menu/feature for pilot store.
docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md:55:| RBAC / DataScope risk | `PASS WITH CONDITIONS` | Role matrix is least-privilege oriented, but role grants are missing. DataScope for cashier/store manager cannot be proven because pilot test users use `ST-VTE-001` while canonical evidence supports `STORE-VTE-001`. | Prove role grants and DataScope with read-only evidence after separate approved gates. No broad admin fallback, wildcard grant, or company/global fallback for ambiguous store scope. |
docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md:56:| Store-code normalization risk | `PASS WITH CONDITIONS` | `STORE-VTE-001 / 万象直营店` is proven active and mapped to `COMP-LAO-AGRI`; `ST-VTE-001` appears on test users and is not proven equivalent. Matrix holds alias/normalization as `S1-APP-005`. | Approve exactly one policy: normalize selected pilot users/scopes, introduce explicit alias mapping, or keep `ST-VTE-001` legacy-only. Silent string substitution is not acceptable. |
docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md:98:Silent aliasing can leak records across stores. Refusing aliases without scope normalization can block the pilot. Falling back to company/global scope would bypass cashier and store-manager boundaries.
docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md:102:Approve a canonical policy and then prove, through A5 read-only evidence, that pilot users, Store Payment account rows, records, filters, and export paths resolve to `STORE-VTE-001` directly or through an explicitly approved alias.
docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md:142:Bundling migration with menu seed, role grants, pilot data creation, or attachment implementation would bypass independent rollback and security review points.
docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md:146:Keep migration as the only action in the first execution request. Do not combine it with seed/register, data normalization, pilot account data, A3/A4 work, deploy, or push.
docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md:150:No Store Payment pilot execution readiness until migration is separately approved, executed, and verified with read-only catalog evidence.
docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md:166:- Store Payment pilot account data creation or mapping.
docs/ops/PRODUCTION_READINESS_P1_005_STORE_PAYMENT_REMOTE_SMOKE_REPORT.md:125:The runtime shell is present and secure enough at the unauthenticated boundary, but there is no Store Payment business data or attachment metadata in the remote target. Business users cannot execute the intended pilot flow until a dedicated, approved UAT fixture/data setup gate creates or synchronizes disabled/pending account rows, records if needed, and protected attachment metadata.
docs/ops/PRODUCTION_READINESS_P1_005_STORE_PAYMENT_REMOTE_SMOKE_REPORT.md:133:1. Create or synchronize Store Payment pilot account placeholder rows for `STORE-VTE-001 / COMP-LAO-AGRI`.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_FRONTEND_DRAFT.md:52:| store | yes | Derived/limited by DataScope; pilot store default for clerk. |
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_FRONTEND_DRAFT.md:96:1. Create payment record for assigned pilot store.
docs/ops/AI_DELIVERY_PHASE3_1_SPEC_FREEZE_REVIEW.md:10:2. MVP-1 is single-store gray only; pilot store remains pending final user selection.
docs/ops/AI_DELIVERY_PHASE3_1_SPEC_FREEZE_REVIEW.md:73:1. Select the pilot store.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MASTER_DATA_DIAGNOSIS_REPORT.md:9:The master-data diagnosis found no duplicate core keys, no null/blank core keys in the audited columns, and a valid `STORE-VTE-001 / COMP-LAO-AGRI` pilot store/company/organization alignment. It did not perform any data repair.
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:116:1. Confirm exact pilot store row: `mst_stores.store_code` plus matching `sys_organizations.org_code`.
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:267:| Store master data | partial | `mst_stores` and `sys_organizations STORE` nodes exist, but pilot row and company mapping need DB/user confirmation. |
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:348:| Pilot store | pending | Confirm `STORE-VTE-001 / 万象直营店` exists and is the approved pilot. |
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:351:| Store clerk | pending | Identify cashier/clerk user(s), likely `ROLE_CASHIER`, and bind to pilot store. |
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:365:1. Is `万象直营店` the final MVP-1 pilot store, and is its canonical code `STORE-VTE-001`?
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:388:1. User confirms the pilot store and company mapping.
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:398:Do not start A2/A3/A4/A6/A7 in this round. Wait for user review of this A5 report, pilot-store confirmation, and explicit Schema Gate approval.
docs/ops/A2_STORE_PAYMENT_PILOT_GATE_S1_REVIEW.md:38:The S1 package is acceptable as a security gate package because it keeps execution separate from approval, preserves read-only review boundaries, and explicitly identifies the current HOLD blockers. It is not approval to run the migration, register menus, grant roles, normalize data, create pilot account rows, or expose proof/QR preview-download.
docs/ops/A2_STORE_PAYMENT_PILOT_GATE_S1_REVIEW.md:48:| DataScope and store-code normalization risk | `PASS WITH CONDITIONS` | `STORE-VTE-001` is DB-proven active and mapped to `COMP-LAO-AGRI`; test users still use `ST-VTE-001`; pilot user/store scope for canonical `STORE-VTE-001` is not proven. | Approve one canonical policy: normalize pilot users/scopes to `STORE-VTE-001`, or implement an explicit alias mapping. No silent string substitution and no fallback to company/global scope for ambiguous store codes. |
docs/ops/A2_STORE_PAYMENT_PILOT_GATE_S1_REVIEW.md:50:| Whether A3/A4 may open | `CONDITIONALLY NO` | S1 decision keeps A3/A4 blocked because tables, menu codes, role grants, pilot account rows, aligned scope, and protected attachment evidence are absent. | A3 may open only after S1 migration/menu/role/store-code/account/attachment conditions are approved and A1/A2 return at least `PASS WITH CONDITIONS`. A4 may open only after backend contract, menu visibility, A2 posture, and A5 readiness reach `GO WITH CONDITIONS` or better. |
docs/ops/A2_STORE_PAYMENT_PILOT_GATE_S1_REVIEW.md:88:Silent aliasing can leak cross-store records; refusing aliases without user/scope remediation can block valid pilot access. A fallback to company/global scope would bypass the intended cashier/store-manager boundaries.
docs/ops/A2_STORE_PAYMENT_PILOT_GATE_S1_REVIEW.md:92:Approve either direct normalization to `STORE-VTE-001` or an explicit alias mapping owned by backend/master data. A5 must then produce read-only evidence that pilot users, roles, Store Payment account rows, and Store Payment records resolve to the canonical store or approved alias.
docs/ops/A2_STORE_PAYMENT_PILOT_GATE_S1_REVIEW.md:139:No Store Payment pilot release until the migration is approved, executed, and verified in the selected environment.
docs/ops/AI_DELIVERY_IMPLEMENTATION_PLAN_STORE_PAYMENT_001_REVIEW.md:65:6. pilot DB read-only confirmation.
docs/ops/AI_DELIVERY_IMPLEMENTATION_PLAN_STORE_PAYMENT_001_REVIEW.md:69:1. Confirm `STORE-VTE-001 / 万象直营店` exists in DB and is final pilot store.
docs/ops/AGENT_AUTONOMOUS_BASELINE_LIFECYCLE.md:14:4. Baseline autopilot lifecycle.
docs/ops/AGENT_AUTONOMOUS_BASELINE_LIFECYCLE.md:21:After an Agent completes, the execution entrypoint calls `agent-baseline-autopilot.mjs` automatically:
docs/ops/AGENT_AUTONOMOUS_BASELINE_LIFECYCLE.md:100:4. Baseline autopilot runs automatically.
docs/ops/runtime-memory/DECISION_LOG.md:195:- User approved Store Payment staging controlled pilot actions, including non-production push, staging deploy, staging DB migration, staging menu/role sync, staging file storage configuration, and UAT scope.
docs/ops/runtime-memory/DECISION_LOG.md:247:- Controlled pilot is limited to local or separately approved staging environment.
docs/ops/runtime-memory/DECISION_LOG.md:277:- A5 must confirm staging data prerequisites before pilot release.
docs/ops/runtime-memory/DECISION_LOG.md:303:- Final pilot release still requires A7 final QA / GO Gate.
docs/ops/runtime-memory/DECISION_LOG.md:311:- `/store-payment` loaded the pilot Store Payment account list.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_STATE_MACHINE.md:34:1. Can create PENDING records for assigned pilot store.
docs/ops/runtime-memory/CODEX_ORCHESTRATOR_MEMORY.md:19:4. Baseline Autopilot remains responsible for auto-commit, rebase, safe merge, and W5 gate.
docs/ops/runtime-memory/CODEX_ORCHESTRATOR_MEMORY.md:94:Store Payment is ready for controlled pilot with conditions:
docs/ops/runtime-memory/CODEX_ORCHESTRATOR_MEMORY.md:106:- Controlled pilot decision is GO WITH CONDITIONS.
docs/ops/STORE_PAYMENT_STAGING_BUSINESS_UAT_GUIDE.md:53:1. View all approved pilot Store Payment records.
docs/ops/runtime-memory/GUARDRAILS.md:8:4. Baseline Autopilot is the default lifecycle for safe commit, rebase, merge, and gate validation.
docs/ops/runtime-memory/STORE_PAYMENT_STATE.md:327:Store Payment has passed controlled protected attachment UAT smoke for both the pilot account QR file and a Store Payment record proof fixture, not production deployment. File Metadata / ACL foundation is available, Store Payment protected attachment proxy endpoints stream when a valid `file_metadata.file_id` exists and ownership / RBAC / DataScope pass, and `/store-payment` now uses protected endpoints for QR and proof preview / download paths. A6 staging deploy runbook and A7 final QA Gate are complete. The staging deploy approval package, approval matrix, and business UAT scope are complete. The approved non-main branch push completed. The staging-only workflow/env/compose skeleton is now ready. The production server connection card has been sanitized and can produce a same-host staging candidate only with explicit isolation approval. Real staging execution still waits for user approval and GitHub `staging` environment secrets.
docs/ops/runtime-memory/STORE_PAYMENT_STATE.md:517:- Controlled pilot: allowed with conditions.
docs/ops/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS_A1-CI-Runtime-Gate_REPORT.md:83:| A5 single-store gray data checklist | PASS WITH CONDITIONS | A5 report marks pilot store, company, users, collection account, QR code, menu/query permission, and attachment ACL items as pending/partial/gap |
docs/ops/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS_A1-CI-Runtime-Gate_REPORT.md:89:3. A5 readiness remains incomplete: pilot store, company, users/roles, collection account, QR code, menu permissions, and attachment ACL still require explicit confirmation or approved data preparation.
docs/ops/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS_A1-CI-Runtime-Gate_REPORT.md:94:Do not enable Store Payment pilot runtime access yet. Treat API compile/build and static wiring validation as passed, but require a terminal web build result from CI plus an approved A5/DB-readiness confirmation path that does not bypass the no-migration/no-write guardrail. After those are cleared, run a scoped smoke test in an approved environment with Store Payment tables, menu grants, store scope, and attachment behavior already prepared.
docs/ops/runtime-memory/PROJECT_STATE.json:34:    "pilot_accounts_initialized": 3,
docs/ops/runtime-memory/PROJECT_STATE.json:35:    "pilot_accounts_state": "disabled_or_pending_placeholders",
docs/ops/runtime-memory/PROJECT_STATE.json:92:    "controlled_pilot_allowed": true,
docs/ops/runtime-memory/PROJECT_STATE.json:104:    "staging_controlled_pilot_deploy": "HOLD",
docs/ops/runtime-memory/PROJECT_STATE.json:419:    "r3_pilot_user_scope_gap_count": 4,
docs/ops/STORE_PAYMENT_BUSINESS_CLOSED_LOOP_READY_REPORT.md:24:  - IMPROVE-BASELINE-AUTOPILOT-LIFECYCLE / P0 / Codex-Orchestrator: Attach baseline autopilot to every Agent lifecycle path
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_BACKEND_S2_TASK_PACKAGE.md:80:1. Clerk create: derive or validate `store_code` against authenticated user/pilot-store binding; do not trust body alone.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_BACKEND_S2_TASK_PACKAGE.md:244:| Clerk | create PENDING own/pilot-store record; list/detail own records; no confirm/reject/void/account maintenance. |
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_BACKEND_S2_TASK_PACKAGE.md:260:10. A2 review is required before A4 or pilot work.
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md:13:The Store Payment pilot remains blocked because the read-only DB evidence and follow-up reviews confirmed:
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md:18:4. Store Payment pilot account rows are absent or unqueryable because the table is missing.
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md:20:6. Existing test users use `ST-VTE-001`, while the proven pilot store is `STORE-VTE-001`.
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md:88:Required pilot role set:
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md:101:- The proven pilot store is `STORE-VTE-001`.
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md:102:- A Vientiane org-scope row exists for `SITE-VTE-SLAUGHTER`, not the pilot retail store.
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md:113:`STORE-VTE-001` should be treated as canonical for Store Payment pilot because it is proven in both `mst_stores` and `sys_organizations` as `万象直营店`, `ACTIVE`, mapped to `COMP-LAO-AGRI`.
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md:135:| S1-5 | Store-code normalization gate | Align pilot users/scope with canonical `STORE-VTE-001` or approved alias | High | Yes | A5 read-only scope proof |
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md:149:| S1-6 | Store Payment account model approved | Read-only `store_payment_accounts` proof for pilot active account rows | Disable pilot account rows under rollback gate; do not delete without approval |
docs/ops/PRODUCTION_SERVER_REMEDIATION_BACKLOG.md:13:| P0-005 | Audit initialization import quality | master-data | User reports data migration/import issues | Dirty master data can invalidate pilot | Count and duplicate scans for company/store/org/user/role/core tables | true | false | false | false | A5 | 5 | proposed |
docs/ops/A1_STORE_PAYMENT_A5_HOLD_CLEARANCE_VALIDATION.md:44:| A5 has required sections | PASS | Covers pilot store, company/org mapping, accounts, tables, records, users/scope, menus/grants, attachments, HOLD decision, and A3/A4 recommendation. |
docs/ops/A1_STORE_PAYMENT_A5_HOLD_CLEARANCE_VALIDATION.md:81:| Company/account readiness | Consistent. Active pilot `store_payment_accounts` and linked `fin_cash_accounts` evidence is missing. |
docs/ops/A1_STORE_PAYMENT_A5_HOLD_CLEARANCE_VALIDATION.md:99:4. Active pilot collection account/code is not proven.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md:34:| Store | Can existing `mst_stores` or equivalent store data support pilot scope? | A5 later |
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md:144:1. Dropping tables after pilot could lose audit evidence; prefer disable/read-only rollback.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md:161:1. User selects one pilot store.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md:164:4. At least one active company collection account/code is prepared for pilot.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md:170:2. Select pilot store.
docs/ops/A1_STORE_PAYMENT_PILOT_GATE_S1_VALIDATION.md:84:The package is ready for user approval review, but it is not ready for execution without explicit user approval of the target environment, migration execution, menu registration, role grants, store-code normalization policy, pilot account data action, protected attachment implementation boundary, backup/rollback owner, and execution window.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_REPORT.md:93:- `user_id=97`, masked as Store Payment pilot store manager, `STORE-VTE-001`, `ROLE_STORE_MGR`.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_REPORT.md:97:- `user_id=296`, masked username `pilot_***`, `ROLE_CASHIER`, noncanonical `STORE-MS-01`.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_REPORT.md:98:- `user_id=299`, masked username `pilot_***`, `ROLE_FIN_ACCT`, noncanonical `PILOT-MS`.
docs/ops/STORE_PAYMENT_S1_APP_001_MIGRATION_EXECUTION_REPORT.md:275:Do not combine it with role grants, store-code alias/normalization, pilot account data, A3 protected attachment work, A4 frontend work, deployment, or push.
docs/ops/STORE_PAYMENT_READINESS_A1_A2_A5_APPROVED_EXECUTION_REPORT.md:76:  - Condition: release remains blocked by broader A1 runtime/security constraints and by Store Payment pilot conditions such as protected attachment read ACL, current-commit CI evidence, and A5 data confirmation.
docs/ops/STORE_PAYMENT_READINESS_A1_A2_A5_APPROVED_EXECUTION_REPORT.md:90:  - Blocker: local DB read-only proof could not be obtained in this sandbox, so A5 cannot confirm pilot data readiness.
docs/ops/STORE_PAYMENT_READINESS_A1_A2_A5_APPROVED_EXECUTION_REPORT.md:99:| A1 baseline autopilot completed | Yes |
docs/ops/STORE_PAYMENT_READINESS_A1_A2_A5_APPROVED_EXECUTION_REPORT.md:100:| A2 baseline autopilot completed | Yes |
docs/ops/STORE_PAYMENT_READINESS_A1_A2_A5_APPROVED_EXECUTION_REPORT.md:101:| A5 baseline autopilot completed | Yes |
docs/ops/STORE_PAYMENT_READINESS_A1_A2_A5_APPROVED_EXECUTION_REPORT.md:137:A1 and A2 completed with `PASS WITH CONDITIONS`; A5 completed with `HOLD` because pilot data readiness still lacks read-only DB proof. The platform execution itself is healthy: routing selected only A1/A2/A5, denied Agents were not executed, baseline autopilot completed for all three Agents, and W5 static gates passed. Store Payment pilot readiness is not a GO until the A5 data blocker is cleared.
docs/ops/STORE_PAYMENT_READINESS_A1_A2_A5_APPROVED_EXECUTION_REPORT.md:142:2. Clear A5's read-only DB evidence blocker first: confirm pilot store, company, account, role, user-store scope, Store Payment tables, and menu grants with a read-only connection.
docs/ops/PRODUCTION_READINESS_P1_004_MASTER_DATA_REMEDIATION_PLAN.md:13:The reviewed evidence shows that the Store Payment pilot master-data baseline is healthy enough to proceed under conditions:
docs/ops/PRODUCTION_READINESS_P1_004_MASTER_DATA_REMEDIATION_PLAN.md:53:1. Keep `STORE-VTE-001` as the canonical Store Payment pilot store code.
docs/ops/PRODUCTION_READINESS_P1_004_MASTER_DATA_REMEDIATION_PLAN.md:54:2. Keep `COMP-LAO-AGRI` as the pilot company code.
docs/ops/PRODUCTION_READINESS_P1_004_MASTER_DATA_REMEDIATION_PLAN.md:97:A5 can treat `STORE-VTE-001 / COMP-LAO-AGRI` as ready for controlled Store Payment pilot flows, provided that:
docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_INVENTORY_REPORT.md:114:- W5 gate must still be run by Baseline Autopilot after commit.
docs/ops/PRODUCTION_READINESS_P0_001_ACCOUNT_PLACEHOLDER_EXECUTION_REPORT.md:14:2. Exactly three disabled/inactive Store Payment pilot account placeholders.
docs/ops/PRODUCTION_READINESS_P0_001_ACCOUNT_PLACEHOLDER_EXECUTION_REPORT.md:109:The Store Payment pilot now has disabled/inactive placeholder account rows. Finance confirmation, real bank account linkage, QR metadata, and activation remain future Gates.
docs/ops/RBAC_MENU_VISIBILITY_ATOMICITY_AUDIT_20260625.md:112:   - Verify 王乐金 and each pilot role have only the child menus required by their actual job.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_PERMISSION_MATRIX.md:19:| Store clerk | Own records and approved own-store records | Yes, own/pilot store only | Own PENDING only, if approved | No | No | No | No | No |
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_PERMISSION_MATRIX.md:29:| Record create | `MENU_STORE_PAYMENT:C` | Clerk create only for assigned pilot store. |
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_PERMISSION_MATRIX.md:40:1. Clerk create: request `store_code` must be derived from authenticated user/pilot binding, not trusted from body alone.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:12:The read-only DB evidence report is acceptable as a security input, but it does not clear the previous A5 HOLD. The report confirms no secret output and no write action, but it also proves or records release-blocking gaps: Store Payment tables are absent, menu codes and role grants are absent, pilot store/user scope is mismatched or unproven, and protected proof/QR attachment access is unproven.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:74:- Any migration execution, menu seed, role grant seed, or pilot data seed requires a separate approved gate.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:106:- The pilot store `STORE-VTE-001 / 万象直营店` exists and is active: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:92`.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:108:- Test users are scoped to `ST-VTE-001`, while the pilot store is `STORE-VTE-001`: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:163`.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:113:- Provide read-only DB evidence that pilot cashier and store manager users are active, carry the intended roles, and resolve to the exact same store-code namespace used by Store Payment accounts and records.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:114:- Decide whether the pilot namespace is `STORE-VTE-001` or `ST-VTE-001`, then align users, org scope, and Store Payment rows before reopening A5.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:118:- A5 HOLD cannot be cleared because a user could be denied valid pilot access or scoped to the wrong store.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:138:- If proof/QR preview is required for pilot, HOLD remains.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:139:- If preview/download is explicitly disabled, this can become a documented pilot condition after the table/menu/scope blockers are cleared.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:155:- After approved execution, re-run read-only evidence for table existence, constraints/indexes, active pilot account rows, status distribution, and proof attachment population.
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:167:| A3 Backend Gate | `HOLD` | May not open for implementation until DB tables, menu grants, pilot account rows, user scope, and attachment policy are proven or separately gated. |
docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md:174:2. At least one active Store Payment account row for `STORE-VTE-001` and `COMP-LAO-AGRI`, or an approved correction to the pilot company/store mapping.
docs/ops/AI_DELIVERY_PHASE2_NL_DISPATCH_REVIEW.md:136:Ask the user to answer the payment-channel, callback, store-code, pilot-store, POS-binding, currency, and Chanjet questions before generating a formal Requirement Spec or starting any Agent task.
docs/ops/STORE_PAYMENT_A5_HOLD_CLEARANCE_REPORT.md:6:- Goal: clear the previous Store Payment pilot readiness A5 `HOLD` blocker with read-only evidence.
docs/ops/STORE_PAYMENT_A5_HOLD_CLEARANCE_REPORT.md:18:The previous A5 readiness run could not prove Store Payment pilot data readiness because it lacked read-only DB evidence for:
docs/ops/STORE_PAYMENT_A5_HOLD_CLEARANCE_REPORT.md:47:| Store Payment account / record data readiness | HOLD | No DB proof for active account rows or pilot records. |
docs/ops/STORE_PAYMENT_A5_HOLD_CLEARANCE_REPORT.md:48:| User role and store scope | HOLD | Static mismatch: UAT users use `ST-VTE-001` while pilot store candidate is `STORE-VTE-001`. |
docs/ops/STORE_PAYMENT_A5_HOLD_CLEARANCE_REPORT.md:67:A2 confirmed that A5 did not miss a material RBAC, DataScope, menu grant, attachment ACL, audit/log redaction, or release-safety blocker. A2 agrees A5 HOLD cannot be lifted because DB evidence is unavailable, menu grants and store scope are unproven, and proof/QR preview must be protected or disabled before pilot.
docs/ops/STORE_PAYMENT_A5_HOLD_CLEARANCE_REPORT.md:123:4. At least one active pilot collection account/code exists or the account creation path is formally approved before pilot.
docs/ops/STORE_PAYMENT_A5_HOLD_CLEARANCE_REPORT.md:131:2. Confirm canonical pilot store code: `STORE-VTE-001` versus any existing DB code.
docs/ops/runs/router-v1-revalidate-case5-route-plan.md:25:- pilot-data
docs/ops/PRODUCTION_SERVER_REMEDIATION_INTAKE_REPORT.md:124:- Must be audited before production-side controlled pilot.
docs/ops/PRODUCTION_READINESS_P1_003_MANUAL_SCOPE_REVIEW_PACKAGE.md:31:| `P1-003-U296` | `296` | `pilot_cashier` | `陈 丽 (试运行收银)` | `STORE-MS-01` | `ROLE_CASHIER` | `HOLD_OR_EXCLUDE_FROM_VIENTIANE_PILOT` |
docs/ops/PRODUCTION_READINESS_P1_003_MANUAL_SCOPE_REVIEW_PACKAGE.md:32:| `P1-003-U299` | `299` | `pilot_finance` | `刘 华 (试运行财务)` | `PILOT-MS` | `ROLE_FIN_ACCT` | `HOLD_OR_MAP_TO_COMPANY_FINANCE_AFTER_CONFIRMATION` |
docs/ops/PRODUCTION_READINESS_P1_003_MANUAL_SCOPE_REVIEW_PACKAGE.md:46:| `EXCLUDE` | User is not part of Store Payment Vientiane pilot. | No SQL. Keep HOLD/excluded. |
docs/ops/PRODUCTION_READINESS_P1_003_MANUAL_SCOPE_REVIEW_PACKAGE.md:81:Store Payment pilot can remain limited to already approved users/scopes. Broader UAT participation requires business decisions for the three listed users.
docs/ops/NEXT_PRODUCTION_READINESS_REMEDIATION_PLAN_20260626.md:29:   - Remaining work: production user-by-user permission matrix evidence for Wang Lejin and other pilot roles.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_MIGRATION_DRAFT.md:131:1. Rollback migration may drop new tables only before production/pilot data exists.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_MIGRATION_DRAFT.md:132:2. After pilot data exists, prefer disable/read-only rollback over destructive rollback.
docs/ops/A2_SECURITY_DESIGN_STORE_PAYMENT_001_REPORT.md:127:   - Clerk create: `store_code` must equal the user's assigned pilot store; request body must not be trusted blindly.
docs/ops/A2_SECURITY_DESIGN_STORE_PAYMENT_001_REPORT.md:300:4. Long-term archive/delete policy can follow after MVP-1, provided evidence is retained during pilot.
docs/ops/A2_SECURITY_DESIGN_STORE_PAYMENT_001_REPORT.md:320:Do not start A3/A4/A6/A7 from this A2 round. Wait for user review, pilot-store confirmation, Schema Gate decisions, and explicit implementation approval.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REMOTE_AUDIT_REPORT.md:81:The audit found active pilot and finance/store-role users, but several role-bearing users have no organization scope rows. This is a readiness issue for controlled pilot access because role assignment and store/company scope are not consistently paired.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REMOTE_AUDIT_REPORT.md:98:- Some pilot-style users use noncanonical store codes such as `PILOT-MS` / `STORE-MS-01`; those are outside the Store Payment `STORE-VTE-001` pilot scope.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REMOTE_AUDIT_REPORT.md:113:- Current controlled pilot policy and UI are aligned to `V/E/X`.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REMOTE_AUDIT_REPORT.md:131:- Several pilot-relevant users have role assignment without org/store scope.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REMOTE_AUDIT_REPORT.md:139:| P1 | 6 | Missing menu codes; missing role grants; missing Store Payment DataScope rows; pilot user scope gaps; deployed action-bit mismatch; one orphan menu. |
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REMOTE_AUDIT_REPORT.md:140:| P2 | 2 | Role/user naming drift and pilot-style noncanonical store codes need cleanup before business UAT. |
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_DECISION.md:11:The current system remains `HOLD` for A3/A4 implementation because the target DB still lacks Store Payment tables, menu codes, role grants, pilot account rows, aligned user/store scope, and protected attachment evidence.
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_DECISION.md:35:4. Whether `STORE-VTE-001` is the canonical Store Payment pilot store code.
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_DECISION.md:37:6. Whether pilot users/scopes may be updated to canonical store code.
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_DECISION.md:38:7. Whether Store Payment pilot account rows may be created or mapped.
docs/ops/AI_DELIVERY_SCHEMA_GATE_STORE_PAYMENT_001_REVIEW.md:33:| Confirm canonical store code and pilot store. | Schema Gate Proposal, Permission Matrix |
docs/ops/AI_DELIVERY_SCHEMA_GATE_STORE_PAYMENT_001_REVIEW.md:44:2. Which pilot store is final?
docs/ops/AI_DELIVERY_SCHEMA_GATE_STORE_PAYMENT_001_REVIEW.md:73:2. User selects pilot store and canonical store-code rule.
docs/ops/PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md:9:This task list consolidates the previous audit, readiness, remediation, runtime gate, security, attachment, deployment-chain, and Store Payment pilot reports into one prioritized production-readiness backlog.
docs/ops/PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md:83:| PRD-P1-003 | P1 | Manual scope and DataScope model cleanup | `PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_REPORT.md`; `PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md`; `PRODUCTION_READINESS_P1_003_MANUAL_SCOPE_DATASCOPE_CLEANUP_PLAN.md`; `PRODUCTION_READINESS_P1_003_MANUAL_SCOPE_REVIEW_PACKAGE.md`; `PRODUCTION_READINESS_P1_003_MANUAL_SCOPE_EXCLUSION_DECISION_REPORT.md` | A5, A2, A1 | Current Gate closed by exclusion; future inclusion requires named business approval | GO_WITH_CONDITIONS / EXCLUDED_FROM_CURRENT_PILOT_GATE | Users 296, 299, and 1460 remain excluded from the current Store Payment Vientiane pilot. No DB write was executed; no noncanonical store/global marker was converted into scope. Future inclusion requires a separate approval Gate with exact SQL and rollback. |
docs/ops/PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md:85:| PRD-P1-005 | P1 | Store Payment remote readiness smoke | Store Payment controlled pilot reports; production remediation backlog; `PRODUCTION_READINESS_P1_005_STORE_PAYMENT_REMOTE_SMOKE_REPORT.md`; `PRODUCTION_READINESS_P1_005_STORE_PAYMENT_REMOTE_SMOKE_REFRESH_REPORT.md` | A1, A2, A5, A6 | `APPROVE_STORE_PAYMENT_REMOTE_READINESS_SMOKE` | GO_WITH_CONDITIONS / BUSINESS_UAT_STILL_HOLD | Remote `/store-payment` and no-prefix Store Payment routes now redirect anonymous users to login. Tables and menu codes exist. Read-only DB smoke confirms `store_payment_accounts=3`, all disabled/inactive, `store_payment_records=0`, Store Payment `file_metadata=0`, menus=5, grants=11. Business UAT still requires authenticated smoke, QR metadata, and/or finance-confirmed activation Gate. |
docs/ops/PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md:115:5. A5 confirms master data, Store Payment pilot data, and initial import readiness for the intended environment.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md:215:| Deployment | Single-store gray only; pilot store must be specified before development; no production deploy in this phase. |
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md:220:1. User selects exactly one pilot store from 万象直营店 / 孟赛直营店 / 琅勃拉邦直营店 or another approved store.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md:222:3. Keep old/manual verification process available during pilot.
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md:236:1. Final pilot store.
docs/ops/AGENT_BASELINE_AUTOPILOT.md:1:# Agent Baseline Autopilot
docs/ops/AGENT_BASELINE_AUTOPILOT.md:5:Agent work should not end with a human copying the same sync, rebase, dirty-check, and safe-merge commands across main and every Agent worktree. Those steps are platform plumbing. `agent-baseline-autopilot.mjs` makes them a standard post-task flow with bounded self-repair.
docs/ops/AGENT_BASELINE_AUTOPILOT.md:9:Users should not manually synchronize branches for routine Agent outputs. Use the autopilot entrypoint:
docs/ops/AGENT_BASELINE_AUTOPILOT.md:12:node scripts/ops/agent-baseline-autopilot.mjs \
docs/ops/AGENT_BASELINE_AUTOPILOT.md:22:node scripts/ops/agent-baseline-autopilot.mjs \
docs/ops/AGENT_BASELINE_AUTOPILOT.md:31:`agent-baseline-autopilot.mjs` is the high-level entrypoint for:
docs/ops/AGENT_BASELINE_AUTOPILOT.md:67:Autopilot rebases the target worktree on main. If a conflict appears:
docs/ops/AGENT_BASELINE_AUTOPILOT.md:76:Autopilot delegates final safe merge to `agent-sync-and-merge.mjs`, which remains the lower-level safe merge preflight.
docs/ops/AGENT_BASELINE_AUTOPILOT.md:78:`agent-baseline-autopilot.mjs` is the normal daily entrypoint. `agent-sync-and-merge.mjs` is the lower-level merge helper.
docs/ops/AGENT_BASELINE_AUTOPILOT.md:82:Autopilot defaults to `--max-retries 3`. Retryable cases include:
docs/ops/AGENT_BASELINE_AUTOPILOT.md:94:Autopilot must HOLD for:
docs/ops/AGENT_BASELINE_AUTOPILOT.md:111:Autopilot never pushes, never deploys, never executes migrations, and never writes databases.
docs/ops/AGENT_BASELINE_AUTOPILOT.md:116:node scripts/ops/agent-baseline-autopilot.mjs --agent Codex-Orchestrator --branch w5-codex-orchestrator --yes
docs/ops/AGENT_TASK_BOARD.md:69:| AGENT-ROUTER-V1-REVALIDATION | Codex-Orchestrator | w5-codex-orchestrator | done | N/A | L1 ops routing | No | Revalidated six Router cases and Orchestrator A2/A1/A5 regression after autonomous b
```

## Evidence Gate

```json
{
  "version": 1,
  "agent": "A4-Frontend-UAT-Smoke",
  "exitCode": 0,
  "conclusion": "",
  "responseChars": 0,
  "beforeHead": "c564cf3626d7de48bace17973edb25063dd9e270",
  "afterHead": "c564cf3626d7de48bace17973edb25063dd9e270",
  "commitHash": "",
  "changedFiles": [],
  "businessChangedFiles": [],
  "reportFiles": [],
  "parentCommitRecovered": false,
  "checkedAt": "2026-07-10T04:43:09.127Z",
  "passed": false,
  "role": "implementation",
  "terminalStatus": "HOLD",
  "reason": "Codex exited 0 but produced no Agent result"
}
```

## Parent Commit Recovery

```json
{
  "attempted": false,
  "ok": false,
  "reason": "worktree has no uncommitted Agent changes",
  "files": []
}
```

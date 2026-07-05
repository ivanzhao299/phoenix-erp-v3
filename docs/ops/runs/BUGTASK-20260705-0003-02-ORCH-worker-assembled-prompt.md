# Base Agent Prompt

# Codex-Orchestrator System Prompt

## Agent Identity

You are `Codex-Orchestrator`, the Phoenix ERP AI Delivery Factory commander.

## Worktree and Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/codex-orchestrator`

Branch: `w5-codex-orchestrator`

## Execution Checks

Run before action:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Stop if the directory or branch is wrong, or if the worktree is not clean unless the user explicitly approves the exact dirty files.

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

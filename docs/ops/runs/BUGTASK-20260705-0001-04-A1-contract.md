# Bug Repair Agent Contract

Source bug: BUG-20260705-0001
Source repair task: BUGTASK-20260705-0001
Assigned agent: A1-CI-Runtime-Gate

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

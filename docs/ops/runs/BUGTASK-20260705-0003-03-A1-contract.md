# Bug Repair Agent Contract

Source bug: BUG-20260705-0003
Source repair task: BUGTASK-20260705-0003
Assigned agent: A1-CI-Runtime-Gate

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
    "failedRequests": [],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783258328672-32c6fb39.png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260705-0003/attachments/01-1783258328672-32c6fb39.png",
          "downloadError": "GET /api/bug-intake/reports/BUG-20260705-0003/attachments/01-1783258328672-32c6fb39.png failed HTTP 404: {\"code\":404,\"message\":\"附件文件不存在\",\"error\":\"Not Found\",\"statusCode\":404}"
        }
      ],
      "localAttachmentPaths": []
    }
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
    "route_decision": "PLAN_READY",
    "split_strategy": [
      {
        "agent": "A3-Backend-Critical-Path",
        "reasons": [
          "backend/API/error route matched"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A4-Frontend-UAT-Smoke",
        "reasons": [
          "frontend/UI route or wording matched",
          "failure classification FRONTEND_RENDER"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A1-CI-Runtime-Gate",
        "reasons": [
          "failure classification FRONTEND_RENDER",
          "required validation after repair"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      }
    ],
    "selected_agents": [
      "A3-Backend-Critical-Path",
      "A4-Frontend-UAT-Smoke",
      "A1-CI-Runtime-Gate"
    ],
    "failure_category": "FRONTEND_RENDER",
    "hard_constraints": [
      "no automatic production deploy",
      "no automatic DB write",
      "no automatic migration",
      "human approval required before code repair execution"
    ],
    "route_confidence": 0.82,
    "source_repair_task_no": "BUGTASK-20260705-0003"
  },
  "createdAt": "2026-07-05T13:34:07.517Z",
  "createdBy": "zhaoyongwei",
  "moduleCode": "",
  "agentResults": [
    {
      "agent": "A1-CI-Runtime-Gate",
      "taskId": "BUGTASK-20260705-0003-01-A1",
      "summary": "BUG-20260705-0003 驾驶舱卡片问题: local selected agent A1-CI-Runtime-Gate finished with completed; result file docs/ops/runs/BUGTASK-20260705-0003-01-A1-worker-log.md. Reconciled after deployment/runner queue cleanup.",
      "commitHash": "",
      "conclusion": "PASS_WITH_CONDITIONS",
      "nextAction": "Business owner validates the fix in production; reopen if still reproducible.",
      "recordedAt": "2026-07-07T19:52:11.613Z",
      "recordedBy": "bug_intake_runner",
      "resultFile": "docs/ops/runs/BUGTASK-20260705-0003-01-A1-worker-log.md",
      "changedFiles": [],
      "validationResults": {
        "source": "Codex-Orchestrator queue reconciliation after deployed repair",
        "localQueueStatus": "completed"
      }
    },
    {
      "agent": "Codex-Orchestrator",
      "taskId": "BUGTASK-20260705-0003-02-ORCH",
      "summary": "BUG-20260705-0003 驾驶舱卡片问题: local selected agent Codex-Orchestrator finished with completed; result file docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-worker-log.md. Reconciled after deployment/runner queue cleanup.",
      "commitHash": "",
      "conclusion": "PASS_WITH_CONDITIONS",
      "nextAction": "Business owner validates the fix in production; reopen if still reproducible.",
      "recordedAt": "2026-07-07T19:52:12.134Z",
      "recordedBy": "bug_intake_runner",
      "resultFile": "docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-worker-log.md",
      "changedFiles": [],
      "validationResults": {
        "source": "Codex-Orchestrator queue reconciliation after deployed repair",
        "localQueueStatus": "completed"
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
    "taskId": "BUGTASK-20260705-0003-02-ORCH",
    "summary": "BUG-20260705-0003 驾驶舱卡片问题: local selected agent Codex-Orchestrator finished with completed; result file docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-worker-log.md. Reconciled after deployment/runner queue cleanup.",
    "commitHash": "",
    "conclusion": "PASS_WITH_CONDITIONS",
    "nextAction": "Business owner validates the fix in production; reopen if still reproducible.",
    "recordedAt": "2026-07-07T19:52:12.134Z",
    "recordedBy": "bug_intake_runner",
    "resultFile": "docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-worker-log.md",
    "changedFiles": [],
    "validationResults": {
      "source": "Codex-Orchestrator queue reconciliation after deployed repair",
      "localQueueStatus": "completed"
    }
  },
  "redispatchHistory": [
    {
      "mode": "REPLAN_AND_REQUEUE",
      "note": "Re-dispatch after strict-evidence workflow hardening. Require owned business diff, task report, commit, A1 validation, CI/CD, production smoke, then business UAT before RESOLVED.",
      "redispatchNo": 1,
      "approvalScope": "User approved strict-evidence repair of reconciled false completions. Business code only within generated Agent contract; no migration, DB write, force push, or direct deploy outside CI/CD.",
      "previousStatus": "IN_PROGRESS",
      "redispatchedAt": "2026-07-10T04:38:15.601Z",
      "redispatchedBy": "bug_intake_runner",
      "selectedAgents": [
        "A3-Backend-Critical-Path",
        "A4-Frontend-UAT-Smoke",
        "A1-CI-Runtime-Gate"
      ],
      "previousRepairTaskStatus": "HOLD"
    }
  ],
  "acceptanceCriteria": "",
  "agentPlanGeneratedAt": "2026-07-10T04:38:15.601Z",
  "agentPlanGeneratedBy": "redispatch:bug_intake_runner",
  "failureClassification": {
    "category": "FRONTEND_RENDER",
    "evidence": [
      "前端渲染/UI 信号"
    ],
    "priority": "P2",
    "severity": "MEDIUM",
    "confidence": 0.82,
    "suggestedFix": "修正页面状态、空态、样式或组件交互，并执行 Web typecheck/route smoke。",
    "autoFixEligible": true,
    "recommendedAgents": [
      "A4-Frontend-UAT-Smoke",
      "A1-CI-Runtime-Gate"
    ],
    "requiresHumanGate": false,
    "ownerRecommendation": "A4-Frontend-UAT-Smoke"
  },
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-10T04:38:15.601Z",
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
    "reconciledAt": "2026-07-10T03:29:30.577Z",
    "reconciledBy": "bug_intake_runner",
    "previousStatus": "IN_PROGRESS",
    "previousRepairTaskStatus": "AGENT_COMPLETED"
  },
  "failureClassificationUpdatedAt": "2026-07-10T04:38:15.601Z",
  "previousAgentResultsBeforeRedispatch": [
    {
      "agent": "A1-CI-Runtime-Gate",
      "taskId": "BUGTASK-20260705-0003-01-A1",
      "summary": "BUG-20260705-0003 驾驶舱卡片问题: local selected agent A1-CI-Runtime-Gate finished with completed; result file docs/ops/runs/BUGTASK-20260705-0003-01-A1-worker-log.md. Reconciled after deployment/runner queue cleanup.",
      "commitHash": "",
      "conclusion": "PASS_WITH_CONDITIONS",
      "nextAction": "Business owner validates the fix in production; reopen if still reproducible.",
      "recordedAt": "2026-07-07T19:52:11.613Z",
      "recordedBy": "bug_intake_runner",
      "resultFile": "docs/ops/runs/BUGTASK-20260705-0003-01-A1-worker-log.md",
      "changedFiles": [],
      "validationResults": {
        "source": "Codex-Orchestrator queue reconciliation after deployed repair",
        "localQueueStatus": "completed"
      }
    },
    {
      "agent": "Codex-Orchestrator",
      "taskId": "BUGTASK-20260705-0003-02-ORCH",
      "summary": "BUG-20260705-0003 驾驶舱卡片问题: local selected agent Codex-Orchestrator finished with completed; result file docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-worker-log.md. Reconciled after deployment/runner queue cleanup.",
      "commitHash": "",
      "conclusion": "PASS_WITH_CONDITIONS",
      "nextAction": "Business owner validates the fix in production; reopen if still reproducible.",
      "recordedAt": "2026-07-07T19:52:12.134Z",
      "recordedBy": "bug_intake_runner",
      "resultFile": "docs/ops/runs/BUGTASK-20260705-0003-02-ORCH-worker-log.md",
      "changedFiles": [],
      "validationResults": {
        "source": "Codex-Orchestrator queue reconciliation after deployed repair",
        "localQueueStatus": "completed"
      }
    }
  ]
}
```

## Local Evidence

- No local attachment downloaded. If screenshot evidence is required, HOLD and request evidence sync.

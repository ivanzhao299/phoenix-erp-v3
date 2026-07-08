# Bug Repair Agent Contract

Source bug: BUG-20260708-TEST
Source repair task: BUGTASK-20260708-TEST
Assigned agent: A1-CI-Runtime-Gate

## Issue

redispatch fixture 500 API issue

## Route

/test

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "taskNo": "BUGTASK-20260708-TEST",
  "bugNo": "BUG-20260708-TEST",
  "title": "redispatch fixture 500 API issue",
  "moduleCode": "BUG_INTAKE",
  "route": "/test",
  "acceptanceCriteria": "fixture only",
  "agentExecutionApproval": {
    "approved": true,
    "approvedBy": "fixture",
    "redispatch": true,
    "redispatchCount": 1
  },
  "redispatchCount": 1,
  "redispatchHistory": [
    {
      "redispatchedAt": "2026-07-08T01:09:52.455Z",
      "redispatchedBy": "fixture"
    }
  ],
  "agentPlan": {
    "route_decision": "PLAN_READY",
    "source_bug_no": "BUG-20260708-TEST",
    "source_repair_task_no": "BUGTASK-20260708-TEST",
    "selected_agents": [
      "A3-Backend-Critical-Path",
      "A1-CI-Runtime-Gate"
    ]
  },
  "context": {
    "failedRequests": [
      {
        "url": "/api/test",
        "status": 500
      }
    ]
  }
}
```

## Local Evidence

- No local attachment downloaded. If screenshot evidence is required, HOLD and request evidence sync.

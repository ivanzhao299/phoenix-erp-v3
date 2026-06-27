# Agent Platform V2 95 Acceptance Matrix

| Agent | Registered | Worktree | Branch | Prompt | Allowed paths | Forbidden paths | Queue assign | Worker claim-next | Assembled prompt | Dry-run execution | Approved execution | Report output | Next state | Blockers | Maturity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Codex-Orchestrator | Yes | Yes | Yes | Yes | Yes | Yes | Yes | N/A | Yes | Yes | N/A | Yes | Yes | None | 96% |
| A1-CI-Runtime-Gate | Yes | Yes | Yes | Yes | Yes | Yes | Yes | PASS | Command generated | PASS | Ready with token | Yes | Yes | Real execution requires approval | 93% |
| A2-Security-Regression-Gate | Yes | Yes | Yes | Yes | Yes | Yes | Yes | PASS | Command generated | PASS | Ready with token | Yes | Yes | Real execution requires approval | 93% |
| A3-Backend-Critical-Path | Yes | Yes | Yes | Yes | Yes | Yes | Yes | PASS | Command generated | PASS | Manual Gate | Yes | Yes | Code changes require approval; worktree behind main | 84% |
| A4-Frontend-UAT-Smoke | Yes | Yes | Yes | Yes | Yes | Yes | Yes | PASS | Command generated | PASS | Manual Gate | Yes | Yes | Code changes require approval; worktree behind main | 84% |
| A5-Data-Readiness | Yes | Yes | Yes | Yes | Yes | Yes | Yes | PASS | Command generated | PASS | Ready with token | Yes | Yes | Real execution requires approval; worktree behind main | 91% |
| A6-Staging-Deploy-Runbook | Yes | Yes | Yes | Yes | Yes | Yes | Yes | PASS | Command generated | PASS | Runbook only | Yes | Yes | No production deploy; worktree behind main | 85% |
| A7-Final-QA-Gate | Yes | Yes | Yes | Yes | Yes | Yes | Yes | PASS | Command generated | PASS | Final report only | Yes | Yes | Human GO required; worktree behind main | 85% |

Drill Request ID: `REQ-NL-20260622-205604-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UAT-MIG`.

# Orchestration Plan

| Field | Value |
| --- | --- |
| Request ID | REQ-NL-20260622-202514-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION |
| Risk | HIGH |
| Mode | closed-loop |
| Dry run | Yes |
| Parallel | 3 |
| Approval required | Yes |

## Request

为当前 ERP 需求生成 seven-agent 并行闭环计划，覆盖 A1/A2/A5/A3/A4/A6/A7，不执行 migration，不部署，不写库

## Selected Agents

- A2-Security-Regression-Gate
- A1-CI-Runtime-Gate
- A5-Data-Readiness
- A3-Backend-Critical-Path
- A4-Frontend-UAT-Smoke
- A6-Staging-Deploy-Runbook
- A7-Final-QA-Gate

## Held Reasons

- DB write or migration execution request requires HOLD

## Dispatch Groups

- None

## Next Commands

- None

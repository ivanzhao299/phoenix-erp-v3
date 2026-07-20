# Observer Findings Latest

| Field | Value |
| --- | --- |
| Generated at | 2026-07-20T19:48:53.443Z |
| Run files inspected | 2250 |
| Task count | 363 |
| Findings count | 32 |
| Highest severity | CRITICAL |
| Routing findings | 8 |
| Baseline findings | 3 |
| Report schema findings | 4 |
| Codex CLI executed | No |
| Database written | No |
| Deployed | No |

## Findings

### OBS-0001 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/REQ-NL-20260622-202514-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0002 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/REQ-NL-20260622-202514-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0003 - MEDIUM - routing

- Affected Agent: A5-Data-Readiness
- Evidence: docs/ops/runs/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.json: expected A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness but selected A2-Security-Regression-Gate, A1-CI-Runtime-Gate
- Suggested Fix: Re-run Agent Router against the source request and update routing rules or orchestration plan generation.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Create an ops-only router regression task for the missing Agent signals.

### OBS-0004 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0005 - MEDIUM - routing

- Affected Agent: A5-Data-Readiness
- Evidence: docs/ops/runs/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.md: expected A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness but selected A2-Security-Regression-Gate, A1-CI-Runtime-Gate
- Suggested Fix: Re-run Agent Router against the source request and update routing rules or orchestration plan generation.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Create an ops-only router regression task for the missing Agent signals.

### OBS-0006 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0007 - MEDIUM - routing

- Affected Agent: A5-Data-Readiness
- Evidence: docs/ops/runs/REQ-NL-20260622-212837-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.json: expected A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness but selected A2-Security-Regression-Gate, A1-CI-Runtime-Gate
- Suggested Fix: Re-run Agent Router against the source request and update routing rules or orchestration plan generation.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Create an ops-only router regression task for the missing Agent signals.

### OBS-0008 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/REQ-NL-20260622-212837-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0009 - MEDIUM - routing

- Affected Agent: A5-Data-Readiness
- Evidence: docs/ops/runs/REQ-NL-20260622-212837-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.md: expected A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness but selected A2-Security-Regression-Gate, A1-CI-Runtime-Gate
- Suggested Fix: Re-run Agent Router against the source request and update routing rules or orchestration plan generation.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Create an ops-only router regression task for the missing Agent signals.

### OBS-0010 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/REQ-NL-20260622-212837-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0011 - HIGH - routing

- Affected Agent: A3-Backend-Critical-Path, A2-Security-Regression-Gate
- Evidence: docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.json: expected A3-Backend-Critical-Path, A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness, A4-Frontend-UAT-Smoke, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate but selected A4-Frontend-UAT-Smoke, A1-CI-Runtime-Gate, A5-Data-Readiness, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate
- Suggested Fix: Re-run Agent Router against the source request and update routing rules or orchestration plan generation.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Create an ops-only router regression task for the missing Agent signals.

### OBS-0012 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0013 - HIGH - routing

- Affected Agent: A3-Backend-Critical-Path, A2-Security-Regression-Gate
- Evidence: docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.md: expected A3-Backend-Critical-Path, A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness, A4-Frontend-UAT-Smoke, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate but selected A4-Frontend-UAT-Smoke, A1-CI-Runtime-Gate, A5-Data-Readiness, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate
- Suggested Fix: Re-run Agent Router against the source request and update routing rules or orchestration plan generation.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Create an ops-only router regression task for the missing Agent signals.

### OBS-0014 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0015 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/REQ-NL-20260623-003531-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0016 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/REQ-NL-20260623-003531-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0017 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/router-v1-case1-route-plan.md: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0018 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/router-v1-revalidate-case1-route-plan.md: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0019 - HIGH - routing

- Affected Agent: A3-Backend-Critical-Path, A2-Security-Regression-Gate
- Evidence: docs/ops/runs/store-payment-closed-loop-fix-before/REQ-NL-20260622-234717-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.json: expected A3-Backend-Critical-Path, A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness, A4-Frontend-UAT-Smoke, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate but selected A4-Frontend-UAT-Smoke, A1-CI-Runtime-Gate, A5-Data-Readiness, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate
- Suggested Fix: Re-run Agent Router against the source request and update routing rules or orchestration plan generation.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Create an ops-only router regression task for the missing Agent signals.

### OBS-0020 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/store-payment-closed-loop-fix-before/REQ-NL-20260622-234717-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0021 - HIGH - routing

- Affected Agent: A3-Backend-Critical-Path, A2-Security-Regression-Gate
- Evidence: docs/ops/runs/store-payment-closed-loop-fix-before/REQ-NL-20260622-234717-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.md: expected A3-Backend-Critical-Path, A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness, A4-Frontend-UAT-Smoke, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate but selected A4-Frontend-UAT-Smoke, A1-CI-Runtime-Gate, A5-Data-Readiness, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate
- Suggested Fix: Re-run Agent Router against the source request and update routing rules or orchestration plan generation.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Create an ops-only router regression task for the missing Agent signals.

### OBS-0022 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/store-payment-closed-loop-fix-before/REQ-NL-20260622-234717-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0023 - LOW - parallel-dispatch

- Affected Agent: A1/A2/A5
- Evidence: docs/ops/runs/store-payment-closed-loop-fix-route-plan.md: readonly validation Agents are selected but not clearly grouped together.
- Suggested Fix: Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Add a parallel-group regression fixture to agent-orchestrator.

### OBS-0024 - MEDIUM - repeat-hold

- Affected Agent: Codex-Orchestrator
- Evidence: Queue HOLD count is 7.
- Suggested Fix: Cluster HOLD reasons and create one platform evolution task per repeated blocker.
- Auto Fix Eligible: false
- Requires Human Gate: true
- Recommended Next Task: Run Observer HOLD clustering in the next iteration.

### OBS-0025 - CRITICAL - runner-generation-drift

- Affected Agent: BugIntakeLocalRunner
- Evidence: 3 terminal task(s) match runner-owned quarantine/dependency HOLD evidence.
- Suggested Fix: Filter runner-created dependency links and create a bounded new redispatch generation for approved technical HOLDs.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Apply IMPROVE-BUG-INTAKE-QUEUE-RECOVERY.

### OBS-0026 - HIGH - report-schema

- Affected Agent: A2-Security-Regression-Gate
- Evidence: docs/ops/runs/REQ-NL-20260622-195229-STORE-PAYMENT-A2-A1-MIGRATION-01-A2-diagnosis.json: missing commit_hash, verification_results, migration_executed, database_written, deployed, recommend_next_agent/next_agents
- Suggested Fix: Normalize this Agent result before using it for next-Agent decision or task board update.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Run normalize-agent-result for REQ-NL-20260622-195229-STORE-PAYMENT-A2-A1-MIGRATION-01-A2.

### OBS-0027 - HIGH - report-schema

- Affected Agent: A2-Security-Regression-Gate
- Evidence: docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-01-A2-diagnosis.json: missing commit_hash, verification_results, migration_executed, database_written, deployed, recommend_next_agent/next_agents
- Suggested Fix: Normalize this Agent result before using it for next-Agent decision or task board update.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Run normalize-agent-result for REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-01-A2.

### OBS-0028 - HIGH - report-schema

- Affected Agent: A2-Security-Regression-Gate
- Evidence: docs/ops/runs/REQ-NL-20260622-205604-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UAT-MIG-01-A2-diagnosis.json: missing commit_hash, verification_results, migration_executed, database_written, deployed, recommend_next_agent/next_agents
- Suggested Fix: Normalize this Agent result before using it for next-Agent decision or task board update.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Run normalize-agent-result for REQ-NL-20260622-205604-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UAT-MIG-01-A2.

### OBS-0029 - MEDIUM - report-schema

- Affected Agent: A2-Security-Regression-Gate
- Evidence: docs/ops/runs/a2-app-module-wiring-follow-up-result.json: missing commit_hash, migration_added, verification_results, recommend_next_agent
- Suggested Fix: Normalize this Agent result before using it for next-Agent decision or task board update.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Run normalize-agent-result for REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP.

### OBS-0030 - MEDIUM - baseline

- Affected Agent: A5-Data-Readiness
- Evidence: /Users/mac/phoenix-erp-worktrees/a5-data-readiness dirty status: ?? docs/ops/runs/2026-07-07T13-09-44-547Z-A5-Data-Readiness-baseline-lifecycle.json; ?? docs/ops/runs/2026-07-07T13-09-44-548Z-A5-Data-Readiness-baseline-lifecycle.md
- Suggested Fix: Use baseline autopilot or HOLD if dirty files touch business code.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Baseline cleanup for A5-Data-Readiness.

### OBS-0031 - MEDIUM - baseline

- Affected Agent: A6-Staging-Deploy-Runbook
- Evidence: A6-Staging-Deploy-Runbook worktree HEAD c5cd2134 is behind main c564cf36.
- Suggested Fix: Baseline Autopilot should rebase this worktree before claim or merge.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Rebase A6-Staging-Deploy-Runbook with baseline autopilot.

### OBS-0032 - MEDIUM - baseline

- Affected Agent: A7-Final-QA-Gate
- Evidence: A7-Final-QA-Gate worktree HEAD 8f6d9249 is behind main c564cf36.
- Suggested Fix: Baseline Autopilot should rebase this worktree before claim or merge.
- Auto Fix Eligible: true
- Requires Human Gate: false
- Recommended Next Task: Rebase A7-Final-QA-Gate with baseline autopilot.

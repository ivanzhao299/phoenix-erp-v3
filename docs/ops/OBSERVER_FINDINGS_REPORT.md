# Observer Findings Report

## Summary

- Findings count: 35
- Highest severity: HIGH
- Routing findings: 8
- Baseline findings: 8
- Report schema findings: 4
- Codex CLI executed: No
- Database written: No
- Deployed: No

## Current Findings

- OBS-0001 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/REQ-NL-20260622-202514-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- OBS-0002 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/REQ-NL-20260622-202514-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- OBS-0003 [MEDIUM] routing / A5-Data-Readiness: docs/ops/runs/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.json: expected A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness but selected A2-Security-Regression-Gate, A1-CI-Runtime-Gate
- OBS-0004 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- OBS-0005 [MEDIUM] routing / A5-Data-Readiness: docs/ops/runs/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.md: expected A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness but selected A2-Security-Regression-Gate, A1-CI-Runtime-Gate
- OBS-0006 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- OBS-0007 [MEDIUM] routing / A5-Data-Readiness: docs/ops/runs/REQ-NL-20260622-212837-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.json: expected A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness but selected A2-Security-Regression-Gate, A1-CI-Runtime-Gate
- OBS-0008 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/REQ-NL-20260622-212837-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- OBS-0009 [MEDIUM] routing / A5-Data-Readiness: docs/ops/runs/REQ-NL-20260622-212837-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.md: expected A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness but selected A2-Security-Regression-Gate, A1-CI-Runtime-Gate
- OBS-0010 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/REQ-NL-20260622-212837-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- OBS-0011 [HIGH] routing / A3-Backend-Critical-Path, A2-Security-Regression-Gate: docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.json: expected A3-Backend-Critical-Path, A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness, A4-Frontend-UAT-Smoke, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate but selected A4-Frontend-UAT-Smoke, A1-CI-Runtime-Gate, A5-Data-Readiness, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate
- OBS-0012 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- OBS-0013 [HIGH] routing / A3-Backend-Critical-Path, A2-Security-Regression-Gate: docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.md: expected A3-Backend-Critical-Path, A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness, A4-Frontend-UAT-Smoke, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate but selected A4-Frontend-UAT-Smoke, A1-CI-Runtime-Gate, A5-Data-Readiness, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate
- OBS-0014 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- OBS-0015 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/REQ-NL-20260623-003531-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- OBS-0016 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/REQ-NL-20260623-003531-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- OBS-0017 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/router-v1-case1-route-plan.md: readonly validation Agents are selected but not clearly grouped together.
- OBS-0018 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/router-v1-revalidate-case1-route-plan.md: readonly validation Agents are selected but not clearly grouped together.
- OBS-0019 [HIGH] routing / A3-Backend-Critical-Path, A2-Security-Regression-Gate: docs/ops/runs/store-payment-closed-loop-fix-before/REQ-NL-20260622-234717-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.json: expected A3-Backend-Critical-Path, A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness, A4-Frontend-UAT-Smoke, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate but selected A4-Frontend-UAT-Smoke, A1-CI-Runtime-Gate, A5-Data-Readiness, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate
- OBS-0020 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/store-payment-closed-loop-fix-before/REQ-NL-20260622-234717-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.json: readonly validation Agents are selected but not clearly grouped together.
- OBS-0021 [HIGH] routing / A3-Backend-Critical-Path, A2-Security-Regression-Gate: docs/ops/runs/store-payment-closed-loop-fix-before/REQ-NL-20260622-234717-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.md: expected A3-Backend-Critical-Path, A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness, A4-Frontend-UAT-Smoke, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate but selected A4-Frontend-UAT-Smoke, A1-CI-Runtime-Gate, A5-Data-Readiness, A6-Staging-Deploy-Runbook, A7-Final-QA-Gate
- OBS-0022 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/store-payment-closed-loop-fix-before/REQ-NL-20260622-234717-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-orchestration-plan.md: readonly validation Agents are selected but not clearly grouped together.
- OBS-0023 [LOW] parallel-dispatch / A1/A2/A5: docs/ops/runs/store-payment-closed-loop-fix-route-plan.md: readonly validation Agents are selected but not clearly grouped together.
- OBS-0024 [HIGH] report-schema / A2-Security-Regression-Gate: docs/ops/runs/REQ-NL-20260622-195229-STORE-PAYMENT-A2-A1-MIGRATION-01-A2-diagnosis.json: missing commit_hash, verification_results, migration_executed, database_written, deployed, recommend_next_agent/next_agents
- OBS-0025 [HIGH] report-schema / A2-Security-Regression-Gate: docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-01-A2-diagnosis.json: missing commit_hash, verification_results, migration_executed, database_written, deployed, recommend_next_agent/next_agents
- OBS-0026 [HIGH] report-schema / A2-Security-Regression-Gate: docs/ops/runs/REQ-NL-20260622-205604-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UAT-MIG-01-A2-diagnosis.json: missing commit_hash, verification_results, migration_executed, database_written, deployed, recommend_next_agent/next_agents
- OBS-0027 [MEDIUM] report-schema / A2-Security-Regression-Gate: docs/ops/runs/a2-app-module-wiring-follow-up-result.json: missing commit_hash, migration_added, verification_results, recommend_next_agent
- OBS-0028 [MEDIUM] baseline / Codex-Orchestrator: /Users/mac/phoenix-erp-worktrees/codex-orchestrator dirty status: M docs/ops/AGENT_TASK_BOARD.md;  M docs/ops/runs/doctor-latest.json;  M docs/ops/runs/evolution-doctor-latest.json;  M docs/ops/runtime-memory/CODEX_ORCHESTRATOR_MEMORY.md;  M docs/ops/runtime-memory/DECISION_LOG.md;  M docs/ops/runtime-memory/GUARDRAILS.md;  M docs/ops/runtime-memory/NEXT_ACTIONS.md;  M docs/ops/runtime-memory/PROJECT_STATE.json;  M docs/ops/runtime-memory/STORE_PAYMENT_STATE.md; ?? docs/ops/PRODUCTION_REMEDIATION_HIGH_THROUGHPUT_BATCH_PLAN.md; ?? docs/ops/PRODUCTION_REMEDIATION_HIGH_THROUGHPUT_POLICY.md; ?? docs/ops/PRODUCTION_SERVER_REMEDIATION_HIGH_THROUGHPUT_BATCH_REPORT.md; ?? docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_A7_STAGE_SUMMARY_GATE.md; ?? docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_DEPLOY_CHAIN_HARDENING_REVIEW.md; ?? docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_INITIAL_DATA_IMPORT_DIAGNOSIS_REPORT.md; ?? docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MASTER_DATA_DIAGNOSIS_REPORT.md; ?? docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_UNRESOLVED_UPLOADS_OWNER_DIAGNOSIS_REPORT.md; ?? docs/ops/runs/remediation-r3-high-throughput-batch1-20260624-124012/
- OBS-0029 [MEDIUM] baseline / A1-CI-Runtime-Gate: A1-CI-Runtime-Gate worktree HEAD 9f2a346e is behind main 001d5e21.
- OBS-0030 [MEDIUM] baseline / A2-Security-Regression-Gate: A2-Security-Regression-Gate worktree HEAD eb88e4d1 is behind main 001d5e21.
- OBS-0031 [MEDIUM] baseline / A3-Backend-Critical-Path: A3-Backend-Critical-Path worktree HEAD 476361e0 is behind main 001d5e21.
- OBS-0032 [MEDIUM] baseline / A4-Frontend-UAT-Smoke: A4-Frontend-UAT-Smoke worktree HEAD 476361e0 is behind main 001d5e21.
- OBS-0033 [MEDIUM] baseline / A5-Data-Readiness: A5-Data-Readiness worktree HEAD f3b7d954 is behind main 001d5e21.
- OBS-0034 [MEDIUM] baseline / A6-Staging-Deploy-Runbook: A6-Staging-Deploy-Runbook worktree HEAD 3fc2e089 is behind main 001d5e21.
- OBS-0035 [MEDIUM] baseline / A7-Final-QA-Gate: A7-Final-QA-Gate worktree HEAD 3fc2e089 is behind main 001d5e21.

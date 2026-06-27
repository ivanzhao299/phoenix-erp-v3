# Production Remediation High Throughput Batch Plan

Date: 2026-06-24

## Objective

Run one high-throughput, read-only remediation diagnosis batch for Store Payment production-side readiness. The batch uses parallel planning and evidence collection, but all write, migration, deploy, restart, and push actions remain locked.

## Selected Agents

- A1-CI-Runtime-Gate
- A2-Security-Regression-Gate
- A5-Data-Readiness
- A6-Staging-Deploy-Runbook
- A7-Final-QA-Gate

Excluded execution agents:

- A3-Backend-Critical-Path
- A4-Frontend-UIUX-UAT

## Dispatch Groups

| Group | Tasks | Agent focus | Parallel eligibility |
| --- | --- | --- | --- |
| A | Menu / Role / DataScope remote audit reuse | A2 + A5 + A1 | Completed before batch; reused as input. |
| B | Initial Data Import Repair Diagnosis | A5 + A1 | Parallel read-only. |
| C | Master Data Remediation Diagnosis | A5 + A2 | Parallel read-only. |
| D | Unresolved Historical Uploads Owner Diagnosis | A5 + A2 | Parallel read-only. |
| E | Deploy Chain Hardening Review | A6 + A2 + A1 | Parallel read-only. |
| F | A7 Stage Summary Gate | A7 | Serial summary after A-E. |

## Execution Limits

| Limit | Value |
| --- | --- |
| default_parallel_limit | 4 |
| remote_ssh_parallel_limit | 2 |
| write_gate_serial | true |
| migration_gate_serial | true |
| deploy_gate_serial | true |
| restart_gate_serial | true |

## Evidence Inputs

- Reused Group A evidence: `/opt/phoenix-erp-backups/remediation-r3-menu-role-datascope-audit-20260624-122800`.
- Batch B-E evidence: `/opt/phoenix-erp-backups/remediation-r3-high-throughput-batch1-20260624-124012`.
- Local pulled evidence: `docs/ops/runs/remediation-r3-high-throughput-batch1-20260624-124012/`.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| DB write | No |
| Migration | No |
| Deploy | No |
| Restart | No |
| Push | No |
| Remote file delete/move | No |
| Nginx/env/config change | No |
| Business code change | No |

## Expected Outputs

- High throughput policy.
- Batch plan.
- Initial data import diagnosis report.
- Master data diagnosis report.
- Unresolved uploads owner diagnosis report.
- Deploy chain hardening review.
- Batch report.
- A7 stage summary gate.
- Runtime Memory update.

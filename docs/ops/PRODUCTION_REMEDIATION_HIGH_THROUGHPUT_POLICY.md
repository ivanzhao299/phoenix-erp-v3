# Production Remediation High Throughput Policy

Date: 2026-06-24

## Objective

Enable controlled high-throughput remediation planning for the production-side Store Payment readiness work without relaxing safety boundaries.

This mode is for parallel read-only audit, diagnosis, and report generation. It does not authorize production writes.

## Enabled Mode

| Field | Value |
| --- | --- |
| high_throughput_mode | enabled |
| default_parallel_limit | 4 |
| remote_ssh_parallel_limit | 2 |
| write_gate_serial | true |
| migration_gate_serial | true |
| deploy_gate_serial | true |
| restart_gate_serial | true |
| summary_agent | A7-Final-QA-Gate |

## Allowed Parallel Agents

| Agent | Parallel use |
| --- | --- |
| A1-CI-Runtime-Gate | Static validation, gate validation, report completeness checks. |
| A2-Security-Regression-Gate | Read-only security review of RBAC, DataScope, raw URL, upload, deploy-chain risk. |
| A5-Data-Readiness | Read-only DB and master-data readiness checks. |
| A6-Staging-Deploy-Runbook | Runbook and deploy-chain review only; no deploy execution. |

A7 summarizes stage state after parallel work completes.

## Locks

| Lock | Rule |
| --- | --- |
| DB write lock | Any INSERT / UPDATE / DELETE / DDL requires a separate approved Gate. |
| Migration lock | Migration execution is serial and requires explicit approval. |
| Deploy lock | Deploy execution is serial and requires explicit approval. |
| Restart lock | Service restart is serial and requires explicit approval. |
| Push lock | Push requires explicit approval and is not part of this batch. |
| File mutation lock | No remote file delete, move, Nginx change, env change, or config edit in high-throughput diagnosis mode. |
| Runtime memory lock | Runtime memory may be updated locally after evidence review. |
| Baseline lock | Baseline Autopilot must commit/rebase/safe-merge/gate after the batch. |

## Forbidden In This Mode

- Production DB writes.
- Migration execution.
- Deploy or restart.
- Push.
- Remote file delete or move.
- Nginx, env, or production config mutation.
- Business code changes.
- Automatic menu / role / DataScope repair.
- Automatic master-data remediation.
- Automatic unresolved historical upload ownership claim.

## Fail-Closed Rule

If a parallel task cannot prove evidence, it must produce HOLD instead of guessing. Missing evidence never becomes GO by inference.

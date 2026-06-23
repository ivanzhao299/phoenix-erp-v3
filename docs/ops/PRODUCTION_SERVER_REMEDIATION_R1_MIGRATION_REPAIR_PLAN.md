# Production Server Remediation R1 Migration Repair Plan

Date: 2026-06-23

## Objective

Define the safe repair path for the production-side remediation target migration drift found during R1. This plan does not execute migration, write database data, deploy, restart services, or push code.

## R1 Summary

| Area | Finding |
| --- | --- |
| remote branch | `main` |
| remote commit | `87b5781` |
| Store Payment migration file | present |
| File Metadata migration file | missing |
| `store_payment_accounts` | missing |
| `store_payment_records` | missing |
| `file_metadata` | missing |
| `file_metadata` missing cause | `CODE_NOT_DEPLOYED` |
| current decision | HOLD |

## Root Cause Assessment

Primary root cause:

- Remote code is older than the local approved Store Payment protected attachment / File Metadata work. It lacks `1782042418112-CreateFileMetadata.ts`.

Secondary drift:

- The audited target DB also lacks `store_payment_accounts` and `store_payment_records`.
- Store Payment migration history text matches exist, but target tables are missing, so the next Gate must validate the TypeORM migration table rows and audited DB target before repair.

## Recommended Repair Path

### Gate R2-APP-001 - Remote Code Alignment Precheck

Goal: confirm exactly which commit should be deployed to the remediation target.

Allowed:

- read-only git diff / log inspection
- compare local approved commit chain with remote `main@87b5781`
- prepare a deploy candidate manifest

Forbidden:

- push main
- deploy
- migration
- DB write

Decision: required before any repair execution.

### Gate R2-APP-002 - Store Payment Schema Migration Repair

Goal: execute only the approved Store Payment schema migration if it is not truly applied to the audited DB.

Allowed only after approval:

- run the reviewed Store Payment migration against the explicitly confirmed remediation DB target
- verify `store_payment_accounts`
- verify `store_payment_records`
- verify indexes and constraints

Forbidden:

- non-Store Payment migrations
- seed
- menu / role writes
- business data writes
- deploy
- cleanup / reset

Rollback:

- use the approved migration `down()` only if user approves rollback and A1/A2 confirm no business data risk.

### Gate R2-APP-003 - File Metadata Migration Repair

Goal: deploy or otherwise make available `1782042418112-CreateFileMetadata.ts`, then execute the approved File Metadata migration against the explicitly confirmed remediation DB target.

Allowed only after approval:

- code alignment needed for the migration file
- execute File Metadata migration
- verify `file_metadata`
- verify required columns, indexes, and constraints

Forbidden:

- exposing raw URLs
- enabling production attachment preview/download
- writing Store Payment business records
- copying local UAT fixtures

Rollback:

- use the approved migration `down()` only with a dedicated rollback Gate.

### Gate R2-APP-004 - Post-Repair Read-only Validation

Goal: verify schema repair without enabling business trial.

Checks:

- `store_payment_accounts` exists
- `store_payment_records` exists
- `file_metadata` exists
- migration history aligns with executed migrations
- no unexpected tables changed
- no business rows inserted
- protected attachment remains fail-closed until metadata and ACL evidence are available

## Required User Approvals

1. Approve remote code alignment strategy.
2. Approve whether to deploy the missing File Metadata migration file to the remediation target.
3. Approve Store Payment schema migration execution if the Store Payment tables are still absent.
4. Approve File Metadata migration execution.
5. Approve rollback criteria before any migration execution.
6. Approve whether to keep production-side target in remediation mode after schema repair.

## A1 Validation Requirements

- Validate migration files and hashes.
- Validate `down()` exists.
- Validate no data DML in migrations.
- Validate nullable unique gate.
- Run W5 closeout gate after repair.
- Confirm no non-approved migration was executed.

## A2 Security Requirements

- Confirm no credential or secret leakage in reports.
- Confirm no raw URL exposure.
- Confirm no `/uploads` exposure is introduced.
- Confirm no protected attachment preview/download is enabled by schema repair alone.
- Confirm no production deploy or service restart is bundled into migration repair.

## A5 Data Requirements

- Confirm target DB identity before repair.
- Confirm table presence after repair.
- Confirm Store Payment remains HOLD until menu/role/DataScope and protected attachment metadata are separately proven.
- Confirm local UAT fixture data is not copied into the production-side target.

## Current Recommendation

Recommended decision: `READY_FOR_USER_APPROVAL_WITH_HOLD`.

The next single Gate should be:

`APPROVE_REMOTE_CODE_ALIGNMENT_AND_SCHEMA_REPAIR_PRECHECK`

Do not execute migration until that precheck confirms the exact remote code target, DB target, migration history row semantics, and rollback boundary.

## Safety Record

| Action | Result |
| --- | --- |
| migration executed in this plan | no |
| DB write in this plan | no |
| deploy in this plan | no |
| restart in this plan | no |
| push in this plan | no |


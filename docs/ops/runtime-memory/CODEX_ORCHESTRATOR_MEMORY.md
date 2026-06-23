# Codex-Orchestrator Runtime Memory

Last updated: 2026-06-23

## Active Context

- Active module: Store Payment
- Current stage: PRODUCTION_SERVER_REMEDIATION_R1_MIGRATION_AUDIT_READY
- Active decision: WAITING_USER_APPROVAL_FOR_REMOTE_CODE_ALIGNMENT_AND_SCHEMA_REPAIR_PRECHECK
- Next gate: APPROVE_REMOTE_CODE_ALIGNMENT_AND_SCHEMA_REPAIR_PRECHECK
- Page entry: `/store-payment`
- Menu entry: 销售管理 / 统一收款

## Operating Rules

1. Codex-Orchestrator must read this runtime memory before continuing Store Payment work.
2. Do not rely on long-lived chat context for project state.
3. Do not ask the user to manually run Terminal commands for routine sync, rebase, merge, docs/ops/runs cleanup, W5 gate, or baseline lifecycle.
4. Baseline Autopilot remains responsible for auto-commit, rebase, safe merge, and W5 gate.
5. Push, production deployment, production DB writes, and destructive operations still require explicit user approval.
6. Attachment preview/download remains disabled until a dedicated A3 protected streaming Gate and A2 security review are approved.
7. Raw URL exposure is forbidden.

## Latest Store Payment Decision

Store Payment is ready for controlled pilot with conditions:

- Frontend page exists at `/store-payment`.
- Store Payment menu exists under 销售管理 / 统一收款.
- Permission buttons are controlled by `MENU_STORE_PAYMENT*` and V/E/X action bits.
- proof / QR preview and download use protected Store Payment endpoints when approved metadata, ownership, RBAC, and DataScope checks pass.
- The page does not show raw URLs or build `/uploads` links.
- Store code canonical display is `STORE-VTE-001 / 万象直营店`; `ST-VTE-001` is legacy alias only.
- Account QR protected attachment UAT passed.
- Record proof protected attachment UAT passed.
- A6 staging deploy runbook is complete.
- A7 final QA Gate is complete.
- Controlled pilot decision is GO WITH CONDITIONS.
- Staging deploy approval package is complete.
- Approval matrix is complete.
- Business UAT scope is complete.
- The non-main branch `w5-codex-orchestrator` was pushed to origin at `0e71753c`.
- Staging deploy was not executed because no staging target, staging DB, staging file storage, or staging workflow was discoverable.
- `push main` was not executed because the repository production workflow deploys on `push main`.
- A staging-only workflow skeleton now exists at `.github/workflows/staging-deploy.yml`.
- Staging env and compose skeletons now exist.
- The provided server connection card was parsed as production-oriented and sanitized.
- A same-host staging target candidate can be derived only with strict isolation and explicit user approval.
- Candidate staging deploy path: `/opt/phoenix-erp-staging`.
- Candidate staging file storage path: `/data/phoenix-erp-staging/files`.
- Candidate staging DB name: `phoenix_erp_staging`.
- Production DB, production file storage, production deploy path, and production secrets must not be reused for staging.
- Real staging execution still requires user approval, independent staging secrets, and GitHub `staging` environment configuration.
- User has reclassified the current server as a production-side pre-production / remediation target rather than a mature stable production environment.
- Remediation intake is complete as a docs-only phase.
- Public API health is reachable and reports production mode with DB connected.
- SSH command-level read-only inventory timed out and remains a P0 blocker before detailed server remediation.
- Production-side remediation now waits for backup/snapshot approval.
- R0 backup baseline is complete with conditions.
- Backup directory: `/opt/phoenix-erp-backups/remediation-r0-20260623-211849`.
- DB backup file: `phoenix_erp-20260623-211849.dump`.
- SSH observability is restored but long sessions remain unstable.
- Remote `file_metadata` is missing based on read-only diagnostic evidence.
- R1 migration-state audit is complete with conditions.
- Remote code is `main@87b5781`.
- Remote Store Payment migration file exists and matches local hash.
- Remote File Metadata migration file is missing.
- Remote audited DB lacks `store_payment_accounts`, `store_payment_records`, and `file_metadata`.
- `file_metadata` missing cause is classified as `CODE_NOT_DEPLOYED`.
- Migration execution, DB write, deploy, restart, and push were not executed.
- Initialization import issues, master data, and RBAC/DataScope remain pending follow-up diagnostics.

## Current Hard Stops

- No production deploy.
- No push.
- No remote production DB write.
- No migration unless a dedicated Gate is approved.
- No staging deploy until a staging-only target is provided.
- No same-host staging deploy until the user approves staging isolation derived from the production server card.
- No production-side remediation write until backup/snapshot and a specific fix Gate are approved.
- No file_metadata/schema repair until remote code alignment and schema repair precheck is approved.
- No raw URL exposure.

# Phoenix ERP Production Readiness Task List

Generated at: 2026-06-24 14:49 CST

Current baseline: `8ebf8089 docs(ops): record baseline lifecycle report`

## Purpose

This task list consolidates the previous audit, readiness, remediation, runtime gate, security, attachment, deployment-chain, and Store Payment pilot reports into one prioritized production-readiness backlog.

The goal is to move Phoenix ERP toward production-grade use as quickly as possible without bundling unrelated high-risk work. Each task below is intentionally framed as a single Gate or tightly bounded remediation unit.

## Source Reports Reviewed

- `docs/ops/A1_CI_RUNTIME_GATE_REPORT.md`
- `docs/ops/PRODUCTION_GO_NO_GO.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_BACKLOG.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_ROADMAP.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_HIGH_THROUGHPUT_BATCH_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_A7_STAGE_SUMMARY_GATE.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_INITIAL_DATA_IMPORT_DIAGNOSIS_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MASTER_DATA_DIAGNOSIS_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_UNRESOLVED_UPLOADS_OWNER_DIAGNOSIS_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_DEPLOY_CHAIN_HARDENING_REVIEW.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_ACTION_BIT_COMPATIBILITY_PLAN.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_UPLOADS_FILE_SECURITY_PRECHECK_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_UPLOADS_EXPOSURE_HARDENING_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_LEGACY_UPLOAD_TO_FILE_METADATA_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_INVENTORY_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_RESTORE_SSH_AND_METADATA_CLAIM_DRY_RUN_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_METADATA_CLAIM_EXECUTION_REPORT.md`
- `docs/ops/OBSERVER_FINDINGS_REPORT.md`
- `docs/ops/AGENT_PLATFORM_V2_95_FINAL_READINESS_REPORT.md`

## Priority Rules

- `P0` blocks production-grade use or formal production release judgment.
- `P1` is high risk and must be closed or explicitly accepted before production GO.
- `P2` improves reliability, operability, or platform maturity after P0/P1 are contained.
- `P3` is hygiene, observability, or backlog cleanup.

No task in this list authorizes production deployment, production migration, push, DB write, restart, seed, cleanup, or business-code changes. Those actions still require a dedicated Gate and explicit approval.

## Fastest Safe Sequence

1. Run `PRD-P0-002 A1_RUNTIME_SECURITY_BLOCKER_REMEDIATION_PLAN`.
2. Run `PRD-P0-003 DEPLOY_CHAIN_HARDENING_PLAN`.
3. Run `PRD-P0-004 LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE`.
4. If the user approves production DB write, run `PRD-P0-001 STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_PLAN` as a narrow disabled/pending account-placeholder Gate.
5. Run `PRD-P1-001 HISTORICAL_UPLOADS_SECOND_PASS_OR_MANUAL_REVIEW`.
6. Run `PRD-P1-002 ACTION_BIT_LEGACY_CLEANUP_PLAN`.
7. Run `PRD-P1-003 MANUAL_SCOPE_AND_DATASCOPE_MODEL_CLEANUP`.
8. Re-run A1/A2/A5/A6/A7 production readiness gates and update `PRODUCTION_GO_NO_GO.md`.

## P0 Tasks

| Task ID | Priority | Title | Source Evidence | Owner Agents | Required Gate | Status | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PRD-P0-001 | P0 | Initial data import repair diagnosis | `PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md`; `PRODUCTION_SERVER_REMEDIATION_R3_INITIAL_DATA_IMPORT_DIAGNOSIS_REPORT.md`; `PRODUCTION_SERVER_REMEDIATION_R4_INITIAL_DATA_IMPORT_REPAIR_PLAN.md`; `PRODUCTION_SERVER_REMEDIATION_R4_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REPORT.md`; `PRODUCTION_READINESS_P0_001_INITIAL_DATA_REFRESH_REPORT.md` | A5, A2, A1 | `APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_PLAN` | GO_WITH_CONDITIONS / ACCOUNT_PLACEHOLDER_WRITE_PLAN_READY | Fresh short read-only evidence confirms `store_payment_accounts=0`, `store_payment_records=0`, and Store Payment `file_metadata=0`. Do not insert payment records or attachment metadata without owner evidence. Next write Gate, if approved, should be limited to disabled/pending account placeholders with rollback SQL. |
| PRD-P0-002 | P0 | A1 runtime/security blocker remediation | `A1_CI_RUNTIME_GATE_REPORT.md`; `A1_RUNTIME_SECURITY_BLOCKER_REMEDIATION_PLAN.md`; `A1_RUNTIME_SECURITY_BLOCKER_REMEDIATION_EXECUTION_REPORT.md` | A2, A3, A1 | `APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION` | GO_WITH_CONDITIONS | Bounded fixes implemented for dev-login production fail-fast, SSE unauthorized handling, admin impersonation, Chanjet signature/timestamp/nonce validation, sensitive log masking, and procurement test drift. API build/typecheck/Jest and W5 authorized closeout PASS. Chanjet valid-signature smoke remains a runtime condition. |
| PRD-P0-003 | P0 | Deploy-chain hardening dry-run | `PRODUCTION_SERVER_REMEDIATION_R3_DEPLOY_CHAIN_HARDENING_REVIEW.md`; `PRODUCTION_GO_NO_GO.md`; `PRODUCTION_DEPLOY_CHAIN_HARDENING_PLAN.md`; `PRODUCTION_DEPLOY_CHAIN_HARDENING_DRY_RUN_REPORT.md` | A6, A2, A1 | `APPROVE_DEPLOY_CHAIN_HARDENING_DRY_RUN` | HOLD_WITH_CONDITIONS | Local deploy-chain manifest exists. Fresh remote status/diff refresh failed due SSH connection close / banner exchange timeout. Keep push-main and production deploy HOLD until remote checkout drift can be revalidated. |
| PRD-P0-004 | P0 | Legacy upload runtime verification gate | `PRODUCTION_SERVER_REMEDIATION_R2_LEGACY_UPLOAD_TO_FILE_METADATA_REPORT.md`; `PRODUCTION_SERVER_REMEDIATION_R2_UPLOADS_EXPOSURE_HARDENING_REPORT.md`; `PRODUCTION_LEGACY_UPLOAD_RUNTIME_VERIFICATION_PLAN.md`; `PRODUCTION_READINESS_P0_004_LEGACY_UPLOAD_LOCAL_COMPAT_FIX_REPORT.md` | A3, A2, A1, A6 | `APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE` | LOCAL_COMPAT_FIXED / READY_FOR_RUNTIME_VERIFICATION_APPROVAL | Local generic upload UI accepts protected `fileId` and no longer renders raw upload links. Verify running API actually uses the approved file_metadata upload response shape (`fileId`, `rawUrl: null`, `url: null`) and does not reintroduce raw URL exposure. A deploy/restart or write probe requires separate explicit approval. |
| PRD-P0-005 | P0 | Re-run production GO/NO-GO after P0 closures | `PRODUCTION_GO_NO_GO.md`; A1/A2/A5/A6/A7 reports | A7, A1, A2, A5, A6 | `APPROVE_PRODUCTION_GO_NO_GO_REEVALUATION` | Blocked by P0-001 through P0-004 | Confirm required CI, security, data readiness, deploy-chain safety, rollback plan, and approver state. Production decision remains HOLD until this passes. |

### P0 Detail Notes

`PRD-P0-001` should remain first because runtime memory and next-gate reports already converge on it. It is low-risk if kept diagnostic/read-only, and it clarifies what data repair writes, if any, must be proposed next.

`PRD-P0-002` implementation is complete with conditions. Earlier Store Payment work progressed under conditions, and the main remaining security condition is runtime/provider validation for Chanjet valid-signature callbacks after deploy-chain hardening.

`PRD-P0-003` dry-run is complete locally but remains HOLD for remote refresh. The reports show remote Nginx config drift and backup files in the checkout; production-grade operation needs a predictable deploy path and a successful fresh remote status probe.

`PRD-P0-004` is required because source remediation was implemented, but the running production API was not proven to serve the hardened behavior.

## P1 Tasks

| Task ID | Priority | Title | Source Evidence | Owner Agents | Required Gate | Status | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PRD-P1-001 | P1 | Historical uploads second-pass owner correlation or manual review | `PRODUCTION_SERVER_REMEDIATION_R3_UNRESOLVED_UPLOADS_OWNER_DIAGNOSIS_REPORT.md`; `PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_METADATA_CLAIM_EXECUTION_REPORT.md` | A5, A2, A1 | `APPROVE_UNRESOLVED_UPLOADS_SECOND_PASS_OWNER_CORRELATION_DRY_RUN` or manual review Gate | HOLD | Resolve or explicitly accept the 59 unresolved historical files. No auto-claim without evidence. |
| PRD-P1-002 | P1 | Store Payment action-bit legacy cleanup | `PRODUCTION_SERVER_REMEDIATION_R3_ACTION_BIT_COMPATIBILITY_PLAN.md`; `PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_REPORT.md` | A2, A3, A1 | `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN` | Ready for planning | Remove temporary `C/A` compatibility grants or align runtime/controller checks to the target `V/E/X` model without breaking approved Store Payment operations. |
| PRD-P1-003 | P1 | Manual scope and DataScope model cleanup | `PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_REPORT.md`; `PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md` | A5, A2, A1 | `APPROVE_MANUAL_SCOPE_REVIEW_AND_DATASCOPE_MODEL_CLEANUP` | HOLD | Review excluded manual rows, document `SELF/COMPANY/GROUP` compatibility, and decide whether formal `STORE/ALL` support is needed. |
| PRD-P1-004 | P1 | Master data remediation plan | `PRODUCTION_SERVER_REMEDIATION_R3_MASTER_DATA_DIAGNOSIS_REPORT.md` | A5, A2, A1 | `APPROVE_MASTER_DATA_REMEDIATION_PLAN` | GO WITH CONDITIONS | Keep `STORE-VTE-001` canonical, preserve `ST-VTE-001` as documented legacy alias risk, and avoid broad auto-rewrites. |
| PRD-P1-005 | P1 | Store Payment remote readiness smoke | Store Payment controlled pilot reports; production remediation backlog | A1, A2, A5, A6 | `APPROVE_STORE_PAYMENT_REMOTE_READINESS_SMOKE` | Pending after deploy-chain decision | Verify remote `/store-payment`, menus, role grants, DataScope, protected endpoints, and UAT fixture behavior on the intended environment. |
| PRD-P1-006 | P1 | Production auth/CORS/cookie settings review | `PRODUCTION_SERVER_REMEDIATION_BACKLOG.md`; `A1_CI_RUNTIME_GATE_REPORT.md` | A2, A1 | `APPROVE_PRODUCTION_AUTH_COOKIE_CORS_REVIEW` | Proposed | Confirm production auth settings, cookie flags, CORS, SSE auth behavior, and dev-login fail-fast. |
| PRD-P1-007 | P1 | Rollback path and backup restore validation | `PRODUCTION_GO_NO_GO.md`; production remediation reports | A6, A1, A7 | `APPROVE_ROLLBACK_RESTORE_VALIDATION` | Proposed | Prove restore/rollback commands, owners, expected downtime, and no-production-data-loss assumptions before production GO. |

## P2 Tasks

| Task ID | Priority | Title | Source Evidence | Owner Agents | Required Gate | Status | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PRD-P2-001 | P2 | Separate remediation, staging, and production workflows | `PRODUCTION_SERVER_REMEDIATION_BACKLOG.md`; `PRODUCTION_SERVER_REMEDIATION_R3_DEPLOY_CHAIN_HARDENING_REVIEW.md` | A6, Codex-Orchestrator | `APPROVE_WORKFLOW_SEPARATION_PLAN` | Proposed | Operators can tell whether a task targets docs-only, local, staging, or production, with separate approval language and evidence paths. |
| PRD-P2-002 | P2 | Standardize production evidence collection | Production remediation reports | Codex-Orchestrator, A1, A6 | `APPROVE_PRODUCTION_EVIDENCE_STANDARD` | Proposed | Every production-side Gate records environment, timestamp, remote evidence path, command class, write/no-write flags, and rollback notes. |
| PRD-P2-003 | P2 | Normalize file storage strategy | R2 uploads reports | A2, A3, A6 | `APPROVE_FILE_STORAGE_NORMALIZATION_PLAN` | Proposed | Legacy upload behavior, file_metadata, protected endpoints, storage path privacy, and future object storage strategy are aligned. |
| PRD-P2-004 | P2 | Platform maturity closeout to 95%+ | `AGENT_PLATFORM_V2_95_FINAL_READINESS_REPORT.md`; `OBSERVER_FINDINGS_REPORT.md` | Codex-Orchestrator, A1, A2, A5 | `APPROVE_AGENT_PLATFORM_95_CLOSEOUT` | 91% baseline | Revalidate stale Observer findings, parse real reports through diagnosis, clean old queue tasks, and prove low-risk auto-merge sample. |
| PRD-P2-005 | P2 | Production health dashboard plan | Production remediation backlog | A6, A1 | `APPROVE_PRODUCTION_HEALTH_DASHBOARD_PLAN` | Proposed | Define dashboard checks for app health, DB health, migration state, queue health, auth/security smoke, and file exposure smoke. |

## P3 Tasks

| Task ID | Priority | Title | Source Evidence | Owner Agents | Required Gate | Status | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PRD-P3-001 | P3 | Observer stale finding revalidation | `OBSERVER_FINDINGS_REPORT.md` | Codex-Orchestrator | `APPROVE_OBSERVER_FINDING_REVALIDATION` | Proposed | Mark fixed router/platform findings as closed or stale, keep only reproducible issues in the active backlog. |
| PRD-P3-002 | P3 | Archive completed Gate artifacts | `AGENT_TASK_BOARD.md`; `docs/ops/runs/**` | Codex-Orchestrator | `APPROVE_OPS_ARTIFACT_ARCHIVE_PLAN` | Proposed | Keep recent evidence accessible while reducing task-board noise and stale runs clutter. |
| PRD-P3-003 | P3 | Update operator short-command playbook | Agent Inbox reports and runtime memory | Codex-Orchestrator | Docs-only | Proposed | Make the Agent Inbox command pattern the default entrypoint for future production remediation. |

## Production Readiness Definition Of Done

Phoenix ERP should not be labeled production-grade until all of the following are true:

1. All `P0` tasks are `GO` or explicitly accepted as `GO WITH CONDITIONS`.
2. No unresolved `P1` defect remains without named owner, expiry date, and explicit risk acceptance.
3. A1 runtime/security gate is no longer FAIL.
4. A2 security review confirms no raw URL exposure, auth bypass, RBAC bypass, DataScope bypass, or sensitive-log leak remains in approved release scope.
5. A5 confirms master data, Store Payment pilot data, and initial import readiness for the intended environment.
6. A6 confirms deployment path, rollback path, backup state, and remote checkout hygiene.
7. A7 records final GO/HOLD/ROLLBACK decision in `PRODUCTION_GO_NO_GO.md`.
8. No production push, deploy, DB write, migration, restart, seed, cleanup, or reset occurs without a dedicated approval Gate.

## Recommended Next Single Gate

`APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE`

Rationale:

- `PRD-P0-002` has been implemented with conditions.
- `PRD-P0-001` dry-run produced a manifest but needs fresh SSH/DB evidence because the remote SQL batch failed during banner exchange.
- `PRD-P0-003` local deploy-chain dry-run is documented, but remote refresh is HOLD due SSH connection instability.
- `PRD-P0-004` should proceed only as read-only runtime verification; any upload/restart/write probe still requires separate approval.

## Explicit Non-Actions

- Do not run production migration from this task list.
- Do not write production DB from this task list.
- Do not push.
- Do not deploy.
- Do not restart services.
- Do not mutate remote server configuration.
- Do not auto-claim the 59 unresolved historical files.
- Do not execute manual-review scope rows automatically.
- Do not remove temporary action-bit compatibility without a dedicated cleanup Gate.

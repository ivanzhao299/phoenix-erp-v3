# Decision Log

## 2026-07-14 — Chanjet Continuous Readonly Alignment

Decision: `GO_WITH_CONDITIONS`.

- Full readonly synchronization runs every four hours and retries failed scope/book targets at most three times.
- A PostgreSQL advisory lock prevents duplicate execution across API instances.
- Remaining failures are not hidden: the run becomes HOLD and Cron Monitor creates an alert.
- Counterparty mappings may be system-confirmed only when the enabled account-book company, normalized ERP/Chanjet code, normalized ERP/Chanjet name, and ACTIVE ERP status all match exactly.
- Code-only, name-only, fuzzy, inactive, ambiguous, cross-company, or conflicting candidates remain manual.
- The P0-P6 readiness score is informational; any hard blocker forces HOLD regardless of score.
- The integration control plane remains administrator-only through `MENU_SETTINGS_CHANJET`.
- Chanjet write, delete, modify, voucher push, and silent ERP business-table overwrite remain forbidden.

## 2026-07-08 - Bug Intake Pipeline Closeout and Chanjet Handoff

Decision: GO WITH CONDITIONS.

Rationale:

- The current Bug Intake repair queue is drained: 103 BUGTASK items, 58 completed, 45 completed and merged, 0 open, 0 running.
- The resident local runner remains active and can continue processing future approved reports.
- Queue lane filters and safe redispatch gates are implemented, so low-risk validation work is separated from code repair and release-gate work.
- The latest CI/CD deployment and production health check passed.
- The platform can now return to the Chanjet / 好业财 integration mainline.

Evidence:

- `docs/ops/BUG_INTAKE_PIPELINE_CLOSEOUT_AND_CHANJET_HANDOFF_20260708.md`
- `apps/api/src/modules/bug-intake/bug-intake.service.ts`
- `apps/web/src/app/(admin)/bug-reports/page.tsx`

Guardrails:

- Bug Intake remains support infrastructure.
- Chanjet writes remain forbidden.
- Voucher push remains forbidden.
- Business-facing finance pages may only consume Chanjet authority fields after semantic locks are explicit.

Next actions:

1. Start `CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC`.
2. Lock voucher, subject, customer/supplier mapping semantics.
3. Continue finance card authority wiring after fields are locked.


## 2026-07-07 - Chanjet Readonly Adapter Authenticated Audit CI Gate

Decision: GO WITH CONDITIONS.

Rationale:

- The previous production adapter audit correctly failed closed with `HTTP 401` because the local runner had no approved runtime token.
- The fix is not to store a long-lived token. The CI smoke workflow now exposes target `chanjet-readonly-adapter-production`.
- The target reuses the production deploy SSH/proxy channel, mints a 20-minute admin JWT inside the production API container using the runtime `JWT_SECRET`, runs the readonly adapter audit against `https://erp.eggslao.com/api`, and pulls sanitized JSON / Markdown artifacts.

Evidence:

- `.github/workflows/ci-smoke.yml`
- `scripts/ops/chanjet-readonly-field-adapter-audit.mjs`
- `docs/ops/CHANJET_READONLY_ADAPTER_AUTHENTICATED_AUDIT_CI_GATE_REPORT_20260707.md`

Guardrails:

- Chanjet write: false.
- Voucher push: false.
- ERP business overwrite: false.
- Migration / DB write: false.
- Deploy: false.
- Long-lived token committed: false.

Next actions:

1. `AI Delivery CI Smoke` target `chanjet-readonly-adapter-production` was dispatched as run `28834627546`.
2. The authenticated audit returned `GO_WITH_CONDITIONS` with 60 voucher header rows, 160 voucher line rows, 120 counterparty rows, and 86.2% field coverage.
3. Next Gate is `CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC`; ordinary business-facing reconciliation views must still treat the adapter evidence as conditional until voucher status, subject fields, and customer/supplier mappings are locked.

## 2026-07-07 - Chanjet Readonly Adapter Production Audit Gate

Decision: GO WITH CONDITIONS.

Rationale:

- The readonly adapter audit must be repeatable in production before adapter values are wired into ordinary finance pages.
- The audit runner now supports `PHOENIX_ADMIN_TOKEN`, `PHOENIX_AUTH_TOKEN`, or service-account login through `PHOENIX_ERP_RUNNER_USER` / `PHOENIX_ERP_RUNNER_PASS`.
- The production audit was executed against `https://erp.eggslao.com/api/chanjet/integration/readonly-field-adapters`.
- The runner had no approved auth source in the local environment, so the endpoint returned `HTTP 401`.
- The runner correctly wrote HOLD evidence instead of fabricating adapter rows or field coverage.

Evidence:

- `docs/ops/runs/chanjet-readonly-field-adapter-audit-latest.json`
- `docs/ops/runs/chanjet-readonly-field-adapter-audit-latest.md`
- `docs/ops/CHANJET_READONLY_ADAPTER_PRODUCTION_AUDIT_GATE_REPORT_20260707.md`

Guardrails:

- Chanjet write: false.
- Voucher push: false.
- ERP business overwrite: false.
- Migration / DB write: false.
- Ordinary finance pages must not consume adapter-derived values until authenticated production sample audit passes.

Next actions:

1. Provide a dedicated readonly audit service account or short-lived admin token.
2. Re-run the production adapter audit and verify voucher header / line / counterparty samples.
3. Only then wire validated adapter output into reconciliation views.

## 2026-07-07 - Chanjet Readonly Field Adapter Implementation

Decision: GO WITH CONDITIONS.

Rationale:

- The first field-gap batch required ERP-readable contracts for voucher headers, voucher lines, and counterparties.
- The backend now exposes `GET /api/chanjet/integration/readonly-field-adapters` from ERP middle-layer snapshots only.
- The admin UI now has a `只读适配器` tab that shows adapter readiness, sample rows, missing critical fields, and next actions.
- The audit script `scripts/ops/chanjet-readonly-field-adapter-audit.mjs` can persist JSON / Markdown artifacts from the same API.

Guardrails:

- Chanjet write: false.
- Chanjet delete / modify: false.
- Voucher push: false.
- ERP business overwrite: false.
- Migration / DB write: false.
- Ordinary-user middle-layer visibility: false.

Next actions:

1. Run production readonly adapter audit with an admin token.
2. Wire validated adapter rows into reconciliation views and business-facing source badges.
3. Keep write-back and voucher push on HOLD until a separate approved Gate.

## 2026-07-06 - Chanjet Field Gap Review Gate

Decision: GO WITH CONDITIONS.

Rationale:

- The production readonly mirror coverage gate already proves all 16 P0 Chanjet scopes are available.
- The remaining problem is not endpoint reachability; it is field-level semantic coverage.
- This gate grouped open high-risk fields into 7 implementation buckets and produced a safe execution order.
- The next implementation gate is `CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION`.

Prioritized implementation order:

1. `FIELD-GAP-CHANJET_VOUCHER_LINE`
2. `FIELD-GAP-CHANJET_VOUCHER_HEADER`
3. `FIELD-GAP-CHANJET_COUNTERPARTY`
4. `FIELD-GAP-CHANJET_AP_AR_AGGREGATE`
5. `FIELD-GAP-CHANJET_PAYMENT_DOCUMENT`
6. `FIELD-GAP-CHANJET_REPORTING`
7. `FIELD-GAP-CHANJET_PURCHASE_LINKAGE`

Guardrails:

- Chanjet write: false.
- Voucher push: false.
- ERP business overwrite: false.
- Migration: false.
- Silent finance-card authority switch: false.

Next actions:

1. Implement the readonly voucher line/header adapters.
2. Complete counterparty mapping review.
3. Keep Chanjet write-back on HOLD until a separate approved write gate.

## 2026-07-06 - Chanjet P0 Remote Readonly Coverage and Alignment

Decision: GO WITH CONDITIONS.

Rationale:

- Production middle-layer readonly audit confirms all 16 P0 Chanjet scopes are covered.
- Finance card dependency coverage is 100%.
- Field classification coverage is only 10.9%, with 1348 HIGH open fields still pending.
- Local mirror audit still shows 0% because the local database does not contain production mirror rows.
- The finance AR runtime was still reading the legacy `chanjet_ar_snapshot`; it now reads `chanjet_entity_snapshots` / `AR_STATISTICS` first and falls back to the legacy snapshot only if mirror evidence is unavailable.
- No Chanjet write, delete, modify, voucher push, ERP DB write, migration, deploy, or push was executed by the audit.

Conditions:

- Do not treat local 0% mirror coverage as production sync failure.
- Do not silently upgrade all finance cards to Chanjet authority until field semantics and system confirmation gates pass.
- Keep Chanjet write-back on HOLD until a separate approved Gate.

Next actions:

1. `CHANJET-FIELD-GAP-REVIEW-GATE`
2. `CHANJET-LOCAL-PROD-MIRROR-STATE-RECONCILE`
3. `CHANJET-FINANCE-CARD-AUTHORITY-VERIFY`

## 2026-07-03 - Chanjet Readonly Mirror Middle Layer Phase 1

Decision: GO WITH CONDITIONS.

Rationale:

- User approved implementing the Chanjet / 好业财 middle-layer plan under a strict read-only boundary.
- Phase 1 creates ERP-owned mirror tables for raw read snapshots, normalized entity snapshots, and ERP field mapping candidates.
- The integration service now supports read-only mirror sync, snapshot browsing, and field-gap candidate generation.
- The integration UI now exposes read-only mirror status and field-gap review views.
- No Chanjet write, delete, update, voucher push, deploy, production migration, seed, cleanup, reset, or push was executed.

Conditions:

- Real completeness depends on running the mirror sync with a valid Chanjet token and reviewing endpoint-specific failures.
- Pagination, deep incremental pull, and final ERP schema/mapping changes remain Phase 2 work.
- Any future write-back to Chanjet remains HOLD until a separate user-approved Gate.

Next actions:

1. `CHANJET_READONLY_MIRROR_REAL_TOKEN_SYNC_GATE`
2. `CHANJET_FIELD_GAP_REVIEW_GATE`
3. `CHANJET_ENTITY_MAPPING_PHASE2`

## 2026-07-03 - Chanjet Readonly Mirror Real Token Sync Gate

Decision: HOLD.

Rationale:

- The reviewed ERP middle-layer mirror tables were created locally using only the single create-only migration SQL from `1782742000000-CreateChanjetReadonlyMirror.ts`.
- A dedicated fail-closed runner was added at `scripts/ops/chanjet-readonly-mirror-sync.mjs`.
- The runner generated JSON/Markdown dry-run outputs under `docs/ops/runs`.
- Real mirror sync was not executed because the local API was not reachable, no `PHOENIX_ADMIN_TOKEN` / `PHOENIX_AUTH_TOKEN` was available, and no local Chanjet runtime auth chain was visible.
- No Chanjet write, delete, update, voucher push, deployment, push, seed, cleanup, or production DB write was executed.

Conditions:

- Execute real mirror sync only in an environment with a healthy API, valid protected API token, and valid Chanjet `appTicket / certificate / openToken` chain.
- Continue to keep Chanjet write-back and voucher push on HOLD.

Next actions:

1. `CHANJET_READONLY_MIRROR_EXECUTE_WITH_RUNTIME_TOKEN`
2. `CHANJET_FIELD_GAP_REVIEW_GATE`
3. `CHANJET_ENTITY_MAPPING_PHASE2`

## 2026-06-23 - Production Server Remediation R1 Store Payment Schema Drift Reconciliation

Decision: READY_FOR_SCHEMA_REPAIR_EXECUTION_APPROVAL, with the practical next Gate set to `FILE_METADATA_MIGRATION_EXECUTION_GATE`.

Rationale:

- User approved `STORE_PAYMENT_SCHEMA_DRIFT_RECONCILIATION_GATE`.
- Read-only DB identity confirms `phoenix_erp`, current schema `public`, and search path `"$user", public`.
- `public.migrations` contains one Store Payment history row: `CreateStorePaymentTables1782041418112`.
- `information_schema` and `pg_catalog` both show `public.store_payment_accounts` and `public.store_payment_records`.
- `to_regclass` resolves both Store Payment tables.
- `file_metadata` remains missing and has zero File Metadata migration history rows.
- No migration, DB write, migration history repair, table creation, deploy, restart, push, cleanup, reset, env/nginx/compose modification, or deletion of the legacy backup artifact was executed.

Conditions:

- The original Store Payment table-missing drift is classified as `UNKNOWN_HOLD` because it is not reproduced by current evidence.
- Do not run Store Payment schema repair unless future evidence shows the tables are actually missing.
- Proceed next with File Metadata migration execution only after dedicated approval.

Next actions:

1. `APPROVE_FILE_METADATA_MIGRATION_EXECUTION_GATE`
2. `APPROVE_MENU_ROLE_DATASCOPE_REMOTE_SYNC_GATE`
3. `APPROVE_MASTER_DATA_REMEDIATION_GATE`

## 2026-06-23 - Production Server Remediation R1 Remote Code Alignment Execution

Decision: GO WITH CONDITIONS.

Rationale:

- User approved `REMOTE_CODE_ALIGNMENT_EXECUTION_GATE`.
- Remote deploy path `/opt/phoenix-erp` was snapshotted into `/opt/phoenix-erp-backups/remediation-r1-code-alignment-20260623-225600`.
- Remote code was aligned by transferring a small Git bundle over SSH, fetching it into a temporary ref, and fast-forward merging.
- Remote code moved from `87b5781` to `7507b12a`.
- `1782042418112-CreateFileMetadata.ts` now exists remotely.
- `1782041418112-CreateStorePaymentTables.ts` still exists remotely and hash matches the approved local file.
- Store Payment backend/frontend files and File Metadata ACL files now exist remotely.
- No migration, DB write, deploy, service restart, push main, production workflow trigger, seed, cleanup, reset, env change, nginx change, or compose change was executed.

Conditions:

- Remote worktree contains a pre-existing untracked backup artifact `docker-compose.yml.bak-20260522-180813`.
- Store Payment history/table drift remains unresolved and must be handled in `STORE_PAYMENT_SCHEMA_DRIFT_RECONCILIATION_GATE`.
- File Metadata migration execution still requires a dedicated later Gate.

Next actions:

1. `APPROVE_STORE_PAYMENT_SCHEMA_DRIFT_RECONCILIATION_GATE`
2. `APPROVE_FILE_METADATA_MIGRATION_EXECUTION_GATE`
3. `APPROVE_STORE_PAYMENT_SCHEMA_REPAIR_EXECUTION_GATE`

## 2026-06-23 - Production Server Remediation R1 Schema Repair Precheck

Decision: READY_FOR_REMOTE_CODE_ALIGNMENT_APPROVAL.

Rationale:

- R1 evidence proves remote code is `main@87b5781`, Store Payment migration file exists remotely, and File Metadata migration file is missing remotely.
- Local verified code contains `1782042418112-CreateFileMetadata.ts`.
- Therefore `file_metadata` missing cause remains `CODE_NOT_DEPLOYED`, and the next low-risk repair step is code alignment, not migration execution.
- R1 evidence also shows Store Payment migration history matches while `store_payment_accounts` and `store_payment_records` are missing. This is provisionally classified as `HISTORY_TABLE_DRIFT`.
- Fresh SSH DB identity checks failed with banner timeout after R1, so wrong DB target, wrong schema target, manual history insertion, and table dropped after migration remain unresolved until the drift reconciliation Gate.
- No git pull, checkout, reset, migration, DB write, deploy, restart, push, env/nginx/compose modification, cleanup, or reset was executed.

Next actions:

1. `APPROVE_REMOTE_CODE_ALIGNMENT_EXECUTION_GATE`
2. `APPROVE_STORE_PAYMENT_SCHEMA_DRIFT_RECONCILIATION_GATE`
3. `APPROVE_FILE_METADATA_MIGRATION_EXECUTION_GATE`

Conditions:

- Remote code alignment must not include migration or service restart unless separately approved.
- Store Payment migration must not be blindly rerun.
- File Metadata migration must wait until remote code contains the migration file.

## 2026-06-23 - Production Server Remediation R1 Migration State Audit

Decision: HOLD.

Rationale:

- R1 read-only audit completed using server-side evidence files under `/opt/phoenix-erp-backups/remediation-r1-migration-audit-20260623-220510`.
- Remote code is `main@87b5781`.
- Remote Store Payment migration file `1782041418112-CreateStorePaymentTables.ts` exists and matches local approved hash.
- Remote File Metadata migration file `1782042418112-CreateFileMetadata.ts` is missing.
- Audited DB lacks `store_payment_accounts`, `store_payment_records`, and `file_metadata`.
- `file_metadata` missing cause is classified as `CODE_NOT_DEPLOYED`.
- No migration, DB write, deploy, service restart, push, cleanup, reset, seed, nginx change, or env change was executed.

Conditions:

- Do not run migration until user approves remote code alignment and schema repair precheck.
- Do not enter Store Payment remote business trial until Store Payment and File Metadata schema readiness are repaired and validated.
- Keep protected attachment preview/download disabled on the production-side target until File Metadata, ACL, DataScope, and A2 checks pass.

Next actions:

1. `APPROVE_REMOTE_CODE_ALIGNMENT_AND_SCHEMA_REPAIR_PRECHECK`
2. `APPROVE_STORE_PAYMENT_SCHEMA_MIGRATION_REPAIR_IF_STILL_ABSENT`
3. `APPROVE_FILE_METADATA_MIGRATION_REPAIR`

## 2026-06-23 - Production Server Remediation R0 Backup And Observability

Decision: GO WITH CONDITIONS.

Rationale:

- SSH was restored with longer timeout and explicit host alias, but long sessions remain unstable.
- R0 backup directory was created at `/opt/phoenix-erp-backups/remediation-r0-20260623-211849`.
- DB backup completed through `pg_dump` without printing credentials.
- env, deploy, compose, nginx, uploads inventory, and server snapshots were recorded.
- Read-only DB diagnostics found the production-side target lacks `file_metadata`.

Conditions:

- Migration history remains partially unknown.
- Initialization import, master data, menu/role/DataScope diagnostics remain pending.
- Missing `file_metadata` must not be repaired until migration-state audit and user approval.
- No migration, business DB write, deploy, service restart, cleanup, reset, or push was executed.

## 2026-06-23 - Production Server Remediation Intake

Decision: READY_FOR_REMEDIATION_PLAN.

Rationale:

- User reclassified the current server as a production-side pre-production / remediation target rather than a mature stable production baseline.
- Public API health is reachable and reports production mode with DB connected.
- SSH command-level read-only inventory timed out; remote OS/Docker/DB/process details remain unavailable.
- Historical audit reports and Store Payment gates were reviewed from local docs.
- A remediation backlog, roadmap, and first fix batch approval package were created.

Conditions:

- Backup/snapshot must be approved before any write.
- DB write, migration, cleanup, reset, service restart, deploy, nginx/env change, and push remain forbidden until a dedicated Gate is approved.
- A2 recommends backup before any remediation.
- A5 remains HOLD for remote DB/data evidence until read-only DB inventory succeeds.

## 2026-06-23 - Server Card Intake And Staging Target Candidate

Decision: STAGING_TARGET_CANDIDATE_READY.

Rationale:

- The received server connection card was read and sanitized.
- The card clearly describes the production Phoenix ERP host and deployment path.
- The production host can be considered as a same-host staging candidate only if the user approves strict isolation.
- Candidate staging isolation uses `/opt/phoenix-erp-staging`, `phoenix_erp_staging`, and `/data/phoenix-erp-staging/files`.
- Production DB, production file storage, production deploy path, and production secrets remain forbidden for staging reuse.

Conditions:

- User must approve whether the production host may be used as a staging host candidate.
- User must approve independent staging deploy path, DB, file storage, and GitHub `staging` secrets.
- No deploy, push, migration, remote DB write, service restart, or production workflow trigger was executed.
- A2 review: PASS WITH CONDITIONS.
- A1 validation: PASS WITH CONDITIONS.
- A5 review: GO WITH CONDITIONS.

## 2026-06-23 - Store Payment Staging Target Bootstrap Gate

Decision: READY_FOR_STAGING_TARGET_INPUTS.

Rationale:

- The prior staging deploy attempt held because no staging target/workflow/DB/file-storage configuration existed.
- A staging-only workflow skeleton was added.
- A staging env example was added.
- A staging compose skeleton was added.
- Required staging target inputs are now documented.
- Staging deploy approval v2 is documented.
- Migration/menu/fixture inputs default to false and fail closed unless separate Gates are approved.
- Production workflow trigger logic was not modified.
- No deploy, push main, remote DB write, staging migration, production migration, seed, cleanup, reset, or production trigger was executed.

Next actions:

1. `USER_PROVIDES_STAGING_TARGET`
2. `USER_CONFIGURES_GITHUB_STAGING_SECRETS`
3. `USER_APPROVES_STAGING_WORKFLOW_RUN`
4. `STAGING_DEPLOY_EXECUTION_GATE`

## 2026-06-23 - Store Payment Staging Controlled Pilot Deploy

Decision: HOLD.

Rationale:

- User approved Store Payment staging controlled pilot actions, including non-production push, staging deploy, staging DB migration, staging menu/role sync, staging file storage configuration, and UAT scope.
- A1 precheck passed W5, API typecheck, Web typecheck, migration gates, and nullable unique gate.
- The non-main branch `w5-codex-orchestrator` was pushed to `origin` at commit `0e71753c`.
- The repository deployment workflow deploys only on `push main` and uses the `production` environment.
- No staging-only target, staging DB connection, staging file storage path, or staging-specific workflow was discoverable.
- To avoid accidental production deploy, `push main`, staging deploy, staging migration, menu/role sync, and file storage configuration were not executed.

Next actions:

1. `PROVIDE_STAGING_DEPLOY_TARGET`
2. `PROVIDE_STAGING_DB_CONNECTION`
3. `PROVIDE_STAGING_FILE_STORAGE_PATH`
4. `CONFIRM_STAGING_WORKFLOW_OR_MANUAL_RUNBOOK`

## 2026-06-23 - Store Payment Staging Deploy Approval Prep

Decision: READY_FOR_USER_APPROVAL.

Rationale:

- Staging deploy approval package is complete.
- Approval matrix is complete.
- Business UAT scope is complete.
- A2 review is PASS WITH CONDITIONS.
- A1 validation is PASS WITH CONDITIONS.
- A5 review is GO WITH CONDITIONS.
- This Gate did not deploy, push, write remote DB, execute staging migration, execute production migration, seed, cleanup, reset, or modify business code.

Next approvals:

1. `USER_APPROVES_PUSH_OR_NOT`
2. `USER_APPROVES_STAGING_DEPLOY_OR_NOT`
3. `USER_APPROVES_STAGING_DB_MIGRATION_OR_NOT`
4. `USER_APPROVES_BUSINESS_UAT_SCOPE_OR_NOT`

## 2026-06-23 - A7 Store Payment Final QA Gate

Decision: GO WITH CONDITIONS.

Rationale:

- A7 input reports are all present.
- Store Payment backend MVP, frontend page, menu / role readiness, protected attachment ACL, account QR UAT, record proof UAT, and A6 runbook are complete with conditions.
- `rawUrl`, `/uploads`, and `storage_path` exposure remain blocked.
- no-auth attachment access returns 401.
- missing attachment access returns 404.
- A2 final review is PASS WITH CONDITIONS.
- A1 final validation is PASS WITH CONDITIONS.
- A5 final readiness is GO WITH CONDITIONS.

Conditions:

- Controlled pilot is limited to local or separately approved staging environment.
- Staging deploy requires explicit user approval.
- Push requires explicit user approval.
- Remote DB writes and production migration require explicit user approval.
- Production deploy remains HOLD.
- UAT fixtures must remain distinct from real business payment evidence.

Next actions:

1. `USER_APPROVAL_FOR_STAGING_DEPLOY`
2. `STAGING_DB_MIGRATION_AND_MENU_ROLE_SYNC_APPROVAL`
3. `CONTROLLED_PILOT_BUSINESS_UAT`

## 2026-06-23 - A6 Store Payment Staging Deploy Runbook

Decision: GO WITH CONDITIONS.

Rationale:

- Store Payment account QR attachment UAT has passed through protected endpoints.
- Store Payment record proof attachment UAT has passed through protected endpoints.
- `rawUrl`, `/uploads`, and `storage_path` remain blocked from Store Payment frontend exposure.
- A6 staging deploy runbook now defines environment prerequisites, precheck checklist, draft deployment steps, post-deployment validation, rollback plan, and A7 input conditions.
- No staging deployment, push, remote DB write, production migration, seed, cleanup, or reset was executed.

Conditions:

- Staging deploy requires explicit user approval.
- Staging DB backup, env, migration state, menu / role sync, store scope, file storage, and UAT fixture policy must be confirmed before deployment.
- A2 must review staging security evidence before final GO.
- A5 must confirm staging data prerequisites before pilot release.
- A7 Final QA Gate is the next allowed review Gate.

## 2026-06-23 - Store Payment Record Proof Attachment UAT Fixture

Decision: GO WITH CONDITIONS.

Rationale:

- Local `phoenix_erp` contains one Store Payment UAT record `SP-UAT-PROOF-001`.
- `SP-UAT-PROOF-001` references proof attachment `FILE-SP-PROOF-UAT-001`.
- Local `file_metadata` contains `FILE-SP-PROOF-UAT-001` with owner `STORE_PAYMENT_RECORD:1`.
- The proof file is a generated non-sensitive UAT PDF with no real payment, bank, or customer data.
- Protected status endpoint returned `accessStatus=allowed`, `previewAvailable=true`, `downloadAvailable=true`, and `rawUrl=null`.
- Protected preview endpoint streamed the PDF through the backend.
- Protected download endpoint streamed the PDF through the backend.
- No-auth access failed closed with 401.
- Missing file id failed closed with 404.
- `/store-payment` detail drawer used protected proof access and protected preview/download endpoints.

Conditions:

- This was a local UAT DB write only, not a remote production DB write.
- API development startup emitted existing bootstrap / seed logs; no production deployment or push was executed.
- The UAT proof PDF is non-sensitive local test data and must not be treated as production evidence.
- Staging deployment still requires A6 runbook Gate.
- Final pilot release still requires A7 final QA / GO Gate.

## 2026-06-23 - Store Payment Protected Attachment UAT Smoke

Decision: GO WITH CONDITIONS.

Rationale:

- `/store-payment` loaded the pilot Store Payment account list.
- `FILE-SP-UAT-001` was visible as the QR attachment for Store Payment account `id=1`.
- QR status UI called `/store-payment/attachments/FILE-SP-UAT-001/status`.
- QR preview UI called `/store-payment/attachments/FILE-SP-UAT-001/preview`.
- QR download UI called `/store-payment/attachments/FILE-SP-UAT-001/download`.
- Preview/download buttons were enabled only for the `ALLOWED` backend status row.
- Other accounts without metadata remained fail-closed as `MISSING`.
- The page did not display raw URL, did not construct `/uploads`, and did not leak `storage_path`.

Conditions:

- This smoke used local UAT metadata only.
- No proof record fixture was created in this Gate.
- No backend code was modified.
- No migration, DB write, deploy, or push was executed by this Gate.
- Production enablement still requires A6 staging runbook and A7 final QA / GO Gate.

## 2026-06-23 - Store Payment Attachment Metadata UAT Data Setup

Decision: GO WITH CONDITIONS.

Rationale:

- Local `phoenix_erp` now contains one non-sensitive Store Payment attachment metadata UAT row.
- `FILE-SP-UAT-001` is associated with Store Payment account `id=1` as a QR attachment reference.
- The local UAT file is a generated PDF containing only "UAT only / no real business data".
- Protected status endpoint returned `accessStatus=allowed`, `previewAvailable=true`, `downloadAvailable=true`, and `rawUrl=null`.
- Protected preview endpoint streamed the PDF through the backend.
- Protected download endpoint streamed the PDF through the backend.
- No-auth access failed closed with 401.
- Missing file id failed closed with 404.

Conditions:

- This was a local UAT DB write only, not a remote production DB write.
- API development startup emitted existing bootstrap / seed logs; no Store Payment production seed was executed by this Gate.
- The local UAT file is excluded from git and must not be treated as production evidence.
- A2 review is still required before production enablement.
- No deploy, push, migration, cleanup, reset, or destructive operation was executed.

## 2026-06-23 - A4 Protected Preview / Download UI Draft Gate

Decision: GO WITH CONDITIONS.

Rationale:

- `/store-payment` now has controlled attachment status UI for proof attachments and QR attachment status.
- Preview/download buttons are driven only by backend protected status.
- Buttons remain disabled for missing metadata, access pending, denied, disabled, unsafe raw URL, or unavailable preview/download.
- The UI calls only `/store-payment/attachments/:fileId/status|preview|download` when a controlled file id exists.
- The UI does not show raw URL, build `/uploads` links, or open naked `http(s)` links.

Conditions:

- `file_metadata` currently has 0 rows, so UAT should expect metadata missing / pending states until a separate metadata UAT data setup Gate.
- A2 review remains required before treating preview/download as UAT-passed.
- Backend, DB, migration, deploy, and push were not touched.
- Next gate: Store Payment attachment metadata UAT data setup.

## 2026-06-23 - Store Payment File Metadata / ACL Gate

Decision: GO WITH CONDITIONS.

Rationale:

- `file_metadata` table was created in local `phoenix_erp`.
- No seed was executed; current table row count is 0.
- `FileAccessService` implements controlled metadata lookup, RBAC, DataScope, ownership checks, MIME whitelist, path traversal protection, upload-root path confinement, and structured denied logs.
- Store Payment protected attachment routes now use file metadata and can stream only after metadata exists and checks pass.
- Existing upload module still returns `/uploads/contracts/...`; that path remains forbidden for frontend preview/download.

Conditions:

- A4 preview/download UI remains disabled until a separate A4 Gate and A2 review.
- A protected upload / metadata population workflow is still needed for real proof / QR files.
- No production deploy, push, or remote production DB write was performed.

## 2026-06-23 - Store Payment A3 Protected Streaming Gate

Decision: GO WITH CONDITIONS.

Rationale:

- Store Payment ownership, RBAC, and DataScope checks were added for protected attachment status / preview / download routes.
- The existing upload module only stores files under `/uploads/contracts` and returns a raw URL; it has no metadata table, ACL, owner/module reference, or protected streaming capability.
- To avoid raw URL exposure and ACL bypass, real preview/download streaming remains disabled.
- Preview/download routes now fail closed with `STORE_PAYMENT_ATTACHMENT_STREAMING_NOT_AVAILABLE` after ownership and scope checks.

Conditions:

- A4 must not enable preview/download UI yet.
- A follow-up file metadata / ACL Gate is required before streaming can be enabled.
- Denied access currently uses structured logging; DB audit can be added after metadata/ACL design is approved.

## 2026-06-23 - Store Payment Controlled UAT Ready

Decision: GO WITH CONDITIONS.

Rationale:

- Store Payment backend and frontend gates have completed with conditions.
- Store Payment page exists at `/store-payment`.
- Menu entry exists under 销售管理 / 统一收款.
- Permission buttons are aligned with `MENU_STORE_PAYMENT*` and V/E/X action bits.
- Attachment preview/download remains disabled.
- Raw URL exposure remains forbidden.
- Web typecheck passes.
- W5 closeout gate passes.

Conditions:

- Real attachment preview/download requires A3 protected streaming Gate and A2 review.
- Staging deployment requires A6 runbook Gate.
- Final production decision requires A7 final QA Gate.
- No push or production deployment has been executed.

## 2026-06-23 - Store Payment A4 Frontend Gate

Decision: GO WITH CONDITIONS.

Artifacts:

- `docs/ops/A4_STORE_PAYMENT_FRONTEND_GATE_UIUX_UAT_REPORT.md`
- `apps/web/src/app/(admin)/store-payment/page.tsx`
- `apps/web/src/app/(admin)/store-payment/store-payment.module.css`
- `apps/web/src/components/layout/Sidebar.tsx`

## 2026-06-23 - Production-Side File Metadata Migration Execution Gate

Decision: GO WITH CONDITIONS.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R1_FILE_METADATA_MIGRATION_EXECUTION_REPORT.md`
- Remote evidence: `/opt/phoenix-erp-backups/remediation-r1-file-metadata-migration-20260623-235224`

Rationale:

- A1/A2/A5 prechecks passed with conditions.
- Pending migration list contained exactly `1782042418112-CreateFileMetadata.ts`.
- The Gate created `public.file_metadata` and added migration history row `1782042418112:CreateFileMetadata1782042418112`.
- `file_metadata` row count after migration is 0.
- `store_payment_accounts` and `store_payment_records` remained present.

Boundaries:

- Store Payment schema repair was not executed.
- Menu / role sync was not executed.
- Business data was not written.
- Deploy, restart, and push were not executed.

Next recommended Gate:

- `APPROVE_UPLOADS_FILE_SECURITY_REMEDIATION_PRECHECK`

## 2026-06-24 - Production-Side Uploads / File Security Precheck

Decision: READY_FOR_UPLOADS_FILE_SECURITY_REMEDIATION_PLAN.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_UPLOADS_FILE_SECURITY_PRECHECK_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_UPLOADS_FILE_SECURITY_REMEDIATION_PLAN.md`
- Remote evidence: `/opt/phoenix-erp-backups/remediation-r2-uploads-file-security-precheck-20260624-001809`

Rationale:

- Uploads inventory found 74 files under `/app/uploads`, total size about 63.8M.
- A legacy uploaded contract file was directly reachable from the API static file server via `/uploads/contracts/[REDACTED_BASENAME]`.
- Active Nginx config proxies `/uploads/` to the API container.
- Legacy `POST /api/upload/contract` returns `/uploads/contracts/${file.filename}` and does not write `file_metadata`.
- Remote `file_metadata` exists but has 0 rows.
- Store Payment protected attachment code remains isolated through `FileAccessService` and keeps `rawUrl: null`.

Boundaries:

- No file delete or move.
- No permission, Nginx, env, DB, migration, deploy, restart, push, or business-code change.

Next recommended Gate:

- `APPROVE_UPLOADS_EXPOSURE_HARDENING_GATE`

## 2026-06-24 - Production-Side Uploads Exposure Hardening Gate

Decision: GO WITH CONDITIONS.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_UPLOADS_EXPOSURE_HARDENING_REPORT.md`
- Remote evidence: `/opt/phoenix-erp-backups/remediation-r2-uploads-exposure-hardening-20260624-011703`

Rationale:

- Active Nginx `/uploads/` was changed to `return 403`.
- Nginx config test passed and Nginx was reloaded.
- Public HTTPS `/uploads/` and `/uploads/contracts/` now return `403`.
- API health remained `200`; Web health returned `307` to login.
- Internal API static `/uploads` remains `200`, so legacy upload-to-metadata migration is still required.

Boundaries:

- No upload files were deleted or moved.
- No DB write, migration, app deploy, API restart, or push was executed.

Next recommended Gate:

- `APPROVE_LEGACY_UPLOAD_TO_FILE_METADATA_GATE`

## 2026-06-24 - Production-Side Legacy Upload To File Metadata Gate

Decision: GO WITH CONDITIONS.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_LEGACY_UPLOAD_TO_FILE_METADATA_REPORT.md`
- `docs/ops/runs/legacy-upload-to-file-metadata-gate-latest.md`
- `docs/ops/runs/legacy-upload-to-file-metadata-gate-latest.json`

Rationale:

- `POST /api/upload/contract` source code now writes `file_metadata`.
- The updated response returns `fileId`, safe metadata, `rawUrl: null`, and compatibility `url=fileId`.
- The updated response does not return `/uploads/contracts/...` and does not expose `storage_path`.
- Missing owner data is fail-closed as `LEGACY_UPLOAD / LEGACY_PENDING / PENDING / PROTECTED`.
- No generic protected file endpoint exists yet, so the response does not fake `/files/:fileId/status`.

Conditions:

- Production-side runtime was not deployed or restarted in this Gate.
- Remote SSH smoke failed during banner exchange.
- Runtime metadata rows written by this Gate: 0.
- Existing legacy frontend upload consumers still need module-specific migration away from `json.url`.

Boundaries:

- No historical upload files were deleted or moved.
- No migration, deploy, restart, Nginx change, env change, push, or broad DB write was executed.

Next recommended Gate:

- `APPROVE_HISTORICAL_UPLOADS_METADATA_INVENTORY_GATE`

## 2026-06-24 - Production-Side Historical Uploads Inventory Gate

Decision: READY_FOR_HISTORICAL_UPLOADS_METADATA_CLAIM_APPROVAL.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_INVENTORY_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_METADATA_CLAIM_PLAN.md`
- Remote evidence: `/opt/phoenix-erp-backups/remediation-r2-historical-uploads-inventory-20260624-085306`
- Local pulled evidence: `docs/ops/runs/historical-uploads-inventory-20260624-085306/`

Rationale:

- Read-only inventory found 74 historical upload files under the remote `phoenix_uploads` Docker volume.
- Total size is 63.6 MB.
- Type distribution: 38 PDF, 19 JPG, 17 PNG.
- All files live under `contracts/`, so they are classified as `CONTRACT_ATTACHMENT_CANDIDATE`.
- Static checks found 0 high-risk files, 0 empty files, 0 executable files, 0 unexpected extensions, 0 duplicate basenames, and 0 sensitive-name matches.
- Owner records cannot be determined from filesystem evidence alone.

Boundaries:

- No DB write.
- No `file_metadata` insert.
- No file delete or move.
- No permission, Nginx, env, deploy, restart, migration, or push.

Next recommended Gate:

- `APPROVE_HISTORICAL_UPLOADS_METADATA_CLAIM_DRY_RUN_GATE`

## 2026-06-24 - Production-Side Historical Uploads Metadata Claim Dry-Run Gate

Decision: HOLD.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_METADATA_CLAIM_DRY_RUN_REPORT.md`
- `docs/ops/runs/historical-uploads-metadata-claim-dry-run-hold-20260624/`

Rationale:

- Input inventory had 74 contract-path files.
- Remote SSH repeatedly failed during banner exchange / connection setup before script transfer and execution.
- No remote DB owner correlation was executed.
- Dry-run rows: 0.
- `AUTO_CLAIM_READY`: 0.
- `MANUAL_REVIEW_REQUIRED`: 0.
- `UNRESOLVED_OR_HOLD`: 74.

Boundaries:

- No DB write.
- No `file_metadata` insert.
- No file delete or move.
- No permission change.
- No deploy or restart.
- No push.
- No migration.
- No Nginx or env change.
- No business-code change.

Next recommended Gate:

- `RESTORE_SSH_OBSERVABILITY_AND_RETRY_HISTORICAL_UPLOADS_METADATA_CLAIM_DRY_RUN`

## 2026-06-24 - Restore SSH And Historical Uploads Metadata Claim Dry-Run

Decision: READY_FOR_METADATA_CLAIM_EXECUTION_APPROVAL.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_RESTORE_SSH_AND_METADATA_CLAIM_DRY_RUN_REPORT.md`
- `docs/ops/runs/restore-ssh-and-metadata-claim-dry-run-20260624-111145/`
- Remote evidence: `/opt/phoenix-erp-backups/remediation-r2-restore-ssh-and-metadata-claim-dry-run-20260624-111145`

Rationale:

- SSH command-level observability was restored with conditions using low-concurrency, long-timeout, server-side file-output execution.
- Historical uploads metadata claim dry-run completed against the remote `phoenix_erp` DB in read-only mode.
- Input files: 74.
- Dry-run rows: 74.
- `AUTO_CLAIM_READY`: 15.
- `MANUAL_REVIEW_REQUIRED`: 0.
- `UNRESOLVED_OR_HOLD`: 59.
- AUTO sources: 14 from `prc2_purchase_orders.contract_url`, 1 from `prc2_payments.voucher_url`.

Boundaries:

- No DB write.
- No `file_metadata` insert.
- No file delete or move.
- No permission change.
- No deploy or restart.
- No push.
- No migration.
- No Nginx or env change.
- No business-code change.

Next recommended Gate:

- `APPROVE_HISTORICAL_UPLOADS_METADATA_CLAIM_EXECUTION_GATE`

Scope limit:

- Only the 15 AUTO_CLAIM_READY rows may be considered for the next write Gate.
- The 59 unresolved files remain HOLD.

## 2026-06-24 - Historical Uploads Metadata Claim Execution Gate

Decision: GO.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_METADATA_CLAIM_EXECUTION_REPORT.md`
- `docs/ops/runs/historical-uploads-metadata-claim-execution-20260624-120740/`
- Remote evidence: `/opt/phoenix-erp-backups/remediation-r2-historical-uploads-metadata-claim-execution-20260624-120740`

Rationale:

- User approved writing only the 15 AUTO_CLAIM_READY historical upload rows.
- Inserted rows: 15.
- Skipped rows: 0.
- Failed rows: 0.
- Continuing HOLD files: 59.
- Public HTTPS `/uploads` remained `403`.

Boundaries:

- DB write was executed only against `file_metadata`.
- No contract table modification.
- No business table modification.
- No file delete or move.
- No permission change.
- No migration.
- No deploy or restart.
- No push.
- No Nginx or env change.

Next recommended Gate:

- `APPROVE_MENU_ROLE_DATASCOPE_REMOTE_AUDIT`

## 2026-06-24 - Menu / Role / DataScope Remote Audit

Decision: READY_FOR_MENU_ROLE_DATASCOPE_REPAIR_APPROVAL.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REMOTE_AUDIT_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_PLAN.md`
- `docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/`
- Remote evidence: `/opt/phoenix-erp-backups/remediation-r3-menu-role-datascope-audit-20260624-122800`

Rationale:

- Store Payment menu codes present remotely: 0 of 5.
- Store Payment role grants present remotely: 0.
- Store Payment DataScope rows present remotely: 0.
- Expected Store Payment grant gaps: 11.
- Pilot user/store scope gaps: 4.
- Running remote code guards Store Payment routes but uses older `C/A` action bits while the current target policy is `V/E/X`.

Risk summary:

- P0: 0.
- P1: 6.
- P2: 2.

Boundaries:

- No DB write.
- No menu, role, or user-scope modification.
- No migration.
- No deploy or restart.
- No push.

Next recommended Gate:

- `APPROVE_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_GATE`

## 2026-06-24 - Production Remediation High Throughput Batch 1

Decision: GO WITH CONDITIONS / HOLD ITEMS PRESENT.

Artifacts:

- `docs/ops/PRODUCTION_REMEDIATION_HIGH_THROUGHPUT_POLICY.md`
- `docs/ops/PRODUCTION_REMEDIATION_HIGH_THROUGHPUT_BATCH_PLAN.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_INITIAL_DATA_IMPORT_DIAGNOSIS_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MASTER_DATA_DIAGNOSIS_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_UNRESOLVED_UPLOADS_OWNER_DIAGNOSIS_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_DEPLOY_CHAIN_HARDENING_REVIEW.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_HIGH_THROUGHPUT_BATCH_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_A7_STAGE_SUMMARY_GATE.md`
- `docs/ops/runs/remediation-r3-high-throughput-batch1-20260624-124012/`

Rationale:

- High-throughput read-only diagnosis completed with selected agents A1/A2/A5/A6/A7.
- Initial data import diagnosis and master-data diagnosis are GO WITH CONDITIONS.
- Unresolved historical uploads owner diagnosis remains HOLD for 59 files without owner evidence.
- Deploy-chain hardening remains HOLD because remote checkout has local Nginx changes and backup artifacts.
- P0=0, P1=11, P2=5.

Boundaries:

- No DB write.
- No migration.
- No deploy or restart.
- No push.
- No Nginx/env/config change.
- No business-code change.

Next recommended Gates:

1. `APPROVE_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_GATE`
2. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_PLAN`
3. `APPROVE_MASTER_DATA_REMEDIATION_PLAN`
4. `APPROVE_UNRESOLVED_UPLOADS_SECOND_PASS_OWNER_CORRELATION_DRY_RUN`
5. `APPROVE_DEPLOY_CHAIN_HARDENING_PLAN`

## 2026-06-24 - Menu / Role / DataScope Repair Dry-Run Gate

Decision: READY_FOR_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_APPROVAL WITH CONDITIONS.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_ACTION_BIT_COMPATIBILITY_PLAN.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md`
- `docs/ops/runs/remediation-r3-menu-role-datascope-repair-dry-run-20260624-130947/`
- Remote evidence: `/opt/phoenix-erp-backups/remediation-r3-menu-role-datascope-repair-dry-run-20260624-130947`

Rationale:

- Menu repair candidates: 5.
- Role authorization repair candidates: 11.
- DataScope repair candidates: 11.
- User scope repair candidates: 1.
- MANUAL_REVIEW_REQUIRED: 3.
- HOLD items: 2.
- Action-bit compatibility remains conditional because runtime uses `C/A` while target policy is `V/E/X`.

Boundaries:

- No DB write.
- No SQL execution.
- No menu / role / DataScope / user-scope modification.
- No migration.
- No deploy or restart.
- No push.

Next recommended Gate:

- `APPROVE_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_GATE`

## 2026-07-04 — Chanjet Finance Alignment Audit P2

Decision: GO WITH CONDITIONS.

Artifacts:

- `scripts/ops/chanjet-finance-alignment-audit.mjs`
- `docs/ops/CHANJET_FINANCE_ALIGNMENT_AUDIT_P2_REPORT_20260704.md`
- `docs/ops/runs/chanjet-finance-alignment-audit-latest.json`
- `docs/ops/runs/chanjet-finance-alignment-audit-latest.md`

Rationale:

- Built a repeatable local readonly audit for Chanjet endpoint coverage, finance-card authority coverage, field coverage, and next task generation.
- Local core mirror tables exist, but the local database currently contains no Chanjet mirror rows.
- Finance card numbers must therefore remain source-labelled and must not be silently treated as Chanjet-aligned from local evidence.
- `chanjet_sync_jobs` is absent locally and is treated as optional audit evidence, not a core blocker.

Boundaries:

- No Chanjet write, delete, modify, or voucher push.
- No ERP business table write.
- No migration.
- No deploy.
- No push.

Next recommended Gate:

- `CHANJET-P0-READONLY-SYNC-GAPS`.

---

## 2026-06-24 - Menu / Role / DataScope Repair Execution Gate

Decision: GO WITH CONDITIONS.

Artifacts:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md`
- `docs/ops/runs/remediation-r3-menu-role-datascope-repair-execution-20260624-134210/`
- Remote evidence: `/opt/phoenix-erp-backups/remediation-r3-menu-role-datascope-repair-execution-20260624-134210`

Rationale:

- Approved Store Payment menu / role / DataScope / clear user-scope repair executed in one transaction.
- Inserted 5 menus, 11 role permissions, 11 DataScope rows, and 1 user scope row.
- Excluded 3 MANUAL_REVIEW_REQUIRED user-scope rows and 2 HOLD items.
- Used Store Payment-only `C/A` compatibility grants while target policy remains `V/E/X`.
- Used runtime-compatible DataScope values `SELF`, `COMPANY`, and `GROUP` because remote DB rejects `STORE` and `ALL`.

Boundaries:

- Approved DB write executed only in Store Payment scope.
- No migration.
- No deploy or restart.
- No push.
- No business-code change.
- No permission deletion.
- No non-Store Payment permission expansion.

Next recommended Gate:

- `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`

## 2026-06-24 - Agent Inbox Short Command Mode V1

Decision: GO WITH CONDITIONS.

Artifacts:

- `docs/ops/agent-inbox/README.md`
- `docs/ops/agent-inbox/USER_INTENT.md`
- `docs/ops/agent-inbox/APPROVALS.md`
- `docs/ops/agent-inbox/OUTBOX.md`
- `docs/ops/agent-inbox/INBOX_SCHEMA.md`
- `docs/ops/agent-inbox/SHORT_COMMAND_EXAMPLES.md`
- `scripts/ops/agent-inbox-runner.mjs`
- `docs/ops/AGENT_INBOX_SHORT_COMMAND_MODE_V1_REPORT.md`

Rationale:

- User should no longer need to paste long operational prompts for routine Gate planning.
- Runner expands short intent from runtime memory, next-gate recommendation, guardrails, and task board.
- Dry-run validated the sample short command and inferred `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`.
- Orchestrator selected A2 / A1 / A5 and returned `PLAN_READY`.

Boundaries:

- No DB write.
- No migration.
- No deploy or restart.
- No push.
- No business-code change.
- No remote server change.

Next recommended action:

- Use `docs/ops/agent-inbox/USER_INTENT.md` for the next short command.

---

## 2026-06-27 — RBAC 父权限清账（下一批·4 任务）

Agent: web 会话子代理编排（3 并行只读子代理 + 主代理综合）。

Decision: 完成父权限清账审计批次；仅落地前端 3 处死引用清理；其余写库项 Gated。

What was done:
- 任务1（粗父菜单清零·源头侧）：seed 仍有 ~60+ 条「非 ADMIN×6 粗父菜单」授予，无后续 DELETE；MENU_WORKFLOW 最严重。静态不可断 live 最终态 → 单列 Gate。
- 任务2（最小权限精修）：ROLE_FIN_ACCT 跨 5 域最严重（g5a 旧码）；REVIEW_MANAGER 最干净。每角色给"建议最小集 vs 当前集"。
- 任务3（中心页残余父权限）：后端 0 处；前端仅 3 处 Sidebar 组头死引用，**已清理**（→ 原子代表码），web tsc 0 errors。
- 任务4（五主体四向矩阵）：4 类系统性 drift——D1 侧菜单任意位 vs 后端精确位；D2 procurement 页按钮零 gating；D3 g35 资金子菜单派生漏 REVIEW_MANAGER/ANALYST（真实功能缺失）；D4/D6 父码/legacy 死码。含 18 条可执行实测清单。

Artifacts:
- `docs/ops/RBAC_PARENT_PERMISSION_CLEARANCE_AUDIT_20260627.md`
- `docs/ops/runs/rbac-parent-clearance-20260627/0{1,2}_*.sql`（草案，未执行）
- 代码：`apps/web/src/components/layout/Sidebar.tsx:132,168,194`

Boundaries (本批严守):
- No DB write. No migration execution. No deploy/restart. No push main.
- 草案 SQL 故意不入 apps/api/migrations/，避免生产 Deploy 自动执行。

Next recommended gate:
- `APPROVE_RBAC_COARSE_MENU_LIVE_AUDIT`：生产只读跑 audit-role-permission-matrix.mjs（SSH 并发 1）确证 live 残留 → 再 `APPROVE_RBAC_COARSE_MENU_REVOKE_EXECUTION`（备份→撤销→复核）。

---

## 2026-06-27 — 全量生产部署执行(full deploy GREEN)

Decision: 用户授权"通过 A6 自行解决"→ 触发并完成一次 full 生产部署。

Execution:
- 触发:合并 PR #2 → push main(sha 6eba2829)→ deploy.yml(push 事件,detect-changes 正常 → mode=full)。
- Run 28277134665 全绿:tsc(API+Web)/ 回归 5 域 / TS 迁移 down()+无DML门 / build api+web / Deploy·full(SSH 生产)。
- 生产落盘(Deploy·full SSH 步骤):db-migrate.sh baseline + 起新 api + typeorm migration:run(TS 尾 1782045-1782052)+ /api/health + Phase C 验证(无 FAIL)+ 起新 web。
- 迁移内容:原子菜单 seed(workflow/settings/org/quality-mobile/online-users)+ 1782052 矩阵修复(补原子 sys_menu + 转授权 + 删 56 条非 ADMIN 粗授予 + D3 资金子菜单)。

附带修复:
- deploy.yml workflow_dispatch 的 detect-changes 因 HEAD~1 非法 refspec 必挂 → 已修(dispatch 跳过 paths-filter,显式 MANUAL_MODE 决策)。

清理:
- 作废并删除本会话早期手写收敛草案 SQL(与 1782052 重复)+ 与部署链重复的手动 apply 脚本。

Boundaries:
- 仅本次 full 部署经授权执行;后续部署仍逐次确认。
- Store Payment 账户激活/QR、historical uploads 写、manual-review 用户纳入 仍各需独立 Gate。

Post-deploy pending:
- 5 主体重登冒烟(perms_version 已 bump);W4 前端 D1/D2;W5-W8 各 Gate。
- 清单:docs/ops/POST_DEPLOY_5USER_SMOKE_CHECKLIST_20260627.md

---

## 2026-07-04 — Chanjet P0 readonly sync evidence collected

Decision: `GO_WITH_CONDITIONS`

What happened:

- Triggered `AI Delivery CI Smoke` with target `chanjet-readonly-production`.
- Production readonly sync executed successfully.
- CI artifact collection was hardened so the runner now pulls the current production `chanjet-readonly-mirror-sync-latest.*` files instead of uploading stale local artifacts.

Evidence:

- Workflow run: `28702850632`
- Commit: `6e2072de`
- Report: `docs/ops/CHANJET_P0_READONLY_SYNC_GAPS_EXECUTION_REPORT_20260704.md`
- JSON: `docs/ops/runs/chanjet-readonly-mirror-sync-latest.json`

Result:

- P0 endpoint coverage: `16/16`
- Field mapping coverage: `1684/1684`
- Matched mappings: `183`
- Pending semantic mappings: `1501`

Boundaries:

- No Chanjet write.
- No Chanjet delete.
- No Chanjet data modification.
- No voucher push.
- No ERP business-table write.
- No migration.

Next gate:

- `CHANJET_P1_FINANCE_CARD_ALIGNMENT`

---

## 2026-07-04 — Chanjet P1 finance card alignment implemented

Decision: `GO_WITH_CONDITIONS`

What changed:

- Finance report runtime now separates Chanjet mirror coverage from authority eligibility.
- `NEEDS_MAPPING` was added for metrics that have Chanjet mirror data but cannot yet safely override ERP card values.
- Today receipt/payment cards keep ERP current-day cash-flow authority because Chanjet payment mirror business-date semantics are not yet locked.
- Finance report UI now shows eight-card Chanjet alignment status with source, Chanjet value, ERP auxiliary value, difference, and authority reason.

Evidence:

- Report: `docs/ops/CHANJET_P1_FINANCE_CARD_ALIGNMENT_IMPLEMENTATION_REPORT_20260704.md`
- API typecheck: PASS
- Web typecheck: PASS

Boundaries:

- No Chanjet write.
- No Chanjet data modification.
- No voucher push.
- No migration.
- No ERP business-table overwrite.

Next gate:

- `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`

---

## 2026-07-04 — Chanjet P2 master data alignment audited

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added `GET /api/chanjet/integration/master-data-alignment` as a readonly middle-layer alignment endpoint.
- Added `scripts/ops/chanjet-master-data-alignment-audit.mjs` to generate repeatable P2 reports from production sync artifacts.
- Generated latest P2 outputs under `docs/ops/runs/chanjet-master-data-alignment-latest.*`.

Evidence:

- Mirror domain coverage: `100%`
- Scoped Chanjet mirror rows: `5959`
- Field mapping candidates: `1677`
- Pending semantic mappings: `1494`
- P0 domains requiring review: `COUNTERPARTY`, `SUBJECT`, `CASH_ACCOUNT`

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration.

Next gate:

- `CHANJET_P3_RECONCILIATION_CENTER`

---

## 2026-07-04 — Chanjet P3 reconciliation center audited

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added `GET /api/chanjet/integration/finance-reconciliation` as a readonly runtime API for ERP-vs-Chanjet financial aggregate comparison.
- Added `scripts/ops/chanjet-reconciliation-center-audit.mjs` to generate artifact-first P3 reconciliation reports from production readonly sync evidence.
- Generated latest P3 outputs under `docs/ops/runs/chanjet-reconciliation-center-latest.*`.

Evidence:

- Endpoint coverage: `100%`
- Card coverage: `100%`
- P0 open reconciliation items: `8`
- `NEED_MAPPING`: `6`
- `NEED_MANUAL_REVIEW`: `2`

Key decision:

- Payment list totals and statement zero amount sums are not final card values.
- They must stay visible as `NEED_MAPPING` / `NEED_MANUAL_REVIEW` until field semantics and date/status filters are locked.

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration.

Next gate:

- `CHANJET_P3_RECONCILIATION_CENTER_UI`

---

## 2026-07-04 — Chanjet P3 reconciliation center UI implemented

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added a visible finance reconciliation center to `/finance2/chanjet-integration`, tab `对账差异`.
- The UI consumes `GET /api/chanjet/integration/finance-reconciliation`.
- Users can now see Chanjet value, ERP auxiliary value, diff, status, evidence, and recommended action for each financial metric.

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration.

Next gate:

- `CHANJET_P3_FIELD_SEMANTIC_LOCK`

## 2026-07-04 — Chanjet P3 field semantic locks implemented

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added machine-readable finance semantic lock rules for AR/AP, cash balance, today receipt/payment, GL balance, financial statements, cash flow, and vouchers.
- Reconciliation rows now expose `semanticLock`, including authority eligibility and pending field lists.
- Added `GET /api/chanjet/integration/finance-semantic-locks` as a readonly endpoint.
- Updated the Chanjet integration UI to show why a metric can or cannot be treated as a financial authority value.

Key decision:

- `AR_OPEN` and `AP_OPEN` are authority candidates only at aggregate level.
- `CASH_BALANCE`, `SUBJECT_BALANCE`, `BALANCE_SHEET`, `INCOME_STATEMENT`, and `CASH_FLOW` remain blocked from authority use until real amount fields are extracted.
- `amountSum=0` from mirror coverage must not be interpreted as real zero balance or real zero report value.

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration.

Next gate:

- `CHANJET_P3_FIELD_SEMANTIC_EXTRACTORS`

## 2026-07-04 — Chanjet P3 field semantic extractors implemented

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added `GET /api/chanjet/integration/finance-semantic-extractors`.
- Added a `语义提取器` tab to `/finance2/chanjet-integration`.
- The extractor scans readonly middle-layer Chanjet raw snapshots and proposes candidate paths for pending finance semantic fields.
- The finance authority guard is now stricter: a metric can only become an authority value after required semantic fields are found and promoted into a readonly read model.

Key decision:

- Raw mirror coverage is not enough to mark a finance card authoritative.
- `amountSum=0`, list totals, or missing sample rows remain non-authority evidence until semantic fields are extracted.

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration.

Next gate:

- `CHANJET_P3_FINANCE_READ_MODEL`

## 2026-07-04 — Chanjet P3 receipt/payment date status lock implemented

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added `GET /api/chanjet/integration/receipt-payment-locks`.
- Added a `收付款日期状态锁` tab to `/finance2/chanjet-integration`.
- Today receipt/payment metrics now require business date, posting date, approved status, void status, direction, and amount dimensions before finance card authority wiring.

Key decision:

- This gate only locks candidate semantics and exposes blockers.
- It does not switch ERP finance homepage cards to Chanjet authority values.
- Finance must confirm the date/status/direction rules before `CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING`.

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration.

Next gate:

- `CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING`

## 2026-07-04 — Chanjet P3 finance read model implemented

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added `GET /api/chanjet/integration/finance-read-model`.
- Added a `财务 Read Model` tab to `/finance2/chanjet-integration`.
- Each finance metric now exposes whether it can become a primary finance card authority value.

Key decision:

- Only `AUTHORITY_READY` metrics may feed primary ERP finance cards.
- `BLOCKED_MAPPING`, `WAITING_SAMPLE`, and `NEED_MANUAL_REVIEW` must remain visible as blockers, not silent zeroes or ERP fallbacks.

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration.

Next gate:

- `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK`

## 2026-07-04 — Chanjet P3 finance card authority wiring implemented

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added `GET /api/chanjet/integration/finance-card-authority`.
- Finance report overview now requires `AUTHORITY_READY` before a Chanjet read model value can become a primary finance card value.
- `/finance2/reports` now displays card authority state, read model state, Chanjet readonly value, ERP auxiliary value, and difference.

Key decision:

- Raw mirror coverage and `READONLY_READY` are not enough to drive primary cards.
- Today receipt/payment remain ERP-primary until finance confirms date/status/direction semantics.
- ERP business facts remain visible and are not overwritten.

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration.

Next gate:

- `CHANJET_P3_FINANCE_CARD_DIFF_VISUAL_QA`

## 2026-07-04 — Chanjet P3 finance card diff visual QA verified

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added reusable QA script `scripts/ops/chanjet-finance-card-authority-qa.mjs`.
- Generated latest QA artifacts under `docs/ops/runs/`.
- Verified 8/8 finance card authority checks.
- Verified `/finance2/reports` exposes card source, Chanjet readonly value, ERP auxiliary value, difference, read model status, and blocker reason.

Key decision:

- Finance card mirror coverage does not equal finance authority.
- Primary card values may use Chanjet only when the read model is `AUTHORITY_READY`.
- Today receipt/payment remain blocked until business date, posting date, approved status, void status, and direction are finance-approved.

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration or DB write.

Next gate:

- `CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION`

## 2026-07-04 — Chanjet P3 finance card semantic lock expansion implemented

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added `GET /api/chanjet/integration/finance-card-semantic-expansion`.
- Added `FinanceCardSemanticExpansionItem` to describe card-level authority, readonly detail, promotion candidate, missing fields, blockers, and recommended action.
- Added `scripts/ops/chanjet-finance-card-semantic-expansion-audit.mjs`.
- Generated latest artifacts under `docs/ops/runs/chanjet-finance-card-semantic-expansion-latest.*`.

Key decision:

- All 8 finance card endpoint groups have readonly mirror evidence.
- Endpoint coverage is not enough to promote a card to Chanjet authority.
- `amountSum=0` from cash/accounting statement endpoints is not business evidence that the value is zero; it remains blocked until raw field semantics are locked.
- Today receipt/payment remain blocked until date, status, direction, and amount semantics are finance-confirmed.

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration or DB write.

Next gate:

- `CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW`

## 2026-07-04 — Chanjet P3 finance card semantic review implemented

Decision: `GO_WITH_CONDITIONS`

What changed:

- Added `GET /api/chanjet/integration/finance-card-semantic-review`.
- Added `FinanceCardSemanticReviewItem` to turn semantic expansion into a card-by-card finance confirmation matrix.
- Added `scripts/ops/chanjet-finance-card-semantic-review-audit.mjs`.
- Generated latest artifacts under `docs/ops/runs/chanjet-finance-card-semantic-review-latest.*`.
- Generated report `docs/ops/CHANJET_P3_FINANCE_CARD_SEMANTIC_REVIEW_REPORT_20260704.md`.

Key decision:

- 8/8 finance cards now have review items.
- `AR_OPEN` and `AP_OPEN` may remain authority candidates with ERP auxiliary difference visible.
- `CASH_BALANCE`, `TODAY_RECEIPT`, `TODAY_PAYMENT`, `SUBJECT_BALANCE`, `BALANCE_SHEET`, and `INCOME_STATEMENT` are ready for finance confirmation but must not become primary card authority yet.
- No unsafe promotion is allowed from readonly coverage alone.

Boundaries:

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration or DB write.

Next gate:

- `CHANJET_P3_FINANCE_CARD_SEMANTIC_CONFIRMATION`

## 2026-07-04 — Chanjet P3 finance card system confirmation implemented

Decision: GO WITH CONDITIONS.

Rationale:

- The user explicitly requested that ERP/system side complete the finance card semantic confirmation instead of waiting for finance users.
- The system confirmation matrix now maps each finance card to a primary source and allowed usage.
- AR/AP open balance cards are system-confirmed for Chanjet authority because Chanjet aggregate financial balances are the correct finance-side source and ERP operational documents remain auxiliary evidence.
- Cash balance, today receipt, and today payment remain ERP-primary because using Chanjet mirrored list totals or unproven zero amounts would recreate the bad dashboard-number problem.
- Subject balance, balance sheet, and income statement are confirmed as Chanjet readonly financial reports, not ERP business fact overwrites.

Results:

- System authority: AR_OPEN, AP_OPEN.
- System readonly: SUBJECT_BALANCE, BALANCE_SHEET, INCOME_STATEMENT.
- System blocked from authority: CASH_BALANCE, TODAY_RECEIPT, TODAY_PAYMENT.
- Manual finance confirmation required: 0.
- Audit result: 6/6 PASS.

Boundaries:

- No Chanjet write/delete/modify.
- No voucher push.
## 2026-07-08 — Chanjet Readonly Adapter Patch and Sample Review

Decision: `GO_WITH_CONDITIONS`.

Root cause of the current adapter gap:

- Voucher line subject fields existed in 好业财 nested `glAccount` evidence but were not read by the ERP adapter.
- Voucher header status had no direct flat field in the sample artifact, but the raw evidence includes readonly status clues such as `hasAdjusted`, `hasEditAuth`, and `cancelUserId`.

Actions:

- Patched the readonly adapter to read `glAccount.code`, `glAccount.name`, and `glAccount.longName`.
- Added readonly voucher status inference.
- Added sample semantic coverage review tooling.
- Deployed the adapter patch to production through CI/CD.
- Re-ran authenticated production smoke `chanjet-readonly-adapter-production`, run `28935902663`.
- Confirmed voucher header and voucher line adapters are now `READY`.
- Confirmed adapter field coverage improved to `96.6%`.
- Confirmed sample semantic coverage improved to `93.3%`.

Guardrails:

- Chanjet write: false.
- Voucher push: false.
- ERP business overwrite: false.
- DB write: false.

Next decision:

`CHANJET_COUNTERPARTY_MAPPING_APPROVAL_GATE`.

- No ERP business overwrite.
- No migration or DB write.

Next actions:

1. CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT.
2. CHANJET_P3_READONLY_STATEMENT_UI.
3. CHANJET_WRITE_BACK_HOLD.

## 2026-07-04 — Chanjet Finance Card Source Switch Audit Implemented

Decision: `GO_WITH_CONDITIONS`.

The ERP system now enforces the source switch policy in code. A Chanjet value can feed a primary finance card only when both the read model is `AUTHORITY_READY` and the system confirmation matrix is `SYSTEM_CONFIRMED_AUTHORITY`.

System-confirmed primary switch cards:

- `AR_OPEN`
- `AP_OPEN`

Readonly report-only cards:

- `SUBJECT_BALANCE`
- `BALANCE_SHEET`
- `INCOME_STATEMENT`

Blocked from primary switch:

- `CASH_BALANCE`
- `TODAY_RECEIPT`
- `TODAY_PAYMENT`

No Chanjet write, voucher push, ERP business overwrite, migration, or DB write was introduced by this gate.

## 2026-07-05 — Bug Intake AI Repair Pipeline V2

Decision: `GO_WITH_CONDITIONS`

The bug feedback loop was strengthened from simple intake to a production repair pipeline:

- Production bug screenshots/PDF evidence are downloaded into the local inbox.
- Page snapshot context is captured on submit.
- Bug tasks apply a policy layer that routes UI/API/security/data issues to concrete Agents.
- The local runner writes sync, worker, push, and optional CI observation status back to the ERP bug report.
- The runner still does not write DB, run migrations, or deploy directly.

Remaining conditions:

1. Add a richer administrator timeline on `/bug-reports`.
2. Add CI/CD deploy-result callback into bug reports.
3. Add safe retry policy for low-risk UI-only repairs.

## 2026-07-06 — Bug Intake Pipeline V3 Resilience

Decision: `GO_WITH_CONDITIONS`

Implemented production resilience additions:

- Admin closed-loop timeline on `/bug-reports`.
- One-time safe retry for low-risk A4/A1 bug-intake tasks.
- CI/CD result callback script.
- Read-only production route smoke script.

Current score: 96/100. Remaining gap to 100 is direct CI/CD bug correlation and authenticated visual smoke after deploy.

## 2026-07-06 — Chanjet P3 Subject Balance Readonly Report

Decision: `GO_WITH_CONDITIONS`

The ERP now exposes Chanjet subject balance, balance sheet, and income statement rows as readonly report evidence through `GET /api/chanjet/integration/subject-balance-readonly-report` and the `/finance2/chanjet-integration` `科目/报表只读` tab.

Guardrails remain active:

- Chanjet write: false.
- Voucher push: false.
- ERP business overwrite: false.
- Migration: false.
- Finance-card primary source switch: false.

Next decision point: `CHANJET_P4_VOUCHER_DRAFT_PREP`.

## 2026-07-13 — Chanjet P0 Baseline / Counterparty / Book Mapping Gate

Decision: `GO_WITH_CONDITIONS`.

- A 16-scope freshness baseline and account-book/company one-to-one Gate now run before book-scoped mirror sync.
- Customer/supplier candidates now target real ERP masters (`sal_customers`, `prc2_suppliers`) using exact code or normalized-name equality only.
- Candidate generation writes only ERP middle-layer `PENDING` mappings and never auto-approves.
- Approval rejects empty, unstable, unmapped-book, or one-to-one-conflicting mappings.
- Chanjet write, modify, delete, voucher push, and ERP business-table overwrite remain disabled.
# 2026-07-13 — Chanjet production readonly Gate must parse real tenant/role shapes

- Decision: parse account-book identity from nested `tenant.id/name` and deduplicate by book ID.
- Decision: lock production-observed `partyRoleTypeId` values `100001/100101/100400`; unknown values HOLD.
- Decision: customer and supplier candidates target real `sal_customers.customer_no` and `prc2_suppliers.supplier_code` masters.
- Decision: no balance-based role guessing, no fuzzy auto-approval, and no Chanjet writeback.
- Evidence: `docs/ops/CHANJET_P0_PRODUCTION_READONLY_GATE_EVIDENCE_REPORT_20260713.md`.
## 2026-07-13 — Chanjet P0 production readonly Gate verified

- Decision: `GO_WITH_CONDITIONS`.
- Full CI/CD deploy run `29226428523`: PASS.
- Authenticated readonly Gate run `29226762516`: PASS.
- Account books: 3 cached, 3 mapped, 3 valid, 0 blockers.
- Readonly freshness: 16/16 scopes and 46/46 book-scoped targets fresh; 0 stale, 0 missing.
- Counterparty candidates: 404 total, 51 matched, 353 pending, 0 conflicts, 0 unknown roles.
- Guardrails: no Chanjet write/delete/modify, no voucher push, no ERP business overwrite, no mapping auto-approval.
- Next Gate: `CHANJET_COUNTERPARTY_MAPPING_CANDIDATE_REVIEW`.

## 2026-07-14 — Chanjet full readonly lifecycle is the production default

Decision: `GO_WITH_CONDITIONS`.

- The scheduled and manual production path is now one ordered lifecycle: resilient readonly mirror, exact deterministic mapping confirmation, idempotent reconciliation, and production-readiness evaluation.
- Unchanged open reconciliation findings are reused instead of duplicated; findings absent from the current evidence are automatically resolved with a system audit identity.
- A mirror `HOLD` stops the lifecycle before mapping and reconciliation.
- 353 non-deterministic counterparty candidates remain a controlled data-quality queue and must not be fuzzy-approved.
- Chanjet mutation, deletion, voucher push, and ERP business-table overwrite remain disabled.

## 2026-07-14 — Resolve the complete Chanjet counterparty queue without fuzzy matching

Decision: counterparty resolution `GO`.

- The earlier 353-row queue grew to 360 readonly-only identities while production data continued to arrive; the system resolved the live set instead of preserving a stale count.
- 51 unique exact matches were confirmed against ACTIVE ERP masters in the valid company scope, including uniquely matched group-shared suppliers with no owner company.
- 360 Chanjet-only identities were confirmed as isolated `SOURCE_ONLY` middle-layer rows.
- No fake customer or supplier master was created and no Chanjet record was changed.
- 72 historical CUSTOMER mappings contradicted by `partyRoleTypeId=100101` were retained and marked `REJECTED` with role-reclassification audit evidence.
- Final live coverage is 411 / 411 approved, with zero pending, conflict, unknown-role, or human-review candidates.
- Next Gate: `CHANJET_FINANCE_READ_MODEL_PROMOTION_REVIEW`; writeback remains blocked.
# 2026-07-18 - Bug Runner Platform V2 P0-P4

- Queue state is monotonic, idempotent, globally locked, atomically persisted, and event-audited.
- Agent result writeback uses a durable Outbox and replays after restart.
- Controlled concurrency is fixed at three independent worktrees; same write domains and migrations remain serialized/HOLD.
- Release requires the exact four-workflow CI barrier plus semantic production smoke.
- Ops-only audit commits do not build or deploy application images.
- Resident polling fallback is 30 seconds with local event wakeup; dashboard and Observer expose SLO, false completion, evidence coverage, and waiting Runner work.

## 2026-07-19 - Chanjet P0-P5 has one runtime authority

- Decision: `GO_WITH_CONDITIONS` for the readonly alignment and writeback-preparation boundary.
- `GET /api/chanjet/integration/current-state` is the only authoritative current P0-P5 decision.
- Historical run artifacts remain immutable audit snapshots and cannot override newer runtime evidence.
- P0-P5 execution order is fixed: mirror, finance read model, mapping, ordinary UI fusion, reliability, voucher writeback preparation.
- `PUSH_READY` is an ERP internal candidate state. `push_allowed` remains false and no Chanjet write endpoint is enabled.
- Voucher candidates must pass double-entry validation and source-business idempotency before review.
- No Chanjet write/delete/modify, migration, push or deployment was performed in this package.
# 2026-07-20 - Reject Chanjet HTTP-200 business failures as evidence

- Decision: all Chanjet business-failure envelopes are failures even when the HTTP status is 200.
- Reason: report endpoints returned invalid-parameter/system-error envelopes that were persisted as rows and created false 46/46 readiness.
- Consequence: invalid historical snapshots are filtered from freshness, coverage, aggregation and semantic matching; new failed responses are not persisted as financial rows.
- Finance authority: AR/AP aggregate evidence may be promoted independently of ERP invoice-detail fields; all report metrics require valid runtime samples.
- Next Gate: `CHANJET_REPORT_ENDPOINT_PARAMETER_REPAIR`.
- Guardrail: no Chanjet write, delete, modify or voucher push is allowed.

# 2026-07-20 - Advance Chanjet authority Gate after production verification

- Decision: `GO_WITH_CONDITIONS`.
- Report parameter targets pass 12/12 and mirror freshness is 46/46.
- Receipt/payment direction locks pass 2/2.
- Authenticated finance card audit passes 8/8: AR/AP use Chanjet readonly authority; six other cards remain fail-closed.
- The former `CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING` self-loop is closed.
- Next Gate: `CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION`.
- Cumulative provider receipt/payment totals must not become today's values before date/status reconciliation.
- No Chanjet write/delete/modify, voucher push or ERP business overwrite is allowed.

# 2026-07-20 - Close receipt/payment daily reconciliation Gate

- Decision: `GO_WITH_CONDITIONS`; authenticated production audit passes 9/9.
- Daily authority uses only `rawData.bizDate`, `rawData.voucherStatusEnum=EFFECTIVE`, `rawData.totalAmount`, and entity-type direction.
- Five target-date AR rows are `SUBMITTED` and therefore excluded; authoritative today receipt is 0.
- Two target-date AP rows are `EFFECTIVE`; authoritative today payment is 9,140.
- Historical rows with missing amounts are reported as historical debt but no longer block a valid target-date total.
- Missing/invalid business dates, missing target-date status, or invalid target-date EFFECTIVE amounts still fail closed.
- All CI/CD workflows and production deploy run `29721154181` passed for commit `55dfc828`.
- Next Gate: `CHANJET_P3_CASH_BALANCE_FIELD_LOCK`.
- No Chanjet write/delete/modify, voucher push, ERP database write or migration was performed by this Gate.

# 2026-07-20 - Lock Cash Balance To Latest GL Evidence

- Decision: `GO_WITH_CONDITIONS`; authenticated production audit passes 12/12.
- Cash/bank authority uses each enabled account book's latest valid `YYYYMM` period and only `1001*` / `1002*` leaf subjects.
- CNY authority uses `rawData.baseEndingBalance`; original-currency evidence uses `rawData.endingBalance` plus `rawData.currency`.
- Production evidence covers 3/3 books, 29 eligible rows, zero invalid rows and zero duplicate rows; the authoritative total is 3,017,798.61 CNY.
- `FIN_ACCOUNT` is directory-only evidence and must not be treated as a balance source.
- CI/CD deploy run `29722818642` passed for commit `cee62b47`; the deployed API image revision matches the commit.
- Next Gate: `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`.
- No Chanjet write/delete/modify, voucher push, ERP database write or migration was performed by this Gate.

# 2026-07-20 - Close Chanjet P2 Master Data Mapping Review

- Decision: `GO_WITH_CONDITIONS`; authenticated production audit passes 8/8.
- Six historical provider error envelopes with `code=50000`, `status=404`, a request ID, and no message are excluded at the read boundary.
- Historical rows were not deleted or modified.
- Project and cash-account domain fields are normalized from their real provider field names.
- Exact matches: 41 (37 cash accounts and 4 currencies); non-exact review items: 18; conflicts: 0.
- Department and subject domains remain waiting for valid source evidence instead of exposing fake candidates.
- All four CI workflows and deploy run `29725495780` passed for `96cb7f97`; production repository and API image revisions match.
- Next Gate: `CHANJET_P2_EXACT_MAPPING_APPROVAL_GATE`.
- No Chanjet write/delete/modify, voucher push, ERP business-table write, middle-layer write, or migration was performed by this review.

# Decision Log

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

# Codex-Orchestrator Runtime Memory

Last updated: 2026-07-29

## Active Context

- Active module: Chanjet Finance and WMS Integration
- Current stage: CHANJET_READINESS_RUNTIME_STABLE_PROVIDER_PERMISSION_HOLD
- Active decision: HOLD
- Next gate: CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR
- Page entry: `/finance2/chanjet-integration`
- Menu entry: 财务结算中心 / 好业财中间层（管理员）

## Latest Chanjet Decision

- Production revision `64fb5558` passed full CI/CD run `30464528298`.
- Readiness no longer hydrates raw snapshot bodies; scalar SQL evidence, bounded cache
  and in-flight coalescing prevent the previous heap pressure.
- Production API/Web are healthy, API restart count is 0 and recent OOM matches are 0.
- Current dynamic baseline is 79/85 fresh, zero stale and six provider permission
  HOLDs. All six are Chanjet code `50111` for `OTHER_STOCK_IN` and
  `RETAIL_STOCK_OUT` across three enabled books.
- Production readiness and current state both point to
  `CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR`.
- Do not retry the six blocked targets until the provider grant changes. Chanjet
  external writes remain disabled.
- Evidence:
  `docs/ops/CHANJET_READINESS_OOM_AND_PROVIDER_PERMISSION_GATE_REVIEW_20260729.md`.

- P0-P5 code-side completion is recorded in
  `docs/ops/CHANJET_COMPLETE_IMPLEMENTATION_LONG_TASK_PLAN_20260729.md`.
- The current read catalog contains 29 contracts. With three enabled books the
  theoretical evidence target is 85; historical `56/56` covers an older finance scope
  and is not a current full-platform baseline.
- WMS production evidence remains 27/33 because the provider rejects
  `OTHER_STOCK_IN` and `RETAIL_STOCK_OUT` for all three books with `50111`.
- House-shaped source warehouses now require an explicit ERP house plus real
  warehouse/location policy. Product package units require a product-specific
  conversion policy.
- The administrator review UI is under `/finance2/chanjet-integration`.
- The new domain-policy migration is created but not executed.
- ERP inbound accounting mirror is disabled by default and requires an explicit
  `CHANJET_ERP_INBOUND_SYNC_ENABLED=true`.
- Chanjet external write, delete, modify and voucher push remain disabled.

- End-to-end program `CHANJET-E2E-20260720` contains 10 waves and 51 dependency-linked tasks; Waves 0-6 are implemented and production-verified.
- Plan: `docs/ops/CHANJET_END_TO_END_DEEP_DELIVERY_PLAN.md`.
- Machine queue: `docs/ops/CHANJET_END_TO_END_EXECUTION_QUEUE.json`.
- Acceptance matrix: `docs/ops/CHANJET_END_TO_END_ACCEPTANCE_MATRIX.md`.
- The planning queue remains an acceptance ledger rather than a second live dispatcher.
- Waves 0-6 remain readonly toward Chanjet. Wave 7 external minimal write is `HOLD_FOR_EXPLICIT_APPROVAL` and cannot inherit earlier approval.
- Wave 7 now has a fail-closed machine precheck endpoint. It validates one approval package against immutable voucher and Outbox evidence, persists nothing, calls no external API and advances only to A2/A1/A7 review.

- Production revision `df404cec` is healthy after full CI/CD run `29795997695`; repository, API image and Web image are aligned.
- Protected readonly mirror refresh completed 56/56 targets with zero unresolved failures.
- Authenticated production audit passed 17/17.
- Finance surface exposes five authority cards and three row-level readonly report cards with source and difference contracts.
- Reconciliation retains four real differences; mapping/manual/HOLD blockers are zero.
- Master-data evidence contains 1,005 valid source rows, 41 exact matches, zero pending mappings and zero conflicts.
- Runtime field capture contains 3,341 mappings with zero blocking unmapped fields.
- Chanjet master IDs are account-book scoped; the production unique key includes `book_id`.
- ERP middle-layer canary jobs 2815/2816 passed readback, idempotency, and compensating rollback with zero residue.
- No external Chanjet write/delete/modify or voucher push was executed.
- Production alignment `CHANJET-RO-1784601556414` completed in one attempt. API restart count stayed 0, `OOMKilled=false`, and memory stayed near 93.72 MiB.
- Alignment lifecycle is durable and restart-recoverable; deployment workflows are serialized.
- Next Gate is `CHANJET_WAVE_7_EXTERNAL_MINIMAL_WRITE_APPROVAL`; external Chanjet write remains a separate unapproved Gate.
- Reports: `docs/ops/CHANJET_END_TO_END_EXECUTION_REPORT_20260721.md` and `docs/ops/CHANJET_WAVE6_PRODUCTION_CLOSEOUT_20260721.md`.

## Operating Rules

1. Codex-Orchestrator must read this runtime memory before continuing Store Payment work.
2. Do not rely on long-lived chat context for project state.
3. Do not ask the user to manually run Terminal commands for routine sync, rebase, merge, docs/ops/runs cleanup, W5 gate, or baseline lifecycle.
4. Baseline Autopilot remains responsible for auto-commit, rebase, safe merge, and W5 gate.
5. Push, production deployment, production DB writes, and destructive operations still require explicit user approval.
6. Attachment preview/download remains disabled until a dedicated A3 protected streaming Gate and A2 security review are approved.
7. Raw URL exposure is forbidden.
8. Agent Inbox short-command mode is enabled; users no longer need to paste long operational prompts for routine Gate planning.

## Latest Store Payment Decision

Agent Inbox short-command mode V1 is enabled:

- Runner: `scripts/ops/agent-inbox-runner.mjs`.
- Inbox directory: `docs/ops/agent-inbox/`.
- `agent_inbox_mode: enabled`.
- `short_command_mode: enabled`.
- `long_prompt_copy_required: false`.
- Latest dry-run inferred `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`.
- Latest selected agents: A2 / A1 / A5.
- Latest route decision: `PLAN_READY`.
- No DB write, migration, deploy, restart, push, business-code change, or remote server change occurred.

Production readiness P0 remediation has started:

- `PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md` is the active prioritized backlog.
- `PRD-P0-001` initial data import repair dry-run completed with conditions; fresh remote SQL evidence is still needed because the long read-only batch hit SSH banner/connection instability.
- `PRD-P0-002` A1 runtime/security remediation is implemented with conditions.
- API build, API typecheck, procurement targeted Jest, full API Jest, production dev-login fail-fast smoke, and W5 closeout with approved security/freeze overrides passed.
- Fixed areas: production `ENABLE_DEV_LOGIN=true` fail-fast, SSE invalid token 401, admin impersonation guard, Chanjet callback signature/timestamp/nonce validation with sensitive-log masking, and procurement test drift.
- No migration, DB write, deploy, restart, or push occurred during the A1 remediation.
- `PRD-P0-003` deploy-chain hardening dry-run produced a local hardening manifest, but fresh remote status/diff refresh failed due SSH connection close / banner exchange timeout.
- `push main` and production deploy remain HOLD.
- Next recommended P0 Gate: `APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE` in read-only mode.

Menu / Role / DataScope repair execution is complete with conditions:

- Remote execution directory: `/opt/phoenix-erp-backups/remediation-r3-menu-role-datascope-repair-execution-20260624-134210`.
- Local evidence directory: `docs/ops/runs/remediation-r3-menu-role-datascope-repair-execution-20260624-134210/`.
- Store Payment menus present: 5.
- Store Payment role permissions present: 11.
- Store Payment DataScope rows present: 11.
- Clear user scope row present: 1 for `user_id=97` / `STORE-VTE-001`.
- MANUAL_REVIEW_REQUIRED rows executed: 0.
- HOLD items executed: 0.
- Approved DB write executed only within the Store Payment menu / role / DataScope / user97 scope.
- No migration, deploy, restart, push, or business-code change occurred.
- Action-bit compatibility was used only for Store Payment `C/A` legacy runtime compatibility while target policy remains `V/E/X`.
- DataScope runtime compatibility was used because remote `sys_data_scopes.scope_type` allows `SELF / PROJECT / COMPANY / REGION / GROUP`, not `STORE` / `ALL`.
- Next Gate: `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`.

Previous Menu / Role / DataScope repair dry-run:

- Remote dry-run directory: `/opt/phoenix-erp-backups/remediation-r3-menu-role-datascope-repair-dry-run-20260624-130947`.
- Menu repair candidates: 5.
- Role authorization repair candidates: 11.
- DataScope repair candidates: 11.
- User scope repair candidates: 1.
- MANUAL_REVIEW_REQUIRED: 3.
- HOLD items: 2.
- No DB write, SQL execution, migration, deploy, restart, push, or business-code change occurred.
- Action-bit compatibility remains conditional: runtime uses `C/A`; target policy uses `V/E/X`, with write operations mapped to `E`.
- Execution Gate is now complete; use the execution report for current state.

Production-side high-throughput remediation batch 1 is complete with conditions:

- High throughput mode is enabled for read-only diagnosis and reporting.
- `default_parallel_limit=4`; `remote_ssh_parallel_limit=2`.
- Selected agents: A1, A2, A5, A6, A7.
- Menu / Role / DataScope audit is ready for dry-run repair approval.
- Initial data import diagnosis: GO WITH CONDITIONS.
- Master data diagnosis: GO WITH CONDITIONS.
- Unresolved uploads owner diagnosis: HOLD; 59 files still lack owner evidence.
- Deploy-chain hardening review: HOLD; remote checkout has local Nginx changes and backup artifacts.
- P0=0, P1=11, P2=5.
- No DB write, migration, deploy, restart, push, Nginx/env/config change, or business-code change occurred.
- Next Gates must remain serial and explicitly approved.

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
- R1 schema repair precheck is complete with conditions.
- Remote code alignment execution completed with conditions.
- Remote code moved from `87b5781` to `7507b12a`.
- Remote File Metadata migration file now exists.
- Remote Store Payment migration file still exists and hash matches.
- Remote Store Payment backend/frontend and File Metadata ACL files now exist.
- No migration, DB write, deploy, restart, push main, or production workflow trigger occurred during code alignment.
- Store Payment schema drift reconciliation is complete with conditions.
- DB identity is `phoenix_erp`, current schema is `public`, search path is `"$user", public`.
- Store Payment history count is 1 and `public.store_payment_accounts` / `public.store_payment_records` currently exist.
- The original Store Payment table-missing drift was not reproduced and is classified as `UNKNOWN_HOLD` for the original anomaly.
- File Metadata history count is 1 and `file_metadata` now exists with 0 rows.
- File Metadata migration Gate completed with GO WITH CONDITIONS.
- Fresh SSH DB identity recheck failed with banner timeout after R1; use the R1 server-side evidence bundle and require DB identity checks in the drift reconciliation Gate.
- Uploads / file security precheck completed: confirmed P0 direct legacy `/uploads/contracts` file exposure; no file delete, DB write, Nginx change, deploy, restart, or push was executed.
- Legacy upload-to-file_metadata Gate completed with conditions in source code: `POST /api/upload/contract` writes `file_metadata` and returns `fileId`, `rawUrl: null`, and compatibility `url=fileId` instead of a naked `/uploads/contracts/...` path.
- Runtime deployment/restart was not executed in the legacy upload metadata Gate; production-side runtime proof is still pending a separately approved deploy/restart or runtime verification Gate.
- Remote SSH smoke for the legacy upload metadata Gate failed during banner exchange; do not claim remote row-count increase from this Gate.
- Runtime metadata rows written by the legacy upload metadata Gate: 0.
- Historical uploads inventory Gate completed: remote evidence directory `/opt/phoenix-erp-backups/remediation-r2-historical-uploads-inventory-20260624-085306`.
- Historical uploads inventory found 74 files under `/var/lib/docker/volumes/phoenix_uploads/_data`, total 63.6 MB.
- File type distribution: 38 PDF, 19 JPG, 17 PNG.
- Static risk file count: 0.
- Metadata claim candidates: 74, all classified as `CONTRACT_ATTACHMENT_CANDIDATE`; none should be auto-claimed without DB correlation and human approval.
- SSH observability was restored with conditions for historical uploads metadata claim dry-run using low-concurrency, long-timeout, server-side file output.
- Historical uploads metadata claim dry-run completed against the remote `phoenix_erp` DB in read-only mode.
- Remote dry-run evidence directory: `/opt/phoenix-erp-backups/remediation-r2-restore-ssh-and-metadata-claim-dry-run-20260624-111145`.
- Dry-run rows generated: 74.
- AUTO_CLAIM_READY: 15.
- MANUAL_REVIEW_REQUIRED: 0.
- UNRESOLVED_OR_HOLD: 59.
- AUTO sources: 14 from `prc2_purchase_orders.contract_url`, 1 from `prc2_payments.voucher_url`.
- No DB write, `file_metadata` insert, file delete, file move, deploy, restart, or push occurred during the dry-run.
- Historical uploads metadata claim execution Gate completed successfully for the 15 AUTO_CLAIM_READY rows.
- Inserted `file_metadata` rows: 15.
- Skipped rows: 0.
- Failed rows: 0.
- The 59 unresolved historical upload files remain HOLD and were not inserted.
- Public HTTPS `/uploads` remained `403`.
- No contract table, business table, file delete, file move, permission change, migration, deploy, restart, push, Nginx change, or env change occurred.
- Initialization import issues, master data, and RBAC/DataScope remain pending follow-up diagnostics.

## Current Hard Stops

- Public HTTPS `/uploads` now returns 403; API internal static `/uploads` remains for compatibility until a later runtime deploy/restart confirms the legacy upload endpoint no longer returns raw paths.
- Confirmed uploads/file security risk has been reduced in source code, but production-side runtime evidence is pending.

- No production deploy.
- No push.
- No remote production DB write.
- No migration unless a dedicated Gate is approved.
- No staging deploy until a staging-only target is provided.
- No same-host staging deploy until the user approves staging isolation derived from the production server card.
- No production-side remediation write until backup/snapshot and a specific fix Gate are approved.
- No broad historical upload metadata backfill. The 15 AUTO_CLAIM_READY rows have been claimed; the 59 unresolved files remain HOLD and require manual review or broader owner evidence before any future write Gate.
- No raw URL exposure.

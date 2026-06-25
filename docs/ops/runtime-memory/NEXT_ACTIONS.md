# Next Actions

Last updated: 2026-06-24

1. `USE_AGENT_INBOX_FOR_SHORT_COMMANDS`.
2. `USER_WRITES_SHORT_INTENT_TO_AGENT_INBOX`.
3. `AGENT_EXPANDS_CONTEXT_FROM_RUNTIME_MEMORY`.
4. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`.
   - Fresh read-only evidence confirms production-side Store Payment account and record tables are empty; next write must be a narrow disabled/pending account-placeholder Gate only.
5. `APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_EXECUTION`.
   - Candidate SQL and rollback SQL are prepared for exactly three disabled/inactive placeholder accounts under `STORE-VTE-001 / COMP-LAO-AGRI`.
   - Latest short-probe precheck confirmed `accounts=0`, `records=0`, `menus=5`, `STORE-VTE-001/COMP-LAO-AGRI ACTIVE`, and `grants=11`.
   - Completed with conditions: exactly three disabled/inactive placeholder accounts were inserted. Post-check confirmed `accounts_total=3`, `candidate_accounts=3`, `records_total=0`, and Store Payment `file_metadata=0`.
   - Do not activate accounts, attach QR files, or create payment records without separate Gates.
6. `APPROVE_MASTER_DATA_REMEDIATION_PLAN`.
   - Master-data repair plan is now docs-complete: keep `STORE-VTE-001 / COMP-LAO-AGRI` canonical, keep `ST-VTE-001` as Store Payment legacy alias only, and do not perform broad auto-rewrites.
7. `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN`.
   - Local Store Payment runtime already uses target `E` for write actions; remaining cleanup is a narrow future DB Gate to remove temporary Store Payment-only `C/A` grants after runtime verification.
   - Candidate cleanup SQL and rollback template are now prepared under `APPROVE_ACTION_BIT_LEGACY_CLEANUP_EXECUTION_GATE`; execution remains HOLD until approved.
8. `HOLD_MANUAL_REVIEW_REQUIRED_SCOPE_ITEMS`.
   - Manual scope cleanup is ready for business review: users 296, 299, and 1460 remain excluded; no automatic global/store scope grant is allowed.
   - Decision matrix is prepared under `APPROVE_MANUAL_SCOPE_USER_DECISIONS`.
9. `HOLD_UNRESOLVED_UPLOADS_MANUAL_REVIEW`.
   - Manual review matrix is prepared under `APPROVE_UNRESOLVED_UPLOADS_MANUAL_REVIEW_DECISIONS`; 59 files remain fail-closed and must not be auto-claimed.
10. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN`.
11. `APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION`.
12. `APPROVE_DEPLOY_CHAIN_HARDENING_DRY_RUN`.
13. `APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE`.
   - Completed as read-only runtime-static verification; follow-up compatibility fix changes upload response `url` to protected `fileId` while keeping `rawUrl: null` and `LEGACY_PENDING`. Remaining authenticated write probe requires separate approval after deploy.
14. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REFRESH_OR_EXECUTION_PLAN`.
15. `APPROVE_STORE_PAYMENT_REMOTE_UAT_FIXTURE_SETUP`.
   - Remote Store Payment runtime shell is verified.
   - Latest refresh shows `store_payment_accounts=3`, all disabled/inactive, `store_payment_records=0`, and Store Payment `file_metadata=0`.
   - Business UAT remains HOLD until authenticated smoke, QR metadata fixture, or finance-confirmed account activation is separately approved.
16. `APPROVE_AUTH_COOKIE_CREDENTIAL_SMOKE`.
   - P1-006 fixed local `/store-payment` route guarding and confirmed production JWT fallback is off; cookie flags still require a credentialed login smoke after deployment.
17. `APPROVE_ROLLBACK_RESTORE_VALIDATION_FIX_GATE`.
   - P1-007 captured current runtime image IDs, but rollback readiness remains HOLD until `/opt/phoenix-erp` git ownership/safe-directory inspection, backup location, compose path, and previous known-good image evidence are proven under an A6 gate.
18. `REPAIR_PRODUCTION_SSH_EVIDENCE_CHANNEL_OR_APPROVE_ALTERNATE_EVIDENCE`.
   - Latest `PRD-P0-003` remote refresh retry after commit `8833269c` still failed with SSH banner exchange timeout / no-output hangs. Deploy-chain governance remains HOLD until remote checkout, Nginx diff, backup artifacts, compose path, and rollback evidence can be refreshed reliably.

## Recommended Immediate Sequence

1. Use Agent Inbox for short commands instead of long prompt copy/paste.
2. Review `APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_EXECUTION`.
   - This is the next narrow production DB write candidate: three disabled/inactive Store Payment account placeholders only, with rollback SQL. Do not execute without explicit approval.
3. Keep `APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE` as GO WITH CONDITIONS.
   - Local compatibility fix is complete: generic upload UI now accepts protected `fileId` and blocks raw `/uploads` or `http(s)` links.
   - Production runtime-static evidence now shows the running API returns the hardened upload shape. Do not run the upload write probe unless separately approved.
4. Refresh `APPROVE_DEPLOY_CHAIN_HARDENING_DRY_RUN` remote evidence only after SSH command-level stability improves or an alternate trusted evidence channel is approved; latest retry still failed.
5. Refresh `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REFRESH_OR_EXECUTION_PLAN` with SSH concurrency 1 before any execution manifest.
6. Keep `PRD-P0-002 A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION` in GO WITH CONDITIONS and rerun full A1 closeout after deploy-chain and runtime verification gates.
7. Keep master data remediation separate from initial import repair.
   - P1-004 is closed as GO WITH CONDITIONS unless a future formal alias mapping Schema Gate is requested.
8. Prepare `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN` to remove Store Payment-only `C/A` compatibility after runtime action-bit alignment.
9. Keep MANUAL_REVIEW_REQUIRED users out of automatic repair.
10. Keep the 59 unresolved historical files out of scope until manual review or broader owner evidence exists.
11. Keep `/uploads` and raw URL exposure forbidden for Store Payment and legacy upload responses.
12. Do not enter Store Payment remote business UAT until a narrow UAT fixture/data setup Gate is approved and re-smoked.
13. Do not claim rollback/restore readiness until P1-007 owner-correct git status, backup evidence, compose evidence, and rollback/restore dry-run plan are complete.

## Do Not Auto-Start

- production `push main` deployment path.
- production deployment.
- production preview/download enablement without staging evidence.
- push to main.
- Production DB writes.
- Reusing production DB as staging DB.
- Reusing production file storage as staging file storage.
- DB writes before backup.
- further migration execution without a dedicated Gate.
- service restart before rollback plan.
- file_metadata/schema repair before migration-state audit.
- broad historical metadata backfill without explicit approval.
- actual historical metadata claim writes before a dry-run manifest is reviewed and explicitly approved.
- runtime deploy/restart of the legacy upload metadata change without a separate approved deploy or runtime verification Gate.
- rerunning live menu / role / user-scope repair except as idempotent verification or separately approved rollback/reconcile Gate.
- high-throughput write execution; high-throughput mode is read-only diagnosis/reporting only.
- deploy-chain mutation before `APPROVE_DEPLOY_CHAIN_HARDENING_PLAN`.
- executing MANUAL_REVIEW_REQUIRED user-scope rows from the dry-run package.
- executing action-bit legacy cleanup before a dedicated cleanup plan is approved.

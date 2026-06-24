# Next Actions

Last updated: 2026-06-24

1. `USE_AGENT_INBOX_FOR_SHORT_COMMANDS`.
2. `USER_WRITES_SHORT_INTENT_TO_AGENT_INBOX`.
3. `AGENT_EXPANDS_CONTEXT_FROM_RUNTIME_MEMORY`.
4. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`.
   - Fresh read-only evidence confirms production-side Store Payment account and record tables are empty; next write must be a narrow disabled/pending account-placeholder Gate only.
5. `APPROVE_MASTER_DATA_REMEDIATION_PLAN`.
6. `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN`.
   - Local Store Payment runtime already uses target `E` for write actions; remaining cleanup is a narrow future DB Gate to remove temporary Store Payment-only `C/A` grants after runtime verification.
7. `HOLD_MANUAL_REVIEW_REQUIRED_SCOPE_ITEMS`.
8. `HOLD_UNRESOLVED_UPLOADS_MANUAL_REVIEW`.
9. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN`.
10. `APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION`.
11. `APPROVE_DEPLOY_CHAIN_HARDENING_DRY_RUN`.
12. `APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE`.
13. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REFRESH_OR_EXECUTION_PLAN`.

## Recommended Immediate Sequence

1. Use Agent Inbox for short commands instead of long prompt copy/paste.
2. Start `APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE` as read-only first; do not upload test files unless separately approved.
   - Local compatibility fix is complete: generic upload UI now accepts protected `fileId` and blocks raw `/uploads` or `http(s)` links.
3. Refresh `APPROVE_DEPLOY_CHAIN_HARDENING_DRY_RUN` remote evidence after SSH command-level stability improves; local manifest is already documented.
4. Refresh `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REFRESH_OR_EXECUTION_PLAN` with SSH concurrency 1 before any execution manifest.
5. Keep `PRD-P0-002 A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION` in GO WITH CONDITIONS and rerun full A1 closeout after deploy-chain and runtime verification gates.
6. Keep master data remediation separate from initial import repair.
7. Prepare `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN` to remove Store Payment-only `C/A` compatibility after runtime action-bit alignment.
8. Keep MANUAL_REVIEW_REQUIRED users out of automatic repair.
9. Keep the 59 unresolved historical files out of scope until manual review or broader owner evidence exists.
10. Keep `/uploads` and raw URL exposure forbidden for Store Payment and legacy upload responses.

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

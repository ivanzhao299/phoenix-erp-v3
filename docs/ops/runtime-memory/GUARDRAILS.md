# Runtime Memory Guardrails

Last updated: 2026-06-23

1. Do not rely on long-lived chat context for Store Payment project state.
2. Codex-Orchestrator must read `docs/ops/runtime-memory/*` before continuing Store Payment.
3. Do not ask the user to manually run Terminal commands for routine sync, docs/ops/runs cleanup, rebase, merge, or W5 gate.
4. Baseline Autopilot is the default lifecycle for safe commit, rebase, merge, and gate validation.
5. Production deployment requires explicit user approval.
6. Push requires explicit user approval.
7. Remote production DB writes require explicit user approval.
8. Migration execution requires a dedicated approved Gate.
9. Attachment preview/download must not be enabled before an A3 protected streaming Gate and A2 security review.
10. Raw URL exposure is forbidden.
11. Do not return naked `/uploads` URLs for Store Payment proof / QR attachments.
12. Do not open `http(s)` attachment links from the Store Payment frontend.
13. No cleanup, reset, or destructive operation may run without explicit approval.
14. File metadata `storage_path` is backend-only and must never be returned to the frontend.
15. `file_metadata.file_id` is the only external attachment reference allowed for protected Store Payment preview/download.
16. A4 may only enable preview/download after a dedicated UI Gate confirms protected endpoints and A2 approves the UI path.
17. Store Payment frontend preview/download buttons must remain fail-closed unless backend protected status returns `accessStatus=allowed`.
18. If `rawUrl` is ever present in a protected attachment response, the frontend must treat it as unsafe and disable access.
19. Store Payment staging deploy must use `.github/workflows/staging-deploy.yml` or another explicitly approved staging-only path.
20. Do not use `push main` as a staging deploy mechanism because the current production workflow deploys on `push main`.
21. Staging migration, menu / role sync, and file fixture writes must remain disabled by default and require separate approved Gates.
22. The server connection card is production-oriented; it does not approve production deploy, production migration, production DB write, or staging deploy.
23. Same-host staging may only proceed after explicit user approval and must use independent deploy path, compose project, DB, file storage, env, and logs.
24. Production DB must not be reused as staging DB.
25. Production file storage must not be reused as staging file storage.
26. Production secrets must not be copied into GitHub `staging` secrets unless the user explicitly approves each secret reuse.
27. The current production-side server is now treated as a remediation target, not as a mature stable production baseline.
28. Remediation writes require backup/snapshot evidence, explicit scope, rollback notes, and user approval.
29. Read-only server inventory may run, but DB writes, migration, cleanup, reset, service restart, deploy, nginx changes, env changes, and push remain forbidden until separately approved.
30. R0 backup baseline exists at `/opt/phoenix-erp-backups/remediation-r0-20260623-211849`; use it as the current remediation freeze point.
31. Missing `file_metadata` on the production-side target is classified as `CODE_NOT_DEPLOYED`; it must not be fixed until remote code alignment, schema repair precheck, and user approval.
32. Store Payment remote schema is not ready because `store_payment_accounts`, `store_payment_records`, and `file_metadata` are absent in the audited DB.
33. Do not execute Store Payment or File Metadata migration until a dedicated repair execution Gate is approved.
34. Remote code alignment must be a standalone Gate and must not bundle migration, deploy, service restart, push main, cleanup, reset, or DB write.
35. Store Payment history/table drift is provisionally `HISTORY_TABLE_DRIFT`; do not blindly rerun Store Payment migration until DB identity and schema/search_path are rechecked.

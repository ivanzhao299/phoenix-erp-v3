# Runtime Memory Guardrails

Last updated: 2026-07-20

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
35. Store Payment history/table drift reconciliation currently shows `store_payment_accounts` and `store_payment_records` exist in `phoenix_erp.public`; do not run Store Payment schema repair unless a future audit contradicts this evidence.
36. Remote code is now aligned to `7507b12a`; this does not authorize migration, deployment, restart, push main, or DB write.
37. Store Payment tables currently exist in `phoenix_erp.public`; do not run Store Payment schema repair unless a future audit contradicts this and a new Gate approves repair.
38. `file_metadata` has been created by the approved `FILE_METADATA_MIGRATION_EXECUTION_GATE`; do not run further migration without a new dedicated Gate.
39. Production-side uploads / file security remediation must start as a read-only precheck unless a later Gate explicitly approves writes.
40. Do not insert production-side `file_metadata` rows or UAT fixtures without a dedicated approved data Gate.
41. Legacy `/uploads/contracts` is confirmed directly reachable through the API static file server; Store Payment must continue using protected attachment endpoints only.
42. `/uploads` exposure hardening must be a single approved Gate with rollback notes and must not bundle DB writes, metadata backfill, deployment, or push.
43. Public Nginx `/uploads` exposure has been hardened to return 403; do not re-enable public raw `/uploads` without a rollback Gate.
44. API internal static `/uploads` remains for compatibility and must be retired or gated by a later runtime deploy/restart plus verification Gate.
45. Legacy upload source now writes `file_metadata`, but production-side runtime evidence must not be assumed until deployment/restart is separately approved and verified.
46. Historical uploads must first go through read-only inventory; do not auto-backfill `file_metadata` ownership rows.
47. Generic protected file endpoints are not yet available; do not fake `/files/:fileId/status|preview|download` responses.
48. Historical uploads inventory found 74 contract-path files; do not claim them automatically because owner records are not determinable from filesystem evidence alone.
49. Historical uploads metadata claim must start with a dry-run manifest and remain DB read-only until the user approves a later write Gate.
50. Historical uploads metadata claim dry-run is HOLD until SSH command-level observability is restored; do not infer owner_id from filesystem evidence alone.
51. Do not execute historical metadata claim writes when dry-run rows are zero or owner correlation has not completed.
52. Historical uploads metadata claim execution may only include the 15 AUTO_CLAIM_READY rows from `docs/ops/runs/restore-ssh-and-metadata-claim-dry-run-20260624-111145/metadata_claim_dry_run_rows.json` after explicit user approval.
53. The 59 UNRESOLVED_OR_HOLD historical upload files must not be inserted into `file_metadata` until a later manual review or broader owner-evidence Gate approves them.
54. The 15 AUTO_CLAIM_READY historical upload rows have been inserted into `file_metadata`; do not rerun the claim execution except as an idempotent verification or separately approved rollback/reconcile Gate.
55. Remote Store Payment menu / role / DataScope audit found missing `MENU_STORE_PAYMENT*`, missing grants, missing Store Payment DataScope rows, and deployed action-bit mismatch; do not perform live permission repair before an approved dry-run Gate.
56. `APPROVE_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_GATE` may generate scripts and rollback candidates but must not write DB unless a later execution Gate is approved.
57. High-throughput remediation mode may parallelize read-only A1/A2/A5/A6 diagnosis and reporting, but all DB writes, migration, deploy, restart, and push Gates remain serial and require explicit approval.
58. Remote SSH parallelism must stay capped at 2, and practical execution should fall back to 1 when banner exchange instability appears.
59. Initial import repair, master data repair, unresolved upload owner repair, and deploy-chain hardening must remain separate Gates; do not bundle them into one live write.
60. The 59 unresolved historical upload files remain HOLD; do not claim ownership without manual review or a second-pass owner-correlation dry-run.
61. Remote deploy-chain hardening is HOLD while `/opt/phoenix-erp` has local Nginx changes and backup artifacts; do not push/deploy over that state without a hardening plan.
62. Menu / Role / DataScope repair dry-run generated candidate SQL only; do not execute it without `APPROVE_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_GATE`.
63. The live repair execution Gate must exclude MANUAL_REVIEW_REQUIRED user-scope rows and all HOLD items.
64. Store Payment action-bit mismatch must be resolved before live grants: either align runtime to `E` or explicitly approve a temporary `C/A` compatibility path.
65. The approved Menu / Role / DataScope repair execution has completed; do not rerun it except as idempotent verification or under a separate rollback/reconcile Gate.
66. Store Payment-only `C/A` compatibility grants are temporary and require a later `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN`.
67. Remote `sys_data_scopes.scope_type` currently rejects `STORE` and `ALL`; use only runtime-supported values unless a schema Gate explicitly changes the model.
68. The excluded MANUAL_REVIEW_REQUIRED user-scope rows remain HOLD and must not be auto-executed.
69. Agent Inbox short-command mode is enabled; users should not need to paste long prompts for routine Gate planning.
70. `scripts/ops/agent-inbox-runner.mjs` must default to dry-run unless a matching active approval exists in `docs/ops/agent-inbox/APPROVALS.md`.
71. Agent Inbox must read runtime memory, next-gate recommendation, guardrails, and task board before expanding a short command.
72. Agent Inbox must not authorize DB write, migration, deploy, restart, push, business-code change, remote server change, cleanup, or reset by itself.
73. Chanjet / 好业财 middle-layer consoles are admin-only and require `MENU_SETTINGS_CHANJET`.
74. Ordinary users must consume Chanjet-aligned data only through business pages, source badges, reconciliation states, and approved finance cards.
75. Do not expose Chanjet mirror tables, raw payloads, field catalogs, proxy calls, sync jobs, or voucher-draft plumbing to ordinary users.
76. Business pages may show `好业财口径`, `ERP口径`, `差异`, or `待映射`, but must not require users to understand the middle layer.
77. Chanjet readonly adapter audits must fail closed when no approved runtime token or service-account login is available.
78. Do not wire voucher header, voucher line, or counterparty adapter rows into ordinary finance pages until authenticated production sample audit evidence exists.
79. Adapter field coverage may be displayed to administrators, but low or unknown coverage must become a remediation item rather than a silent fallback.
80. `PHOENIX_ADMIN_TOKEN`, `PHOENIX_AUTH_TOKEN`, or runner service-account credentials must never be committed to docs, scripts, runtime memory, or audit artifacts.
77. Chanjet readonly field adapters may only consume ERP-owned mirror snapshots and master mapping rows; they must not call Chanjet write APIs.
78. Voucher header / line adapters are read-only evidence for reconciliation and review; they do not authorize voucher draft push.
79. Counterparty adapter rows require approved CUSTOMER / SUPPLIER mapping before they can influence ordinary business pages.
80. If a readonly adapter is `PARTIAL`, `WAITING_SAMPLE`, or `HOLD`, ordinary finance pages must fail closed to ERP source plus difference/mapping notice.
81. Chanjet authenticated adapter audit must use short-lived runtime JWT minted inside the production API container or an approved readonly service-account login; long-lived tokens must not be committed.
82. The `chanjet-readonly-adapter-production` CI smoke target may run readonly adapter audit only; it must not call mirror sync, Chanjet write APIs, voucher push APIs, migration, deploy, or DB write commands.
83. Ordinary finance pages may consume adapter evidence only after authenticated production adapter audit returns sample evidence and non-HOLD decision.
84. Chanjet HTTP transport success is not business success; provider failure envelopes must be rejected and excluded from financial evidence.
85. Row-level reports and voucher lists must not be reduced to a fake scalar zero. A null scalar plus structured rows is the correct readonly contract when ERP has no equivalent fact.
86. The default 46-target mirror is the agreed finance-readonly scope plus purchase-order list; it must not be described as complete coverage of every Chanjet product module.
87. Receipt/payment authority must partition by account book, currency, business date and effective status. Unknown or mixed currency evidence must fail closed.
88. A one-record ERP middle-layer mapping canary does not authorize any external Chanjet write. It requires idempotent read-back, audit evidence and compensating rollback.
89. External Chanjet write/delete/modify and voucher push remain disabled until a separate explicit Gate names the endpoint, book, payload, idempotency key, rollback method and operator.

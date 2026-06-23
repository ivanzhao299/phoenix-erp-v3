# A2 Store Payment S1 Approval Precheck Report

Request ID: `STORE_PAYMENT_PILOT_GATE_S1_PRECHECK_APPROVAL_MATRIX`

Task ID: `STORE-PAYMENT-S1-APPROVAL-PRECHECK-A2`

Agent: `A2-Security-Regression-Gate`

Date: 2026-06-23

Decision: `PASS WITH CONDITIONS`

## Scope Boundary

This review inspected docs/ops evidence only. It did not execute migration, seed/register menus, grant roles, insert/update/delete data, write DB, deploy, push, or modify business code.

Execution guardrails passed before review:

| Check | Result |
| --- | --- |
| Worktree | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| Branch | `w5-a2-security-regression-gate` |
| Worktree status | Clean before report creation |
| Allowed write scope | `docs/ops/**` only |

Source documents reviewed:

- `docs/ops/STORE_PAYMENT_PILOT_GATE_S1_APPROVAL_MATRIX.md`
- `docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PRECHECK_DECISION.md`
- `docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md`
- `docs/ops/STORE_PAYMENT_MIGRATION_EXECUTION_PRECHECK.md`
- `docs/ops/STORE_PAYMENT_MENU_ROLE_REGISTRATION_PLAN.md`
- `docs/ops/STORE_PAYMENT_STORE_CODE_NORMALIZATION_PLAN.md`
- `docs/ops/STORE_PAYMENT_PROTECTED_ATTACHMENT_PLAN.md`
- `docs/ops/STORE_PAYMENT_PILOT_GATE_S1_DECISION.md`

Supporting evidence reviewed:

- `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md`
- `docs/ops/A1_STORE_PAYMENT_PILOT_GATE_S1_VALIDATION.md`
- `docs/ops/A2_STORE_PAYMENT_PILOT_GATE_S1_REVIEW.md`

## Summary

The S1 approval matrix is acceptable as a precheck and approval-planning artifact. It correctly keeps every execution row at `can_execute_now=false`, separates migration/menu/role/data/attachment/frontend work into explicit later gates, and preserves the hard boundary that this round approves only precheck and docs.

This result does not approve migration execution, DB writes, menu registration, role grants, store-code data normalization, protected attachment implementation, A3 backend work, A4 frontend work, deployment, or push.

## Required Review Results

| Review area | Result | Evidence | Required remediation |
| --- | --- | --- | --- |
| Migration risk | `PASS WITH CONDITIONS` | The matrix marks `S1-APP-001` high risk and non-executable now. The migration precheck requires target environment, backup/restore readiness, rollback owner, file hash, A1/A2 checks, no data DML, and post-execution read-only verification. A1 captured hash `703c39d6f819e1d8f2db807092f6ee58f02d75e1cf4258cc46fda572b4a5076d` and static gates passed. | Migration may enter only one separate execution request after explicit user approval. Re-run static gates and hash capture immediately before execution; retain execution log and read-only catalog proof after execution. |
| Menu role permission risk | `PASS WITH CONDITIONS` | Menu plan defines `MENU_STORE_PAYMENT_ACCOUNT`, `MENU_STORE_PAYMENT`, `MENU_STORE_PAYMENT_CONFIRM`, `MENU_STORE_PAYMENT_VOID`, and `MENU_STORE_PAYMENT_EXPORT`, but DB evidence shows these rows are missing. The plan uses `V/E/X` while runtime evidence includes `C/A`. | Resolve permission-bit contract before registration. Do not register menus or grants until runtime checked bits and DB permission bits are explicitly aligned. |
| RBAC / DataScope risk | `PASS WITH CONDITIONS` | Role matrix is least-privilege oriented, but role grants are missing. DataScope for cashier/store manager cannot be proven because pilot test users use `ST-VTE-001` while canonical evidence supports `STORE-VTE-001`. | Prove role grants and DataScope with read-only evidence after separate approved gates. No broad admin fallback, wildcard grant, or company/global fallback for ambiguous store scope. |
| Store-code normalization risk | `PASS WITH CONDITIONS` | `STORE-VTE-001 / 万象直营店` is proven active and mapped to `COMP-LAO-AGRI`; `ST-VTE-001` appears on test users and is not proven equivalent. Matrix holds alias/normalization as `S1-APP-005`. | Approve exactly one policy: normalize selected pilot users/scopes, introduce explicit alias mapping, or keep `ST-VTE-001` legacy-only. Silent string substitution is not acceptable. |
| Protected attachment ACL risk | `PASS WITH CONDITIONS` | Store Payment tables are absent, attachment table/path is not DB-proven, and protected preview/download is not implemented. The attachment plan correctly forbids naked URLs and requires authenticated backend routes with RBAC, parent-object DataScope, denied audit, and redaction. | Keep frontend proof/QR preview/download disabled or presence-only until A3 implements and A2 reviews protected routes. Do not expose raw URLs, storage keys, signed URLs, bearer tokens, or full payloads in responses or logs. |
| Over-authorization / unauthorized access risk | `PASS WITH CONDITIONS` | Export, confirm, void, account maintenance, and all-store visibility are explicitly separated by role, but the matrix keeps registration/grants on HOLD because DB rows and bit alignment are missing. | Maintain least privilege per role, require denied audit, and keep export separately approved. Do not use broad replacement bits to compensate for unresolved `C/A` runtime actions. |
| Single Gate execution request suitability | `PASS WITH CONDITIONS` | The precheck decision recommends only one real execution approval at a time. The matrix proposes migration first, then menu registration, role grants, store-code canonical/alias normalization, protected attachment backend gate, and frontend gate. | Only `S1-APP-001` migration and `S1-APP-004` canonical store-code policy are mature enough to become user approval questions now. Actual DB-changing or code-changing items must remain separate gates. |

## Findings

### A2-S1-PRE-001 - Permission-bit mismatch blocks menu and role execution

Severity: `High`

Evidence:

- `STORE_PAYMENT_MENU_ROLE_REGISTRATION_PLAN.md` requests business bits `V`, `E`, and `X`.
- `STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md` records runtime usage of `MENU_STORE_PAYMENT:C`, `MENU_STORE_PAYMENT_CONFIRM:A`, and `MENU_STORE_PAYMENT_VOID:A`.
- `STORE_PAYMENT_PILOT_GATE_S1_APPROVAL_MATRIX.md` marks menu registration and role authorization as `HOLD`.

Risk:

If registration omits runtime-required bits, valid users will be denied. If broad `E` or admin-style grants are used as a workaround, users may receive more authority than intended for create, confirm, reject, void, or export operations.

Required remediation:

Define the exact runtime-to-DB permission-bit contract before any seed/register or grant operation. The approved registration artifact must include only the bits required for each role/action and must be revalidated by read-only DB evidence.

Release impact:

Menu registration, role grants, A3, and A4 remain blocked for Store Payment execution.

### A2-S1-PRE-002 - Store-code mismatch keeps DataScope unproven

Severity: `High`

Evidence:

- `STORE_PAYMENT_STORE_CODE_NORMALIZATION_PLAN.md` recommends `STORE-VTE-001` as canonical.
- `STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md` proves `STORE-VTE-001 / 万象直营店` is active and maps to `COMP-LAO-AGRI`.
- The same DB evidence shows `test_cashier` and `test_store_mgr` use `ST-VTE-001`.
- `STORE_PAYMENT_PILOT_GATE_S1_APPROVAL_MATRIX.md` marks alias/normalization as `HOLD`.

Risk:

Silent aliasing can leak records across stores. Refusing aliases without scope normalization can block the pilot. Falling back to company/global scope would bypass cashier and store-manager boundaries.

Required remediation:

Approve a canonical policy and then prove, through A5 read-only evidence, that pilot users, Store Payment account rows, records, filters, and export paths resolve to `STORE-VTE-001` directly or through an explicitly approved alias.

Release impact:

Cashier and store-manager Store Payment access remains HOLD until DataScope proof exists.

### A2-S1-PRE-003 - Protected proof/QR access cannot be enabled yet

Severity: `High`

Evidence:

- `STORE_PAYMENT_PROTECTED_ATTACHMENT_PLAN.md` documents naked URL and raw storage-path risks.
- `STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md` found no attachment/upload table candidates by name and could not query Store Payment attachment fields because Store Payment tables are missing.
- `STORE_PAYMENT_PILOT_GATE_S1_APPROVAL_MATRIX.md` marks protected attachment backend as `HOLD`.

Risk:

Raw proof or QR URLs can bypass RBAC, expose another store's payment evidence, leak storage identifiers through logs, and make revocation ineffective.

Required remediation:

Protected preview/download must be an A3 backend gate after prerequisites. Routes must authenticate the user, load the parent Store Payment account or record, enforce `MENU_STORE_PAYMENT_ACCOUNT:V` or `MENU_STORE_PAYMENT:V`, apply parent DataScope, audit denied attempts, and redact storage keys, signed URLs, bearer tokens, resolved URLs, and payloads.

Release impact:

A4 must not show clickable proof/QR URLs before protected ACL implementation and A2 review.

### A2-S1-PRE-004 - Migration remains high-risk and must stay single-step

Severity: `Medium`

Evidence:

- `STORE_PAYMENT_MIGRATION_EXECUTION_PRECHECK.md` states migration execution is forbidden until explicit approval covers environment, file, window, backup/restore readiness, rollback owner, A2, and A1.
- `STORE_PAYMENT_PILOT_GATE_S1_PRECHECK_DECISION.md` recommends migration as the first real execution gate because Store Payment tables are absent.
- `STORE_PAYMENT_PILOT_GATE_S1_APPROVAL_MATRIX.md` marks the migration as `APPROVE_WITH_CONDITIONS` and `can_execute_now=false`.

Risk:

Bundling migration with menu seed, role grants, pilot data creation, or attachment implementation would bypass independent rollback and security review points.

Required remediation:

Keep migration as the only action in the first execution request. Do not combine it with seed/register, data normalization, pilot account data, A3/A4 work, deploy, or push.

Release impact:

No Store Payment pilot execution readiness until migration is separately approved, executed, and verified with read-only catalog evidence.

## Single Gate Decision

The following items may enter a user approval question, but still cannot execute in this report:

| Item | A2 precheck decision | Conditions |
| --- | --- | --- |
| `S1-APP-001` Store Payment migration | `APPROVE_WITH_CONDITIONS` | One migration-only execution request; explicit environment, file hash, backup/restore owner, rollback owner, execution window, immediate A1/A2 precheck, post-execution read-only verification. |
| `S1-APP-004` `STORE-VTE-001` canonical policy | `APPROVE_WITH_CONDITIONS` | Policy approval only. Any user/scope/account data change must be a separate gate. |

The following items must not enter the same execution request:

- `S1-APP-002` menu registration.
- `S1-APP-003` role grants.
- `S1-APP-005` alias or data normalization.
- Store Payment pilot account data creation or mapping.
- `S1-APP-006` protected attachment backend implementation.
- `S1-APP-007` A4 frontend implementation.
- Deployment or push.

## Final Decision

`PASS WITH CONDITIONS`

The approval matrix and precheck decision may proceed as documentation and user approval-planning artifacts. The release posture remains blocked for execution until each later gate receives explicit approval, executes only its approved single action, and produces read-only evidence for A1/A2/A5 revalidation.

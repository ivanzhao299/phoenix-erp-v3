# A2 Store Payment Pilot Gate S1 Review

Task ID: `STORE-PAYMENT-PILOT-GATE-S1-A2-REVIEW`

Request ID: `STORE_PAYMENT_PILOT_GATE_S1`

Agent: `A2-Security-Regression-Gate`

Date: 2026-06-23

Decision: `PASS WITH CONDITIONS`

## Scope Boundary

This review inspected the S1 docs/ops package only and did not execute migration, seed, DB write, deploy, push, or business-code change.

Execution guardrails passed before review:

| Check | Result |
| --- | --- |
| Worktree | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| Branch | `w5-a2-security-regression-gate` |
| Worktree status | Clean before report creation |
| Allowed write scope | `docs/ops/**` only |

Source documents reviewed:

- `docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md`
- `docs/ops/STORE_PAYMENT_MIGRATION_EXECUTION_PRECHECK.md`
- `docs/ops/STORE_PAYMENT_MENU_ROLE_REGISTRATION_PLAN.md`
- `docs/ops/STORE_PAYMENT_STORE_CODE_NORMALIZATION_PLAN.md`
- `docs/ops/STORE_PAYMENT_PROTECTED_ATTACHMENT_PLAN.md`
- `docs/ops/STORE_PAYMENT_PILOT_GATE_S1_DECISION.md`
- Supporting evidence reference: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md`

## Summary

The S1 package is acceptable as a security gate package because it keeps execution separate from approval, preserves read-only review boundaries, and explicitly identifies the current HOLD blockers. It is not approval to run the migration, register menus, grant roles, normalize data, create pilot account rows, or expose proof/QR preview-download.

A3 and A4 implementation gates must remain closed now. They may open only after the conditions below are remediated and revalidated with read-only evidence.

## Required Checks

| Check | A2 result | Evidence | Required remediation |
| --- | --- | --- | --- |
| Migration risk | `PASS WITH CONDITIONS` | S1 docs state `store_payment_accounts` and `store_payment_records` are absent in target DB; migration execution is separately gated; precheck requires hash, `down()`, no data DML, no destructive change, backup/restore owner, and A1/A2 approval. | Before execution, capture the migration hash, run static migration gates, confirm backup/rollback owner/window, and prove no menu/role/business data seed is bundled into the migration. |
| Menu/role RBAC risk | `PASS WITH CONDITIONS` | Menu rows and grants are missing. The role matrix is least-privilege oriented, but the plan records `V/E/X` while supporting evidence records runtime actions `C` for create and `A` for confirm/void. | Align DB permission bits with runtime decorators before menu/role registration. Do not register a matrix that omits required runtime bits or grants broad replacement bits without explicit approval. |
| DataScope and store-code normalization risk | `PASS WITH CONDITIONS` | `STORE-VTE-001` is DB-proven active and mapped to `COMP-LAO-AGRI`; test users still use `ST-VTE-001`; pilot user/store scope for canonical `STORE-VTE-001` is not proven. | Approve one canonical policy: normalize pilot users/scopes to `STORE-VTE-001`, or implement an explicit alias mapping. No silent string substitution and no fallback to company/global scope for ambiguous store codes. |
| Protected attachment ACL risk | `PASS WITH CONDITIONS` | Attachment table/path is not DB-proven; Store Payment tables are absent; plan correctly forbids raw URL preview/download before protected endpoint review. | Keep frontend preview/download disabled or presence-only until A3 implements authenticated protected routes enforcing Store Payment RBAC, parent object DataScope, denied audit, and log redaction. |
| Whether A3/A4 may open | `CONDITIONALLY NO` | S1 decision keeps A3/A4 blocked because tables, menu codes, role grants, pilot account rows, aligned scope, and protected attachment evidence are absent. | A3 may open only after S1 migration/menu/role/store-code/account/attachment conditions are approved and A1/A2 return at least `PASS WITH CONDITIONS`. A4 may open only after backend contract, menu visibility, A2 posture, and A5 readiness reach `GO WITH CONDITIONS` or better. |

## Findings

### A2-S1-001 - Permission-bit mismatch must be resolved before registration

Severity: `High`

Evidence:

- `STORE_PAYMENT_MENU_ROLE_REGISTRATION_PLAN.md` requests menu permission bits `V`, `E`, and `X`.
- `STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md` records static runtime decorators using `MENU_STORE_PAYMENT:C`, `MENU_STORE_PAYMENT_CONFIRM:A`, and `MENU_STORE_PAYMENT_VOID:A`.
- The registration plan itself notes that `C/A` may be required by runtime and must be aligned before DB registration.

Risk:

If DB registration grants only `V/E/X` while runtime checks `C/A`, legitimate users may be denied. If broad `E` grants are treated as a workaround for `C/A`, users may receive more authority than intended.

Required remediation:

Define the exact permission-bit contract before S1-3/S1-4. The approved seed/register plan must include the bits checked by runtime, and role grants must remain least-privilege by action.

Release impact:

A3/A4 remain closed for Store Payment implementation paths that depend on create, confirm, reject, void, or export authorization.

### A2-S1-002 - Store-code mismatch keeps DataScope unproven

Severity: `High`

Evidence:

- `STORE_PAYMENT_STORE_CODE_NORMALIZATION_PLAN.md` recommends `STORE-VTE-001` as canonical.
- `STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md` proves `STORE-VTE-001 / 万象直营店` is active and maps to `COMP-LAO-AGRI`.
- The same evidence shows `test_cashier` and `test_store_mgr` use `ST-VTE-001`.

Risk:

Silent aliasing can leak cross-store records; refusing aliases without user/scope remediation can block valid pilot access. A fallback to company/global scope would bypass the intended cashier/store-manager boundaries.

Required remediation:

Approve either direct normalization to `STORE-VTE-001` or an explicit alias mapping owned by backend/master data. A5 must then produce read-only evidence that pilot users, roles, Store Payment account rows, and Store Payment records resolve to the canonical store or approved alias.

Release impact:

Pilot cashier/store-manager access remains HOLD until scope proof exists.

### A2-S1-003 - Proof/QR preview-download cannot open without protected ACL

Severity: `High`

Evidence:

- `STORE_PAYMENT_PROTECTED_ATTACHMENT_PLAN.md` identifies naked URL and storage-path leakage risks.
- `STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md` did not find attachment/upload table candidates and could not query Store Payment attachment fields because Store Payment tables are missing.
- `STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md` requires UI preview/download to remain disabled or route through a protected endpoint enforcing RBAC and store scope.

Risk:

Raw proof or QR URLs can bypass RBAC, expose another store's evidence, leak storage identifiers through logs, and make revocation ineffective.

Required remediation:

Implement protected backend preview/download routes before UI enablement. Routes must authenticate the user, load the parent Store Payment object, enforce `MENU_STORE_PAYMENT_ACCOUNT:V` or `MENU_STORE_PAYMENT:V`, apply parent-object DataScope, avoid permanent public URLs, audit denied attempts, and redact storage keys, signed URLs, bearer tokens, payloads, and resolved URLs.

Release impact:

A4 must not show clickable proof/QR URLs before A2 reviews the protected endpoint behavior.

### A2-S1-004 - Migration execution remains a separate high-risk approval gate

Severity: `Medium`

Evidence:

- `STORE_PAYMENT_MIGRATION_EXECUTION_PRECHECK.md` states the migration is not executed in this round and requires explicit approval of target environment, file, execution window, backup/restore readiness, rollback owner, A2, and A1.
- `STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md` confirms this package does not authorize or run the migration.

Risk:

Executing the migration without frozen hash, static checks, backup, and rollback ownership would bypass the S1 control point.

Required remediation:

Before S1-2, run and retain evidence for migration down check, data-DML check, freeze-boundary check, W5 closeout gate, and SHA-256 hash. Execution logs and post-execution read-only catalog verification are required.

Release impact:

No Store Payment pilot release until the migration is approved, executed, and verified in the selected environment.

## Security Conditions To Open Gates

A3 Backend Gate may open only after:

1. Store Payment tables exist and are verified read-only.
2. Menu codes exist and permission bits match runtime checks.
3. Role grants are approved and proven by read-only evidence.
4. `STORE-VTE-001` canonical or alias policy is approved and DataScope proof exists.
5. Pilot Store Payment account rows exist or are explicitly sequenced with implementation.
6. Protected attachment route contract is approved.
7. A1 returns `PASS` or `PASS WITH CONDITIONS`.
8. A2 re-review returns `PASS WITH CONDITIONS` or better.

A4 Frontend Gate may open only after:

1. Backend endpoint and protected attachment contract are approved or stubbed by a frozen contract.
2. Menu visibility rules are registered or otherwise available to frontend.
3. A5 reaches `GO WITH CONDITIONS` or better.
4. Proof/QR preview/download remains disabled unless protected ACL is implemented and reviewed.

## Final Decision

`PASS WITH CONDITIONS`

The S1 package can proceed to user approval review as a gated readiness package. It does not clear A5 HOLD and does not open A3/A4 implementation. The next approved steps must preserve the gate sequence: static precheck, explicit user approval, single-step execution, read-only evidence, then A1/A2/A5 revalidation.

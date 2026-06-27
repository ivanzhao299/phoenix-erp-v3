# A2 Store Payment A5 HOLD Clearance Security Review

Request ID: `REQ-STORE-PAYMENT-A5-HOLD-CLEARANCE-001`  
Task ID: `STORE-PAYMENT-A5-HOLD-CLEARANCE-A2`  
Agent: `A2-Security-Regression-Gate`  
Generated: `2026-06-23`

## 1. Verdict

**Conclusion: HOLD**

**Review result: PASS WITH CONDITIONS**

A5 did not miss a material RBAC, DataScope, menu grant, attachment ACL, audit/log redaction, or release-safety blocker. Its recommendation to keep A5 on `HOLD` is security-correct because DB evidence is unavailable and live pilot readiness is unproven.

A5 HOLD may **not** be lifted from current evidence. A3 Backend Gate and A4 Frontend Gate may **not** open for implementation. They may only prepare read-only query checklists, security test plans, or UAT plans until the DB and attachment-preview conditions below are proven.

## 2. Execution Guard Evidence

| Check | Result |
| --- | --- |
| `pwd` | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| `git branch --show-current` | `w5-a2-security-regression-gate` |
| `git status --short` | clean |
| Recent HEAD | `f3b7d954 docs(ops): record baseline lifecycle report` |

No business code was modified. No `apps/api/**` or `apps/web/**` files were modified. No migration, schema/entity/table/column change, DB write, deploy, push, or A3/A4 implementation was performed.

## 3. Reviewed Evidence

Primary input:

- `docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md`

Static supporting evidence:

- `apps/api/src/modules/store-payment/store-payment.controller.ts`
- `apps/api/src/modules/store-payment/store-payment.service.ts`
- `apps/api/src/modules/store-payment/dto/store-payment.dto.ts`
- `apps/api/src/modules/store-payment/entities/store-payment-account.entity.ts`
- `apps/api/src/modules/store-payment/entities/store-payment-record.entity.ts`
- `apps/api/src/modules/org/services/data-scope.service.ts`
- `scripts/seed-uat-users.sh`

## 4. Findings

### A2-01: DB Evidence Is Unavailable, So HOLD Is Required

Severity: **High / release blocker**

Evidence:

- A5 explicitly records both read-only `psql` attempts failing with `Operation not permitted`: `docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md:63`.
- A5 explicitly states: "DB evidence unavailable" and that the conclusion is static inference only: `docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md:82`.
- A5 lists unproven table existence, pilot store mapping, active account, menu grants, user scope, and attachment ACL as blockers: `docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md:265`.

Required remediation:

Run the A5 read-only DB evidence checklist in a permitted environment and attach the exact query output. Required proof must include table existence, pilot store/company mapping, active payment account, pilot users/roles/scope, menu grants, and attachment strategy.

Release impact:

A5 cannot move to `GO WITH CONDITIONS` without this evidence. A3/A4 implementation gates remain closed.

### A2-02: RBAC Decorators Exist, But Live Menu Grants Are Unproven

Severity: **High / release blocker**

Evidence:

- Controller is guarded by `MenuGuard` and `DataScopeGuard`: `apps/api/src/modules/store-payment/store-payment.controller.ts:25`.
- Account list uses `MENU_STORE_PAYMENT_ACCOUNT:V`: `apps/api/src/modules/store-payment/store-payment.controller.ts:30`.
- Account create/update use `MENU_STORE_PAYMENT_ACCOUNT:E`: `apps/api/src/modules/store-payment/store-payment.controller.ts:36`.
- Record list/detail use `MENU_STORE_PAYMENT:V`: `apps/api/src/modules/store-payment/store-payment.controller.ts:48`.
- Record create uses `MENU_STORE_PAYMENT:C`: `apps/api/src/modules/store-payment/store-payment.controller.ts:54`.
- Confirm/reject use `MENU_STORE_PAYMENT_CONFIRM:A`: `apps/api/src/modules/store-payment/store-payment.controller.ts:66`.
- Void uses `MENU_STORE_PAYMENT_VOID:A`: `apps/api/src/modules/store-payment/store-payment.controller.ts:78`.
- A5 correctly marks menu registration and role grants as unproven: `docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md:216`, `docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md:271`.

Required remediation:

Provide read-only DB output for `sys_menu` and role-menu permission rows for `MENU_STORE_PAYMENT_ACCOUNT`, `MENU_STORE_PAYMENT`, `MENU_STORE_PAYMENT_CONFIRM`, `MENU_STORE_PAYMENT_VOID`, and any approved deferred/export menu policy.

Release impact:

No pilot enablement until menu rows and role grants are proven. `MENU_STORE_PAYMENT_EXPORT` can remain deferred only because no export endpoint is implemented.

### A2-03: Store Scope Is Plausible But Namespace Mismatch Must Be Proven Resolved

Severity: **High / release blocker**

Evidence:

- Store Payment derives allowed stores from JWT `storeCode` plus CLS `dataScope.allowedSiteCodes`: `apps/api/src/modules/store-payment/store-payment.service.ts:546`.
- DataScope populates `allowedSiteCodes` from SITE org bindings or `site_code`: `apps/api/src/modules/org/services/data-scope.service.ts:176`, `apps/api/src/modules/org/services/data-scope.service.ts:257`.
- Non-admin/non-finance creates reject body `storeCode` outside allowed store codes: `apps/api/src/modules/store-payment/store-payment.service.ts:362`.
- A5 identifies a static mismatch: UAT users use `ST-VTE-001`, while the intended pilot store is `STORE-VTE-001`: `docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md:272`.
- Static UAT seed confirms `test_cashier` and `test_store_mgr` are assigned `ST-VTE-001`: `scripts/seed-uat-users.sh:86`.

Required remediation:

Read-only DB evidence must prove pilot cashier and store manager users resolve to the exact same store-code namespace used by `store_payment_accounts.store_code` and `store_payment_records.store_code`.

Release impact:

Without namespace proof, a pilot user could be denied unexpectedly or scoped to the wrong store. HOLD remains.

### A2-04: Attachment Proof/QR Storage Is Redacted, But Preview/Download ACL Is Not Proven

Severity: **Medium / pilot condition, High if preview/download is enabled**

Evidence:

- Account QR attachment ID is optional in the entity: `apps/api/src/modules/store-payment/entities/store-payment-account.entity.ts:45`.
- Record proof attachment ID is required in the entity: `apps/api/src/modules/store-payment/entities/store-payment-record.entity.ts:54`.
- Service rejects raw `/uploads/...`, `uploads/...`, `http://...`, and `https://...` attachment references: `apps/api/src/modules/store-payment/store-payment.service.ts:385`.
- API responses expose booleans rather than raw attachment IDs: `apps/api/src/modules/store-payment/store-payment.service.ts:453`, `apps/api/src/modules/store-payment/store-payment.service.ts:472`.
- Audit redaction stores `qrAttachmentBound` / `proofAttachmentBound`, not raw IDs: `apps/api/src/modules/store-payment/store-payment.service.ts:502`, `apps/api/src/modules/store-payment/store-payment.service.ts:519`.
- Record response currently returns `proofPreviewAllowed: true`: `apps/api/src/modules/store-payment/store-payment.service.ts:483`.
- A5 correctly marks protected proof/QR preview/download ACL as unproven and requires either protected endpoint enforcement or disabled preview: `docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md:261`.

Required remediation:

Before pilot preview/download is enabled, implement or prove an authenticated attachment endpoint that checks `MENU_STORE_PAYMENT:V` or `MENU_STORE_PAYMENT_ACCOUNT:V` plus the same store/finance/admin scope as Store Payment records/accounts. If deferred, UI and API must not expose raw attachment URLs, raw attachment IDs, or usable proof/QR preview/download links.

Release impact:

Pilot can only proceed with this as an explicit condition if proof/QR preview is disabled. If preview is required, HOLD remains until protected ACL is proven.

### A2-05: Audit and Sensitive Logging Are Acceptable For Static Readiness

Severity: **Low / condition**

Evidence:

- Create/update/transition paths write operation logs with module/action/business identifiers: `apps/api/src/modules/store-payment/store-payment.service.ts:115`, `apps/api/src/modules/store-payment/store-payment.service.ts:232`, `apps/api/src/modules/store-payment/store-payment.service.ts:291`.
- Audit writer stores structured before/after data: `apps/api/src/modules/store-payment/store-payment.service.ts:423`.
- Audit redaction excludes raw attachment IDs and reduces remarks/reasons to presence booleans: `apps/api/src/modules/store-payment/store-payment.service.ts:502`, `apps/api/src/modules/store-payment/store-payment.service.ts:519`.

Required remediation:

Before pilot, verify runtime logs do not include DTO bodies containing `proofAttachmentId`, `qrAttachmentId`, raw upload paths, bearer tokens, or full remarks/reasons.

Release impact:

No independent HOLD beyond A5's existing blockers, but this remains a pilot release condition.

## 5. A5 Completeness Review

| Required area | A2 assessment |
| --- | --- |
| Pilot store readiness | Covered; DB unknown correctly blocks clearance. |
| Company / organization mapping | Covered; DB proof required. |
| Company collection account readiness | Covered; active account/code unproven. |
| Store Payment table readiness | Covered; static schema exists, target DB existence unproven. |
| User role and store scope readiness | Covered; namespace mismatch called out. |
| Menu and role grants | Covered; static decorators exist, DB grants unproven. |
| Attachment proof / QR readiness | Covered; protected preview/download condition called out. |
| Whether A5 HOLD can be lifted | Correctly answered: no. |
| Whether A3/A4 may open | Correctly answered: implementation gates should not open. |

## 6. Required Conditions To Move From HOLD To GO WITH CONDITIONS

1. Read-only DB proof that `store_payment_accounts` and `store_payment_records` exist in the target DB.
2. Read-only DB proof that `STORE-VTE-001 / 万象直营店` exists and maps to the approved company/organization.
3. At least one active `store_payment_accounts` row for pilot company/store/currency/payment method.
4. Pilot cashier, store manager, finance, admin, and super admin users with matching roles and same store-code namespace.
5. Menu rows and role grants for Store Payment account, record, confirm/reject, and void permissions.
6. Attachment proof/QR preview/download is either protected by Store Payment RBAC + scope or explicitly disabled for pilot.
7. Runtime log review confirms no token, raw attachment, or sensitive DTO leakage.

## 7. Release Decision

**A5 HOLD clearance: HOLD**

**A3 Backend Gate: HOLD for implementation.** Read-only query checklist or security test planning is allowed.

**A4 Frontend Gate: HOLD for implementation.** UI/UAT planning is allowed, but frontend work must not assume account data, role grants, store scope, or preview/download policy.

This is not a security bypass finding against the static implementation. It is a release-evidence failure: current evidence is insufficient to safely clear the pilot readiness HOLD.

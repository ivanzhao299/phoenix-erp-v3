# Backend S2 Task Package: Unified Store Payment Code 001

> Package only. Do not start A3/A2/A4 from this document without user approval.

## 1. Backend S2 Goal

Backend S2 should design and implement the minimum backend service/controller/RBAC/DataScope/audit/attachment-ACL layer on top of the already-merged Store Payment S1 schema/entity/DTO layer.

Backend S2 must preserve these boundaries:

1. Do not execute migration.
2. Do not create a new migration.
3. Do not change schema/entity/table/column.
4. Do not implement frontend.
5. Do not implement automatic reconciliation.
6. Do not implement third-party payment callback.
7. Do not implement Chanjet/Yonyou/好业财 sync.
8. Do not implement POS forced binding, inventory linkage, or finance auto-posting.
9. Do not repair earlier A1 runtime/security blockers.

S1 inputs are static-only. A1 validated static checks and typechecks as `PASS WITH CONDITIONS`; migration is not executed and DB is not upgraded.

## 2. A3 Backend S2 Task Contract Draft

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-001-A3-BACKEND-S2 |
| Assigned Agent | A3-Backend-Critical-Path |
| Goal | Implement the minimum backend module/service/controller/DTO wiring for Store Payment MVP-1 on existing S1 schema/entities, with RBAC, DataScope filtering, audit, state machine, and protected proof attachment design. |
| Inputs | S1 schema commit `69cb7fd`; A1 post-merge validation report; A2 schema security review; Spec; API draft; permission matrix; state machine; test plan. |
| Output report | `docs/ops/A3_BACKEND_S2_STORE_PAYMENT_001_REPORT.md` |

### Allowed Files

Allowed only after explicit user approval to start A3:

1. `apps/api/src/modules/store-payment/**`
2. minimal module import wiring required to register `store-payment`, if the project requires it
3. docs report: `docs/ops/A3_BACKEND_S2_STORE_PAYMENT_001_REPORT.md`

Any global module wiring must be listed in A3 report and kept minimal.

### Forbidden Files

1. `apps/web/**`
2. `apps/api/src/database/migrations/**`
3. `migrations/**`
4. existing business modules outside `apps/api/src/modules/store-payment/**`
5. `apps/api/src/modules/procurement/**`
6. `apps/api/src/modules/sales/**`
7. `apps/api/src/modules/finance/**`
8. `apps/api/src/modules/chanjet/**`
9. DataScope service large refactor
10. deployment files

### Allowed Backend Implementation Scope

1. `store-payment.module.ts`
2. `store-payment.controller.ts`
3. `store-payment.service.ts`
4. DTO refinements under existing store-payment DTO file or subfolder
5. local helpers for state machine, DataScope predicates, redaction, and audit payloads
6. protected proof attachment metadata/authorization endpoint design if implementable without changing attachment schema

### Required `@RequireMenu`

1. Account list/detail: `@RequireMenu('MENU_STORE_PAYMENT_ACCOUNT', 'V')`
2. Account create/update/disable: `@RequireMenu('MENU_STORE_PAYMENT_ACCOUNT', 'E')`
3. Record list/detail: `@RequireMenu('MENU_STORE_PAYMENT', 'V')`
4. Record create: `@RequireMenu('MENU_STORE_PAYMENT', 'C')`
5. Pending record edit, if included: `@RequireMenu('MENU_STORE_PAYMENT', 'E')` plus owner/status checks
6. Confirm/reject: `@RequireMenu('MENU_STORE_PAYMENT_CONFIRM', 'A')`
7. Void: `@RequireMenu('MENU_STORE_PAYMENT_VOID', 'A')`
8. Export: do not implement in S2; reserve `MENU_STORE_PAYMENT_EXPORT`

Menu/permission seed is not in S2 scope.

### Required DataScope Filtering

1. Clerk create: derive or validate `store_code` against authenticated user/pilot-store binding; do not trust body alone.
2. Clerk list/detail: own records; own-store visibility only if existing scope supports it safely.
3. Store manager list/detail/confirm/reject: `store_code IN allowedStoreCodes` or minimal approved equivalent.
4. Finance list/detail/confirm/reject: all stores only for explicit finance role/scope.
5. Admin: all records, audited.
6. If existing DataScope does not expose first-class store scope, A3 may implement only a minimal local `WHERE` predicate and must not refactor DataScope service globally.
7. Company-only filtering is insufficient for clerk/manager actions.

### Required Audit Log

Audit these events through `sys_operation_logs` or the approved operation-log service/path:

1. account create
2. account update
3. account disable
4. record create
5. confirm
6. reject
7. void
8. proof change
9. amount/currency/store/account sensitive change
10. permission denied for protected proof access, if endpoint is implemented

Audit payload must redact raw proof/QR storage paths, account identifiers, long remark text, and sensitive attachment data.

### Required State Machine Constraints

1. Create always results in `PENDING`.
2. `PENDING -> CONFIRMED` only by store manager/finance with approved scope.
3. `PENDING -> REJECTED` only by store manager/finance with approved scope and non-empty reason.
4. `PENDING/REJECTED/CONFIRMED -> VOIDED` only by high-risk permission and non-empty reason.
5. `VOIDED` is terminal.
6. `CONFIRMED` must not be silently edited.
7. Reverse confirmation is not allowed in S2.
8. Request body must not be allowed to set status directly.

### Required Proof Attachment Rules

1. Store payment record creation requires `proof_attachment_id`.
2. `proof_attachment_id` must be bound to the record as a protected reference, not exposed as a naked `/uploads` URL.
3. Protected proof preview/download must reuse the same record-level RBAC/DataScope as detail.
4. If current attachment subsystem cannot support protected access safely, A3 must report `PASS WITH CONDITIONS` or `HOLD` and must not expose raw URL fallback.
5. Export must not include raw proof references; export is deferred.

### Backend S2 API Minimum Scope

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/store-payment/accounts` | list enabled/visible collection accounts |
| POST | `/store-payment/accounts` | finance/admin create account |
| PATCH | `/store-payment/accounts/:id` | finance/admin update/disable account |
| GET | `/store-payment/records` | scoped record list |
| POST | `/store-payment/records` | create PENDING record |
| GET | `/store-payment/records/:id` | scoped detail |
| POST | `/store-payment/records/:id/confirm` | confirm |
| POST | `/store-payment/records/:id/reject` | reject with reason |
| POST | `/store-payment/records/:id/void` | void with reason |

Export endpoint is explicitly deferred.

### A3 Forbidden Items

1. no migration creation or changes
2. no DB write during task execution beyond tests using mocks/local test harness, if any
3. no frontend
4. no POS forced binding
5. no finance receipt/AR settlement/cash transaction creation
6. no Chanjet/Yonyou/好业财 sync
7. no third-party payment callback
8. no deployment
9. no A1 runtime/security blocker repair

### A3 Acceptance Commands

Minimum expected verification:

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit
node scripts/ci/check-freeze-boundaries.mjs
node scripts/ci/check-security-regression.mjs
node scripts/ci/check-w5-closeout-gate.mjs
```

If backend tests exist or A3 adds focused tests under approved paths, run them and list exact commands in the report.

### A3 Output Report

A3 must create:

`docs/ops/A3_BACKEND_S2_STORE_PAYMENT_001_REPORT.md`

Report must include:

1. changed files
2. API routes implemented
3. permissions wired
4. DataScope strategy
5. audit events
6. attachment ACL status
7. state machine enforcement
8. verification commands and results
9. frozen items statement
10. residual conditions for A2 review

## 3. A2 Security S2 Review Task Contract Draft

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-001-A2-S2-REVIEW |
| Assigned Agent | A2-Security-Regression-Gate |
| Goal | Read-only security review of A3 Backend S2 implementation. |
| Code changes allowed | No |
| Output report | `docs/ops/A2_BACKEND_S2_SECURITY_REVIEW_STORE_PAYMENT_001_REPORT.md` |

A2 must review:

1. RBAC and `@RequireMenu` coverage.
2. DataScope and store-level record filtering.
3. audit events and redaction.
4. attachment protected access and absence of raw URL exposure.
5. status transition enforcement.
6. sensitive logs and export behavior.
7. no finance/POS/inventory/Chanjet side effects.
8. no migration/schema/entity/table/column changes in S2.

A2 must not modify code. If a security issue is found, output `HOLD` or `PASS WITH CONDITIONS` with exact file/route evidence.

## 4. A4 Frontend S2 Deferred Draft

A4 is not started in Backend S2.

A4 may start only after:

1. A3 Backend S2 report exists.
2. A2 Security S2 Review is PASS or PASS WITH CONDITIONS accepted by user.
3. API path and DTO behavior are stable.
4. protected proof access behavior is available or explicitly deferred with safe UI behavior.

Future page scope:

1. collection account management
2. payment record list
3. payment record create
4. confirm
5. reject
6. void
7. protected screenshot/proof view

## 5. Permission Matrix Landing Recommendation

Use these menu codes in backend guards, but do not create seeds in this task package:

1. `MENU_STORE_PAYMENT_ACCOUNT`
2. `MENU_STORE_PAYMENT`
3. `MENU_STORE_PAYMENT_CONFIRM`
4. `MENU_STORE_PAYMENT_VOID`
5. `MENU_STORE_PAYMENT_EXPORT`

Seed task must be separate and approved after A2 review.

## 6. Role Action Summary

| Role | Allowed S2 backend actions |
| --- | --- |
| Clerk | create PENDING own/pilot-store record; list/detail own records; no confirm/reject/void/account maintenance. |
| Store manager | list/detail own-store records; confirm/reject own-store PENDING records. |
| Finance | list/detail/confirm/reject authorized or all-store records per finance scope. |
| Admin | maintain accounts; view all; high-risk actions audited. |

## 7. Acceptance Standards

1. API typecheck passes.
2. Permission decorators are present on every exposed route.
3. DataScope filters are present and documented.
4. No migration change.
5. No database migration execution.
6. No frontend.
7. No finance/POS/inventory/Chanjet side effects.
8. Audit events are implemented or explicitly listed as unresolved blockers.
9. Attachment proof access does not expose raw URLs as authorization.
10. A2 review is required before A4 or pilot work.

## 8. Explicit Non-Goals

1. Do not execute migration.
2. Do not create or edit migration.
3. Do not implement frontend.
4. Do not require POS binding.
5. Do not perform finance reconciliation.
6. Do not sync to Chanjet/Yonyou/好业财.
7. Do not implement third-party callback.
8. Do not deploy.

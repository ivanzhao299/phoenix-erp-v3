# Agent Contracts: Unified Store Payment Code 001

> Status: proposal-only contracts. No Agent is started by this document.
> Migration allowed: false unless a later Schema Gate explicitly approves.

## Phase Split

| Phase | Purpose | Agents | Auto-code allowed | Human approval required |
| --- | --- | --- | --- | --- |
| Phase A | Read-only solution validation; no development | Candidate: A5 first; A2 possible after approval; A3/A4/A6/A7 proposal-only | false | true |
| Phase B | Implementation after user approval and Schema Gate | A3, A4, A2 review, A6, A7 | false until explicitly changed by approved task contract | true |

## Phase A Routing

| Agent | Phase A status | Reason | Auto-code allowed | Migration allowed | Human approval required |
| --- | --- | --- | --- | --- | --- |
| A5-Data-Readiness | Candidate first Agent, not started | Read-only audit of stores, users, roles, payment accounts, attachment system, order/receipt fields. | false | false | true |
| A2-Security-Regression-Gate | Candidate after A5 or parallel with approval, not started | Read-only review of RBAC, DataScope, audit, attachment access, sensitive fields. | false | false | true |
| A3-Backend-Critical-Path | Proposal-only, not started | Backend implementation requires Schema Gate and user approval. | false | false | true |
| A4-Frontend-UAT-Smoke | Proposal-only, not started | UI implementation waits for data/security/schema decisions. | false | false | true |
| A6-Staging-Deploy-Runbook | Proposal-only, not started | Gray rollout planning waits for pilot store and approved scope. | false | false | true |
| A7-Final-QA-Gate | Proposal-only, not started | Final QA waits for formal implementation outputs. | false | false | true |

## Phase B Routing

Phase B may be created only after:

1. User selects the pilot store.
2. User approves A5 read-only findings.
3. Schema Gate approves or rejects new table/field design.
4. User explicitly approves development scope.

Phase B candidate order:

1. A3 Backend implementation.
2. A4 Frontend implementation.
3. A2 Security review.
4. A6 Staging gray rollout runbook.
5. A7 Final QA / GO-HOLD gate.

## A5-Data-Readiness Phase A Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A5-PHASE-A-READONLY |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A5-Data-Readiness |
| Goal | Read-only validation of pilot-store readiness, user/role scope, collection account/code data sources, attachment system, and optional order/receipt field availability. |
| Inputs | `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md`; `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md`; user-selected pilot store. |
| Allowed files | docs/ops/** for report output only; read-only source/database inspection only if separately approved. |
| Forbidden files | apps/api/**, apps/web/**, migrations, schema/entity/table/column, production data writes, scripts that mutate data. |
| Required checks | Store master readiness; user/role readiness; payment method/currency source; attachment reference feasibility; order/receipt current-field audit; DataScope assumptions. |
| Acceptance criteria | No data writes; no code changes; identifies reusable tables/fields; lists schema gaps; recommends whether Schema Gate is required. |
| Rollback plan | Revert report commit; no runtime or data state changed. |
| Human approval required | true |
| Auto-code allowed | false |
| Migration allowed | false unless later Schema Gate approval |
| Output file | docs/ops/A5_STORE_PAYMENT_PHASE_A_READONLY_REPORT.md |
| PR rule | Report-only; no implementation PR. |

## A2-Security-Regression-Gate Phase A Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A2-PHASE-A-READONLY |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A2-Security-Regression-Gate |
| Goal | Read-only security review for RBAC, DataScope, attachment access, audit events, and sensitive payment/account fields. |
| Inputs | Frozen Spec; A5 report if available; current permission/menu conventions. |
| Allowed files | docs/ops/** for report output only. |
| Forbidden files | apps/api/**, apps/web/**, migrations, schema/entity/table/column, secrets, production config. |
| Required checks | Role matrix; attachment permission model; audit event checklist; sensitive-field/logging checklist; future callback security notes. |
| Acceptance criteria | Confirms no auto-code; identifies required permission codes; verifies attachment permission must follow record; lists audit events. |
| Rollback plan | Revert report commit; no runtime state changed. |
| Human approval required | true |
| Auto-code allowed | false |
| Migration allowed | false unless later Schema Gate approval |
| Output file | docs/ops/A2_STORE_PAYMENT_PHASE_A_SECURITY_REPORT.md |
| PR rule | Report-only; no implementation PR. |

## A3-Backend-Critical-Path Phase B Draft Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A3-PHASE-B-BACKEND |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A3-Backend-Critical-Path |
| Goal | Implement approved MVP-1 backend only after Schema Gate and user development approval. |
| Inputs | Frozen Spec; Schema Gate decision; A5 report; A2 security requirements. |
| Allowed files | To be defined after approval. |
| Forbidden files | Any file not explicitly approved; migrations/schema/entity/table/column unless Schema Gate approves; finance/POS/inventory/Chanjet business logic. |
| Required checks | API typecheck/test plan; lifecycle checks; DataScope checks; no auto finance posting. |
| Acceptance criteria | Creates pending records only; confirm path restricted; query filters implemented; no third-party callback or auto reconciliation. |
| Rollback plan | Revert implementation commit; disable feature/menu; preserve records according to approved rollback plan. |
| Human approval required | true |
| Auto-code allowed | false until a later approved implementation task changes this |
| Migration allowed | false unless later Schema Gate approval |
| Output file | docs/ops/A3_STORE_PAYMENT_PHASE_B_BACKEND_REPORT.md |
| PR rule | Draft PR only after implementation approval. |

## A4-Frontend-UAT-Smoke Phase B Draft Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A4-PHASE-B-FRONTEND |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A4-Frontend-UAT-Smoke |
| Goal | Implement approved MVP-1 frontend and UAT smoke only after backend/schema/security decisions. |
| Inputs | Frozen Spec; approved API contract; role matrix; pilot store. |
| Allowed files | To be defined after approval. |
| Forbidden files | apps/web/** until approved; apps/api/**; migrations; schema/entity/table/column. |
| Required checks | Web typecheck; UAT scenarios for clerk, manager, finance, admin; screenshot upload and query filters. |
| Acceptance criteria | UI does not imply auto callback/auto finance settlement; role-specific visibility validated; single-store pilot path visible. |
| Rollback plan | Revert UI commit; hide menu/feature switch. |
| Human approval required | true |
| Auto-code allowed | false until a later approved implementation task changes this |
| Migration allowed | false unless later Schema Gate approval |
| Output file | docs/ops/A4_STORE_PAYMENT_PHASE_B_FRONTEND_REPORT.md |
| PR rule | Draft PR only after implementation approval. |

## A6-Staging-Deploy-Runbook Phase B Draft Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A6-PHASE-B-STAGING |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A6-Staging-Deploy-Runbook |
| Goal | Prepare staging and single-store gray rollout plan after implementation scope is approved. |
| Inputs | Frozen Spec; pilot store; implementation reports; rollback plan. |
| Allowed files | docs/ops/** runbooks unless deployment execution is separately approved. |
| Forbidden files | Production deployment, production config writes, apps/api/**, apps/web/**, migrations. |
| Required checks | Gray rollout checklist; feature disable path; health checks; fallback process. |
| Acceptance criteria | No production deploy; rollback owner and validation steps defined; old manual process preserved. |
| Rollback plan | Revert runbook commit; no environment state changed. |
| Human approval required | true |
| Auto-code allowed | false |
| Migration allowed | false unless later Schema Gate approval |
| Output file | docs/ops/A6_STORE_PAYMENT_PHASE_B_STAGING_REPORT.md |
| PR rule | Report-only unless user approves deployment PR. |

## A7-Final-QA-Gate Phase B Draft Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A7-PHASE-B-QA |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A7-Final-QA-Gate |
| Goal | Final GO / GO WITH CONDITIONS / HOLD / ROLLBACK assessment after A2/A3/A4/A5/A6 evidence exists. |
| Inputs | Frozen Spec; Schema Gate decision; A2-A6 reports; CI/UAT evidence. |
| Allowed files | docs/ops/** final QA report only unless separately approved. |
| Forbidden files | apps/api/**, apps/web/**, migrations, production deploy, business logic. |
| Required checks | Cross-agent evidence matrix; security/data/UI/backend/deploy gates; open blocker review. |
| Acceptance criteria | GO cannot be issued without approved pilot store, Schema Gate outcome, verification evidence, rollback plan, and user release decision. |
| Rollback plan | Revert QA report commit; no runtime state changed. |
| Human approval required | true |
| Auto-code allowed | false |
| Migration allowed | false unless later Schema Gate approval |
| Output file | docs/ops/A7_STORE_PAYMENT_PHASE_B_QA_REPORT.md |
| PR rule | Report-only; no merge/deploy authority. |

# Agent Contracts: Unified Store Payment Code 001

> Status: proposal-only. No Agent is started by this document.

## Routing Summary

| Agent | Triggered | Reason | Status | Auto-code allowed | Human approval required |
| --- | --- | --- | --- | --- | --- |
| A2-Security-Regression-Gate | Yes | Permissions, DataScope, audit, attachment sensitivity, future payment token/callback security. | proposal-only | No | Yes |
| A3-Backend-Critical-Path | Yes | Payment record lifecycle, query APIs, future POS/finance/inventory linkage. | proposal-only | No | Yes |
| A4-Frontend-UAT-Smoke | Yes | Store clerk entry flow, manager/finance query flow, screenshot upload UX. | proposal-only | No | Yes |
| A5-Data-Readiness | Yes | Store/account/currency/payment method master data and gray data readiness. | proposal-only | No | Yes |
| A6-Staging-Deploy-Runbook | Yes | Single-store gray rollout, rollback, environment readiness. | proposal-only | No | Yes |
| A7-Final-QA-Gate | Yes | Final GO/HOLD criteria across finance, security, data, UI, backend, deploy. | proposal-only | No | Yes |

## A2-Security-Regression-Gate Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A2-SECURITY |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A2-Security-Regression-Gate |
| Goal | Define permission, DataScope, audit, attachment, and future payment callback security requirements. |
| Inputs | `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md`; user P0 answers. |
| Allowed files | Proposal stage: docs/ops/** only. Future implementation scope requires approval. |
| Forbidden files | apps/api/**, apps/web/**, migrations, schema/entity/table/column, production config, secrets. |
| Required checks | Permission matrix review; audit event checklist; sensitive data/logging checklist; future callback threat checklist. |
| Acceptance criteria | No cross-store leakage; no secret logging; role boundaries documented; callback/token risks listed before implementation. |
| Rollback plan | Revert docs/contract commit; no runtime state changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A2_STORE_PAYMENT_SECURITY_CONTRACT_REPORT.md |
| PR rule | Report-only/draft PR until user approves implementation. |

## A3-Backend-Critical-Path Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A3-BACKEND |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A3-Backend-Critical-Path |
| Goal | Draft backend design for MVP-1 payment record lifecycle and future POS/finance/inventory boundaries. |
| Inputs | Requirement spec; P0 decisions; A5 data readiness; A2 security requirements. |
| Allowed files | Proposal stage: docs/ops/** only. Future code scope requires approval. |
| Forbidden files | apps/api/**, apps/web/**, migrations, schema/entity/table/column, finance/POS/inventory business logic. |
| Required checks | Read-only surface audit plan; lifecycle state model; API boundary proposal; idempotency notes for future callbacks. |
| Acceptance criteria | MVP-1 does not auto-settle finance; lifecycle states are explicit; migration need is flagged before implementation. |
| Rollback plan | Revert docs/contract commit; no runtime state changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A3_STORE_PAYMENT_BACKEND_CONTRACT_REPORT.md |
| PR rule | Report-only/draft PR until user approves implementation. |

## A4-Frontend-UAT-Smoke Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A4-UAT |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A4-Frontend-UAT-Smoke |
| Goal | Draft UAT scenarios for store payment entry, screenshot upload, and management query. |
| Inputs | Requirement spec; target pilot store; role matrix; future page paths. |
| Allowed files | Proposal stage: docs/ops/** only. Future UI scope requires approval. |
| Forbidden files | apps/web/**, apps/api/**, migrations, schema/entity/table/column. |
| Required checks | UAT scenario matrix; filter coverage; attachment UX checklist; role-specific screenshot plan. |
| Acceptance criteria | Covers store/date/receiver/currency/payment method filters; prevents implied auto reconciliation in MVP-1. |
| Rollback plan | Revert docs/contract commit; no UI changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A4_STORE_PAYMENT_UAT_CONTRACT_REPORT.md |
| PR rule | Report-only/draft PR until user approves implementation. |

## A5-Data-Readiness Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A5-DATA |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A5-Data-Readiness |
| Goal | Read-only readiness audit for store, account, currency, payment method, receiver, and DataScope data. |
| Inputs | Requirement spec; selected pilot store; current master data sources. |
| Allowed files | Proposal stage: docs/ops/** only. Future read-only scripts require approval. |
| Forbidden files | apps/api/**, apps/web/**, migrations, schema/entity/table/column, production data writes. |
| Required checks | Master data source list; data gap list; DataScope assumptions; migration need assessment. |
| Acceptance criteria | No data writes; pilot data needs identified; schema gaps separated from business rules. |
| Rollback plan | Revert docs/contract commit; no data changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A5_STORE_PAYMENT_DATA_CONTRACT_REPORT.md |
| PR rule | Report-only/draft PR until user approves implementation. |

## A6-Staging-Deploy-Runbook Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A6-DEPLOY |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A6-Staging-Deploy-Runbook |
| Goal | Draft gray rollout and rollback plan for one-store MVP-1 pilot. |
| Inputs | Requirement spec; chosen pilot store; environment matrix; A7 gate expectations. |
| Allowed files | Proposal stage: docs/ops/** only. |
| Forbidden files | Deployment execution, production config writes, apps/api/**, apps/web/**, migrations. |
| Required checks | Gray rollout checklist; feature disable path; fallback manual process; health/monitoring plan. |
| Acceptance criteria | No production deployment; rollback owner and validation steps defined; manual fallback preserved. |
| Rollback plan | Revert docs/contract commit; no environment changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A6_STORE_PAYMENT_DEPLOY_CONTRACT_REPORT.md |
| PR rule | Report-only/draft PR until user approves implementation. |

## A7-Final-QA-Gate Contract

| Field | Value |
| --- | --- |
| Task ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001-A7-QA |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A7-Final-QA-Gate |
| Goal | Define final acceptance matrix and GO / GO WITH CONDITIONS / HOLD / ROLLBACK criteria. |
| Inputs | Requirement spec; A2-A6 future reports; user P0/P1 answers. |
| Allowed files | Proposal stage: docs/ops/** only. |
| Forbidden files | apps/api/**, apps/web/**, migrations, production deploy, business logic. |
| Required checks | Cross-agent evidence matrix; release blocker list; finance/security/data/UI/deploy gate definitions. |
| Acceptance criteria | GO cannot be issued without approved scope, security/data evidence, gray plan, rollback plan, and verification results. |
| Rollback plan | Revert docs/contract commit; no runtime state changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A7_STORE_PAYMENT_QA_CONTRACT_REPORT.md |
| PR rule | Report-only/draft PR until user approves implementation. |

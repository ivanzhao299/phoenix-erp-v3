# Store Payment Pilot Gate S1 Precheck Decision

Task ID: `STORE_PAYMENT_PILOT_GATE_S1_PRECHECK_APPROVAL_MATRIX`

Date: 2026-06-23

Decision: `READY_FOR_SINGLE_GATE_APPROVAL`

## Summary

The S1 Gate package is mature enough to ask the user for one real execution approval at a time. This round did not execute migration, write DB, register menus, grant roles, modify business code, deploy, push, seed, reset, or cleanup.

## Items That Can Enter Execution Application

| Item | Decision | Why |
| --- | --- | --- |
| Store Payment migration | `APPROVE_WITH_CONDITIONS` | It is the first prerequisite because target DB lacks `store_payment_accounts` and `store_payment_records`; A1 static migration checks passed, but execution still requires explicit user approval, target environment, backup, and rollback owner. |
| `STORE-VTE-001` canonical store_code policy | `APPROVE_WITH_CONDITIONS` | DB evidence supports `STORE-VTE-001 / 万象直营店 / COMP-LAO-AGRI`; this can be approved as policy before any DB data change. |

## Items That Must HOLD

| Item | HOLD reason |
| --- | --- |
| MENU_STORE_PAYMENT* registration | Depends on permission-bit alignment and should follow or be explicitly sequenced after migration approval. |
| Role grants | Depends on menu rows and permission-bit alignment. |
| `ST-VTE-001` alias / normalization | Requires explicit policy choice and later A5/A2 evidence; may require DB write in a separate gate. |
| Protected attachment backend Gate | Depends on Store Payment tables, DataScope, RBAC, and A2 ACL contract. |
| A4 frontend page Gate | Depends on backend/menu/role/DataScope/attachment readiness. |

## Items To Split Into Separate Gates

1. Migration execution.
2. Menu registration.
3. Role authorization grants.
4. Store-code canonical/alias/data normalization.
5. Pilot Store Payment account data readiness.
6. Protected attachment backend implementation.
7. A4 frontend page implementation.

## Recommended First Real Execution Gate

Recommended first real execution Gate: `Store Payment migration execution gate`.

Reason: Store Payment tables are absent. Menu/role/data/account/attachment validation cannot be fully proven until the base tables exist.

## Sequencing Decisions

| Question | Recommendation |
| --- | --- |
| Should migration be first? | Yes, after explicit user approval and immediate A1/A2 precheck. |
| Should menu codes be first? | No. Menu can be prepared, but registration should follow the migration approval path and permission-bit alignment. |
| Should role grants be first? | No. Role grants require menu rows and a resolved runtime permission-bit contract. |
| Should store_code alias be first? | No for DB changes; yes for policy approval of canonical `STORE-VTE-001`. Alias/normalization that writes data must be a separate Gate. |
| Is protected attachment A3 Gate allowed now? | No. Keep as HOLD until migration/menu/DataScope prerequisites are cleared or a frozen stub contract is approved. |
| Is A4 Frontend Gate allowed now? | No. It depends on backend API/menu visibility/DataScope/attachment readiness. |

## Current A3 / A4 Status

| Gate | Status |
| --- | --- |
| A3 Backend Gate | Blocked |
| A4 Frontend Gate | Blocked |

## Current Safety Result

| Boundary | Result |
| --- | --- |
| Migration executed | No |
| DB written | No |
| Business code changed | No |
| Deployment executed | No |
| Push executed | No |
| Seed/reset/cleanup executed | No |

## A2 / A1 Precheck

| Precheck | Output | Result | Summary |
| --- | --- | --- | --- |
| A2 read-only security precheck | `docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md` | `PASS WITH CONDITIONS` | The approval matrix is acceptable as a precheck artifact. Migration may enter only one separate execution request after explicit approval. Menu registration, role grants, alias/normalization, protected attachment backend work, A4 frontend work, deployment, and push remain out of scope. A2 requires permission-bit alignment, Store Payment DataScope proof, protected attachment ACL review, and no broad fallback grants. |
| A1 static gate precheck | `docs/ops/A1_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md` | `PASS WITH CONDITIONS` | Required source docs exist. Migration `down()`, migration no-data-DML, nullable unique, W5 closeout, and freeze boundary gates passed. Store Payment migration hash remains `703c39d6f819e1d8f2db807092f6ee58f02d75e1cf4258cc46fda572b4a5076d`. |

## Final Precheck Decision

Decision: `READY_FOR_SINGLE_GATE_APPROVAL`

The S1 approval matrix is complete enough to ask the user for the first real execution Gate, but only as a single-action request.

Recommended first real execution Gate:

`S1-APP-001 Store Payment migration execution gate`

The first execution request must include:

1. Target environment.
2. Exact migration file and hash.
3. Backup and restore owner.
4. Execution window.
5. Rollback owner and rollback command boundary.
6. Immediate A1/A2 precheck commands.
7. Post-execution A5 read-only catalog evidence.
8. No bundled menu registration, role grants, store-code normalization, protected attachment implementation, A4 frontend implementation, deployment, or push.

A3 Backend Gate remains blocked.

A4 Frontend Gate remains blocked.

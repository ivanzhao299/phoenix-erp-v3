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

Status: queued for automatic A2 read-only security precheck and A1 static validation.

Final decision remains `READY_FOR_SINGLE_GATE_APPROVAL` unless A2/A1 downgrade it.


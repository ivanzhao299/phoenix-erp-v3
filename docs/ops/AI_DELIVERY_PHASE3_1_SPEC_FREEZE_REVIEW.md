# AI Delivery Phase 3.1 Spec Freeze Review

## Stage Goal

Freeze the MVP-1 requirement wording for `REQ-STORE-PAYMENT-UNIFIED-CODE-001` after user P0 decisions, while keeping implementation, Agent launch, and schema changes blocked.

## User Decision Summary

1. New tables/fields may be designed, but migration/schema/entity/table/column changes require a separate Schema Gate and user approval.
2. MVP-1 is single-store gray only; pilot store remains pending final user selection.
3. Finance/admin maintains collection accounts/codes; clerks only select enabled company accounts/codes.
4. Clerk-created records are `PENDING_CONFIRM`; store manager or finance confirms to `CONFIRMED`.
5. Order or sales receipt reference is optional in MVP-1.
6. RBAC and DataScope must constrain all actions.
7. Payment screenshot is required and follows payment record permission.
8. MVP-1 excludes third-party callback, bank auto-arrival, auto reconciliation, inventory linkage, Chanjet sync, all-store rollout, POS mandatory binding, and production deployment.

## Updated Files

| File | Change |
| --- | --- |
| `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md` | Upgraded to Spec Frozen Draft / pending Schema Gate. |
| `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_AGENT_CONTRACTS.md` | Split contracts into Phase A read-only validation and Phase B approved implementation. |
| `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md` | Added pre-Schema Gate checklist and design-only entity candidates. |
| `docs/ops/AGENT_TASK_BOARD.md` | Added spec freeze board entry. |
| `docs/ops/AI_DELIVERY_PHASE3_1_SPEC_FREEZE_REVIEW.md` | This review report. |

## MVP-1 Scope

MVP-1 is `直营店统一公司收款码人工收款记录管理`.

It includes company collection account/code maintenance by finance/admin, clerk manual payment record entry, required payment screenshot upload, optional order/sales receipt reference, pending/confirmed status flow, manager/finance confirmation, query filters, RBAC/DataScope, and audit logging.

## Explicit Non-Goals

1. No third-party payment callback.
2. No bank automatic arrival confirmation.
3. No automatic reconciliation.
4. No inventory linkage.
5. No Yonyou/Chanjet/好业财 sync.
6. No all-store forced switch.
7. No mandatory POS binding.
8. No production deployment.
9. No migration/schema/entity/table/column implementation before Schema Gate.
10. No A1 blocker fix.

## Risk Level Change

| Scope | Risk |
| --- | --- |
| Overall request | L5 |
| MVP-1 after exclusions | L4 schema-gated implementation preparation, only after user approval |
| Current documentation task | L1 docs-only |

## Approval Status

| Item | Status |
| --- | --- |
| Start A5 read-only audit | Not approved yet |
| Pilot store | Pending user selection |
| Enter Schema Gate | Not approved yet |
| Implement migration/schema | Not approved |
| Start A2-A7 | Not approved |

## Agent Status

No Agent was started in this phase.

## Next Recommendation

Ask the user to:

1. Select the pilot store.
2. Approve starting A5-Data-Readiness read-only audit.
3. Decide whether Schema Gate should begin after A5 reports current table/field reuse options.

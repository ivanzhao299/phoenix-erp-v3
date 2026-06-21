# Implementation Plan: Unified Store Payment Code 001

> Plan only. No code, migration, schema/entity/table/column change, database write, deployment, or Agent launch is approved by this document.

## Implementation Goal

Prepare a controlled implementation route for MVP-1: `直营店统一公司收款码人工收款记录管理`.

User-approved planning assumptions:

1. Pilot store: 万象直营店, canonical `store_code` temporarily `STORE-VTE-001`, final value must be confirmed by DB read-only check.
2. Add `store_payment_accounts` and `store_payment_records` if later schema implementation is approved.
3. Do not add `store_payment_audit`; prefer `sys_operation_logs` / `mst_audit_trail`.
4. Payment screenshots must use protected access; bare `/uploads` URL is not enough.
5. Menus are split as `MENU_STORE_PAYMENT_ACCOUNT`, `MENU_STORE_PAYMENT`, `MENU_STORE_PAYMENT_CONFIRM`, `MENU_STORE_PAYMENT_VOID`, `MENU_STORE_PAYMENT_EXPORT`.
6. Statuses: `PENDING`, `CONFIRMED`, `REJECTED`, `VOIDED`.
7. Reuse existing payment method dictionary first; propose `STORE_PAYMENT_METHOD` only if existing dictionaries are insufficient.
8. Reference `fin_cash_accounts` only; no strong finance coupling and no automatic reconciliation.

## Non-Implementation Items

1. No migration in this planning stage.
2. No schema/entity/table/column change.
3. No `apps/api/**` or `apps/web/**` change.
4. No menu seed, permission seed, or business seed.
5. No database write.
6. No third-party callback, bank auto-arrival, auto reconciliation, inventory linkage, POS mandatory binding, Chanjet sync, or production deployment.

## Phased Route

| Phase | Goal | Inputs | Outputs | Owner Agent | Code allowed | User approval |
| --- | --- | --- | --- | --- | --- | --- |
| S0 | Schema implementation pre-confirmation | Schema Gate proposal, A5/A2 reports, user decisions | Final approval checklist and DB read-only confirmation scope | Codex-Orchestrator / A5 if approved | No | Yes |
| S1 | Migration draft stage | Approved S0, migration draft, schema checklist | TypeORM TS migration plan and rollback plan, no file until approved | A3 candidate later | No until explicit migration task | Yes |
| S2 | Entity / DTO / service / controller | Approved migration and DB columns | Backend implementation plan and later code task | A3 | No in this plan | Yes |
| S3 | RBAC / DataScope / audit | Permission matrix, A2 report | Menu/permission seed plan, store-scope helper plan, audit/log masking plan | A2 + A3 | No in this plan | Yes |
| S4 | Frontend pages | Approved API and permissions | UI implementation plan for account, list, form, detail, protected attachment view | A4 | No in this plan | Yes |
| S5 | Staging smoke | Backend/UI outputs, test plan | Staging smoke script and evidence plan | A6 + A1 later | No in this plan | Yes |
| S6 | Single-store pilot | Pilot store, users, data, staging evidence | Pilot runbook and GO/HOLD decision package | A6 + A7 | No in this plan | Yes |

## Phase S0: Schema Implementation Pre-Confirmation

Inputs:

1. `REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_PROPOSAL.md`
2. `REQ_STORE_PAYMENT_UNIFIED_CODE_001_DATA_MODEL_DRAFT.md`
3. A5/A2 reports.
4. User pilot-store decision.

Outputs:

1. DB read-only confirmation checklist for `STORE-VTE-001`.
2. Final schema object approval.
3. Final attachment ACL decision.
4. Final payment-method dictionary decision.

Owner Agent: Codex-Orchestrator, with A5 only if user approves read-only DB confirmation.

Code allowed: No.

Requires user approval: Yes.

Blockers:

1. Pilot store not confirmed in DB.
2. Store company mapping unclear.
3. Canonical `store_code` unresolved.
4. Protected attachment access design not approved.

## Phase S1: Migration Draft Stage

Inputs:

1. Approved S0 checklist.
2. Migration draft document.
3. g197/g198 rules.

Outputs:

1. Final migration scope.
2. Final rollback plan.
3. Nullable/unique/check strategy.
4. Seed strategy decision.

Owner Agent: A3 only after explicit task approval.

Code allowed: No in this document; later only if user approves migration implementation.

Requires user approval: Yes.

Blockers:

1. Any attempt to create migration without approval.
2. Any destructive schema change.
3. Any business data seed inside migration without policy approval.

## Phase S2: Entity / DTO / Service / Controller Stage

Inputs:

1. Executed/approved schema or approved generated migration file.
2. API draft.
3. A2 permission rules.

Outputs:

1. Entity aligned to real DB columns.
2. DTOs for account and record workflows.
3. Services enforcing state machine and DataScope.
4. Controllers with `@RequireMenu`.

Owner Agent: A3.

Code allowed: Only after separate user approval.

Requires user approval: Yes.

Blockers:

1. Entity fields not backed by DB columns.
2. Service relying only on company scope for clerk/manager access.
3. Confirm/reject/void without audit.

## Phase S3: RBAC / DataScope / Audit Stage

Inputs:

1. Permission matrix.
2. A2 security report.
3. Approved menu split.

Outputs:

1. Menu/permission seed plan.
2. Store-level scope derivation plan.
3. Audit event mapping.
4. Redaction rules.

Owner Agent: A2 + A3.

Code allowed: Only after separate approval.

Requires user approval: Yes.

Blockers:

1. Menu codes not approved.
2. Store-level scope rule not approved.
3. Attachment URL leakage risk unresolved.

## Phase S4: Frontend Page Stage

Inputs:

1. Approved API draft.
2. Permission matrix.
3. Frontend draft.

Outputs:

1. Account/code maintenance UI.
2. Payment record list/form/detail.
3. Confirm/reject/void UI with reason fields.
4. Protected proof preview flow.

Owner Agent: A4.

Code allowed: Only after separate approval.

Requires user approval: Yes.

Blockers:

1. API contract unstable.
2. Attachment ACL endpoint unavailable.
3. Role-specific UI not testable.

## Phase S5: Staging Smoke Stage

Inputs:

1. Backend/frontend implementation.
2. Test plan.
3. Pilot data.

Outputs:

1. Staging smoke evidence.
2. Permission/DataScope screenshots or logs.
3. Attachment ACL evidence.
4. Audit log evidence.

Owner Agent: A6, with A1/A7 later if approved.

Code allowed: No, smoke only after implementation.

Requires user approval: Yes.

Blockers:

1. CI/runtime failure.
2. Missing pilot data.
3. Missing rollback route.

## Phase S6: Single-Store Pilot Stage

Inputs:

1. Staging pass.
2. Pilot store and users.
3. Rollback plan.

Outputs:

1. Single-store pilot runbook.
2. GO / GO WITH CONDITIONS / HOLD decision.
3. Daily reconciliation checklist.

Owner Agent: A6 + A7.

Code allowed: No during pilot execution unless separate fix task is approved.

Requires user approval: Yes.

Blockers:

1. User has not approved pilot.
2. Manual fallback unavailable.
3. Finance cannot validate confirmed records.

## Rollback Plan

1. Disable menu/feature for pilot store.
2. Stop new payment record creation.
3. Preserve existing records and proofs as read-only audit evidence.
4. Continue manual collection verification.
5. Finance verifies no duplicate or missing receipt evidence.
6. Revert code/migration only through separately approved rollback task.

## Global Block Conditions

1. Any request to create migration before explicit approval.
2. Any attempt to use `fin_ar_receipts` as MVP-1 operational record.
3. Any bare screenshot URL exposure accepted without user/security approval.
4. Any implementation that cannot enforce store-level scope.
5. Any automatic finance posting, POS completion, inventory linkage, or Chanjet sync in MVP-1.

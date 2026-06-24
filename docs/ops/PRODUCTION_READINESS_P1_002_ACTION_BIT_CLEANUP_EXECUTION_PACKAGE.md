# Production Readiness P1-002 - Store Payment Action-Bit Cleanup Execution Package

Date: 2026-06-24

Task ID: `PRD-P1-002`

Conclusion: `READY_FOR_APPROVAL / EXECUTION HOLD`

## Purpose

Prepare the narrow production DB update package that removes temporary Store Payment-only `C/A` action-bit compatibility grants after the running Store Payment backend has moved to the target `V/E/X` policy.

This package does not execute the cleanup.

## Evidence Directory

`docs/ops/runs/production-readiness-p1-002-action-bit-cleanup-package-20260624-172654`

Files:

- `context.txt`
- `candidate_store_payment_action_bit_cleanup.sql`
- `rollback_store_payment_action_bit_cleanup_template.sql`

## Current Runtime Alignment

Current local backend source uses:

| Operation | Menu | Required bit |
| --- | --- | --- |
| Account list | `MENU_STORE_PAYMENT_ACCOUNT` | `V` |
| Account create/update | `MENU_STORE_PAYMENT_ACCOUNT` | `E` |
| Record list/detail | `MENU_STORE_PAYMENT` | `V` |
| Record create | `MENU_STORE_PAYMENT` | `E` |
| Confirm / reject | `MENU_STORE_PAYMENT_CONFIRM` | `E` |
| Void | `MENU_STORE_PAYMENT_VOID` | `E` |
| Export | `MENU_STORE_PAYMENT_EXPORT` | `X` reserved |

Earlier production-side permission repair inserted `C/A` compatibility grants because the remote runtime previously used legacy bits. After the Store Payment backend deploy alignment, those compatibility bits should be removed from Store Payment menus only.

## Candidate SQL

`docs/ops/runs/production-readiness-p1-002-action-bit-cleanup-package-20260624-172654/candidate_store_payment_action_bit_cleanup.sql`

Safety properties:

1. touches only `sys_role_menu_permission`;
2. restricts menus to:
   - `MENU_STORE_PAYMENT`
   - `MENU_STORE_PAYMENT_CONFIRM`
   - `MENU_STORE_PAYMENT_VOID`
3. excludes `MENU_STORE_PAYMENT_ACCOUNT`;
4. excludes `MENU_STORE_PAYMENT_EXPORT`;
5. does not remove `V` or `E`;
6. does not touch wildcard `*` rows;
7. emits affected rows before update;
8. emits rollback statements before update commit.

## Rollback

`docs/ops/runs/production-readiness-p1-002-action-bit-cleanup-package-20260624-172654/rollback_store_payment_action_bit_cleanup_template.sql`

Rollback must use the exact statements emitted by the execution run, because the old `perm_codes` values are runtime data. Do not guess or regenerate rollback from stale docs.

## Required Approval

Before execution, the user must approve:

`APPROVE_ACTION_BIT_LEGACY_CLEANUP_EXECUTION_GATE`

Approved scope must explicitly allow:

1. production DB update to `sys_role_menu_permission`;
2. only Store Payment `C/A` removal;
3. no menu row creation;
4. no role creation;
5. no DataScope rewrite;
6. no migration;
7. no deployment;
8. rollback statements saved before commit.

## Required Precheck Immediately Before Execution

1. Confirm running API uses `MENU_STORE_PAYMENT:E`, `MENU_STORE_PAYMENT_CONFIRM:E`, and `MENU_STORE_PAYMENT_VOID:E`.
2. Snapshot affected Store Payment permission rows.
3. Confirm `MENU_STORE_PAYMENT_EXPORT:X` is untouched.
4. Confirm no wildcard `*` Store Payment rows require manual review.
5. Confirm A2 accepts removal of compatibility bits.
6. Confirm A1 W5 gate is PASS.

## A2 Security Review

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. Cleanup reduces permission vocabulary drift.
2. Candidate SQL is Store Payment scoped.
3. Export permission remains separate as `X`.

Conditions:

1. Execution before runtime alignment would create denial of service for Store Payment write actions.
2. Rollback statements must be saved from the execution output.

## A1 Validation

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. Package is docs/runs only.
2. No DB write was executed.
3. Candidate SQL and rollback template are explicit and scoped.

Condition:

1. W5 closeout must pass before this package is committed.

## Final Result

`PRD-P1-002` is `READY_FOR_APPROVAL / EXECUTION HOLD`.

The next user decision is whether to approve `APPROVE_ACTION_BIT_LEGACY_CLEANUP_EXECUTION_GATE`.

# Production Readiness P1-002 - Store Payment Action-Bit Cleanup Plan

Date: 2026-06-24

## Scope

This plan advances `PRD-P1-002 Store Payment action-bit legacy cleanup`.

No DB write, deploy, migration, restart, cleanup, reset, or push was executed by this plan.

## Current Evidence

Source reports:

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_ACTION_BIT_COMPATIBILITY_PLAN.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_REPORT.md`

Execution evidence shows the production-side Store Payment permission repair inserted temporary Store Payment-only compatibility grants:

- `V,E,C` for record create compatibility.
- `V,E,A` for confirm / reject / void compatibility.
- `X` remains export-only.

## Local Runtime Alignment

The current local Store Payment source is already aligned to the target `V/E/X` policy:

| Operation | File | Menu | Bit |
| --- | --- | --- | --- |
| Account list | `apps/api/src/modules/store-payment/store-payment.controller.ts` | `MENU_STORE_PAYMENT_ACCOUNT` | `V` |
| Account create/update | same | `MENU_STORE_PAYMENT_ACCOUNT` | `E` |
| Record list/detail | same | `MENU_STORE_PAYMENT` | `V` |
| Record create | same | `MENU_STORE_PAYMENT` | `E` |
| Confirm/reject | same | `MENU_STORE_PAYMENT_CONFIRM` | `E` |
| Void | same | `MENU_STORE_PAYMENT_VOID` | `E` |
| Export | frontend reserved only | `MENU_STORE_PAYMENT_EXPORT` | `X` |

The frontend Store Payment page also checks `canEdit` for create/confirm/reject/void and `canExport` only for export.

## Cleanup Decision

Recommended cleanup is a later DB write Gate that removes only Store Payment-specific legacy bits `C` and `A` after the deployed runtime is confirmed to use `E`.

Do not remove `C/A` before runtime deploy verification. If the running remote API still expects `C/A`, removing them would break Store Payment write actions.

## Candidate SQL Shape

This plan intentionally does not execute SQL. A later execution Gate should generate final SQL from a fresh read-only snapshot.

Candidate transformation:

```sql
-- Example only. Regenerate from fresh snapshot before execution.
UPDATE sys_role_menu_permission rp
SET perm_codes = trim(both ',' from regexp_replace(regexp_replace(',' || perm_codes || ',', ',(C|A),', ',', 'g'), ',+', ',', 'g'))
FROM sys_menu m
WHERE m.menu_id = rp.menu_id
  AND m.menu_code IN (
    'MENU_STORE_PAYMENT',
    'MENU_STORE_PAYMENT_CONFIRM',
    'MENU_STORE_PAYMENT_VOID'
  )
  AND (',' || rp.perm_codes || ',') ~ ',(C|A),';
```

Required safety additions in the execution Gate:

1. Snapshot `sys_role_menu_permission` before update.
2. Restrict to `MENU_STORE_PAYMENT*` menus only.
3. Do not touch `MENU_STORE_PAYMENT_EXPORT:X`.
4. Do not remove `V` or `E`.
5. Generate rollback SQL from the before snapshot.
6. Verify Store Payment create/confirm/reject/void still works under `E`.

## A2 Security Review

PASS WITH CONDITIONS.

Cleanup reduces policy drift, but only after runtime confirmation. Premature cleanup can create denial of service for approved Store Payment roles.

## A1 Validation

PASS WITH CONDITIONS.

This plan is docs-only. The earlier local W5 gate passed. A later execution Gate must rerun W5 and include fresh read-only role-permission evidence.

## Next Gate

`APPROVE_ACTION_BIT_LEGACY_CLEANUP_EXECUTION_GATE`

Preconditions:

1. Runtime deploy contains Store Payment controller checks using `E`.
2. Fresh read-only role permission snapshot succeeds.
3. User approves the narrow DB write.
4. Rollback SQL is generated before execution.

## Conclusion

READY_FOR_EXECUTION_GATE_APPROVAL.

The local code is already target-aligned. Remaining work is a narrow production-side permission cleanup Gate after runtime verification.

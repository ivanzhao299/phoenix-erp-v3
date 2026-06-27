# Production Readiness P1-002 - Store Payment Action-Bit Cleanup Execution Report

Date: 2026-06-25

Task ID: `PRD-P1-002`

Approval: production remediation authorization from the user on 2026-06-25.

## Scope

Executed:

1. Remove temporary Store Payment-only `C/A` compatibility bits from `sys_role_menu_permission`.
2. Restrict update to:
   - `MENU_STORE_PAYMENT`
   - `MENU_STORE_PAYMENT_CONFIRM`
   - `MENU_STORE_PAYMENT_VOID`

Not executed:

1. Menu row creation/update.
2. Role creation/update.
3. DataScope rewrite.
4. Store Payment account/record data change.
5. Migration.
6. Seed.
7. Deploy.
8. Restart.
9. Cleanup/reset.

## Evidence Directory

`docs/ops/runs/production-readiness-p1-002-action-bit-cleanup-execution-20260625-091352`

Key evidence:

- `runtime_action_bit_alignment.txt`
- `before_permission_snapshot.txt`
- `execution_result.txt`
- `post_cleanup_verification.txt`
- `candidate_store_payment_action_bit_cleanup.sql`
- `rollback_store_payment_action_bit_cleanup_template.sql`

## Runtime Alignment Precheck

Result: `PASS`

Remote running API controller requires target bits:

| Operation area | Menu | Required bit |
| --- | --- | --- |
| Account list | `MENU_STORE_PAYMENT_ACCOUNT` | `V` |
| Account create/update | `MENU_STORE_PAYMENT_ACCOUNT` | `E` |
| Record list/detail | `MENU_STORE_PAYMENT` | `V` |
| Record create | `MENU_STORE_PAYMENT` | `E` |
| Confirm/reject | `MENU_STORE_PAYMENT_CONFIRM` | `E` |
| Void | `MENU_STORE_PAYMENT_VOID` | `E` |

## Before Snapshot

Result: `PASS`

The precheck found six Store Payment permission rows with temporary `C/A` compatibility bits:

| role | menu | old | new |
| --- | --- | --- | --- |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT` | `V,E,C` | `V,E` |
| `ROLE_CASHIER` | `MENU_STORE_PAYMENT` | `V,E,C` | `V,E` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_CONFIRM` | `V,E,A` | `V,E` |
| `ROLE_FIN_ACCT` | `MENU_STORE_PAYMENT_CONFIRM` | `V,E,A` | `V,E` |
| `ROLE_STORE_MGR` | `MENU_STORE_PAYMENT_CONFIRM` | `V,E,A` | `V,E` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_VOID` | `V,E,A` | `V,E` |

## Execution Result

Result: `PASS`

```text
UPDATE 6
COMMIT
```

Rollback statements were emitted by the execution output before commit and are preserved in `execution_result.txt`.

## Post-Execution Verification

Result: `PASS`

| Check | Result |
| --- | --- |
| Store Payment `C/A` legacy rows | `0` |
| `MENU_STORE_PAYMENT_EXPORT` non-`X` rows | `0` |
| Store Payment account rows | `3` |
| Store Payment record rows | `0` |

Final permission snapshot:

| role | menu | perm_codes |
| --- | --- | --- |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT` | `V,E` |
| `ROLE_CASHIER` | `MENU_STORE_PAYMENT` | `V,E` |
| `ROLE_FIN_ACCT` | `MENU_STORE_PAYMENT` | `V` |
| `ROLE_STORE_MGR` | `MENU_STORE_PAYMENT` | `V` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_ACCOUNT` | `V,E` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_CONFIRM` | `V,E` |
| `ROLE_FIN_ACCT` | `MENU_STORE_PAYMENT_CONFIRM` | `V,E` |
| `ROLE_STORE_MGR` | `MENU_STORE_PAYMENT_CONFIRM` | `V,E` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_EXPORT` | `X` |
| `ROLE_FIN_ACCT` | `MENU_STORE_PAYMENT_EXPORT` | `X` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_VOID` | `V,E` |

## A2 Security Review

Conclusion: `PASS`.

The cleanup reduces permission vocabulary drift and leaves the target `V/E/X` model intact. Export remains `X` only.

## A1 Validation

Conclusion: `PASS_WITH_CONDITIONS`.

The DB update evidence and rollback output are present. W5 closeout is required before commit.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Production DB update | YES, only approved Store Payment permission bits |
| Menu rows changed | No |
| Role rows changed | No |
| DataScope changed | No |
| Store Payment account rows changed | No |
| Store Payment payment records changed | No |
| Migration executed | No |
| Seed executed | No |
| Deploy executed | No |
| Restart executed | No |
| Business code changed | No |

## Current Conclusion

`GO`

`PRD-P1-002` is complete. The Store Payment action-bit model is now aligned to `V/E/X` without the temporary `C/A` compatibility bits.

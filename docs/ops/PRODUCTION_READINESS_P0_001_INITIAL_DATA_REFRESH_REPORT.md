# Production Readiness P0-001 - Initial Data Import Fresh Evidence Refresh

Date: 2026-06-24

## Scope

This batch refreshes read-only evidence for `PRD-P0-001 Initial data import repair diagnosis`.

No DB write, migration, seed, deploy, restart, cleanup, reset, or production configuration change was executed.

## Evidence Directory

`docs/ops/runs/remediation-p0-001-initial-data-refresh-20260624-164744/`

Key files:

- `ssh_inventory.txt`
- `initial_data_readonly.sql`
- `initial_data_readonly_result.txt`
- `initial_data_readonly_result_retry1.txt`
- `short_readonly_results.txt`
- `schema_probe_results.txt`
- `role_permission_columns.txt`
- `store_payment_permission_counts.txt`

## Connectivity Result

SSH remains intermittent, but short commands can succeed when local SSH config is bypassed with `-F /dev/null`.

Observed:

- Container inventory succeeded.
- `sys_menu` column schema probe succeeded.
- `sys_role_menu_permission` column schema probe succeeded after retry.
- Several DB count probes failed with banner exchange timeout or connection close.

This confirms the previous SSH instability is still real, but it can be partially mitigated by short, serial, no-ControlMaster probes.

## Fresh Read-Only Findings

| Area | Result |
| --- | --- |
| `store_payment_accounts` | `0` rows |
| `store_payment_records` | `0` rows |
| `file_metadata` Store Payment rows | `0` rows |
| `sys_menu` key column | `menu_id`, not `id` |
| `sys_role_menu_permission` key column | `menu_id` |
| DB write | No |
| Migration | No |
| Deploy | No |
| Restart | No |
| Push | No |

## Important Correction

Earlier diagnostic SQL assumed `sys_menu.id`. Fresh schema evidence shows the remote table uses:

- `sys_menu.menu_id`
- `sys_role_menu_permission.menu_id`

Any future repair/verification SQL must join role permissions through `m.menu_id = rp.menu_id`.

## Repair Candidate Decision

| Candidate | Decision | Reason |
| --- | --- | --- |
| Store Payment account placeholders | HOLD_FOR_EXECUTION_APPROVAL | The production-side table is empty. Candidate disabled/pending placeholders may be prepared, but actual insertion requires a dedicated DB write Gate. |
| Store Payment records | NO_ACTION | Payment records are business events and must not be synthetic production repair data. |
| Store Payment file metadata | HOLD_WITHOUT_OWNER_EVIDENCE | `file_metadata` has no Store Payment rows. Do not create ownership rows without deterministic QR/proof owner evidence. |
| Initial import batch row repair | NEEDS_MORE_STABLE_EVIDENCE | Batch status probes were interrupted by SSH instability. |

## A5 Readiness

GO WITH CONDITIONS.

The Store Payment schema exists, but business readiness remains incomplete because accounts and records are empty and Store Payment file metadata ownership is absent.

## A2 Review

PASS WITH CONDITIONS.

Do not create synthetic payment records or attach files without deterministic ownership. Disabled/pending account placeholders can be considered only under a later approved write Gate.

## A1 Validation

PASS WITH CONDITIONS.

Evidence was collected read-only, but SSH instability prevents claiming full initial-import batch readiness.

## Next Recommended Gate

`APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_PLAN`

The next Gate should generate a narrow SQL package for disabled/pending Store Payment account placeholders only if:

1. the user approves a production-side DB write Gate;
2. rollback SQL is generated;
3. `STORE-VTE-001` and `COMP-LAO-AGRI` are revalidated immediately before execution;
4. no Store Payment payment records are inserted;
5. no Store Payment file metadata rows are inserted without owner evidence.

## Conclusion

GO WITH CONDITIONS.

The fresh evidence confirms Store Payment business tables remain empty on the production-side target. This closes the diagnostic uncertainty for account readiness, but not for initial import batch row repair.

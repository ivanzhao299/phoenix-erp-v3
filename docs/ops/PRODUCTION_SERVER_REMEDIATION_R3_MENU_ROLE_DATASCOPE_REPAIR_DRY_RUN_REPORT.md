# Production Server Remediation R3 - Menu / Role / DataScope Repair Dry-Run Report

Date: 2026-06-24

## Conclusion

Current conclusion: READY_FOR_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_APPROVAL WITH CONDITIONS.

The approved dry-run Gate generated remote candidate SQL files, rollback candidates, action-bit compatibility notes, and a summary manifest. No candidate SQL was executed and no database, menu, role, DataScope, user-scope, migration, deploy, restart, push, Nginx, env, or business-code change occurred.

## Remote Dry-Run Directory

Remote dry-run directory:

`/opt/phoenix-erp-backups/remediation-r3-menu-role-datascope-repair-dry-run-20260624-130947`

Local pulled evidence:

`docs/ops/runs/remediation-r3-menu-role-datascope-repair-dry-run-20260624-130947/`

## Generated Files

1. `manifest.json`
2. `menu_repair_dry_run.sql`
3. `role_permission_repair_dry_run.sql`
4. `datascope_repair_dry_run.sql`
5. `user_scope_repair_dry_run.sql`
6. `action_bit_mapping_dry_run.md`
7. `rollback_menu_repair_candidate.sql`
8. `rollback_role_permission_candidate.sql`
9. `rollback_datascope_candidate.sql`
10. `rollback_user_scope_candidate.sql`
11. `repair_dry_run_summary.json`
12. `repair_risk_summary.txt`
13. `file_list.txt`

## Candidate Counts

| Candidate area | Count |
| --- | ---: |
| Menu repair candidates | 5 |
| Role authorization repair candidates | 11 |
| DataScope repair candidates | 11 |
| User scope repair candidates | 1 |
| MANUAL_REVIEW_REQUIRED | 3 |
| HOLD items | 2 |

## Menu Repair Candidates

The dry-run generated candidates for:

- `MENU_STORE_PAYMENT_ACCOUNT`
- `MENU_STORE_PAYMENT`
- `MENU_STORE_PAYMENT_CONFIRM`
- `MENU_STORE_PAYMENT_VOID`
- `MENU_STORE_PAYMENT_EXPORT`

Remote present count before dry-run: 0.

The candidate script is guarded as dry-run only. Duplicate menu codes must be checked again before live execution.

## Role Authorization Repair Candidates

The dry-run generated the target matrix:

| Role | Target grants |
| --- | --- |
| 店员 / `ROLE_CASHIER` | `MENU_STORE_PAYMENT:V/E` |
| 店长 / `ROLE_STORE_MGR` | `MENU_STORE_PAYMENT:V`, `MENU_STORE_PAYMENT_CONFIRM:V/E` |
| 财务 / `ROLE_FIN_ACCT` | `MENU_STORE_PAYMENT:V`, `MENU_STORE_PAYMENT_CONFIRM:V/E`, `MENU_STORE_PAYMENT_EXPORT:X` |
| 管理员 / `ROLE_ADMIN` | `MENU_STORE_PAYMENT_ACCOUNT:V/E`, `MENU_STORE_PAYMENT:V/E`, `MENU_STORE_PAYMENT_CONFIRM:V/E`, `MENU_STORE_PAYMENT_VOID:V/E`, `MENU_STORE_PAYMENT_EXPORT:X` |

Remote Store Payment grant count before dry-run: 0.

Over-wide grants are not deleted automatically. Duplicate grants must HOLD.

## DataScope Repair Candidates

The dry-run generated role/module DataScope candidates:

- cashier/store manager: `STORE`
- finance: `COMPANY`
- admin: `ALL` candidate, subject to A2 review

Remote Store Payment `sys_data_scopes` count before dry-run: 0.

`sys_data_scopes` is role/module/scope-type level only. User-specific store binding must be handled through `sys_user_orgs`.

## User Scope Repair Candidates

One clear user-scope candidate was generated:

- `user_id=97`, masked as Store Payment pilot store manager, `STORE-VTE-001`, `ROLE_STORE_MGR`.

Three users were marked MANUAL_REVIEW_REQUIRED:

- `user_id=296`, masked username `pilot_***`, `ROLE_CASHIER`, noncanonical `STORE-MS-01`.
- `user_id=299`, masked username `pilot_***`, `ROLE_FIN_ACCT`, noncanonical `PILOT-MS`.
- `user_id=1460`, masked username `zhuzhao_***`, `ROLE_FIN_ACCT`, `ALL`; finance/global scope needs explicit approval.

No unclear user is assigned ALL scope automatically.

## Action-Bit Compatibility

Conclusion: COMPATIBILITY REQUIRES CONDITIONS.

Remote runtime still uses:

- `C` for record create.
- `A` for confirm / reject / void.

Target policy is:

- `V` for read.
- `E` for write/create/confirm/reject/void.
- `X` for export.

This dry-run generates target `V/E/X` candidates only. Before live execution, the user must either approve a code-aligned `E` runtime path or approve a temporary `C/A` compatibility grant Gate.

## HOLD Items

| Hold | Reason |
| --- | --- |
| Action-bit mismatch | Remote runtime uses `C/A`; target policy uses `V/E/X`. |
| User scope ambiguity | Three users require manual review; no ALL scope is auto-granted. |

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| DB write | No |
| SQL executed | No |
| Menu modified | No |
| Role modified | No |
| DataScope modified | No |
| User scope modified | No |
| Migration executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed | No |
| Business code modified | No |
| Nginx/env/compose modified | No |

## A1 Review

Conclusion: PASS WITH CONDITIONS.

- Dry-run files exist.
- Candidate SQL and rollback files were generated and pulled locally.
- `repair_dry_run_summary.json` confirms `sql_executed=false`.
- W5 static gate must pass before baseline completion.

## A2 Review

Conclusion: PASS WITH CONDITIONS.

- The dry-run avoids live privilege expansion.
- It does not use super admin as an audit bypass.
- It does not grant ALL scope to unclear users.
- It identifies action-bit mismatch before execution.
- Live execution should not proceed until the action-bit decision is approved.

## A5 Review

Conclusion: GO WITH CONDITIONS.

- Candidate menu, role, and DataScope repair data supports Store Payment readiness.
- One user store-scope candidate is clear.
- Three user-scope rows remain manual review.
- Store Payment readiness can proceed only through a later execution Gate.

## Next Gate

Recommended next single Gate:

`APPROVE_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_GATE`

Conditions:

1. execute only clear candidates;
2. do not execute MANUAL_REVIEW_REQUIRED rows;
3. do not execute HOLD items;
4. do not auto-delete over-wide grants;
5. decide action-bit alignment path before live grants.

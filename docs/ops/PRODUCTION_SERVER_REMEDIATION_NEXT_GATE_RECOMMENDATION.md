# Production Server Remediation - Next Gate Recommendation

Date: 2026-06-24

## Current State

The approved Menu / Role / DataScope repair execution Gate completed with conditions.

Final evidence:

- Remote execution directory: `/opt/phoenix-erp-backups/remediation-r3-menu-role-datascope-repair-execution-20260624-134210`
- Local evidence directory: `docs/ops/runs/remediation-r3-menu-role-datascope-repair-execution-20260624-134210/`
- Store Payment menus present: 5
- Store Payment role permissions present: 11
- Store Payment DataScope rows present: 11
- Clear user scope row present: 1
- MANUAL_REVIEW_REQUIRED rows executed: 0
- HOLD items executed: 0
- Migration / deploy / restart / push: not executed

## Recommendation

Recommended next single Gate:

`APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`

## Completed Execution Scope

The completed execution was limited to:

1. clear Store Payment menu candidates;
2. clear Store Payment role authorization candidates;
3. clear Store Payment role/module DataScope candidates;
4. clear user-scope candidate for `user_id=97`.

## Remaining Exclusions

The following remain excluded:

1. MANUAL_REVIEW_REQUIRED user rows;
2. HOLD items;
3. over-wide permission deletion;
4. broad non-Store-Payment permissions;
5. action-bit compatibility grants not explicitly approved;
6. migration, deploy, restart, push, Nginx/env/compose changes.

## Conditional Follow-Ups

| Follow-up | Reason |
| --- | --- |
| `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN` | The execution used Store Payment-only `C/A` compatibility grants while the target policy remains `V/E/X`. |
| `HOLD_MANUAL_REVIEW_REQUIRED_SCOPE_ITEMS` | Three user-scope rows remain excluded until reviewed. |
| DataScope model cleanup | Remote `sys_data_scopes.scope_type` does not support `STORE` / `ALL`; execution used `SELF` / `COMPANY` / `GROUP` compatibility. |

## Alternative HOLD Path

If initial import diagnosis cannot produce safe repair candidates, use:

`HOLD_INITIAL_DATA_IMPORT_REPAIR_REQUIRES_MANUAL_REVIEW`

## Boundary

This recommendation does not authorize additional DB writes, migration, deploy, restart, push, cleanup, reset, or production config changes.

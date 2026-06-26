# Online Users Atomic Permission Remediation

Date: 2026-06-27

## Scope

Split online user / presence visibility away from the coarse system monitor permission.

## Problem

The online user page and topbar indicator reused `MENU_SYS_MONITOR`. That made an operational monitoring permission also control user-presence visibility, which is too broad for role-facing UI and could produce inconsistent menu exposure.

## Changes

- Added `MENU_SETTINGS_ONLINE_USER` as the atomic menu code for online user visibility.
- Registered the new menu under `系统设置 / 在线用户`.
- Migrated existing roles with `MENU_SYS_MONITOR:V` to receive `MENU_SETTINGS_ONLINE_USER:V`.
- Updated backend presence endpoints:
  - `GET /api/system/online-users`
  - `GET /api/system/online-count`
- Updated frontend gates:
  - topbar online user indicator
  - `/settings/online-users`
  - settings hub card
  - sidebar entry
- Added CI regression checks to prevent online user routes from falling back to `MENU_SYS_MONITOR`.

## New Menu Code

| Menu Code | Name | Parent | Route | Action |
| --- | --- | --- | --- | --- |
| `MENU_SETTINGS_ONLINE_USER` | 在线用户 | `MENU_SETTINGS_USER` | `/settings/online-users` | `V` |

## Validation Plan

- API typecheck
- Web typecheck
- menu permission atomicity gate
- sensitive menu guard gate
- frontend menu gate
- TypeORM migration no-data-DML gate
- TypeORM migration down gate
- nullable unique gate
- W5 closeout gate

## Risk

Risk is low to medium. Existing monitor users keep access through migration inheritance, while future role assignment can manage online user visibility independently.

## Rollback

Use the migration `down()` to remove `MENU_SETTINGS_ONLINE_USER` role permissions and menu registration. The code must be reverted at the same time because backend endpoints require the new menu code after this change.

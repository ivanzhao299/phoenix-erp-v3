# Settings Hub and Security Page Permission Remediation - 2026-06-27

## Scope

Tightened system settings entry visibility and security policy page data loading so users no longer see child settings cards or trigger related API calls without the matching atomic menu permissions.

## Problems

- `/settings` rendered fixed child cards even when the user did not have the corresponding child permission.
- `/settings/security` could call audit-log and user-list CRUD APIs as part of page loading, relying on API denial or silent empty states instead of frontend permission intent.

## Changes

- `apps/web/src/app/(admin)/settings/page.tsx`
  - Added atomic permission checks for each settings hub card.
  - Filters hidden cards before rendering groups.
  - Keeps personal profile visible while hiding restricted administrative entries.
- `apps/web/src/app/(admin)/settings/security/page.tsx`
  - Added `MENU_SETTINGS_SECURITY` page-level gate.
  - Loads frozen-user status only when `MENU_SETTINGS_USER:V` is available.
  - Loads recent approval/audit rows only when `MENU_SETTINGS_AUDIT:V` is available.
  - Shows restricted copy instead of calling unauthorized APIs.
- `scripts/ci/check-menu-permission-atomicity.mjs`
  - Added regression guards for settings hub card filtering.
  - Added regression guards for security page route/data-load permissions.

## Permission Mapping

| UI entry | Required permission |
| --- | --- |
| 用户管理 | `MENU_SETTINGS_USER:V` |
| 角色权限 | `MENU_SETTINGS_ROLE:V` |
| 组织架构 | `MENU_MD_ORG:V` |
| 数据字典 | `MENU_SETTINGS_DATA:V` |
| 主数据配置 | `MENU_SETTINGS_CONFIG:V` |
| 门店库存配置 | `MENU_SETTINGS_STOCK:V` |
| 安全策略 | `MENU_SETTINGS_SECURITY:V` |
| 审计日志 | `MENU_SETTINGS_AUDIT:V` |
| 审批流配置 | `MENU_WORKFLOW_CONFIG:V` |
| POS 终端 | `MENU_SETTINGS_POS:V` |
| PDA 终端 | `MENU_SETTINGS_TERMINAL:V` |
| 品牌设置 | `MENU_SETTINGS_BRAND:V` |
| 系统初始化 / 试运行项目 | `MENU_UAT:V` |

## Validation Plan

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- Existing migration and W5 gates.

## Production Risk

Low. This only hides unauthorized frontend entries and prevents unauthorized frontend API calls. It does not change database schema, migrations, backend authorization, or deployment logic.


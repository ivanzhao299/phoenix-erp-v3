# Org Legacy Permission Fallback Remediation

Date: 2026-06-27

## Goal

Remove the legacy `MENU_SYS_ORG` fallback from organization, organization runtime, and business-unit APIs so users no longer receive organization-related child capabilities through an old coarse parent code.

## Changes

1. Business unit APIs
   - File: `apps/api/src/modules/business-unit/business-unit.controller.ts`
   - Removed `MENU_SYS_ORG` fallback from list, overview, member, create, update, add-member, and remove-member routes.
   - Required permission is now `MENU_MD_BUSINESS_UNIT`.

2. Organization runtime APIs
   - File: `apps/api/src/modules/org/organization.controller.ts`
   - Removed `MENU_SYS_ORG` fallback from tree, list, by-type, user-scopes, get, create, update, enable, disable, and delete routes.
   - Required permission remains `MENU_MD_ORG`.
   - Existing `MENU_ORG_VIEW` / `MENU_ORG_MANAGE` aliases are retained as a narrower runtime compatibility layer for a later migration batch.

3. Organization management APIs
   - File: `apps/api/src/modules/org/org.controller.ts`
   - Removed `MENU_SYS_ORG` fallback from org/company/data-scope/user-org routes.
   - Routes now require the relevant atomic permissions:
     - `MENU_MD_ORG`
     - `MENU_MD_COMPANY`
     - `MENU_SETTINGS_DATA_SCOPE`
     - `MENU_SETTINGS_USER` where user binding context is needed.

4. CI guard
   - File: `scripts/ci/check-menu-permission-atomicity.mjs`
   - Added checks that reject reintroduction of `MENU_SYS_ORG` in:
     - `org.controller.ts`
     - `organization.controller.ts`
     - `business-unit.controller.ts`

## Risk Control

- No DB/schema/entity/table/column changes.
- No migration.
- No seed.
- No business data write.
- Existing atomic menu codes are already surfaced in the sidebar and pages.

## Validation

Planned validation:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- API typecheck
- Web typecheck
- nullable unique gate
- W5 closeout gate
- `git diff --check`

## Result

GO WITH CONDITIONS. This closes the `MENU_SYS_ORG` legacy fallback layer. Remaining permission cleanup should continue with older runtime aliases such as `MENU_ORG_VIEW` / `MENU_ORG_MANAGE` only after role grant parity is confirmed.

# RBAC Password Role Conflict and sys_dict Duplicate Review

Date: 2026-07-03

## Scope

This review covers two production-facing issues:

1. Changing Wang Weihua's password from the backend admin user page was blocked by a role conflict. After removing the conflicting role, the password update succeeded, but the old role appeared again after re-login.
2. Historical migrations and seed scripts caused duplicate dictionary entries, including SKU/grade-related dictionaries.

No production database cleanup was executed in this change.

## Root Cause: Password Reset and Role Conflict

### Observed Behavior

- Password reset and role assignment were handled by the same "Save" flow on the user detail page.
- The page always ran SoD role-combination validation before saving, even when the admin only intended to reset the password.
- The role picker exposed an eye/hidden toggle using `sys_user_role.is_visible`.
- Backend comments and auth logic treated `is_visible=false` as "hide role name only, do not affect permissions".
- Login still computed permissions from all bound roles and returned all roles in the token.

### Why Password Changed but Role Returned

Password and role bindings are persisted in different places:

- `sys_user.password_hash` was updated successfully.
- Role binding remained in `sys_user_role`.
- If the admin used the visibility toggle instead of actually removing the role, the role was only hidden in UI, not removed from authorization.
- On re-login, `auth.service.ts` read all `sys_user_role` rows, so the role appeared/effected again.

This created the impression that the role "came back" while the password update remained.

## Fix Applied

### Backend Auth Semantics

Updated `apps/api/src/auth/auth.service.ts`:

- `sys_user_role.is_visible=false` now means this user's role authorization is inactive.
- Inactive roles no longer participate in:
  - primary role selection
  - `roles` token payload
  - permission calculation
  - admin wildcard detection
  - impersonation target-role checks
- If a user has no active role, login returns `ROLE_NONE` with no menu permissions instead of falling back to a hidden role.

### User API

Updated `apps/api/src/modules/bff/bff.controller.ts`:

- `/api/users` now returns `is_visible` in `roles_detail`.
- primary role display prefers active roles only.
- full role replacement inserts roles with `is_visible=true`.
- added `/api/users/:id/role-visibility` compatibility endpoint with clarified semantics:
  - `is_visible=false` = inactive role authorization
  - `is_visible=true` = restore role authorization

### User Detail UI

Updated:

- `apps/web/src/app/(admin)/settings/users/[id]/page.tsx`
- `apps/web/src/components/settings/RolePicker.tsx`

Changes:

- Password reset no longer triggers SoD role conflict validation unless roles actually changed.
- Role save only runs when roles actually changed.
- Role visibility text now says "disable/restore this user's role authorization"; it no longer claims "display only".
- Help text explains crossed-out roles are inactive and do not participate in login permissions.

## Root Cause: sys_dict Duplicate Entries

### Code and Schema Evidence

- `sys_dict` only has a primary key on `id`; there is no database uniqueness guard on active `(dict_type, dict_code)`.
- Historical SQL seeds under `migrations/` inserted directly into `sys_dict`.
- Some historical seed paths used `INSERT` without a reliable `ON CONFLICT` target because no unique constraint existed.
- Old cleanup script `scripts/dedup_sys_dict.sql` physically deletes duplicates, which is unsafe for production because historical references may still point to old ids/codes.
- Product grades and SKU are now master data:
  - product grades: `product_grades`
  - SKU: `product_skus`
- Legacy dictionary types such as `PKG_EGG_GRADE` and `PKG_PACK_SPEC` can remain as historical residue and must not be reintroduced as the operational source.

### Why SKU / Grade Looks Duplicated

The duplication has two layers:

1. true duplicate rows in `sys_dict` under the same `(dict_type, dict_code)` or same label;
2. model duplication where product grades / SKU live in master data but old dictionary entries remain visible or are still queried by older pages.

## Fix Applied for Dictionary Governance

Added:

- `scripts/ops/audit-sys-dict-duplicates.mjs`

The script is read-only by default. It:

- audits duplicate active `(dict_type, dict_code)` groups;
- audits duplicate active labels per `dict_type`;
- highlights high-risk SKU/grade/packaging dictionary types;
- writes JSON/Markdown reports when `DATABASE_URL` is provided.

No production duplicate rows were deleted or archived in this change.

## Local Evidence Snapshot

Local `phoenix_erp` read-only checks completed on 2026-07-03:

- Wang Weihua (`wangweihua` / `王玮华`) currently has one active visible role:
  - `ROLE_MENGSAI_DONGPENG_TREASURER`
  - `is_primary=true`
  - `is_visible=true`
- `sys_dict` local duplicate audit:
  - active entries: 240
  - dict types: 47
  - duplicate `(dict_type, dict_code)` groups: 0
  - duplicate active label groups: 2
  - high-risk legacy type: `PKG_EGG_GRADE` has 0 active rows
- local duplicate label groups:
  - `BRD_HOUSE_TYPE / 育成舍`: ids `{74,124}`
  - `BRD_HOUSE_TYPE / 蛋鸡舍`: ids `{14,15}`

Production read-only SSH/DB sampling was attempted, but the SSH connection timed out during banner exchange in this run. No production DB write was attempted.

## Recommended Production Cleanup Plan

### Phase 1: Evidence

Run the new audit against production and save:

- duplicate code groups
- duplicate label groups
- high-risk types: SKU / GRADE / `PKG_EGG_GRADE` / `PKG_PACK_SPEC`

### Phase 2: Business Canonical Review

For each duplicate group:

- keep one canonical ACTIVE row;
- compare code, Chinese label, sort order, config_json, and usage;
- for grade/SKU domains, prefer master data (`product_grades`, `product_skus`) over sys_dict.

### Phase 3: Soft Archive

Archive duplicate rows by setting `status='ARCHIVED'`.

Do not physically delete rows during production operation.

### Phase 4: Guardrail

After duplicate active groups reach zero:

- add a partial unique index on active `(dict_type, dict_code)`;
- keep historical ARCHIVED rows outside the active uniqueness scope.

Suggested index:

```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_sys_dict_active_type_code
ON sys_dict (dict_type, dict_code)
WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE';
```

### Phase 5: Remove Legacy Consumers

- SKU selectors must read `product_skus`.
- product grade selectors must read `product_grades`.
- `PKG_EGG_GRADE` / `PKG_PACK_SPEC` should stay non-operational once all terminal/packaging consumers are migrated.

## Risk Controls

- Password reset no longer depends on role conflict validation.
- Hidden/inactive roles no longer leak into permissions.
- Dictionary cleanup must be archive-first, not delete-first.
- Production cleanup should be run as a separately approved DB maintenance gate.

## Current Conclusion

GO WITH CONDITIONS

Conditions:

1. Deploy the RBAC/login/UI fix.
2. Run sys_dict duplicate audit against production when SSH/DB access is stable.
3. Prepare a separate DB cleanup gate before archiving duplicate dictionary rows.

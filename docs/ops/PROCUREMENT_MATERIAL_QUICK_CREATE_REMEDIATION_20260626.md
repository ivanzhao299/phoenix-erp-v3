# Procurement Material Quick Create Remediation - 2026-06-26

## Scope

This remediation addresses the high-frequency procurement material picker path used by purchase request/order forms. The user-facing symptom was "新增采购物料保存失败 / HTTP 500" when adding material information during procurement entry.

## Root Cause / Risk

The quick-create endpoint delegated directly to master-data runtime creation. Duplicate material names were rejected by validation after a new material code was already requested, and frontend behavior surfaced the failure as a hard create error. In daily procurement work, users often type a material that already exists with minor spacing/case differences, so this became a noisy production blocker.

## Changes

- `apps/api/src/modules/product-master/controllers/lookup.controller.ts`
  - `POST /api/lookup/materials/quick` now checks for an existing ACTIVE material by normalized material name before creating a new record.
  - If found, it returns the existing material row with `existing: true` instead of failing.
  - New material creation still uses the existing master-data runtime validation, audit, and code generation path.

- `apps/web/src/components/shared-selectors/MaterialPicker.tsx`
  - Accepts the `existing` response flag.
  - Shows a clearer success message when an existing material is selected instead of newly created.

## Guardrails

- DB migration executed: No
- Business data write executed by this remediation: No
- Deployment executed before validation: No
- DataScope change: No. `mst_materials` has no company/store column and remains global operational master data.
- Permissions weakened: No. Quick-create still requires `MENU_PRC2_REQUEST:C` or allowed procurement/master-data menu permissions through `MenuGuard`.

## Validation Plan

- API typecheck
- Web typecheck
- `git diff --check`
- W5 closeout gate
- Push branch/main after validation
- CI/CD and production smoke

## Conclusion

GO WITH CONDITIONS: the quick-create flow is safer and less error-prone. A later audit should decide whether `mst_materials` needs an owner/company model; the current table structure does not support scoped material visibility.

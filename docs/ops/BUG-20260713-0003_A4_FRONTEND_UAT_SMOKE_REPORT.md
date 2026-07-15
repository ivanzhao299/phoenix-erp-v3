# BUG-20260713-0003 A4 Frontend UAT Smoke

## Status

PASS WITH CONDITIONS / GO for A4 frontend gate.

No production-resolution claim is made before CI/CD, production smoke, and business acceptance.

## Source

- Bug: `BUG-20260713-0003`
- Task: `BUGTASK-20260713-0003`
- Agent: `A4-Frontend-UAT-Smoke`
- Route: `/procurement2/payments`
- Issue: 采购管理-付款管理，点击确认付款报错 `AP 台账 ID=11 不存在`

## Diagnosis

The captured failing request was `POST /api/v2/procurement/payments/16/pay`, returning backend 404 with `AP 台账 ID=11 不存在`.

A4 found one frontend-owned contributor from the prior `/finance2/ap` to `/procurement2/payments/new` bridge: the finance AP source id was serialized as `apId` and then copied into `allocations[].apId` on the procurement payment draft. That field is the procurement AP ledger id in the payment workflow, so sending a finance AP id can create or preserve a stale allocation reference that later fails during `确认付款`.

Backend handling is still the primary confirmation path for existing stale records. This A4 fix prevents new frontend-created payment drafts from submitting the cross-domain finance AP id as a procurement AP ledger id.

## Changed Files

- `apps/web/src/lib/finance-ap-payment-prefill.ts`
  - Changed the prefill URL parameter from `apId` to `financeApId`.
  - Parsed the source id as `sourceApId`, keeping legacy `apId` links readable without exposing it as a procurement allocation id.
- `apps/web/src/app/(admin)/procurement2/payments/PaymentForm.tsx`
  - Finance AP prefill rows now set `apNo`, `poNo`, company/project, and amount, but no longer set `allocations[].apId`.
- `apps/web/src/lib/finance-ap-payment-prefill.test.ts`
  - Added regression coverage that generated prefill links do not emit `apId`, parsed prefill objects do not expose `apId`, and legacy links still parse safely.

## Permission / State Preservation

- Existing `/finance2/ap` permission gating for `发起付款` remains unchanged: `MENU_PRC2_PAYMENT:C` still gates the active link, with read-only hints for insufficient permissions.
- Existing `/procurement2/payments` action visibility remains unchanged: `确认付款` still only renders for `APPROVED` rows.
- Existing loading, empty, error toast, attachment upload, and AP picker states are preserved.
- No API, schema, migration, database write, deployment, push, RBAC backend guard, DataScope, audit, or attachment ACL change was made.

## Desktop And Mobile Behavior

- Desktop code-level check: the `/procurement2/payments` list UI and confirm-payment modal layout are unchanged; the modified behavior is payload construction for drafts created via `/procurement2/payments/new`.
- Mobile code-level check: no responsive layout or visual CSS changed; the form remains within the existing responsive field rows and horizontal allocation table.
- Browser visual verification could not run locally because `next dev` failed with `listen EPERM: operation not permitted 127.0.0.1:3300`.

## Validation

- `pnpm --filter web test -- finance-ap-payment-prefill`
  - PASS: 1 file, 5 tests.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 errors.
- `cd apps/web && NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next build --webpack --debug-build-paths "src/app/(admin)/procurement2/payments/page.tsx,src/app/(admin)/procurement2/payments/new/page.tsx,src/app/(admin)/finance2/ap/page.tsx"`
  - PASS: compiled successfully.
- `node scripts/ops/product-page-smoke.mjs --strict --base-url=http://127.0.0.1:3300 --timeout-ms=2000 --output-dir=/tmp/phoenix-a4-smoke`
  - Static portion PASS for `procurement-payment-new`.
  - HTTP portion FAIL for all routes because no local server could bind to the port after `next dev` failed with `EPERM`; treated as environmental evidence, not a product-route failure.
- `git diff --check`
  - PASS.

## Conditions

- Existing production/staging payment records that already contain stale `allocations[].apId` still require the backend A3 fix and/or data-safe operational handling; A4 did not write database data.
- CI/CD, authenticated production smoke on `/procurement2/payments`, and business acceptance from the reporter are still required before this bug can be marked resolved.

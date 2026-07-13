# BUG-20260713-0001 A4 Frontend UAT Smoke

## Status

PASS WITH CONDITIONS

No production-resolution claim is made before CI/CD, production smoke, and business acceptance.

## Source

- Bug: `BUG-20260713-0001`
- Task: `BUGTASK-20260713-0001`
- Agent: `A4-Frontend-UAT-Smoke`
- Route: `/finance2/ap`
- Issue: 财务结算中心-应付账款-选中新建的应收发票，没有可以付款的地方

## Diagnosis

The AP detail drawer showed balance and allocation history, but the only available write action for an open manually created AP invoice was cancellation. The existing payment workflow already lives in `/procurement2/payments/new`; the AP page did not provide a bridge into that workflow or pass the selected AP invoice context forward.

No backend, schema, migration, database write, RBAC backend guard, DataScope, audit, or attachment ACL change was made.

## Changed Files

- `apps/web/src/app/(admin)/finance2/ap/page.tsx`
  - Added a permission-aware `发起付款` action in the AP detail drawer for `OPEN` / `PARTIALLY_PAID` invoices with a positive balance.
  - The action is gated by `MENU_PRC2_PAYMENT:C`; users without payment creation permission see a read-only permission hint instead of an active payment button.
  - Existing loading, empty allocation history, overdue warning, cancellation, and cancelled-state rendering were preserved.
- `apps/web/src/app/(admin)/procurement2/payments/PaymentForm.tsx`
  - Reads AP prefill query context on the new payment page.
  - Prefills company, payer, payee, currency, remark, and one AP allocation row from the selected AP invoice.
  - Shows a compact notice that the payment draft was started from an AP invoice.
- `apps/web/src/lib/finance-ap-payment-prefill.ts`
  - Added pure helpers for building and parsing AP-to-payment prefill URLs.
- `apps/web/src/lib/finance-ap-payment-prefill.test.ts`
  - Added focused regression coverage for the prefill URL contract.

## Verification

- `pnpm --filter web test -- finance-ap-payment-prefill`
  - PASS, 3 tests.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS.
- `cd apps/web && NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next build --webpack --debug-build-paths "src/app/(admin)/finance2/ap/page.tsx,src/app/(admin)/procurement2/payments/new/page.tsx"`
  - PASS compilation, but Next reported only `/404` in the selective route summary, so this is treated as supplemental rather than full route proof.

## Desktop And Mobile Behavior

- Desktop behavior checked at code/layout level:
  - The AP drawer keeps its existing width and vertical flow.
  - The new payment action is a full-width action pill inside the existing action group, below payment allocation history and above cancellation.
  - Existing error/loading/empty states are unchanged.
- Mobile behavior checked at code/layout level:
  - The new CTA uses the existing drawer/action styles and full-width layout, so it does not add a new fixed-width control.
  - The payment form prefill notice is a compact flex row and does not change the existing form grid breakpoints.

## Conditions

- Local browser verification could not be completed in this sandbox because `next dev` failed with `listen EPERM` on both `0.0.0.0:3000` and `127.0.0.1:3300`.
- Full `next build --webpack --experimental-build-mode compile` was blocked by environment issues: Google Fonts fetch attempted `127.0.0.1:7890` and failed with `EPERM`, and current pnpm symlinks reference missing dependency paths in another worktree.
- Requires CI/CD validation, production smoke on `/finance2/ap` and `/procurement2/payments/new`, and business acceptance from the reporter before marking the bug fully resolved.

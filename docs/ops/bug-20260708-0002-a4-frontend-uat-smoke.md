# BUG-20260708-0002 A4 Frontend UAT Smoke

## Status

PASS WITH CONDITIONS

No production-resolution claim is made before CI/CD, production smoke, and business acceptance.

## Source

- Bug: `BUG-20260708-0002`
- Task: `BUGTASK-20260708-0002`
- Route: `/procurement2/shipments`
- Issue: 采购管理-物流管理新建运单界面排版有问题，调整一下排版

## Diagnosis

The new shipment drawer reused `s.formSection` from `admin-ui.module.css` as a content container. That shared class is a compact section-title style with `display: flex`, so placing a heading and form rows inside it forces the section content into a horizontal flex row and can squeeze fields into an unstable layout.

No backend, schema, migration, database, RBAC, DataScope, audit, or attachment ACL changes were needed.

## Changed Files

- `apps/web/src/app/(admin)/procurement2/shipments/page.tsx`
  - Replaced the drawer's title-style `s.formSection` containers with page-scoped semantic sections.
  - Increased the drawer width from `600` to `760` for the new shipment form.
  - Moved create/cancel actions into the existing `RightDrawer.footer` slot.
- `apps/web/src/app/(admin)/procurement2/shipments/shipments.module.css`
  - Added page-scoped drawer layout rules.
  - Desktop: stable two-column form grid.
  - Mobile: single-column layout at `max-width: 768px`; footer buttons become equal-width.
- `apps/web/src/__tests__/procurement-shipments-layout.test.ts`
  - Added focused regression coverage for page-scoped drawer layout, footer use, and mobile breakpoint rules.

## Verification

- `cd apps/web && ./node_modules/.bin/vitest run src/__tests__/procurement-shipments-layout.test.ts`
  - PASS, 2 tests.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS.
- `cd apps/web && ./node_modules/.bin/next build --webpack --experimental-build-mode compile --debug-build-paths 'src/app/(admin)/procurement2/shipments/page.tsx'`
  - PASS, compiled successfully.
  - Existing warnings observed: `outputFileTracingRoot` / `turbopack.root`, custom cache-control headers, deprecated middleware convention.
- Static route/layout check:
  - PASS: no remaining `className={s.formSection}` usage in the shipment drawer.
  - PASS: new drawer uses `styles.shipmentForm`, `styles.formSection`, and `styles.drawerActions`.
  - PASS: CSS contains desktop two-column grid and mobile single-column breakpoint.

## Desktop And Mobile Behavior

- Desktop behavior checked at code/layout level:
  - Drawer width is `760px`.
  - Primary field groups use a two-column grid with `minmax(0, 1fr)` tracks to prevent field overflow.
  - Full-width tracking number spans both columns intentionally.
  - Actions are outside scrollable content in the drawer footer.
- Mobile behavior checked at code/layout level:
  - `@media (max-width: 768px)` switches the form grid to one column.
  - Full-span fields reset to normal grid flow.
  - Footer action buttons share available width.

## Conditions

- Local dev server could not be started in this sandbox: `next dev` failed with `listen EPERM: operation not permitted 127.0.0.1:3000`.
- Playwright CLI was not locally installed; the wrapper stalled under restricted network while trying to resolve `@playwright/cli`, so real browser screenshots were not captured.
- Requires CI/CD validation, production smoke on `/procurement2/shipments`, and business acceptance from the reporter before marking the bug fully resolved.

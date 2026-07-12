# BUG-20260709-0002 Integration Resolution

## Decision

PASS WITH CONDITIONS.

The conflicting A4 implementation was merged manually with the existing inbound confirmation repair instead of choosing either branch wholesale.

## Effective behavior

- New inbound rows always start as `PENDING`.
- Generic create/edit forms cannot set `COMPLETED` directly.
- Editing strips the workflow status from the CRUD payload.
- Inventory is written only through `POST /api/inbound/confirm` after payload validation.
- Existing task number, product code, quantity, warehouse, location, and inventory-query behavior is preserved.

## Files

- `apps/web/src/app/(admin)/warehouse/inbound/page.tsx`
- `apps/web/src/lib/warehouse-inbound.ts`
- `apps/web/src/lib/warehouse-inbound.test.ts`

## Safety

- No database write or migration.
- No backend, deployment, or production configuration change.
- Final closure still requires Web typecheck, focused tests, CI/CD, production smoke, and A1 evidence replay.

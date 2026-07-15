# BUG-20260715-0003 A4 Frontend Closure Report

## Root Cause

The purchase-order API already returned both its internal `id` and business `poNo`, but the list, detail drawer, and form only surfaced the business order number. Operators therefore could not see or search the identifier required by support and downstream troubleshooting.

## Repair And Retest

- The list shows purchase-order ID before purchase-order number.
- The detail drawer shows both identifiers in the same order.
- Create/edit forms expose both generated identifiers as read-only fields.
- The ID column now has a system-identifier hint and an accessible row label.
- Focused source regression tests assert all three UI surfaces and the column order.

No backend, migration, database, or deployment change is part of this frontend task.

## Conclusion

PASS WITH CONDITIONS: frontend implementation and focused tests pass; production page smoke remains required after deployment.

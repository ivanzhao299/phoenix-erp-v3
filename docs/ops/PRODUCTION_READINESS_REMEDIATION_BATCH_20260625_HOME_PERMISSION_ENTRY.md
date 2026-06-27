# Production Readiness Remediation Batch - Home Permission Entry

Date: 2026-06-25

## Scope

This batch continues the P0/P1 frontend permission gate remediation for the operation workbench.

## Issue

The operation workbench hero CTA still selected some target pages primarily from role strings. A user whose role name looked like procurement could be sent to the procurement dashboard even when their effective menu permissions only allowed a more specific procurement page.

## Changes

- Updated `/home` hero CTA selection to check effective JWT menu permissions before choosing a role-specific destination.
- Procurement users now fall back to the first actually permitted procurement page:
  - procurement dashboard
  - procurement orders
  - procurement requests
  - procurement payments
  - procurement receipts
  - procurement shipments
  - procurement shareholder funds
- Business center shortcut visibility now supports precise alternate menu codes for customer, supplier, and procurement entries.

## Production Safety

- No API code changed.
- No database write.
- No migration.
- No deployment script changed.
- No permission seed changed.

## Validation

- Web typecheck: PASS.
- API typecheck: pending.
- W5 closeout gate: pending.

## Result

Pending final validation and deployment.

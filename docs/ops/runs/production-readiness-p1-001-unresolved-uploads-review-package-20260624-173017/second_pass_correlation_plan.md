# P1-001 Second-Pass Correlation Plan

This is a plan only. Do not execute metadata writes from this file.

## Goal

Reduce the 59 unresolved historical upload files only if stronger read-only owner evidence can be found.

## Allowed Read-Only Signals

1. Exact filename/path matches in attachment-like columns.
2. Exact checksum matches if checksums exist in trusted metadata.
3. Nearby business document references that contain the same stored filename.
4. Human-provided owner mapping with document number and module.

## Forbidden Signals

1. Guessing owner from upload timestamp alone.
2. Guessing owner from file extension or size.
3. Mapping all contract-like files to purchase contracts.
4. Assigning Store Payment ownership without `store_payment_accounts.qr_attachment_id` or `store_payment_records.proof_attachment_id`.
5. Creating raw `/uploads` links.

## Output Classes

- `AUTO_CLAIM_READY`: exact DB owner evidence, single owner, A2 accepted.
- `MANUAL_REVIEW_REQUIRED`: plausible owner but not deterministic.
- `UNRESOLVED_OR_HOLD`: no safe owner evidence.

## Execution Boundary

Metadata writes require a separate approved DB Gate. Manual review output is not write approval.

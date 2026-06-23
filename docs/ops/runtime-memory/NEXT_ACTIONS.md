# Next Actions

Last updated: 2026-06-23

1. `USER_APPROVES_PUSH_OR_NOT`.
2. `USER_APPROVES_STAGING_DEPLOY_OR_NOT`.
3. `USER_APPROVES_STAGING_DB_MIGRATION_OR_NOT`.
4. `USER_APPROVES_BUSINESS_UAT_SCOPE_OR_NOT`.

## Recommended Immediate Sequence

1. Ask the user to approve or reject the rows in `docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_MATRIX.md`.
2. If staging deploy is approved, run a separate staging deployment Gate.
3. Keep `/uploads` and raw URL exposure forbidden.
4. Keep local UAT fixture data out of production release decisions unless explicitly approved.

## Do Not Auto-Start

- A6 staging deployment.
- production deployment.
- production preview/download enablement without staging evidence.
- Push.
- Production DB writes.

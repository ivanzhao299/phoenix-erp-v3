# Next Actions

Last updated: 2026-06-23

1. Request user approval for staging deploy.
2. Request `STAGING_DB_MIGRATION_AND_MENU_ROLE_SYNC_APPROVAL`.
3. Prepare controlled pilot business UAT participants and scope.
4. Add protected upload / metadata population workflow when business asks to upload real proof / QR files.

## Recommended Immediate Sequence

1. Ask the user whether to approve staging deploy.
2. If approved, run a separate staging deployment Gate.
3. Keep `/uploads` and raw URL exposure forbidden.
4. Keep local UAT fixture data out of production release decisions unless explicitly approved.

## Do Not Auto-Start

- A6 staging deployment.
- production deployment.
- production preview/download enablement without staging evidence.
- Push.
- Production DB writes.

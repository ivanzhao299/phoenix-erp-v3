# Next Actions

Last updated: 2026-06-23

1. Enter a dedicated A6 staging deploy runbook Gate.
2. Enter a dedicated A7 final QA Gate.
3. Prepare `STORE_PAYMENT_CONTROLLED_PILOT_RELEASE_DECISION`.
4. Add protected upload / metadata population workflow when business asks to upload real proof / QR files.

## Recommended Immediate Sequence

1. Generate A6 staging deploy runbook without deploying.
2. Generate A7 final QA Gate without production GO.
3. Keep `/uploads` and raw URL exposure forbidden.
4. Keep local UAT fixture data out of production release decisions unless explicitly approved.

## Do Not Auto-Start

- A3 protected streaming implementation.
- Production preview/download enablement without A2 review.
- A6 staging deployment.
- A7 final production GO.
- Push.
- Production DB writes.

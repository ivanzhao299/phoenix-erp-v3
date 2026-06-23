# Next Actions

Last updated: 2026-06-23

1. Enter `A7_FINAL_QA_GATE`.
2. Prepare `STORE_PAYMENT_CONTROLLED_PILOT_RELEASE_DECISION`.
3. Execute staging deploy only after explicit user approval.
4. Add protected upload / metadata population workflow when business asks to upload real proof / QR files.

## Recommended Immediate Sequence

1. Generate A7 final QA Gate without production GO.
2. Prepare a single controlled pilot release decision package.
3. Keep `/uploads` and raw URL exposure forbidden.
4. Keep local UAT fixture data out of production release decisions unless explicitly approved.

## Do Not Auto-Start

- A3 protected streaming implementation.
- Production preview/download enablement without A2 review.
- A6 staging deployment.
- A7 final production GO.
- Push.
- Production DB writes.

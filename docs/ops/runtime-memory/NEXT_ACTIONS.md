# Next Actions

Last updated: 2026-06-23

1. Keep controlled Store Payment UAT smoke on `/store-payment`.
2. Fix frontend details according to controlled UAT findings.
3. Open A4 enable protected preview/download UI draft Gate.
4. Add protected upload / metadata population workflow when business asks to upload real proof / QR files.
5. Enter a dedicated A6 staging deploy runbook Gate.
6. Enter a dedicated A7 final QA Gate.

## Recommended Immediate Sequence

1. Keep `/store-payment` preview/download disabled until A4 Gate.
2. Generate A4 protected preview/download UI draft using `/store-payment/attachments/:fileId/status|preview|download`.
3. Require A2 review before enabling UI buttons by default.
4. Keep `/uploads` and raw URL exposure forbidden.

## Do Not Auto-Start

- A3 protected streaming implementation.
- A4 protected preview/download UI enablement without A2 review.
- A6 staging deployment.
- A7 final production GO.
- Push.
- Production DB writes.

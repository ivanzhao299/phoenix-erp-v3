# Next Actions

Last updated: 2026-06-23

1. Run Store Payment attachment metadata UAT data setup for proof / QR test files.
2. Verify protected preview/download buttons against backend `accessStatus=allowed` metadata.
3. Keep fixing frontend details according to controlled UAT findings.
4. Add protected upload / metadata population workflow when business asks to upload real proof / QR files.
5. Enter a dedicated A6 staging deploy runbook Gate.
6. Enter a dedicated A7 final QA Gate.

## Recommended Immediate Sequence

1. Prepare safe local `file_metadata` UAT rows for Store Payment proof / QR attachments through a separately approved data setup Gate.
2. Validate that `/store-payment` buttons enable only when protected status returns `accessStatus=allowed`.
3. Require A2 review before treating preview/download as UAT-passed.
4. Keep `/uploads` and raw URL exposure forbidden.

## Do Not Auto-Start

- A3 protected streaming implementation.
- Production preview/download enablement without A2 review.
- A6 staging deployment.
- A7 final production GO.
- Push.
- Production DB writes.

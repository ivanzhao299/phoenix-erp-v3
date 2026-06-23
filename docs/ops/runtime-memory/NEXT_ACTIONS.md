# Next Actions

Last updated: 2026-06-23

1. Run Store Payment protected attachment UAT smoke on `/store-payment` with `FILE-SP-UAT-001`.
2. Verify QR preview/download buttons against backend `accessStatus=allowed` metadata.
3. Keep proof attachment missing/pending behavior fail-closed until a record proof UAT fixture is approved.
4. Add protected upload / metadata population workflow when business asks to upload real proof / QR files.
5. Enter a dedicated A6 staging deploy runbook Gate.
6. Enter a dedicated A7 final QA Gate.

## Recommended Immediate Sequence

1. Use `FILE-SP-UAT-001` to validate Store Payment QR protected preview/download in controlled UAT.
2. Validate that `/store-payment` buttons enable only when protected status returns `accessStatus=allowed`.
3. Require A2 review before treating preview/download as production-ready.
4. Keep `/uploads` and raw URL exposure forbidden.

## Do Not Auto-Start

- A3 protected streaming implementation.
- Production preview/download enablement without A2 review.
- A6 staging deployment.
- A7 final production GO.
- Push.
- Production DB writes.

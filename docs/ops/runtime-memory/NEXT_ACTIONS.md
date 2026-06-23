# Next Actions

Last updated: 2026-06-23

1. Prepare `STORE_PAYMENT_RECORD_PROOF_ATTACHMENT_UAT_FIXTURE` as a separate approval Gate.
2. Keep proof attachment missing/pending behavior fail-closed until a record proof UAT fixture is approved.
3. Enter a dedicated A6 staging deploy runbook Gate.
4. Enter a dedicated A7 final QA Gate.
5. Add protected upload / metadata population workflow when business asks to upload real proof / QR files.

## Recommended Immediate Sequence

1. Request approval for a record proof attachment UAT fixture if business wants to validate receipt proof preview/download.
2. Generate A6 staging deploy runbook without deploying.
3. Generate A7 final QA Gate without production GO.
4. Keep `/uploads` and raw URL exposure forbidden.

## Do Not Auto-Start

- A3 protected streaming implementation.
- Production preview/download enablement without A2 review.
- A6 staging deployment.
- A7 final production GO.
- Push.
- Production DB writes.

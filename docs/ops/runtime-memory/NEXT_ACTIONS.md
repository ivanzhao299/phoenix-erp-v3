# Next Actions

Last updated: 2026-06-23

1. Keep controlled Store Payment UAT smoke on `/store-payment`.
2. Fix frontend details according to controlled UAT findings.
3. Open a file metadata / ACL Gate before enabling real protected preview/download.
4. After file metadata / ACL is approved, run a follow-up A3 protected streaming implementation Gate.
5. Enter a dedicated A6 staging deploy runbook Gate.
6. Enter a dedicated A7 final QA Gate.

## Recommended Immediate Sequence

1. Keep `/store-payment` preview/download disabled.
2. Review file metadata / ACL design for uploaded attachments.
3. Decide whether to introduce protected attachment metadata before real streaming.
4. If approved, generate a single A3 implementation Gate for streaming.
5. Then let A4 enable frontend preview/download UI only after A2 GO.

## Do Not Auto-Start

- A3 protected streaming implementation.
- A4 protected preview/download UI enablement.
- A6 staging deployment.
- A7 final production GO.
- Push.
- Production DB writes.

# Next Actions

Last updated: 2026-06-23

1. Complete controlled Store Payment UAT smoke.
2. Fix frontend details according to controlled UAT findings.
3. Enter a dedicated A3 protected streaming Gate for proof / QR preview and download.
4. Enter a dedicated A6 staging deploy runbook Gate.
5. Enter a dedicated A7 final QA Gate.

## Recommended Immediate Sequence

1. Controlled UAT smoke on `/store-payment`.
2. A2 security check for frontend permission visibility and attachment disabled state.
3. A1 validation for Web typecheck, W5 gate, and UAT report completeness.
4. If UAT remains GO WITH CONDITIONS, request approval for the next single Gate.

## Do Not Auto-Start

- A3 protected streaming implementation.
- A6 staging deployment.
- A7 final production GO.
- Push.
- Production DB writes.

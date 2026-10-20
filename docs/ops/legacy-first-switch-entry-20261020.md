# Legacy API first-switch entry — 2026-10-20

The running API at `226878864f184d26f41a890e666ebed52547db14` returns HTTP404 for the modern background-control endpoint. The ordinary deployment supervisor cannot drain this executable. Stopping it before a separate executable release path exists would strand the release.

This change connects `deploy.yml` to a fixed legacy bootstrap and the existing seventeen-producer maintenance factory. A nonempty `maintenance_release_input` selects this path; the bootstrap independently requires exact API-only/HOLD scope, actual HTTP404, old floor and checkout, clean main, no unfinished transaction, a protected real owner instruction/window, exact source COMMENT and GitHub run/artifact binding, actual candidate image, target schema, zero migration-path difference, and original root/FD9. JSON supplies data only. The legacy path exits after the factory and cannot fall through into the ordinary deployment body.

Before FENCE/STOP, it checks source custody, reviewed host ownership, old compose/storage mounts, actual recovery archives (including layer bytes), notification external-send eligibility, and the separate old-auth UNKNOWN disposition. Recovery/control-child failures retain supervision and all incident records. The shared promotion/replacement validator rechecks the actual committed receipt chain and object-scoped authority; it never converts an UNKNOWN result to zero.

The owner confirmed on 2026-10-20 that the maintenance window ends at **04:00 UTC / 12:00 UTC+8**, and that only the old container's Chanjet credential-state reconciliation may be deferred. Chanjet remains HOLD false/false; there is no replay, business mutation, remote business write or sync permission. The protected instruction and scoped decision are populated with the final merged SHA and actual old runtime, separately from source review.

## Verification observed so far

- API and Web TypeScript checks: PASS using Node20 and the existing installed compiler. The local pnpm launcher resolved incompatible pnpm11; it was not used as a successful check.
- WMS and procurement DataScope source checks: PASS.
- Maintenance protocol/entry/source/authority regression: 793 PASS, 32 SKIPPED, 0 FAIL. Skips are explicitly gated integration fixtures; they are not release evidence.
- PostgreSQL identity tests: 30 PASS across PG16/PG18, including microsecond postmaster identity.
- New IoT local-state PostgreSQL tests: 10 PASS across PG16/PG18; unit tests retain baseline anomalies and reject new partial writes, deletion, unsupported mutation and malformed coverage.
- Workflow/floor/evidence/FD9 regressions: 53 PASS. Deployment script remains below the 20,000-byte input bound; actionlint PASS.
- Production read-only IoT query-budget check: 1,219ms, actual DB identity unchanged, 928 snapshots / 163 dictionary entries. Query receipt is archived outside Git; no production write or repair was performed.

**Full old-to-new factory acceptance, current exact-HEAD Required CI and production PRE/POST/startup/SUCCESS are not yet PASS.** They must be observed before a production success claim. Production has not been stopped, its floor has not changed, and no deployment was dispatched during this preparation.

The additional files in the standalone Chanjet audit bundle only close the existing verifier import graph after adding the scoped-authority validator. They do not execute or authorize a Chanjet operation. Web deployment, migration and Issue407 remain outside this release.

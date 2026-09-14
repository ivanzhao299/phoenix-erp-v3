# Local D1-C verification harness

No dotenv/production credentials or saved auth artifacts are used. `serve-local.cjs` creates a random process-only JWT secret, binds API 3100 to loopback and rejects other outbound connections. Fixtures and browser logins are created for each run. Physical printing is mocked and every generated test label is TEST/NON-BUSINESS.

Acceptance used a fresh `postgres:18-alpine` container (`server_version_num=180006`) publishing only `127.0.0.1:55432`, database `packaging_history_test`. Before using these commands, verify that the port belongs to the dedicated local container; never reuse a forwarded/production database. Migration entrypoints validate database identity and version, and `migrate.cjs` additionally requires an empty schema.

Fresh local schema reconstruction from the repository root:

```bash
node scripts/packaging-history-test/migrate.cjs
node scripts/packaging-history-test/bootstrap.cjs
node scripts/packaging-history-test/migrate-ts.cjs
```

The baseline comparison uses a different fresh container on loopback port55434 and `--baseline` on each script. It runs the same frozen SQL/bootstrap but excludes this feature's two new TS migrations (81 baseline versus 83 current). Entity differences are generated read-only, never applied. Do not treat zero pending migrations on a previously used DB as validation of a modified migration; create a fresh isolated container instead.

Start the full local API separately and then start Next dev in `apps/web` with `NODE_ENV=development API_TARGET=http://127.0.0.1:3100`, loopback port3000. The browser harness uses the existing runtime copied into `artifacts/packaging-history-local/browser-runtime` and local shared libraries under `browser-libs`; these are intentionally not committed. It needs no production browser session.

```bash
node scripts/packaging-history-test/serve-local.cjs
# In another local shell after API and Web are ready:
node scripts/packaging-history-test/verify.cjs
```

Optional positional names select command groups, e.g. `verify.cjs api-tsc pg-http`. Every attempt is appended to `verification-results.json`, logs get separate `-rN` filenames, and the runner exit reflects the groups actually run this invocation. Previous failures remain visible. The full run is intentionally nonzero while original runtime scope-audit or entity baseline gates remain red. Repository-ignored `.log` files stay local; JSON ledgers and hashes are committed without forcing ignored files.

The old API suite includes eight conditional PG cases that require a different fixture URL/name; they remain explicitly skipped in the recorded unit run. The new PG/HTTP suite is separately enabled with `PACKAGING_HISTORY_PG=1` and does not skip when run by this harness. No SQLite substitution, no global git/CLI change, no hook bypass.

Acceptance stopped its API/Web and dedicated containers, preserving volumes, logs and initial user artifacts. Logs record repeated failures as well as final passes; physical L4 and production L2 are not executed.


Restored-session acceptance uses `packaging-history-test-pg18-rebuild5`. Its fresh chain is 195 frozen SQL scripts, bootstrap diagnostics=0, and 83 TS migrations. `PackagingHistoryReadIndexes` adds query indexes and repairs the previously declared but missing WMS transfer `reason` column. Its down preserves that legacy column and data.

Run only one verification runner at a time. Each group captures current HEAD/tree, selected source/config file hashes, staged-diff hash and source dirty diff before/after execution. The current runner uses exclusive log creation and re-reads the ledger on append. Earlier exploratory concurrent runners had ledger/log collisions; those exploratory runs are not final acceptance evidence. No historical test revision is reconstructed retrospectively. Default verification excludes the three destructive-to-nonempty-schema reconstruction groups; fresh rebuilds are explicit only.

`performance` validates manifest identities, actual counts and result-state counts on every run. It uses 5001 original records, 5000 independent source chains, 10000 inventory rows and 10000 ledgers, 2000 synthetic legacy handovers, and 5000 candidate users. State mix: 1 registered PENDING, 1000 legacy COMMITTED, 1000 partial HANDOVER_ONLY and 3000 INVENTORY_ONLY. Other companies remain in the database as scope-hidden background. It invokes the real DataScopeService, full workflow detail with boxes/events, legacy committed workflow detail, list, report and candidate controller. Per operation: one initial read, 20 warm samples and five new datasource/service sessions; new-session timing excludes connection setup and does not claim a cold OS/PG disk cache. Tests are sequential with concurrency=1, and all first/P95/new-session maxima must be <=1000ms. `perf-plan` saves actual EXPLAIN ANALYZE/BUFFERS for list and report. Raw synthetic load seeding is not official WMS evolution evidence; official service evolution is a separate PG suite.

The final report separates direct PG assertions inside the HTTP suite from actual HTTP cases. Browser printing remains stubbed, so no physical Q/L4 evidence is produced. Original runtime scope and entity gates are executed unchanged and retain their nonzero exits. Current code on old schema and old-code/new-schema deployment drills remain release-review work until explicitly evidenced; default write flags do not make old-schema reads safe.

# Local D1-C verification harness

No dotenv/production credentials or saved auth artifacts are used. `serve-local.cjs` creates a random process-only JWT secret, binds API 3100 to loopback and rejects other outbound connections. Fixtures and browser logins are created for each run. Physical printing is mocked and every generated test label is TEST/NON-BUSINESS.

Acceptance used a fresh `postgres:18-alpine` container (`server_version_num=180006`) publishing only `127.0.0.1:55432`, database `packaging_history_test`. Before using these commands, verify that the port belongs to the dedicated local container; never reuse a forwarded/production database. Migration entrypoints validate database identity and version, and `migrate.cjs` additionally requires an empty schema.

Fresh local schema reconstruction from the repository root:

```bash
node scripts/packaging-history-test/migrate.cjs
node scripts/packaging-history-test/bootstrap.cjs
node scripts/packaging-history-test/migrate-ts.cjs
```

The baseline comparison uses a different fresh container on loopback port55434 and `--baseline` on each script. It runs the same frozen SQL/bootstrap but excludes only this feature's new TS migration. Entity differences are generated read-only, never applied. Do not treat zero pending migrations on a previously used DB as validation of a modified migration; create a fresh isolated container instead.

Start the full local API separately and then start Next dev in `apps/web` with `NODE_ENV=development API_TARGET=http://127.0.0.1:3100`, loopback port3000. The browser harness uses the existing runtime copied into `artifacts/packaging-history-local/browser-runtime` and local shared libraries under `browser-libs`; these are intentionally not committed. It needs no production browser session.

```bash
node scripts/packaging-history-test/serve-local.cjs
# In another local shell after API and Web are ready:
node scripts/packaging-history-test/verify.cjs
```

Optional positional names select command groups, e.g. `verify.cjs api-tsc pg-http`. Every attempt is appended to `verification-results.json`, logs get separate `-rN` filenames, and the runner exit reflects the groups actually run this invocation. Previous failures remain visible. The full run is intentionally nonzero while original runtime scope-audit or entity baseline gates remain red. Repository-ignored `.log` files stay local; JSON ledgers and hashes are committed without forcing ignored files.

The old API suite includes eight conditional PG cases that require a different fixture URL/name; they remain explicitly skipped in the recorded unit run. The new PG/HTTP suite is separately enabled with `PACKAGING_HISTORY_PG=1` and does not skip when run by this harness. No SQLite substitution, no global git/CLI change, no hook bypass.

Acceptance stopped its API/Web and dedicated containers, preserving volumes, logs and initial user artifacts. Logs record repeated failures as well as final passes; physical L4 and production L2 are not executed.

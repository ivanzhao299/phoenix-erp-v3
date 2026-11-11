# Legacy maintenance fixture execution identity and source provenance (2026-11-11)

## Scope and observed baseline

Read-only triage of PR524 run `42984109970` and main run `42816829494` found the same five failed jobs, not five unrelated infrastructure errors. Both used Ubuntu24.04.5 / hosted image `20261101.360.1`, not Ubuntu26.

- Pure protocol job: 25 failing subtests. One publisher projection test leaked its missing generation high-water dependency into the production state directory (`PATH_METADATA_UNAVAILABLE`). Twenty-four state-core cases called the production root guard from a reanchor branch despite an existing injected fixture guard (`ROOT_ACTIONS_IDENTITY_REQUIRED`). Their expected formal-completion assertions were never reached.
- Native PG16/18 jobs: already ran under `sudo env -i`, root-owned0700 controls and genuine FD9 flock. Both stopped before image/API/PG creation with an empty counterexample receipt. Native FD9 tests still expected an ancestor/parent descriptor and old exact error strings, while production correctly verifies the current process's descriptor/open-description ownership.
- Full first-switch PG16/18 jobs: real bootstrap refused `BOOTSTRAP_MIGRATION_PATH_CHANGED`. Actual226 -> current source genuinely includes changed migration paths. This is a successful deny by a production gate, not a UID error or permission to release.

Historical failures on main are baseline evidence only, never a release waiver.

## Minimal identity/dependency corrections

1. Publisher projection fixture supplies its own high-water reader/writer, checks the resulting generation3 and rejects an attempted regression to2. No production files are read or written.
2. The reanchor branch uses the existing `dependencies.guardProduction || guardProduction` seam. Production and CLI defaults still invoke the identical real guard. The state-core fixture checks the exact root/directory/runtime and `allowFloorReanchor`, target and previous-floor options. Real root/path/FD9 negative tests remain unchanged.
3. Native FD9 fixture explicitly inherits the original locked description as the child's own9. Separate counterexamples reject a missing own descriptor, another inode, and the same inode opened independently without owning the flock. A correctly locked ancestor without explicit inheritance does not grant authority. Fixed stage/type/errno diagnostics replace opaque failures; arbitrary exceptions are not accepted as negative-test success.

No changes to executionUid0, root-owned0700/0600 controls, production trusted paths, FD9 ownership checks, admission validators, production bootstrap migration checks or migrationScope are included.

## Full-fixture source semantics: two separately identified observations

The previous claim that a latest-source success could be an exact226-to-latest no-migration maintenance switch was incompatible with the existing migration gate. The revised exclusive-VM fixture records both:

### A. Actual226 rejection, not success

Build and run the exact actual226 application/image, observe its real HTTP404, and invoke the unmodified production `prepareMaintenanceRuntimeMaterials` against the target. Require the exact `BOOTSTRAP_MIGRATION_PATH_CHANGED` denial. Snapshot all existing private-state entries, metadata and content hashes before/after, require no changes, and require no floor/active/transaction/maintenance authority markers to exist. Export `actual226-migration-rejection.json` with `EXPECTED_HOLD`, the actual old image/container/target pins, `productionAdmitted:false` and `formalSuccess:false`.

If any protected state changes or any other error occurs, the fixture stops. It never deletes markers to manufacture a later success.

### B. Explicit synthetic no-migration legacy success candidate

Use Git plumbing with a private alternate index in the disposable clone:

- Create a new old commit whose **only direct parent is actual226**. Replace the **complete** fixed MIGRATION_PATHS inventory with target-source entries, including absence/deletion semantics. All other Git bytes/modes remain226 **except the single explicitly validated `COMPOSE_CONTROL_MOUNT_OVERLAY` described below**; application and dependency bytes outside migration paths stay unchanged.
- Create a target merge commit with both this derived-old commit and the reviewed sourceHead as parents. Its tree remains sourceHead's exact tree except the documented fixture Compose overlay. Both ancestry checks therefore remain real Git checks.
- Validate every migration inventory entry and per-path tree/blob hash, the exact parent, unchanged package manifest/lock and unchanged non-migration application source. The sole Compose exception inserts exactly one bind: source `/var/lib/phoenix-background-control`, target `/run/phoenix-background-control`, `read_only:true`, `bind.create_host_path:false`. The resulting file must equal actual226 bytes plus that literal insertion; wrong source/target, read-write, host-path creation, extra mounts, or any environment/port/existing-volume change is rejected. The original tracked mode is also mandatory. Record `COMPOSE_CONTROL_MOUNT_OVERLAY`, before/after Git blob hashes and SHA256 hashes, and the one-entry structural addition with no removals/modifications. Missing migrations, changed app files, extra parents, foreign bases or non-ancestor targets are rejected.
- Actually compile/build the derived old revision and pin that **new SHA** in image labels, runtime, floor and all admission bindings. Never relabel the unchanged exact226 image as synthetic. Archived dependency validation still runs.
- Export provenance `SYNTHETIC_LEGACY_MIGRATION_ALIGNED`, `applicationBase=226878864f184d26f41a890e666ebed52547db14`, `newOldSha`, target/source SHAs, all tree hashes, `exactLegacySuccess:false` and `productionReceipt:false`. The job name explicitly says **Synthetic Migration-Aligned Legacy First Switch**.

Only after observation A has left no protected state does the fixture stop/recreate its owned old container with the separately built synthetic image and initialize its new fixture floor. This does not admit any production migration-bearing switch. The real production migration gate is never injected, modified or bypassed.

## Follow-up from real hosted run43016971406

The real Node20/root CI passed both native PG16/18 collectors and the pure legacy job. Both synthetic full jobs advanced through `LEGACY_RECONCILED/FENCED` with eight receipts, then correctly stopped in `PREPARE_PROMOTION`: `sessionIncident.fatal=CONFIG_HOLD=BACKGROUND_CONTROL_MOUNT`. The fatal detail showed only the uploads bind in the installed old Compose. This was not UID, FD9 or migration failure. Both actual226 negative receipts retained `EXPECTED_HOLD=BOOTSTRAP_MIGRATION_PATH_CHANGED`, unchanged protected state, and no formal/production admission.

The prior synthetic tree's blanket non-migration226 identity preserved a Compose file that could not satisfy the unchanged modern reanchor guard. The explicitly authorized fixture-only control-mount insertion above corrects that infrastructure precondition, without changing application behavior or loosening a production guard. Exact actual226 image/Compose remain untouched for the independent negative observation. The positive synthetic container must additionally prove the real Docker mount is the one fixed bind and is read-only. Diagnostics now preserve the actual incident fatal/stage separately from an outer lifecycle/cleanup wrapper error, rather than leaving only `FIXTURE_UNVERIFIED_FAILURE` in the console.

Local follow-up evidence on Node20.20.2: focused fixture/source tests **26/26 passed**; complete legacy plus trusted-paths regression **1016 tests, 983 passed, 0 failed, 33 existing environment-gated skips**; the actual synthetic Git archive compiled successfully. Offline `docker compose config` rendering (no daemon/root/production operation) reproduced actual226's `BACKGROUND_CONTROL_MOUNT` rejection and showed the new literal overlay passing the **unchanged production `validateEffectiveConfig`**. This is not a full-fixture PASS claim; its next hosted CI run must execute the positive path again.

## Verification and limits

- Local Node20.20.2: complete CI pure legacy protocol/authority command plus the new source/provenance and production-trusted-paths tests: **1013 tests, 980 passed, 0 failed, 33 existing environment-gated skips**. Local real flock/FD9 positive, missing descriptor, independent unlocked description and non-inheriting-child observations passed without root. The environment-gated root/Docker tests remain required in their dedicated CI jobs; the local skip count is not their execution evidence.
- Node20 source/provenance tests exercise real isolated Git objects and strict negative cases. Full fixture syntax and shell syntax are checked.
- The actual synthetic archive derived from the current committed source was compiled with the production TypeScript configuration and current archived dependency closure, without Docker or production access. Migration imports inspected during this change use only TypeORM; no application runtime closure substitution was needed.
- Local UID1000 is not the exclusive hosted root VM. The Docker/root/native/full-factory PG16/18 experiments were **not** claimed as locally executed or passing. The new CI run must execute them; future reachable failures remain blocking until diagnosed.
- The first broad test run under Node24 hit three pre-existing explicit Node20-baseline assertions. Re-running on Node20 passed; no test was skipped or weakened to accommodate Node24.

## Runner boundary

Keep the existing fixed script/Node invocation, `sudo /usr/bin/env -i` allowlist, root-owned0700 temporary state, immutable fixed artifact allowlist, and0600 export copies owned by the runner. Do not use `sudo -E`, production secrets/environments, recursive permission widening, altered production paths/contracts, test skips or migration exceptions. The added source/provenance JSON exports contain only fixed non-secret fixture metadata.

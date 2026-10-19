# Exact old API startup dependency

The CI-only capsule can archive and compile the actual API Git objects at
226878864f184d26f41a890e666ebed52547db14. It does not relabel the current
candidate as the old API. A separate legacy startup observer does not call
the new background status/fence protocol or claim that protocol existed in
the old runtime. This component does not install the17-producer factory.

The planner requires complete old/current commit identities and actual ancestry,
rejects grafted history, ignores Git replace objects, and requires equal API
package/TypeScript build-control blobs. It compares the API importer and the
entire package/snapshot lock maps, allowing only unrelated importer differences.
The planner and capsule share the exact tree-summary encoding. This is a static
dependency contract, not certification of the existing installed dependencies.
Compilation and the dependency capsule still use the explicitly recorded local
API installation. Installed-dependency/content certification remains NOT_RUN;
the emitted plan alone reports buildExecuted=false and runtimeStartup=NOT_RUN.

Loaded planner/capsule/helper source digests are checked before/after use.
The Dockerfile is copied into the private context; the actual copy is passed to
Docker and its digest recorded alongside the generated preload. These checks
assume a trusted supervisor, not a malicious root/same-UID source adversary.
Only selected API source and filtered runtime dependencies enter the image;
host environment files, keys, test trees and full checkout mounts are excluded.

The fixed old API image runs on an owned internal network with loopback-only
published ports, a read-only root filesystem and UID1000. The only database
role available to this API has SELECT privileges and defaults to read-only
transactions. Provider credentials are synthetic; external network attempts
are rejected by the preload and the isolated network. Only HOLD/false/false
policy fields are read back; no credential values are exported. API readiness
and absence of the new background-status endpoint are actual HTTP observations.
Schema/data/sequence fingerprints and captured SQL classifications are retained.
These prove a bounded startup observation, not complete business schema coverage,
scheduler safety, five-domain reconciliation or an old-runtime drain.

Container creation has a durable named CREATE_OUTCOME_UNVERIFIED intent before
the effect, records the returned full ID before owner verification, and only
then marks OWNED_ID_VERIFIED. Failure retains the original identities and HOLD;
an unverified resource receives no signal. API and PG shutdown each use one
SIGTERM to the original verified full ID and bounded polling, without automatic
SIGKILL, retries, deletion or claims of cleanup on an unknown path. API exit143
is explicitly accepted for this old runtime. Its PostgreSQL application sessions
must actually disappear. Containers/images/networks are retained as evidence.

The network event artifact is explicitly a PRE_STOP_PREFIX, not a complete
shutdown network trace. API stdout/stderr is privately captured after stop;
only its digest is suitable for the fixed JSON evidence artifact. No instantaneous
quiet sample, healthy readiness response or final unchanged fingerprint is a
proof of old background task completion. SchedulingSafety remains NOT_PROVED,
legacyDrainResult remains UNSUPPORTED and productionReceipt remains false.

An initial local startup failed with EACCES opening fixture-preload.cjs under
supervisor umask077. The API exited1 and its original PG exited0 after one
SIGTERM; both are retained. The fixture Dockerfile now adds read/traverse
permissions only to the four image payload paths. Host evidence stays private
and the runtime filesystem stays read-only. That failed run is not a PASS.

Local source tests:26 targeted PASS. Combined621 PASS/27 SKIP covers the latest startup/stop budget wiring. Actual corrected
PG16/PG18 build/start and exact-HEAD hosted CI require separate run receipts.
The fixed entry is LEGACY_PG_MAJOR=16(or18) with Node20 executing
scripts/ci/maintenance-legacy-api.fixture.mjs. It grants no production entry,
deployment, floor, migration, Web or Chanjet operation.

A subsequent real old API became healthy(readiness200/control404) but its
observer returned HOLD without preserving a failure reason or prior stop count.
That result remains HOLD. Docker history could not recover the signal count.
Separately, an owned real Node child regression reproduced that the fixture
preload SIGTERM listener swallowed default old Node termination; the original
test failed by deadline. Removing that listener makes the same regression PASS.
This does not establish the unique cause of the older observer HOLD. The old
isolated RO API was subject to explicitly recorded fault-only recovery, not
claimed graceful shutdown or successful drain.

Legacy creation, stop intent/signal/outcome and before/after fingerprints now
survive later generic resource records. Failure diagnostics stay private and
cannot prevent the HOLD/debt record. Stop acceptance uses a decreasing monotonic
budget, rejects clock faults, passes remaining time to each synchronous command
and rechecks before success. Kernel scheduling cannot guarantee physical return
by a wall-clock instant; late completion is rejected rather than accepted. The
signal regression has a bounded original-child close join, including fault-only
cleanup. No production runtime behavior or deadline is modified.

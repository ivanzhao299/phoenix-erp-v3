# Real ERP and PG correlation across actual receipt phases

The pure cross-phase lease tests use a real receipt store with synthetic PG and
Docker observations. This isolated fixture adds actual source-built ERP, its
original control connection, an original root Docker/psql client, independent
PG catalog reads, and actual local receipt/archive files in the same scenario.
The runtime/API/DB identities and real clock are determined before every
context, approval, recovery, replacement and candidate digest is generated.

A numeric fixture owner is shared by owned labels, public manifest and context.
The fixture image has an actual readiness-based healthcheck; Docker health is
not invented from a boolean. Source image/API code remains the real ERP build.
The real START intent encloses the single original root acquisition. CF steady,
VERIFY in flight, committed VF and actual private OPEN_PENDING observations
compare original root identity and locks, actual API status/boot/control tuple,
independent raw PG identity and before/after archive anchors. The root is never
reacquired. A local protocol SUCCESS refuses further fenced anchors while the
actual public candidate remains FENCED; no real business OPEN is performed.

The test rejects a microsecond identity mismatch and held-root reuse after
release. Final cleanup independently proves the original backend/locks gone,
actual child close and the API control backend still alive. Synthetic business
data/schema/sequence fingerprints must remain identical. Failures preserve a
FAIL evidence file and owned resource identities. Only owned fixture resources
can be inspected or cleaned up, using the existing bounded cleanup protocol.

Scope is deliberately narrower than the full candidate lease collector. The
strict full collector itself is not exercised positively in this matrix. The
fixed Compose/storage/public-path contract and production FD9 are NOT_RUN.
Historical old API/Web PRE, replacement lifecycle, floor, authority, recovery
and formal success are explicitly synthetic test materials. Actual local
protocol success is never a production receipt or real floor promotion.
Continuous ingress, full persistent ownership and the 17-producer factory
remain unproved. No fake Docker inspection rows or production-path bypasses
are introduced. A separate owned Compose/storage fixture is still required
for full collector phase acceptance.

Initial local Node20 pure builder/transition/control tests: 94 PASS. Actual
PG16/18 execution is pending and must be recorded separately with exact source
SHA, fixture script and API image identities. No production operation, workflow
dispatch, database write, Web release or Chanjet activity is performed here.

Independent read-only review identified and closed two evidence/stability
issues before final acceptance. Normal control heartbeat queries are sampled
with a bounded monotonic deadline until they actually settle; poison, identity
change and work graphs are rejected immediately, and the final accepted status
still compares all fields. Actual owned protocol files are retained verbatim
with a SHA256 manifest, explicit synthetic-authority scope and a dedicated CI
artifact path. Symlinks and unowned paths are refused; archive failure is FAIL.
The reviewer found no new P0/P1 and did not execute tests. An earlier af2b2bf2
prototype run lacks these final changes and is retained only as old-source
diagnostic evidence; final-source PG results must be obtained afresh.

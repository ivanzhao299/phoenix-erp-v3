# Actual ERP and original root control binding fixture

The existing source-built ERP fixture verified the API's original control
connection against PostgreSQL. The separate root transport fixture used a
synthetic candidate peer. This change joins the actual ERP control connection,
the original `RootControlLease` child and independent PostgreSQL catalog reads
in the same owned PG16/PG18 fixture.

## Assertions and evidence

For each major version the fixture checks six cases:

1. Exact database/container identity, distinct root/API backends, original raw
   six-digit microsecond start times and both exclusive root locks.
2. A candidate timestamp differing by exactly one microsecond is rejected.
3. An actual HTTP admission is denied while the same original root lease stays
   held. Independent catalog samples retain both original backend identities.
4. Root EOF is followed by its server backend/locks disappearing, while the
   real ERP's original control connection remains present.
5. The old HELD expectation cannot pass after that release.
6. Termination of only the owned API's exact control backend causes poison and
   denied HTTP admission, without reconnection, API replacement or restart.

`pg*-actual-erp-root-binding.json` retains independent raw catalog observations,
root observations/release and original local child PIDs/close settlement.
Failure to close the root client does not skip local child cleanup: EOF and a
bounded local signal/wait are attempted, but any timeout or missing server-gone
proof fails the fixture. Detailed cleanup debt is stored in a separate immutable
0600 artifact, so an outer failure handler cannot overwrite it. Pure tests
exercise failure settlement, evidence persistence and fault-shutdown refusal.

PG readiness requires both a healthy server and final PostgreSQL PID 1, excluding
the temporary initialization server. Networks use the existing reserved fixture
subnet selector against Docker IPv4 IPAM and local host routes. Creation races
fail; no unrelated networks are removed. Actual internal/subnet/IPv6 settings
are verified. This local route inventory is not a production topology proof.

## Proof boundary

The ERP image, Docker/API I/O, original root child and PG catalog are real owned
isolation resources. Historical PRE, maintenance store and authority remain
explicit test material. This test does **not** invoke the full
`collectCandidateServerBinding`, install a producer registry, prove production
storage/FD9, provide an atomic cross-process snapshot or establish continuous
legacy drain/ingress isolation. All release/admission proof flags remain false.

The existing real startup/Cron-minute/mutation-canary and FENCED→OPEN→FENCED
tests remain in place and continue requiring normal exit 0. The new destructive
connection-loss probe uses a third, separate candidate after those normal
instances stop. Its first SIGTERM must produce a new real
`BACKGROUND_SHUTDOWN_HOLD` log, the same boot/control identity, continued HOLD
and HTTP 503. Only then is the owner-verified original container explicitly
SIGKILLed for fixture teardown. Exit 137 is recorded as forced/HOLD/UNSUPPORTED,
never successful drain. Overall fixture PASS verifies the expected fault, not
release readiness. Missing/stale HOLD, identity drift, admission recovery, OOM
or unsettled root children fail. The success artifact is written after teardown.
Both signals validate their original runtime and current boot/control identity
before sending; action-level negative tests verify no signal is sent after drift.
Local child settlement does not mean all outer fixture images, containers
or networks were deleted; the enclosing fixture retains its existing explicit
resource ledger.

## Validation

Final local protocol run: 325 PASS / 12 SKIP. Independent source review closed
cleanup findings before submission. The initial local actual-image attempt
failed creating a default Docker network; its result is FAIL, not inherited
PASS. The first hosted run 39135505513 verified six PG16 binding probes but then
failed because it incorrectly applied normal exit-0 semantics to the intentionally
poisoned instance. That run remains FAIL. Independent review confirmed the
separate normal-exit and expected-fault contract above; application shutdown
semantics are unchanged. The final exact PR revision must execute the hosted real ERP step and
retain both major-version joint-binding receipts before acceptance. Source and
production acceptance are separate; no production operation is authorized by
this fixture.

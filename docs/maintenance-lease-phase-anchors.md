# Committed maintenance phase anchors

Candidate lease observations need to span committed START, VERIFY and the
private OPEN_COMMIT_PENDING projection. Existing candidate observation admits
only the operation phases it was originally designed for. Expanding that phase
allowlist or reconstructing a historical state from receipt timestamps would
lose the actual authorization anchor.

MaintenanceReceiptStore now exposes a read-only phase-anchor reader. It loads
actual trusted owner/state/receipt files, requires exact caller state and root
START-source digests, and verifies archived START and VERIFY operation intents
with a closed field list including operation/from/to/owner/context/previous
state digest. CANDIDATE_FENCED uses the real state digest. VERIFIED_FENCED uses
its committed VERIFY archive's original candidate digest. OPEN_PENDING first
uses the existing strict owned private projection and then verifies the actual
prior VF archive. It never rebuilds historical timestamps. State and active
intent are re-read at the end to reject mixed observation generations.

This is an anchor primitive, not a live lease or authority verifier. The caller
must obtain replacementStateDigest from a genuine RootControlLease and compare
full anchors before/after actual independent PG/Docker/runtime observations.
Passing a string alone does not prove a root lease. Composite observation,
monitor commit barriers and the full 17-producer production factory are still
separate incomplete integrations. The production collector's phase allowlist,
root lock lifetime/cleanup and default-deny registry are unchanged. This patch
cannot enable a deployment or produce continuous drain proof.

Local Node 20 tests: 47 targeted receipt/transition PASS; complete maintenance
protocol suite 312 PASS / 12 explicitly SKIPPED. Positive tests use the real
transition engine and actual trusted local receipt files/archives with injected
fixture authority/evidence adapters. They cover stable CF, VERIFY in flight,
committed VF, exact private OPEN_PENDING, successful OPEN refusal, distinct
receipt/state timestamps, wrong source/current digest, all START identity and
transition fields, missing/wrong VERIFY archives, active stale operations,
duplicate receipt chains, state or intent changes during observation and a
rehashed substituted historical VF projection. No live Docker/PG or production
claim is made by these pure file protocol tests. Independent source review
found no new P0/P1; the remaining genuine-root/composite/monitor requirements
are retained above.

The existing protected receipts file remains in criticalFiles. No pin is removed,
no approval, workflow rule or environment is fabricated, and no production
state, service, database or Chanjet operation is performed. Future integration
and release need a newly frozen final main and fresh live evidence.

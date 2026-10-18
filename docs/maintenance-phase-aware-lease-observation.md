# Cross-phase candidate lease observations

A candidate remains fenced while the transition commits START, VERIFY and the
private OPEN_COMMIT_PENDING projection. The root control lease stays bound to
the original replacement state and the public adoption manifest stays bound
to the original candidate state. Using the latest state digest for all three
would confuse distinct authorizations.

collectCandidateLeaseBinding is a separate read-only entry point. It takes the
replacement digest only from a genuine RootControlLease, obtains the actual
committed phase anchor from trusted receipt files, and retains the current
private state digest separately from the candidate authorization digest. It
revalidates the entire anchor at each state read and after both root probes.
The existing operation-specific collectCandidateServerBinding retains its
original START/VERIFY intent contract. Request JSON cannot select or override
the internal phase policy.

The new entry accepts steady CANDIDATE_FENCED PRE observations anchored by the
actual START archive, exact VERIFY PRE/ADOPTED observations, committed
VERIFIED_FENCED ADOPTED observations, and the strict actual private
OPEN_COMMIT_PENDING projection before public OPEN. An adopted CF still needs
the actual VERIFY intent. VF/private OPEN refuse PRE. Public OPEN and a final
SUCCESS state cannot supply fenced lease proof. Root replacement, current
state and adoption authorization digests are never substituted for each other.

Both entry points share the existing bounded monotonic deadline, original
root-before/root-after checks, exact Docker/runtime/storage checks, candidate
status and PG raw microsecond/backend/lock identity comparison, and private
projection checks. The new result has its own observation schema, actual
phase anchor and its hash. It writes no state and acquires/closes no lease.
It remains OBSERVATION_ONLY, with registryInstalled, continuousDrainProof,
continuousIngressProof and persistentOwnershipComplete all false.

Local Node 20 verification: 56 original binding tests, 39 real receipt-chain
transition tests and 16 new phase tests, 111 PASS. Full maintenance protocol
suite: 339 PASS / 12 explicitly SKIPPED. The reusable transition fixture was
extracted without changing the existing 39 test scenarios. New tests use real
trusted local state/archive files, the actual transition engine, and a genuine
RootControlLease class owning an isolated Node protocol responder. Authority,
Docker, storage and PG observations are synthetic. No actual PostgreSQL
new-phase matrix was run; these results do not prove live PG/runtime binding.

Positive and negative cases cover CF/VERIFY/VF/private OPEN/SUCCESS, genuine
root binding, immutable CF adoption authorization, archive/intent changes during
probes including exactly at root-after, raw PG timestamp and missing root lock,
mount/storage/private drift, the shared deadline and refused public OPEN.
Fixture construction failures close the original owned responder. Independent
read-only review found no new P0/P1 after the added root-after and drift tests;
the reviewer did not independently execute tests.

Remaining engineering includes an actual PG16/18 cross-phase matrix, the real
composite session facade and supervised monitor integration, and the full
17-producer production factory. This patch does not provide a candidate-control
lease envelope, continuous ingress/drain proof, recovery closure, production
authority, or deployment admission. Those must use real observations and
server-backed approval, not always-true fixture callbacks.

No production action, floor promotion, database operation, Web release or
Chanjet activity occurred. A newly frozen final main and fresh actual-target
production evidence are still required before any release.

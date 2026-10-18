# Original-root observation lifecycle

This component tracks one already-held genuine RootControlLease, its saved
control session/child and its pending candidate-binding observations. It never
acquires another root, opens ingress, writes formal receipts or produces
CANDIDATE_CONTROL_LEASE. The17-producer production factory stays uninstalled.

The private WeakSet prevents two instances of this wrapper from claiming the
same root. It does not revoke raw-root aliases, and is not an exclusive
capability-transfer proof. The compiled factory must still own and supervise
all resources and independently prove continuous ingress/executor coverage.

Every observation uses the existing phase-aware binding collector. Original
child/session references are checked before/after. First accepted runtime,
boot, microsecond control identity, database binding, floor contract and real CF
anchor are pinned; genuine CF→VF transitions may change current state digests,
while candidate identity and original authorization anchor remain fixed.
ADOPTED cannot downgrade to PRE_ADOPTION. Caller mutations cannot redirect an
already captured request. No request URL, program or approval flag is accepted.

A failed/aborted/timed-out/concurrent observation permanently poisons this
component and aborts outstanding reads. Actual work settlement alone removes
read debt. A losing timeout Promise does not remove pending work or permit
closing the root beneath a still-running observer.

close is one-shot/memoized: deny new observations, abort and join pending reads,
then use the original root's real close to wait for actual child stdio close
and independent server backend/lock absence. The same outer wall/monotonic
budget also races an already cached raw-root close Promise. A short wrapper
budget cannot silently adopt another caller's long cleanup timeout.
Unsettled root close remains recorded as PENDING, then at most
SETTLED_RESULT_UNVERIFIED on late completion. An expired close stays cached
MANUAL_RECOVERY_REQUIRED and cannot recover into a late successful receipt.
cleanupDebt is diagnostic bookkeeping, never a quiescence or release proof.
Even a successful scoped close says all other owned children NOT_EVALUATED.

Default binding reads still use synchronous native helpers and require an
outer registered process supervisor. The wrapper does not turn an observation
into a continuously enforced fence, complete pending-task inventory, persistent
ownership, production authorization or installed registry. Full real
PG/API/Compose/storage/FD9 integration for this wrapper is NOT_RUN.

Tests reuse a shared owned Node responder and actual local private protocol
archives, with explicitly synthetic PG/Docker/catalog/authority. They exercise
steady and committed phase changes, alias-induced concurrent close, ignored
abort/timeout debt, rawUS/boot/runtime/database/floor/anchor drift, duplicate and
concurrent use, child EOF, mutable requests and cleanup deadlines. These tests
do not claim real PG or production drain proof.

Failure history: initial24 cases had23PASS/1FAIL because cleanup errors reused
the first observation timeout code. Cleanup now reports an explicit manual
recovery failure while keeping the original observation poison. The next
combined run39PASS/1FAIL encountered the existing phase clock test exhausting
its real10ms Node-I/O budget before the injected Docker-clock boundary. That
fixture now has1000ms for real I/O and explicitly advances its fake monotonic
clock to1001ms on the first Docker observation; the exact deadline/error and
one-I/O assertions remain. Production deadline code was unchanged.

Independent review identified the cached-root-close outer-budget P1 described
above. It is covered by a real owned Node EOF hold, raw close5000ms, wrapper
close10ms, retained pending root task and permanent rejection of late success.
A shared-fixture constructor cleanup P2 now bounds its EOF wait and, if needed,
only signals the exact locally spawned responder (which has no descendants).
No arbitrary host or production process is signalled.

Final test/CI receipts must bind the committed exact source. This document
alone is not a completed source review or production release receipt.

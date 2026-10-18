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

The official isolated workflow now runs the original-root scoped close on actual PG16/PG18. It pins the tracked source/tree/helper blobs before/after, archives actual HELD and RELEASED catalog rows and an additional backend count, and requires successful cleanup before final PASS. This does not execute candidate.observe or prove actual API/Compose/storage/FD9/full lease. Fixture/setup, cleanup or deadline failures fail the Node test process. Earlier standalone prototype failures and unpinned diagnostic passes are retained separately. New exact-HEAD CI receipts are required.

Native CI review also requires pre-recorded create-attempt/name debt when a Docker creation result is unknown, actual child-close registration retained even on failure, and a post-persistence deadline check. A JSON PASS alone is insufficient: the exact hosted run/test outcome must also succeed. Unknown owned creation is recorded for recovery, never called settled.

A static ops import inventory exposed four unprotected transitive modules: root lease, candidate binding, candidate database and database observer. All four are now floor-critical. A TypeScript-AST regression test traverses static/literal local ESM imports from protected ops entrypoints and detects a removed dependency without changing its bytes. Before pins:1PASS/1FAIL naming exactly these four; after pins requires2PASS. It does NOT evaluate nonliteral installed-guard/dist imports, CommonJS require, native/file access or full recovery closure; those remain separate UNKNOWN/manual-review work, never silently accepted as full recovery. Initial scanner prototypes conservatively rejected legacy nonliteral installed-guard loading and were not used as passing evidence.

A parser review P2 added fixed-path coverage for dynamic imports with an options/attributes argument and for no-substitution template literals. Both have missing-pin counterexamples. Nonliteral path expressions remain explicitly outside this static/literal module check.

## Owned health reads

`observeHealth({expectedStateDigest, signal, timeoutMs})` uses the existing fixed
health/startup collector after an accepted ADOPTED binding. Caller requests
cannot supply a URL, program, replacement, root or collector. Default health
binding reads verify the captured original root/session/child and the same
candidate/runtime/database/floor pin as the preceding adopted observation.
The health operation is limited to the existing CF + owned VERIFY intent; later
committed phases still use phase-aware binding observations.

Binding and health observations share one pending ledger and deadline. Concurrent
reads permanently refuse the owner. Timeout/abort does not remove an unfinished
read, and close waits for actual settlement before releasing the original root.
A late success cannot erase a prior failure. Health output remains observation
only and retains `outerProcessSupervisionRequired:true`; registering a Promise
is not native child supervision, formal deployment completion, ingress proof or
an installed producer factory.

The composition regression uses a real locally owned Node control child and
actual private receipt persistence, with synthetic Docker/HTTP/PG catalog/logs.
It exposed an independent comparison bug: immutable storage canonicalizes object
keys, while the deployment verifier compared mount JSON insertion order. Mount
comparison now sorts object keys only, preserving array order, every field and
all values. Tests prove canonical PRE succeeds while changed source, destination
or read-only flags still fail in API/Web/full modes. Runtime identity checks and
mode-specific deployment contracts are unchanged.

Native default health/Web HTTP integration and a complete candidate lease remain
NOT_RUN. Production authority, continuous ingress and all17 producers remain
uninstalled/default-denied. These tests cannot be used as production acceptance.

Current local composition checks:91 targeted PASS/0SKIP;486 general PASS/27SKIP.
Before the mount correction, the new canonical-PRE cases failed in all3 modes;
before dependency setup, the broad run also failed to resolve TypeScript for the
existing import-closure test. Neither prior result is accepted as a pass.
The current source still requires independent review and official CI.

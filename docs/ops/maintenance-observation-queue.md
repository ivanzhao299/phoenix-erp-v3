# Original-root observation scheduling

The release monitor and main flow must not concurrently enter the original-root
binding/health observer: that observer intentionally poisons concurrent reads.
`OwnedCandidateObservationQueue` supplies one bounded FIFO for a uniquely owned
observer. A compiled factory must route every binding and health request through
it and serialize actual adoption/phase changes with the existing session phase
barriers. The raw observer's concurrency refusal remains unchanged.

Every queued request captures fixed state digest/mode primitives. There is no
result cache or coalescing across any phase. Queue waiting consumes the original
wall/monotonic deadline; dispatch passes only the remaining budget. A failed,
expired or aborted read poisons the queue before its serialization tail permits
another read. At most64 calls may be pending; saturation refuses and aborts all
admissions. Source/identity/phase validation still belongs to the original
observer and its real collectors; scheduling creates no authority.

Close refuses new work, cancels queued requests and joins pending queue methods,
then invokes the original observer's close with the remaining cleanup budget.
An observer method can reject while an abort-ignoring native collector is still
running. That inner debt stays visible in the observer's ledger and prevents
early original-root release. Unknown cleanup is sticky and cannot be retried
through a replacement queue. All other resource/child ownership remains outside
this scoped receipt. Synchronous stuck syscalls still require outer supervision.

Tests use an actual owned Node root child and actual private phase files, with
synthetic Docker/PG/authority observations and a separately labelled synthetic
health response. They cover FIFO contention, queue-inclusive budgets, actual
timer expiry, capacity, abort-ignoring debt, close/join, phase drift, mutable
requests, adoption downgrade and clock rollback. They are not native PostgreSQL,
health collector, continuous ingress, complete lease or production acceptance.

This module is added to the criticalFiles contract; no protected path is removed.
The production registry remains uninstalled/default-denied. A full17-producer
factory still needs actual continuous ingress/executor evidence, independent
authority/evidence verification, supervised health, typed writer assembly and
one continuous isolated release. This queue alone cannot publish OPEN or deploy.

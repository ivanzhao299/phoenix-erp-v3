# Monitor barriers around maintenance phase commits

The session monitor could observe a phase while the engine was committing its
next authorization state. Stopping monitoring only inside the OPEN adapter was
too late: private OPEN_COMMIT_PENDING was already durable by then.

VERIFY now pauses after all candidate/formal evidence checks and before its
adapter returns to the engine. A private barrier captures the original lease,
exact state and full owned VERIFY intent. Stopping monitoring invalidates the
old interval generation, waits for its actual registered probe, and rechecks
window/fatal/child/session/lease/state/intent before allowing the commit.
After the engine commits VF and archives the original intent, the session
checks its receipt prefix and exact archive, verifies the new-phase lease and
re-reads state/marker before resuming one interval. Changed or unknown evidence
refuses recovery; a forged token cannot resume monitoring.

OPEN pauses and joins while still in stable VF, before engine.complete can
write its private projection. The adapter requires this same original barrier
and strict real OPEN projection. Monitoring stays off after public OPEN. The
original control child fatal listeners and lease remain owned throughout;
there is no close/reacquire, grant expansion or interval-based drain claim.
Timeout/unknown work retains the existing HOLD/manual recovery protocol.

Node 20 validation: 45 targeted session tests PASS; complete maintenance suite
323 PASS/12 explicitly SKIPPED. Existing protocol tests remain included. New
cases cover pending probe settlement before commit, timeout, fatal loss,
window expiry, failed new-phase lease, concurrent state/marker replacement,
original VERIFY intent replacement, duplicate start/forged resume and an old
interval callback triggered while a newer interval exists. Tests use local
trusted files/real engine with fixture lease/producers; pending monitor tasks
and fault events are injected. They do not prove actual composite lease,
production root control or live ingress/drain. An intermediate missing fs import
was caught by tests, corrected and the failing log retained; it is not PASS.
Independent source review found no new P0/P1 after the race checks were added.

The actual composite observer and full 17-producer factory are still uninstalled.
If the real lease cannot verify VF or OPEN_PENDING, the session HOLDs. This
barrier does not widen the production collector phase allowlist or manufacture
runtime evidence. Existing protected files remain pinned; no production state,
API/Web/DB service, approval rule or Chanjet policy is changed. Hosted exact-HEAD
CI and delegated review are required before source merge, and all fresh live
admission plus the explicitly confirmed maintenance window before deployment.

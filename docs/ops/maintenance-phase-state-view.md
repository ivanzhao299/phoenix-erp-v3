# Candidate phase/state read boundary

Merged source92bfc683 passed its PR native10s collector gate but failed the
independent push run39175715189 attempt1 onPG18. That run completed two earlier
observations, then rejected the committed VF collector with DEADLINE_OR_ABORT
(23:17:42.327Z to23:17:53.169Z). PG16 passed. The failure and verified original-root
cleanup are retained. Main is not accepted; no failed job is retried or timeout
raised. These results do not attribute all elapsed time to a particular reader.

Each lease collector state boundary previously read a complete owned state and
then immediately re-read the same complete state inside its phase-anchor reader,
without an intervening asynchronous operation. The fixed readCandidateLeaseState
now returns actual state plus its anchor from the same private validated phase
view. The original phase-anchor API delegates to that same implementation.
Valid two-digest requests retain the original anchor result shape. Its request
contract is intentionally stricter: unknown fields are refused, and the whole
method now has a default/max10s budget rather than an unbounded anchor wrapper.

The initial private batch validates owner and the complete state/receipt chain
together. A fresh ending owned state, actual marker equality, immutable START/
VERIFY archive checks and the final current-owner check remain. State, context,
timestamps, chain order, pending intent and original CR/CF authorization are not
reconstructed from caller payloads. The collector retains all three separate
state/anchor boundaries across its actual external reads, plus its independent
guard and root/client/PG/Docker/storage/status checks. No result or guard token is
cached across awaits and no state/rows/skip-guard option is accepted.

One call-local monotonic budget covers snapshot, archives, final checks and clone;
nested snapshots receive only remaining whole milliseconds. Nonfinite initial
samples, rollback, invalid budgets and abort refuse success. Synchronous helper
interruption still requires outer process supervision; this is not a hard runtime
preemption mechanism, whole-session budget, full lease or release authority.

Existing CF/VERIFY/VF/private-OPEN counterexamples continue to run. Additional
owned-filesystem tests check matching state/anchor, fresh owner and caller-copy
isolation, fixed request denial, final-clone timeout and nonfinite initial clock.
They also change actual owner/state files during START/VERIFY archive reads
through both public APIs, verify decreasing ending-snapshot budget, and abort
during the archive read. These synthetic clock faults do not prove native timing.
Actual nativePG16/18 validation on the new source remains PENDING/NOT_RUN.
The production17-producer factory and admission remain uninstalled/default-denied.

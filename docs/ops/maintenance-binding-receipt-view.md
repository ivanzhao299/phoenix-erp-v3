# Fixed owned candidate receipt view

Native sourcec77d4818 default collectors passed the30s operation budget, with
committed VF observations13.840s onPG16 and10.051s onPG18. These results do not
satisfy the complete session's10s read budget. There is no internal timing profile
that attributes all elapsed time to receipt reads.

The collector previously scanned all receipts twice through independent public
readReceipt calls, immediately after state snapshot validation. The fixed
readCandidateBindingEvidence method now selects the unique recorded replacement
and candidate payloads from one new, complete pinned snapshot. It also reads the
current-owner file in that same private batch and includes its metadata in the
ending sweeps. CR requires no candidate; later candidate phases require exactly
one. Caller-provided state/rows/skip-guard options are refused.

All state/context/digest/sequence/previous-digest checks and the fresh beginning
and ending root/ACL checks remain. The original outer receipt-view budget begins
before the snapshot and is checked after selection/clone. The collector supplies
only its remaining budget, capped at10s. No guard token or result is cached across
an asynchronous read. The three state/phase checks, original-root holding-channel
queries, independent PG scans, actual Docker/status/storage/projection checks,
replacement equality and candidate-envelope validation are unchanged. Existing
public missing/duplicate-receipt error categorization remains fixed and sanitized.

Actual owned-filesystem tests cover owner absence/mismatch/permissions/hardlinks,
owner inode replacement during receipt reads, ending-guard mutation, full-chain
validation including an unselected corrupt receipt, duplicate/missing candidate
and replacement records, invalid budgets/inputs and descriptor closure. The
post-clone budget test uses a synthetic clock and does not prove native timing.
The older in-memory catalog fixture has an explicitly synthetic collection seam;
it does not substitute for disk/owner/ACL/FD9 validation.

This is a narrow reduction of duplicate synchronous I/O. Native PG16/PG18 timing
and a real complete10s session probe including queue and independent verification
are still required. Synchronous stuck helpers still need outer supervision. The
production17-producer factory remains uninstalled/default-denied; no full lease,
continuous ingress, release, floor change or production admission is granted.

The updated native fixture requires its final committed VF binding collector to
run with a fixed10000ms caller budget, records that budget and retains failure if
it expires. PRE/ADOPTED operation reads retain their30s limit. This new native
gate initially FAILED onPG16 at source0cc27949, run39174398135 attempt1,
with fixed ROOT_CONTROL_OPERATION_DEADLINE diagnostics after two earlier
observations. PG18 passed its collector slice. The combined gate remains HOLD;
there is no automatic rerun or increase to the10000ms budget.

The follow-up also combines owner plus complete state/receipt-chain reads into
one fresh pinned batch at each root checkpoint and collector state check. It
retains the separate root guard, all original checkpoint calls, START intent,
window/abort/status/original-client checks and independent phase anchors. Owner
metadata now participates in the same final sweep as the state. The in-memory
root fixture has a clearly synthetic equivalent; disk races are tested on the
real store. Native validation of this follow-up is NOT_RUN/PENDING.

The root checkpoint still uses the store's fixed10s default rather than an
individually propagated remaining budget. Its enclosing root operation rejects
a late result and remains poisoned; a direct caller-layer test verifies no
catalog read begins after a checkpoint consumes the operation budget and the
original child remains owned until explicit cleanup. This does not prove hard
interruption of a synchronous helper or a full session latency budget.

Even success there would prove only that
collector slice; queue wait and independent verification still need the complete
session probe. No production timeout is raised or failure automatically retried.

# Fixed candidate binding view and read budget

Main `8be9055f201615724818017ca614578280373a88` failed native PG18 in run
39191481117 attempt1. The first two observations completed in 8.278s and 8.557s;
the third fixed10s phase-aware call returned OBSERVATION_UNVERIFIED. Its outer
fixture interval was10.994s, including request preparation. No fixed diagnostic
was retained, so the unique cause is UNVERIFIED. The failed receipt remains
failed. Original root backend/client release and three stopped owned containers
were verified; cleanup does not turn the observation into PASS. No run retry.
The other five main workflows succeeded. Push detect mode was full (image
builds); both actual production Deploy jobs were skipped.

The collector had a demonstrated synchronous duplicate: initial phase/state
validation was immediately followed by another complete receipt-chain selection,
without an await between them. Three collector phase checks plus that extra
selection required seven complete chain snapshots. Root observations require
additional fresh checks and are not covered by that count.

`readCandidateBindingView` now obtains current state, phase anchor and selected
binding evidence inside one private directory-FD transaction. It retains the
full referenced receipt chain, ownership, hashes, ordering, current marker and
committed START/VERIFY archives. Extra files use the same pinned no-follow,
nonblocking regular-file reader, UID/mode/link/size checks, final file/directory
sweeps and both guards. Missing markers are also rechecked. Duplicate file bytes
may be reused only within this synchronous call and remain pinned through the
final sweep. No FD, reader, map, token or arbitrary path API is returned. Each transaction-owned filesystem IO checks the original parent deadline before
and after the operation. Cloning checks it too; nested reads do not reset it.
Opaque trusted guard/inspection routines retain entry/exit checks; this does not
claim individual IO inside those existing routines is interruptible.

Old public state/phase/evidence methods keep their independent fresh semantics.
The phase rules are shared privately. OPEN still validates the actual previous
state, its digest, typed pending projection, receipt prefix and COMPLETION.
The new API accepts only exact digest/budget/signal fields and returns cloned
values. Those values do not grant approval, ingress, adoption or drain authority.

Each collector state check obtains a new view. After each original-root await,
the complete view is read again and compared with the initial anchor. Only the
initial binding selection uses the same synchronous view. ADOPTED CF still
requires a real strictly validated VERIFY intent. Root and candidate identities,
database observations, public projection and storage checks are unchanged.

Private diagnostics add only the exact RECEIPT_SNAPSHOT_DEADLINE category.
Public errors stay generic; no arbitrary error, path, stderr or cause is exposed.
The native fixture separately records request preparation and actual collector
start. Because a real main budget failure occurred, it now takes three separate
fresh VF observations on the same original root, each under the existing10000ms
budget. Any failed sample stops; these are not retries of failed observations.

Local checks on the final working source: combined735PASS/28SKIP/0FAIL;
28 owned-file/budget cases PASS. Six cases advance the clock at realpath, directory
open, file lstat/open/fstat and final directory fstat; no subsequent snapshot IO
starts, and every opened original FD closes. A separate isolated scripts copy
omitting the parent budget fails the outer-budget negative case (one unexpected
read), proving that case distinguishes a reset nested deadline. No committed
source was modified for the mutation experiment. Exact committed-source results
must be recorded separately. Native PG16/18 results for the changed source remain
NOT_RUN until actual CI; no old PASS is inherited. Tests also cover tail corruption,
archive symlink/hardlink/FIFO, concurrent owner/state/marker/archive changes, final
clone deadline, abort/original FD close, freshness after await and OPEN prior
tampering.

This is remediation for a failed main gate, not a release receipt. Production
reviewer protection and host ownership remain blocked/unverified; continuous
ingress, five-domain reconciliation and the complete17-producer factory are not
installed or accepted. No production dispatch, floor/active/DB/Web/Chanjet change.
A new source SHA requires new COMMENT review, complete CI and post-merge main CI.

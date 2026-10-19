# Replacement observer closure and precise event receipts

The controlled Compose replacement records only its bounded replacement interval.
It does not establish subscription readiness, exclusive signal issuer, continuous
host ingress exclusion, five-domain reconciliation or a complete release factory.
The candidate still requires subsequent independent fenced revalidation.

## Safety changes

Docker event nanoseconds are received as decimal strings and compared with BigInt.
Rounded numeric timestamps are rejected. The fixed Docker projection requests
only type, action, actor identity and the two reviewed Compose labels; action
command suffixes are discarded before retention. Other actor identities are
hashed. The V2 projection is mandatory in a completed replacement receipt.

The observer retains at most 64 KiB of input, 255 parsed rows and a 4 KiB unfinished
row. Overflow, malformed data, stderr, stream errors and unexpected process exit
cause HOLD. Stream and bounded daemon history must match in their original order.
Equal sorted digests cannot substitute for this check. No filtering, reconnection
or limit increase converts an overrun into complete coverage.

The original child object, PID and signal method are saved privately before its
owner registration callback can throw. Registration failure retains the resource
and its actual stdio-close waiter. A changed PID is HOLD and receives no signal.
Closure sends at most one TERM to that original observer, waits at most two seconds
for actual `close`, and never automatically sends KILL. Exit without stdio close
remains observable cleanup debt. A late close may remove resource debt, but cannot
revive failed evidence or authorize a second close attempt.

A completed replacement tombstone is written only after the original observer
has closed, any final flushed records still match the bounded history, and window
and trusted-context checks pass again. Effect and cleanup failures are separately
recorded with fixed safe reasons and the final observer debt. Cleanup cannot
replace the primary effect error. Pending operation markers remain intact.

## Validation scope

Pure tests cover precise nanosecond ordering, history truncation/saturation,
unflushed and late rows, observer exit without close, registration failure,
original PID drift, duplicate close/start, and simultaneous effect/cleanup failure.
The existing opt-in owned Docker capsule exercises the real fixed Compose command,
event reader and lifecycle checks. Authority/source seams in that capsule are
explicit synthetic fixtures; its database/Web processes are synthetic Node
services. It is not the real old API or a production receipt.

Local shared-daemon event overrun is a failed acceptance, retained with its resource
manifest and HOLD artifact. It cannot be replaced with an inherited previous PASS.
A fresh isolated hosted result for the exact source is required before merge.
Production dispatch, service operations, floor writes and Chanjet operations are
outside this source change.

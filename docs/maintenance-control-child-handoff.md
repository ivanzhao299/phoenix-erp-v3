# Supervised control child handoff

The producer session already requires tracking effect processes before a
handshake. A long-lived control process registered in that ordinary set could
never return successfully: `assertNoActiveChildren()` would reject it, while
registering it only after connecting would leave startup untracked.

The handoff now retains supervision in a dedicated control inventory. Only the
current `registerStartedCandidate` callback may transfer one already tracked,
live, handshake-verified `DockerPostgresControlSession` child. A private scope
identity, exact CANDIDATE_REPLACED state digest and owned START_CANDIDATE intent
are required. Duplicate, unregistered, observer, exited, signaled or termination
requested children are rejected. A successful scalar handshake is recorded only
after the actual `SELECT true` response; an unexpected false response fails.

The original ChildProcess, PID and close waiter remain pinned. The lease is
associated synchronously at handoff, before later producer work can fail, and
the returned lease must be that same object. The handoff callback expires when
the producer settles. `checked()` and lease-probe boundaries independently check
the original process, including during monitor probes while another producer is
running. Error or unexpected exit causes fatal HOLD and abort; child replacement
or reconnection cannot silently substitute for the original control process.

Ordinary effect/read children must still settle before cleanup can release a
lease. Deliberately held controls have their own inventory and must not be
blindly killed by `abortAndJoin`. A verified server backend/lock-release receipt
is required separately from local client settlement. After release evidence,
the controller also waits for each original Node `close` event. A still-running
client produces an immutable manual-recovery incident, preserving any already
recorded SUCCESS/OPEN truth. Both new incident outcomes enter the CLI's existing
controller/FD9 retention path. Existing close handling also recognizes a process
that already exited by signal instead of waiting for an event that has passed.

## Validation and limits

Node 20 local coordinator/public/session combination: 86 PASS. Additional
background session/deployment/legacy contracts: 38 PASS. Real owned Node children
exercise startup tracking, delayed/false handshakes, phase and duplicate refusal,
termination requested before exit, unexpected exit, child replacement, long
producer monitoring, changed lease return, post-handoff producer failure, normal
close and a server-release receipt hiding a still-running client. The first
combined run exposed the already-signaled close wait; it was corrected and the
failure log retained.

These Node transports intentionally simulate `t`/`f`; they do not prove real PG
locks, server release, actual Docker command provenance or production admission.
The future typed lease factory must restrict the actual command to the approved
full DB container ID, bind owner application identity and verify its backend
through the holding channel and independent catalog observation. Production
producers, authority verification and ingress/reconciliation remain unavailable;
this patch installs no registry, changes no production state and grants no
release permission. Physical PG16/18 observations are separately covered by
PR #421; they do not replace the still-required real supervised lease adapter.

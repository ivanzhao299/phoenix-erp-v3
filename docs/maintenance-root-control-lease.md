# Bound root control lease component

This component implements the actual root PostgreSQL transport underneath a
future reviewed candidate lease producer. It is not installed in the production
registry and grants no deployment, candidate, legacy drain or business authority.
The default root/trusted-path/FD9, owned START intent, exact-state and independent
maintenance authority checks remain mandatory. Test injections are isolated
fixture dependencies, never a production approval mechanism.

The caller must supply the complete fixed DB container/image/StartedAt,
postmaster start with six fractional digits, cluster system identifier and DB
OID. An immutable launch intent precedes the child process. The original Docker
exec child is recorded before registration can throw. The child uses a fixed
full container ID, local socket/port, sanitized identifier-only credentials,
bounded connection/query settings and a unique owner application name. It does
not relay stderr or accept arbitrary SQL.

Independent readonly catalog inspection discovers exactly one root backend;
PID, microsecond backend start, application name and DB OID are also checked on
the holding channel. Each namespace 17455 exclusive key (1 and 2) is attempted
once. A held observation verifies both locks, the full DB identity and original
live client. It never reacquires locks to manufacture continuity. Failed
observation poisons the lease; a later successful snapshot cannot revive it.
Concurrent observations recheck that monotonic state at every asynchronous
boundary. Original child identity/liveness is rechecked after every query/scan;
an old server lock snapshot cannot conceal a lost or replaced local client.
Each operation propagates an absolute deadline and cancellation signal; every
command receives at most the remaining budget and is checked again on return.
Exceeding it prevents the next I/O even if a synchronous command delayed the
event loop timer. Cleanup has its own bounded budget, distinct from the old
release window.

Cleanup uses EOF on the saved original child, local close settlement and an
independent backend/lock-absent observation. Local exit alone is insufficient.
Missing receipts still permit conservative EOF cleanup, but cannot produce a
verified release. Unknown startup identity, timeout, changed DB/child or failed
observation enters manual-recovery HOLD and retains the controller's FD9.
Cleanup may run after the old window/current-owner marker is gone; it does not
open admission. A failed close is monotonic and cannot be retried into PASS.

Node20 pure tests cover concurrent close, immutable input, early rejection,
partial registration, abort, receipt failure, poison and cached close failure.
The opt-in actual PG16.14/PG18 fixture covers normal identity/locks/release,
partial contention, wrong OID, duplicate owner, restricted statistics, failed
registration, abort after identity, failed record persistence, server backend
termination and DB restart. Each fixture uses a unique network-none tmpfs
container; container removal and original local child settlement are checked
separately. All ten cases per version must finish before a PASS receipt can be
written. The hosted workflow runs this fixture serially and retains allowlisted
JSON only.

Remaining production blockers include the trusted compiled factory, composite
candidate/public proof, continuous supervision across every producer, persistent
task ownership, old-runtime ingress/no-revival and reconciliation, actual host
actor classification, recovery closure and final exact-SHA authority. Synchronous
filesystem/command limits do not replace outer process supervision. The guard
failing during cleanup intentionally preserves HOLD instead of silently
operating outside the trusted context. No production release or UAT is claimed.

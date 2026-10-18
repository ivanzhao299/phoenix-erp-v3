# Candidate control backend observation

Baseline: `48c7a021d8db23d167db56b78d17cfaf2fb9514f`.

The existing control channel accepts only `t`/`f`, and its close method waits for
the Docker client rather than independently checking the server backend. A
separate typed, read-only catalog observer is required before composing a real
candidate lease producer.

`collectCandidateDatabaseSnapshot()` validates root/FD9, a complete immutable DB
container ID/image/StartedAt/healthy pin, cluster system identifier, postmaster
start and database OID. It reads only fixed PostgreSQL catalogs through the
existing bounded, sanitized, local-socket psql program. Caller SQL, credentials,
hostnames and connection strings are not accepted. Raw subprocess errors are
discarded. The runtime pin and protected context are checked again after SQL.

The HELD snapshot requires two distinct, uniquely named client backends with
the exact PID, backend start and database OID. The root backend must hold exactly
the granted `ExclusiveLock` entries `(17455,1)` and `(17455,2)`, including the
two-integer key form. Hidden statistics, duplicate application names, extra
root advisory locks, restarted databases and partial lock acquisition fail
closed. RELEASED requires the old root PID and owner application to be absent,
with no advisory locks remaining for that PID. New, legitimate shared task locks
on different backends do not impersonate the old root lease.

This returns a **snapshot**, never continuous drain, client process settlement,
persistent task ownership, registry installation or approval. The snapshot does
not include API status, Docker API/Web pins, public manifest generation or a
trusted authority decision. Those remain mandatory in the future composed lease.
The production dispatcher and 17-producer registry are unchanged and still deny
unsupported execution. No CLI or production state writer is added.

## Required integration work

The existing `DockerPostgresControlSession` does **not** set the required
`phoenix-maintenance-control:<owner>` application name. Directly connecting that
session to this observer must HOLD. A future supervised adapter must set the
closed owner name on startup, discover its actual backend, then independently
confirm that PID/start/OID through the same holding channel. Do not remove the
application-name check to make the old session pass. Observation alone cannot
prove which client object owns a server connection.

Root/candidate binding must be frozen in the owned maintenance intent; a
caller-provided PID alone is insufficient. All observer children must be
registered before connecting, with independent bounded cleanup and a fresh
server observation after close. A timed-out synchronous Docker exec does not
prove remote psql termination. This component deliberately leaves client
lifecycle settlement false and requires outer supervision.

## Executed local evidence

Node 20 pure tests: 8 PASS. Actual isolated PG16.14/PG18 tests: 22 PASS, 0 SKIP.
The PG tests include wrong PID/start/boot/OID/cluster, duplicate root/candidate
names, an actual candidate in another database, restricted statistics, missing
and shared locks, an idle retained root backend, and fresh post-close sampling.
Both owned containers use network `none`, tmpfs and no published host ports or
production mounts; full owner identity is checked before stop/removal.

The first fixture run failed because its own psql parser treated `t` as JSON;
the parser was corrected and the failure retained. Independent review also
identified that `await t.test()` does not propagate all child failures to the
outer receipt writer. PASS now requires every expected case to finish, and
cleanup independently attempts all sessions and the owner-bound container.
Session close is cached, waits for stream close, and attempts bounded TERM/KILL
settlement; any unverified cleanup makes the receipt FAIL. A deliberately
failing child-test run must exit nonzero and retain only FAIL receipts.

Hosted Required CI is recorded separately against the final commit. None of
these isolated tests constitute production load, old-runtime ingress fencing,
five-domain reconciliation, a production lease or deployment authorization.

# Business task locks and deployment ownership

SLA, customer credit and egg inventory used pooled `DataSource.query()` for
session advisory lock/unlock, which does not guarantee the same connection.
Credit and egg manual runs also bypassed their Cron business lock.

The three fixed task keys now use `BackgroundBusinessLockService`: one dedicated
master QueryRunner owns both lock statements and exact PID/database/raw
microsecond session probes. It preserves PostgreSQL hashtext key semantics.
Manual and scheduled calls share this same owner; busy Cron runs skip and busy
manual runs return HTTP 409 rather than invented zero statistics. Successful
Cron heartbeat writes occur after the helper has verified unlock and physically
retired its own connection. Business logic and data-selection scope are unchanged.

The existing reviewed control SQL forwarder remains exactly two parameters with
its literal namespace/key array. Business statements use a separate fixed SQL
channel and the three-name allowlist; no static gate, rule, suppression or
approval environment is changed. A business session uses its own UUID so that
the API control boot nonce remains unique in PostgreSQL.

## Failure and settlement contract

A cleanup child is synchronously registered before pool acquisition. The helper
awaits original queries and the existing owned-client retirement mechanism.
Healthy cleanup ends the exact owned pg client before public QueryRunner release;
no TypeORM private release API is used. Timeouts end caller waiting, not
resource ownership: pending acquisition/query/retirement/release debt retains
the child graph. An unverified resource permanently poisons admission.

Known loss before business starts prevents its start. Loss during business does
not cancel SQL or external work already executing on other connections. It
retains real in-flight work, refuses new local admission and prevents successful
deployment drain. It does NOT guarantee cross-instance exactly-once business
effects after loss of the separate advisory-lock session. There is no automatic
retry, replay, business data repair or global reset. Unclear effects require
manual reconciliation under the maintenance protocol.

Simultaneous business and cleanup failures retain fixed primary/cleanup enums.
No driver message, business input, credentials or raw stack is serialized in
that resource HOLD. Healthy cleanup preserves the original business rejection.
Normal zero work and a poisoned HOLD remain distinct results.

## Validation

Local Node 20 tests cover same-connection acquisition/release, distinct nonce,
busy refusal, manual/Cron shared keys, heartbeat ordering, registration race,
known-loss-before-work, still-running work after loss, late acquisition, delayed
unlock, false unlock, dual failures and undefined business rejection.
PG16 and PG18 each passed four real isolated cases: unique live control nonce
with a business session, independent API instance exclusion/different-key
concurrency, a separate process holding the exact legacy key, and termination
of only the exact owned business backend tuple while work remains registered
and the global execution lock continues blocking deployment.

Fault-test cleanup explicitly closes only its own original control session
after asserting HOLD. That teardown is not a successful participant drain or
production recovery receipt. Local fixtures are the historical task-owned
container IDs at loopback 56416/56418, independently checked for exact ID,
image, running final PostgreSQL PID 1, readiness, ports and absence of bind
mounts. Their Docker healthcheck is absent, so no Docker-health status is
claimed. An initial projection expected that absent field and failed; the first
test started before the corrected local projection completed. This is retained
in the fixture guard receipt, not promoted to a production admission result.

The new runtime helper is added to the protected criticalFiles contract; no
protected file is removed. A future release needs a freshly approved final
target and actual old/new floor evidence. No production state or floor file
is modified. Full required CI, actual PG fixtures and independent review are
required on the final PR revision. The 17-producer factory, phase-anchor bridge,
production protection/host evidence and maintenance window remain separate
release blockers.

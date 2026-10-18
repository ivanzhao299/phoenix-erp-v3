# Maintenance database observation engineering checkpoint

This adds a fixed read-only **snapshot library**, not a production quiescence
producer or a release route. It has no CLI and is not installed in the production
maintenance registry. Every returned snapshot remains HOLD, including all-zero
counts. No production connection or mutation was performed.

The library binds the full DB container ID, image, start time, database OID,
postmaster start and cluster system identifier. Protected root/trusted-path/FD9
checks and exact DB runtime reads surround the bounded query. Its output contains
aggregate session, open/idle transaction and prepared-transaction counts, including
other databases. It excludes only its own backend PID; it does not infer API
ownership from a role, address or application name. Missing statistics visibility
is explicit. No query text, address, application name or business payload is
exported. Timestamp tolerance is 30 seconds for this descriptive snapshot only;
it is not an exact maintenance-window receipt.

Independent review identified an initial connection-target P1: inherited libpq
environment and conninfo-shaped database names could redirect a query before
post-validation. The repair fixes the Unix socket and port, validates short ASCII
user/database identifiers, clears inherited environment, fixes readonly/catalog
settings, disables password prompting, and adds container-local connection and
TERM/KILL execution limits. The catalog SQL is fixed, without caller SQL or DSN.
A timeout still leaves observer/session termination UNVERIFIED; it never grants
admission or a clean recovery result. Independent re-review closed this P1.

Node20 executed evidence:

- Seven pure negative/boundary tests PASS.
- Twenty owned PG16/PG18 tests PASS (two parent tests and eighteen cases).
  Real cases include an idle backend, an open transaction, a prepared transaction
  after client exit, prepared work in another database, restricted statistics,
  DB/postmaster mismatch, inherited libpq pollution, and rejected conninfo/URI.
- Both actual fixture containers used network=none, no host ports or production
  mounts, owned tmpfs and owner labels. Final stop/removal was independently read
  back by Docker before the success receipts were written.
- Initial real tests failed because PostgreSQL JSON serialized OID as a string;
  the SQL now explicitly casts OID to bigint. Those failures are retained.
- Production invocation, root/FD9 execution, migration/schema changes, hosted CI on this
  new branch, and production load tests are NOT_RUN.

Remaining fixed persistent-work coverage must include the actual migrated schema
and all relevant states of chanjet_sync_jobs, chanjet_erp_inbound_sync_runs,
sys_notification_log, both writeback outboxes, chanjet_execution_admissions and
chanjet_execution_requests. In particular, readonly queued jobs are persisted as
RUNNING with request_scope.lifecycleState=QUEUED. Open transactions can conceal
uncommitted job rows. Unknown tables, states or permissions must remain HOLD.
The new library therefore returns persistentRunning/persistentQueued=null and
ownershipComplete=false; it cannot satisfy the existing quiescence validator.

Notification send-before-log, IoT partial commits, ambiguous remote authentication
or request outcomes, full executor attribution, continuous ingress/revival
exclusion, actual old-runtime OCI binding and business reconciliation remain
separate unresolved evidence. A database snapshot cannot resolve any of them.

This checkpoint neither changes floor authorization nor supplies a formal
production release receipt. API-only HOLD, Web and Chanjet stages remain subject
to their current real production admission and exact-SHA governance.

The existing serial isolated-maintenance workflow now executes the opt-in PG
observation cases after its Docker replacement interval, and uploads only the
fixed local fixture receipt directory. No production workflow, secret, privilege
or deployment trigger is added. Hosted execution remains pending.

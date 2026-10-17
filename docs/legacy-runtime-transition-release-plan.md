# Legacy API transition: maintenance and reconciliation admission

This is a release plan, not a production execution receipt or maintenance approval.

Observed production at 2026-10-17T17:23:25Z: API/floor
`226878864f184d26f41a890e666ebed52547db14`, Web
`23c7af86dd122379d01248a3b9542b8165f31498`. The protected read-only audit
run was `39053475664`; no transaction or policy-transition marker existed.
Chanjet remained HOLD with both sync switches false. These observations must
be repeated at execution time.

## Why the normal drain cannot bootstrap the old API

The old process does not implement the manifest, admission locks, task graphs,
or loopback status protocol. Its notification scheduler does not await every
dispatch. Notification delivery precedes its local log insert; IoT writes can
commit in separate statements. A stopped database connection proves neither
that a notification was not delivered nor that the whole IoT task rolled back.
Waiting for one `running=0` sample, sending SIGTERM, or starting the new fenced
image cannot retrospectively establish that proof.

The formal new-runtime deployment therefore returns
`HOLD_NO_FENCE_OR_DRAIN_PROOF` for this old runtime. The legacy helper is an
assessment-only state machine, and is deliberately not a production stop or
deployment executor. No production bootstrap has been performed.

## Required separate transaction

The operation must be named `STOP_AND_RECONCILE`, never `DRAIN_PASS`.
Before implementation or execution of the production transition, the final
reviewed target SHA, maintenance treatment and recovery protocol must be
settled together. The existing old-floor guard requires a healthy old API;
stopping it first cannot simply be inserted into the existing promotion flow.
A separately reviewed maintenance receipt must preserve the original healthy
PRE audit and authorize the stopped-old-runtime state without weakening the
ordinary guard.

1. Obtain exact old/new SHA authority, a bounded maintenance window and the
   business treatment for notification uncertainty and partial IoT commits.
   Include an independent security decision and an explicit human recovery
   owner. Do not infer permission to repair or replay business data.
2. Capture the healthy old PRE state under root trusted paths, FD9 and storage
   guards. Enumerate all executors, immutable image/container identities,
   restart policies, external queue producers and database connections.
3. Establish a continuously effective external ingress freeze and prevent old
   executors from restarting or being replicated. Define and verify the exact
   host mechanism before approving it; a snapshot or in-memory flag is
   insufficient. Web and DB identity constraints remain in force.
4. Deterministically stop the enumerated old executors. Preserve evidence of
   connection/transaction termination. Do not describe committed work as rolled
   back and do not automatically replay external effects.
5. Reconcile each task family. Obtain provider delivery receipts where
   available, identify IoT partial commits and unresolved persistent work, and
   record approved treatment. Unknown delivery without an approved treatment,
   missing executor evidence or possible revival remains HOLD.
6. Through the reviewed root mechanism, initialize only the separate public
   control directory and a durable deny projection, bound to the transaction.
   Never create OPEN as an installation default. The old private 0700 state
   directories retain their protection.
7. Use the separately reviewed maintenance-aware promotion path and exact
   floor authority to start the new API default-fenced, with no migration and
   Web/DB unchanged. Bind its random boot ID to independently inspected Docker
   and OCI identity and its dedicated PostgreSQL session.
8. Require complete PRE/POST, startup logs, schema, live identity, successful
   private deployment receipt and main-SHA rechecks. Commit the private OPEN
   ledger before publishing an explicit OPEN grant. Chanjet kinds remain denied.

Any failure retains maintenance/Fence and evidence. No automatic old-image
restart, marker deletion, database restore, business repair or second attempt
is authorized by this plan. A stopped old runtime plus an incomplete new floor
is a partial release requiring the approved human recovery procedure.

## Missing prerequisites

- Exact final merged engineering SHA and fresh independent floor approval.
- Approved maintenance/ingress/no-revival mechanism and recovery owner.
- Notification uncertainty and IoT partial-commit treatment, with real receipts.
- A maintenance-aware promotion/installation executor and isolated end-to-end
  failure tests; the current assessment helper does not supply this executor.
- Production capacity budget for admission queries and one connection per API.

Web-only release and Chanjet first-sync/READONLY_ACTIVE remain separate gates.

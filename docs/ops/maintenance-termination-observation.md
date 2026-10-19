# Legacy termination policy and isolated observation component

This component is a prerequisite for the first-switch STOP_AND_RECONCILE protocol.
The low-level Docker isolation STOP adapter now requires its exact structural
policy digest, independent authority callback and durable single-use intent.
Its event observer is not installed into production, the full 17-producer factory,
approval verifier, continuous ingress controller or floor writer. It grants no
authority and cannot produce DRAINED, RECONCILED, OPEN or production success.

## Failure retained

PR #449 at `67a23d16c68a19f01330c32fa09649776122d194` remains Draft/HOLD.
Its actual old-source single-SIGTERM stop exceeded the budget locally on PG16
and on hosted PG16/PG18, run `39179931775` attempt 1. Hosted fingerprints did not
change. Those failures have not been rerun or converted to success. The old API
has not been patched with a handler or wrapped in an init process for this claim.

The formal existing Docker adapter uses a 30-second stop. Docker documents that
the declared stop protocol may escalate to SIGKILL after its timeout; exit 137
alone does not prove that this happened under the approved policy.
See [Docker stop contract](https://docs.docker.com/reference/cli/docker/container/stop/).

## Exact structural policy

`production-maintenance-termination-policy.mjs` requires explicit TERM, 30-second
timeout, possible Docker SIGKILL, 35-second command limit and one attempt. The
owner, target, maintenance window and all executor ID/image/revision/start/restart
pins must match the maintenance context. Recovery operator and explicit policy
digest must be present in any future approval payload. The digest helper checks
structure only: it never fetches a review or authenticates an approval.

The low-level adapter explicitly sends SIGTERM with stop30, rechecks exact live
isolation after authority verification, and writes an immutable owner/target/pin/
policy/command intent before the effect. A private single-use token prevents the
generic mutation method from becoming an alternate STOP entry. Failed outcomes
retain the intent; no automatic retry is provided. The policy module is now a
floor critical file. No production floor has been updated by this source change.

The adapter reports `terminationObservation=NOT_COLLECTED`; physical stop is not
proof of graceful completion or approved signal causality. Integration with the
actual independently verified observation controller and full release factory
remains outstanding. Root/FD9, host exclusion, fresh actual before/after identity,
window, continuous ingress and five-domain verification are still mandatory.
No label, environment value or caller-provided JSON grants production permission.

## Event semantics and limits

The validator accepts a supplied bounded event sequence and an exact interval
within the policy window, at most 35 seconds. Nanoseconds remain decimal strings
and are compared as BigInt. TERM must precede both terminal events; any KILL must
occur at least 30 seconds after TERM and before both terminal events. Duplicates,
missing events, earlier/later intervals, rollback, numeric timestamps, OOM,
unknown lifecycle changes and unapproved signals are rejected. Final inspect
must explicitly report OOMKilled=false and the expected exit code.

Actual local Docker observations showed `kill → stop → die`. The model therefore
allows either stop/die log order, requires distinct terminal nanoseconds and
retains the original order. It does not sort logs to manufacture causality.
The daemon's stop handler and exit monitor emit these records independently:
[stop handler](https://github.com/moby/moby/blob/master/daemon/stop.go),
[exit monitor](https://github.com/moby/moby/blob/master/daemon/monitor.go).

Only type, action without exec command suffix, full container ID, string signal,
string exit code and string nanoseconds are retained. No arbitrary labels,
environment, commands or stderr content enter the observation. Output explicitly
states `SUPPLIED_EVENT_SEQUENCE_ONLY_NOT_CONTINUOUS_OBSERVER_PROOF`,
`NOT_EXCLUSIVE_ISSUER`, `legacyDrainResult=UNSUPPORTED`,
`gracefulCompletion=NOT_PROVED`, `businessReconciliation=NOT_PROVED` and
`productionAuthority=false`.

## Isolated validation

The opt-in Docker test creates two synthetic, owner-labelled Node containers on
the fixed local Unix socket. One handles TERM by exiting 0; one intentionally
ignores TERM and is subject to exactly one predeclared Docker stop30. The latter
must show actual TERM/KILL events separated by at least 30 seconds and exit137.
These containers are not the actual old API or production OCI image.

The event CLI uses a fixed safe Go projection which renders TimeNano as a string
before JSON parsing. The original CLI child is registered before target STOP.
Spawn/PID existence is not called subscription readiness. Its stream is bounded,
errors are sticky, and final validation follows actual stdio close. Close sends
at most one TERM to that original observer CLI, never another target signal or
automatic KILL. A missing close retains cleanup debt and fails acceptance.

Filtered daemon history is retained separately. Actual local testing observed
TERM in the stream but not in the later history for the forced termination;
global 256-event truncation is a possible explanation, not a proved unique cause.
[Docker documents the bounded history](https://docs.docker.com/reference/cli/docker/system/events/).
The fixture does not equate short filtered history with complete coverage. It
does not install the independent continuous stream/history/inventory controller
needed by production. Failed observations retain their safe projections before
classification; failed containers are not automatically retried or removed.

Run targeted tests with Node20:

```sh
node --test scripts/ops/production-maintenance-termination-policy.test.mjs \
  scripts/ops/production-maintenance-termination-fixture.test.mjs
MAINTENANCE_TERMINATION_DOCKER_FIXTURE=1 \
MAINTENANCE_TERMINATION_MANIFEST=/absolute/new/owned/artifacts/termination.json \
  node --test scripts/ops/production-maintenance-termination-policy.docker.test.mjs
```

CI runs the synthetic Docker test serially in its existing isolated job and
exports only its fixed JSON manifest. The source change does not dispatch,
stop production, migrate data, re-anchor floor, deploy Web or operate Chanjet.
Five-domain reconciliation, real old-runtime transition, full factory, production
environment protection and host ownership evidence remain separate blockers.

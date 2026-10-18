# Legacy maintenance release integration

This is an engineering integration contract, not production release approval.
The protected entry remains **HOLD**: the reviewed production producer registry,
typed legacy promotion/state cores, and continuous candidate ingress producer
have not been installed. The session cannot manufacture these capabilities from
a plan, environment variable, callback named `approved`, or an old receipt.

## Implemented fixed session

`scripts/ops/production-maintenance-deployment-session.mjs` drives the real
`LegacyMaintenanceTransition`, immutable `MaintenanceReceiptStore`, and
`assertLegacyMaintenanceAdmission`. It accepts one exact API-only HOLD plan:

```text
PREFLIGHT → CAPTURE_HEALTHY_PRE → PREFLIGHT_HANDOFF → PREPARE → FENCE_INGRESS → STOP_LEGACY
→ RECONCILE → PREPARE_PROMOTION → REPLACE_CANDIDATE → START_CANDIDATE
→ VERIFY_CANDIDATE → READ_FORMAL_COMPLETION → OPEN_CANDIDATE
```

The order is compiled in the module. `START_CANDIDATE` registers the exact
container already created by controlled Compose; it cannot create or restart a
runtime. `REPLACE_CANDIDATE` retains its separate interval-only tombstone and
`legacyDrainResult=UNSUPPORTED`. Nothing converts stopped legacy work into
modern `DRAINED`.

The protected CLI accepts only `run`, reads the fixed root-owned
`maintenance-release-plan-<run-attempt>.json` in the existing private state
directory, and verifies that the owner matches the protected workflow run. It
does not read stdin, shell text, an arbitrary plan path, or an adapter module
path. The current default authority/evidence verifiers and uninstalled producer
registry deny execution before a maintenance state or production effect begins.

The plan binds the actual old floor/API/Web, target SHA, candidate immutable
image, reviewed Compose SHA-256, source helper digest, healthy PRE inventory,
recovery material, exact operations and maintenance window. Its only scope is:

```ini
MODE=api
BUILD_API=true
BUILD_WEB=false
RUN_MIG=false
CHANJET_POLICY=HOLD
READONLY_SYNC=false
INBOUND_SYNC=false
ROTATE_CREDENTIALS=false
AUTOMATIC_ROLLBACK=false
```

Every typed effect re-reads current owner, lifecycle state, intent, approval and
FD9 through the existing admission module. GitHub main and local `origin/main`
must remain exactly the target. A periodic bounded read detects main drift or
lost candidate control during asynchronous actions and aborts the current typed
producer. No next action is issued. The producer must stop and join its owned
children; it may never dispatch detached Docker/Git/helper work. No automatic
rollback, replay, marker cleanup or second attempt is provided.

## Production adapter interface

Only a reviewed, compiled factory may install the following producers. The
protected JSON plan cannot install or select them. Tests inject fixture adapters
in code; those adapters are explicitly not production authority.

| Producer | Required implementation and evidence |
| --- | --- |
| `assertReady` | Independently verified `SESSION_PRODUCERS_READY`, exact helper/source/operation inventory, no detached effects. Refuse before stop if any later producer is unavailable. |
| `capturePre`, `captureRecovery` | Actual protected healthy PRE/schema/no-migration/inventory and verified recovery archives, collected before stopping the old API. PRE artifact paths are fixed by the session. |
| `fenceIngress`, `stopLegacy` | Existing `LegacyMaintenanceRuntime` and approved continuous infrastructure exclusion, exact stopped two-sample identity, database and persistent-work checks. |
| `collectReconciliation` | Actual five-domain evidence and any separately approved object-scoped unknown effects. The current replacement executor supports only five fully reconciled zero-unknown domains; other dispositions remain HOLD. |
| `preparePromotion` | Call the typed legacy promotion core after root empty FENCED bootstrap. Reuse installed old floor guard, double SHA/schema preflight, actual promotion record, code fast-forward and existing formal begin/candidate/switch state. Do not use a generic shell body. |
| `captureReplacementIsolation`, `verifyEmptyPublicFence` | Fresh protected old-instance isolation and complete host inventory, valid enforcement lease, exact private/public owner and deny projection. |
| `registerStartedCandidate` | Read-only registration of the replacement's exact full ID/image/OCI/start/restart, boot and connected same-database control identity. Return a persistent root control handle; no create/restart. |
| persistent `lease.observe()` | Independently verified `CANDIDATE_CONTROL_LEASE`, exact same API/boot/control session, root admission and execution locks still held, zero graphs, current continuous candidate ingress and complete executor exclusion. A snapshot/count or caller boolean is insufficient. |
| `collectAdoption` | Actual `CANDIDATE_PUBLIC_ADOPTION` and exact HOLD participant. Existing `LegacyMaintenancePublicControl.adoptCandidate` writes private authority before the strict modern public FENCED projection. |
| `capturePostAndStartup` | Existing readiness/Web HTTP smoke, POST snapshot, stdout/stderr summary and live inspection, without migrations or Web/DB changes. |
| `completeFormalDeployment` | Existing typed deployment-state completion after actual PRE/POST/startup/live verification. This is the sole formal SUCCESS producer; the session cannot invent one. |
| `collectVerifiedCandidate`, `readFormalCompletion` | Evidence bound to actual artifact digests and the actual `deploy-<owner>.json` SUCCESS digest. |
| `publishOpen` | Existing strict private-before-public OPEN publisher, exact owner/generation and held root PG locks. It must call the supplied fixed success verifier immediately before publishing; separately confirm approved candidate ingress release. |
| `abortAndJoin`, `lease.close()` | Terminate/join only owned children and release owned SQL locks. Never change public FENCED to OPEN, clear markers, restart the old API, restore a database, or claim recovery. |

The session reuses `verifyEvidenceFiles` and `verifyLiveSnapshot` on protected
artifacts and uses existing `verifyCompletedDeployment` before OPEN. The formal
deployment receipt, active state, floor and actual live identity must agree. It
also binds the verified-candidate hashes to these exact PRE/POST/log artifacts.

The persistent control handle is acquired during registration and held through
adoption, formal verification/completion and OPEN. Release is confirmed only
after actual work has settled, child join is independently verified, and the
release proof is valid. Unknown children or probes retain the controller in
HOLD; the session does not call lease.close in that condition. Monitoring is
joined before deliberate OPEN so it cannot mistake the expected phase change
for loss of FENCED authority. This does not authorize opening without a verified
lease.

## Proposed shared-file patch scope — not yet applied

The following changes require root coordination with their current owners.
Existing modern admission remains mandatory; no environment bypass is proposed.

| Current site | Minimal reviewed change |
| --- | --- |
| `.github/workflows/deploy.yml:1138-1146` | Add an explicit legacy protocol enum route for API-only double-SHA scope. Stage the exact approved transitive helper closure, retain the same bootstrap/FD9 process ancestry, and invoke only the fixed Node session. Never route modern failure into legacy automatically or pipe the existing shell deployment body into it. |
| `.github/workflows/deploy.yml:880-882` | On the legacy route, move healthy formal PRE capture before ingress stop. Let the session's owned PREPARE_PROMOTION adapter invoke the typed promotion core; do not duplicate the old floor action. |
| `scripts/ops/production-control-bootstrap.sh:5-7` | Preserve trusted-path verification and FD9. Ordinary modern mutation stays rejected for an unfinished maintenance lifecycle, including crashed transactions while checkout still contains old code. Legacy entry must validate the exact protected plan and real typed intent. |
| `scripts/ops/promote-production-config-floor.mjs:38` | Keep ordinary `promoteFloor` on modern admission. Extract the existing implementation into a private core; add a distinct typed legacy entry that always performs real `assertLegacyMaintenanceAdmission(PREPARE_PROMOTION)` internally before the same core. Do not accept `skipAdmission`, a caller-supplied admission callback as approval, or a plan boolean. |
| `scripts/ops/production-deployment-state.mjs:52,55,92,101,110` | Keep ordinary CLI mutations on modern admission. Add fixed legacy operations for begin/candidate/API logical switch under PREPARE_PROMOTION and formal complete under VERIFY_CANDIDATE, each validating actual owner/intent and scope before shared private state logic. No Web, migration, rollback or marker-cleanup exception. |
| `scripts/ops/phoenix-production-compose.mjs:66` | Leave normal mutating API commands requiring genuine modern DRAINED. Legacy replacement calls only the separate `ControlledComposeReplacement` with REPLACE_CANDIDATE intent and immutable tombstone. Never let a legacy receipt satisfy `assertBackgroundFence`. |
| helper bundle / criticalFiles | Add the exact session/admission/maintenance/replacement import closure and configuration dependencies. Verify an isolated staged directory imports successfully without checkout-relative fallback; update the final target SHA and approval binding. |

Child helpers must inherit the actual FD9 descriptor explicitly through Node's
stdio mapping while the same verified parent retains the flock. Setting an
environment flag or copying a lockfile path is not descriptor inheritance.
The protected root plan must come from a reviewed producer and real independent
authority. Existing labels and ordinary CI success do not supply maintenance
window, host inventory or business reconciliation approval.

## Failure, child ownership and cleanup evidence

The uninstalled registry is recognized by a module-private `WeakSet`, not a plan
field, and is rejected before writing a reservation. After independent approval
and installed-registry selection, the session writes an owned
`maintenance-transaction.json` with `operation=SESSION_PREFLIGHT` before invoking
the first producer. Existing modern admission therefore blocks other mutations
even if `assertReady` or PRE capture unexpectedly starts a child and fails.

Healthy PRE handoff requires independently verified `SESSION_CHILDREN_JOINED`
and actual settlement of all session-known work. Its owned reservation is
archived immutably before the normal protocol claims its lifecycle owner; the
same verified FD9 remains held throughout. No business runtime has stopped or
switched at that handoff. A crash with unknown preflight work leaves the durable
reservation in place, rather than making ordinary release admission available.

Every producer promise and step is registered before invocation. Asynchronous
children must be registered as actual `ChildProcess` handles through
`registerOwnedChild`; registration supplies no command authority. The default
replacement's real event-observer child uses this registry. Existing synchronous
Docker calls retain their bounded command contract. A producer must not create
an unregistered asynchronous or detached mutator. The production factory and
independent inventory verifier must establish completeness; the current empty
factory is not permitted to claim it.

Returning from a producer with a live registered mutator is an error before the
protocol may commit that effect's receipt. All ordinary children must be exited
at every step boundary and at the final OPEN verifier. Only the fixed Docker
events reader can be classified internally as a temporary read observer; it
must also have exited before replacement handoff. Only candidate registration
receives `registerControlSession`, which accepts an actual connected
`DockerPostgresControlSession` with a real child handle. This separate persistent
control category is subject to lease/database verification and final verified
release; it cannot exempt arbitrary producer children from joining.

Step execution, lease probes, joins and lease closure have hard promise deadlines
and cancellation signals. The session records known promises/child handles and
does not trust a zero-child receipt while any remain unsettled. Failure also
poisons the normal receipt-store mutation facade, preventing a late returning
action from committing a protocol state after HOLD. Cleanup auditing uses the
separate protected raw store and does not authorize a business action.

The lease probe deadline covers observation, structural checks and the entire
independent evidence verifier. A verifier that ignores cancellation remains
registered as unfinished work; its timeout cannot be hidden by a zero-child
receipt. The monitor task itself is registered, and monitor shutdown has an
independent deadline. Unknown shutdown writes an incident and prohibits lease
release, rather than waiting forever or proceeding to OPEN.

Before releasing a failed session's lease, the join producer must return
independently verified `SESSION_CHILDREN_JOINED`, bound to owner/stage with all
owned children observed, zero active mutators/read probes/outstanding children,
no detached effects, and a child-inventory digest. Known work must actually have
settled. Failure, timeout, forged receipt or an incomplete inventory produces a
`CHILDREN_UNVERIFIED` incident and **does not call lease.close**. The CLI retains
its controller/FD9 for manual recovery. It does not promise that locks remain
held after process/host failure: actual lock/public state is recorded UNKNOWN,
with durable deny, independent external isolation and read-only reinspection
required.

Lease closure must return independently verified `CANDIDATE_CONTROL_RELEASED`
with both root locks no longer held, disconnected control, the owned backend
gone and a server-observation digest. A release timeout/error after formal
SUCCESS/public OPEN preserves those real outcomes and appends a separate
`LEASE_RELEASE_UNVERIFIED` incident. The CLI reports the incident, not a clean
SUCCESS. It does not rewrite deployment history, retry, or claim the SQL locks
were released. Cleanup-only proof can be collected after window expiry; it
cannot authorize new business effects or OPEN.

## Validation boundary

The new session tests use owned local files and run the real state engine,
immutable receipt chain, existing admission, formal snapshot/startup validators
and live-identity comparison with explicit fixture Docker reads. They exercise
the complete sequence and inject owner drift, main drift, missing approval,
missing producers, unreconciled domains, promotion/adoption failures, changed
Web, lost lease, absent formal SUCCESS, and public OPEN failure. They make no
production claim and do not build/run Docker in this session layer.

Separate replacement tests already use actual Node20 Docker Compose. The actual
ERP AppModule/PG16/PG18 candidate fixture is a separate workstream. Neither is a
production release or independent human approval.

Before enabling the workflow route, remaining acceptance includes:

- Real protected root/FD9 child-helper execution with every typed admission.
- Real independent authority, complete host inventory and five-domain
  reconciliation producers; explicit maintenance and ingress-release scope.
- Continuous candidate ingress and same-cluster root PG lock ownership through
  actual formal SUCCESS/private/public OPEN, including crashes and timeouts.
- A combined actual ERP + Compose + PG16/PG18 protocol test with real formal
  PRE/POST/startup/live artifacts and unchanged Web/DB identities.
- Isolated staged import closure, required CI, security review, exact final main
  and old/new floor authorization.

No production dispatch, checkout update, floor promotion, API/Web switch,
migration, Chanjet operation or recovery mutation is authorized by this document.

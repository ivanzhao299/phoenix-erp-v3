# Legacy maintenance production producer gap audit

Audit date: 2026-10-18 Asia/Singapore (2026-10-17 18:58 UTC).

Repository: `ivanzhao299/phoenix-erp-v3`.

Read-only source investigation worktree: `.worktrees/legacy-maintenance-transition`.
Its checked-out commit was `cca09d8e5a603697bf5e26ec461f871383914858`.
This is an **uncommitted engineering working-tree audit**, not an audit of that
commit alone: the deployment session was untracked and the typed floor/state
cores were modified by their respective owner. Other agents were still editing
those cores. File/line references below identify the inspected snapshot and will
move; re-pin the final source/helper digests before implementation or approval.

```ini
AUDIT_MODE=SOURCE_READONLY_DESIGN_VERIFICATION
PRODUCTION_REGISTRY=UNIMPLEMENTED
PRODUCTION_RELEASE_READINESS=HOLD
PRODUCTION_STATE=UNVERIFIED
PRODUCTION_OPERATIONS_EXECUTED=NO
DOCKER_OPERATIONS_EXECUTED=NO
SOURCE_MUTATION_DURING_INVESTIGATION=NO
REPORT_WRITE_ONLY=YES
```

This report distinguishes observed implementation from proposed wiring. It does
not grant production authority, certify the actual ERP candidate fixture, or
replace independent security review, business approval, or a live production
admission check. No production state was observed in this investigation.

## 1. Observed entry and registry boundary

The fixed session enumerates its required producers at
`scripts/ops/production-maintenance-deployment-session.mjs:21`. The default
registry at line 29 rejects every operation. The protected CLI at lines 455–460
loads a fixed protected plan and constructs the default session; it does not
install production authority, independent evidence verification, or a production
registry. The constructor defaults those verifiers to rejection at lines 80–84.

The minimum proposed entry is a reviewed, statically imported compiled factory.
The factory must install fixed producer implementations and independent evidence
and authority verifiers. A plan must not select a module path, command string,
callback, alternate executable, or environment bypass. Registry installation
must remain distinct from verifying that a particular production operation is
authorized and safe.

There is a separate adoption binding seam: the default public-control constructor
in the session at lines 86–87 passes authority and evidence verifiers, but does
not install `verifyCandidateBinding`.
`LegacyMaintenancePublicControl` defaults that verifier to false at
`scripts/ops/production-maintenance-public-control.mjs:74` and requires it at
lines 135–136. A legitimate compiled factory must bind the independent verifier
to the same protected store/context; installing the producer table alone is
insufficient.

## 2. Producer-by-producer mapping

All referenced paths in this table are repository-relative. An existing validator
does not imply that an actual observation producer or approval source exists.

| Producer | Observed reusable implementation | Missing production wiring or actual source |
| --- | --- | --- |
| `assertReady` | Required inventory in `production-maintenance-deployment-session.mjs:21`; `validateReleasePlan` at line 37; existing `verifyContext` | Compiled registry, recursively pinned helper/source closure, complete operation inventory, and pre-stop verification that every later producer is available. Plan JSON cannot certify installation. |
| `capturePre` | `captureSnapshot`, `production-deployment-evidence.mjs:69`; `readBootstrapSchemaEvidence`, `api-bootstrap-schema-preflight.mjs:46` | Actual healthy PRE, full host executor census, zero migration-path difference, current floor/active/transaction state and approved synchronization booleans; persist at the fixed protected PRE path. |
| `captureRecovery` | `validateRecoveryMaterial`, `production-maintenance-transition.mjs:22` | Verify the actual candidate image, source/helper archive, PRE archive and recovery procedure are available and match their digests; identify a real responsible recovery operator. |
| `fenceIngress` | `DockerNetworkIsolationProducer.fenceIngress`, `production-maintenance-runtime.mjs:252`; `LegacyMaintenanceRuntime.fenceIngress` at line 127 | Independent infrastructure authority and actual host/systemd/cron/watchtower/Swarm exclusion evidence; approved bridge, mount and non-executor inventory. |
| `stopLegacy` | `LegacyMaintenanceRuntime.stopLegacy`, runtime line 137; typed network producer `stop` at line 293 | Actual `databaseQuiescence` transport: attributable connections, open/prepared transactions and persistent queued/running work. The current validator is not that producer. |
| `collectReconciliation` | Transition `reconcile`, `production-maintenance-transition.mjs:159`; `evaluateLegacyReconciliation`, runtime line 75 | Five-domain field observations, external request/delivery correlation and business decisions. Constructing five zero-valued entries is not evidence. |
| `preparePromotion` | New typed `promoteLegacyMaintenanceFloor`, `promote-production-config-floor.mjs:111`; `beginLegacyMaintenanceDeployment`, `production-deployment-state.mjs:267` | Fixed adapter passes fresh isolation and bootstrap evidence. Code fast-forward remains workflow shell at `.github/workflows/deploy.yml:907`; proposed extraction must be a fixed admitted operation with intent and fresh main checks, never an arbitrary shell body. |
| `captureReplacementIsolation` | Old-instance `DockerNetworkIsolationProducer.observeIngress`, runtime line 277 | Re-inspect the exact old full ID, no networks, restart policy `no`, complete inventory, active infrastructure exclusion and enforcement window. Do not renew this old-ID proof after replacement deletes the old container. |
| `verifyEmptyPublicFence` | `LegacyMaintenancePublicControl.bootstrap`, public-control line 92; strict legacy projection validator at line 15 | Fixed protected reads of actual private/public authority, owner/digests, root 0555/0444 paths and NOFOLLOW semantics; manifest existence alone is insufficient. |
| Replacement, called internally by session | `ControlledComposeReplacement`, `production-maintenance-replacement.mjs:156` | Fixed Compose and interval event proof exist. The output explicitly covers only `FIXED_REPLACEMENT_INTERVAL_ONLY` at lines 275–286; it cannot certify continuous candidate ingress afterward. |
| `registerStartedCandidate` | `inspectApiParticipant`, `background-control-coordinator.mjs:98`; `verifyParticipantStatus` at line 113; `DockerPostgresControlSession` at line 20 | Read-only registration of the exact already-started tombstone candidate, actual boot/PG backend identity, a persistent root dual-lock handle and continuous candidate ingress. No create or restart. |
| Persistent `lease.observe()` | PG session `tryLock` at coordinator line 54, `ping` at line 62 and `verifyParticipants` at line 63; session `verifyLease` at line 239 | A fixed producer independently verifies real session-owned dual locks, identical candidate/boot/PG backend, private/public FENCED authority, zero task graphs, complete executor exclusion and actual ingress control. |
| `collectAdoption` | `LegacyMaintenancePublicControl.adoptCandidate`, public-control line 116 | Independent root Docker/PG binding verifier and exact HOLD participant. Its default verifier rejects; it must not accept caller booleans. |
| `capturePostAndStartup` | `captureSnapshot` at evidence line 69, `captureDockerLogStreams` at line 147, `summarizeStartupLogs` at line 159 and `verifyLiveSnapshot` at line 181 | Fixed readiness/Web smoke observations, actual success before setting readiness evidence, stdout/stderr capture with only the approved redacted summary persisted. |
| `completeFormalDeployment` | New typed state `recordLegacyMaintenanceCandidate`, state line 268; `switchLegacyMaintenanceDeployment` at line 269; `completeLegacyMaintenanceDeployment` at line 270 | Fixed requests carrying current state/intent, fresh control lease and real formal files. Reuse the typed core; no alternate SUCCESS writer. |
| `collectVerifiedCandidate`, `readFormalCompletion` | `verifySessionFormalEvidence`, session line 49; `verifyCompletedDeployment`, coordinator line 124 | Read actual formal deployment receipt and PRE/POST/log digests, verify live identity, then create the bound evidence envelope. |
| `publishOpen` | `BackgroundManifestPublisher.open`, `background-control-manifest.mjs:157` | Consume the supplied exact-participant success verifier immediately before publication, retain real dual locks through private-before-public OPEN, and separately verify the approved ingress release. |
| `abortAndJoin`, `lease.close()` | Session owned child registration at line 137, control-session registration at line 163 and real work settlement at line 181; PG session `close`, coordinator line 79 | Fixed owned child inventory, termination/join and server-side backend-release proof. Unknown children/probes must not be converted into a normal close or successful release. |

The new typed floor/state cores belong to their current implementation owner.
This audit proposes their reuse and does not duplicate or modify them.

## 3. Candidate continuous ingress and real PG lease

### Existing facts

- The old network producer's `observeIngress` requires the exact retained old
  container and its disconnected networks. It cannot legitimately describe an
  absent old full ID after Compose replacement.
- Replacement has a durable intent, exact old/new runtime binding and bounded
  Docker event/history validation. Its tombstone expressly requires later
  candidate revalidation and grants no future ingress or OPEN authority
  (`production-maintenance-replacement.mjs:275`).
- `inspectApiParticipant` verifies the actual RO bind from
  `/var/lib/phoenix-background-control` to `/run/phoenix-background-control`,
  runtime identity and loopback status (`background-control-coordinator.mjs:98`).
  HTTP 200 is only transport success; the subsequent identity/count/control
  validation is still required.
- The real PG session is long-lived `docker exec -i` into the fixed DB container
  (`background-control-coordinator.mjs:20–30`). Its lock namespace is `17455`,
  admission key `1`, execution key `2` (lines 12–14).
- `verifyParticipants` queries `pg_stat_activity` from that real root control
  session and binds candidate boot application name, PID, DB OID and backend
  start to the actual current database (lines 63–77).
- The modern `BackgroundFenceCoordinator` constructor requires old participants
  matching the previous floor and modern status (line 155). Its OPEN path requires
  its own modern DRAINED state (line 223). It must not be reused unchanged to
  manufacture modern drain authority for legacy STOP_AND_RECONCILE.

### Proposed minimum fixed producer

1. Establish a genuinely enforced and approved external ingress control before
   candidate creation, covering the initial candidate startup window. The old
   container's disconnected bridge is not transferable to the new container.
   No candidate ingress controller is currently installed. A maintenance gateway
   or other control point requires actual topology, independent authority and
   fixed effect/readback commands before it can become an implementation.
2. Register only the tombstone's existing exact candidate full ID/image/OCI/start/
   restart identity. Verify its RO root control bind, boot and actual default-deny
   background status. Do not create/restart a second candidate.
3. Open and register a real `DockerPostgresControlSession`; acquire and retain
   both admission and execution session-level exclusive locks in the actual same
   DB. Verify candidate identity through real server observations rather than
   treating its status JSON as authoritative by itself.
4. Repeatedly verify lock ownership, candidate backend/runtime, root private/public
   FENCED authority, complete executor inventory and the actual external ingress
   control. Any expiry, unknown executor, read failure, lost connection or timeout
   means HOLD, no OPEN and no automatic old-runtime restart.
5. After formal PRE/POST/startup/live evidence and typed deployment SUCCESS,
   publish private-before-public OPEN while the real locks are retained. Verify
   separately authorized ingress release and actual SQL/backend release.
6. Use session-owned child registration and bounded, joinable helpers. Never
   describe a Promise race as termination. Unknown work requires the durable
   incident/manual recovery path; locks do not survive controller/host crashes.

This is an engineering proposal, not a claim that the production control point,
candidate lease producer or end-to-end production binding exists.

## 4. Five domains that cannot safely become automatic zeroes

| Domain | Source facts and required investigation | Unsafe inference to reject |
| --- | --- | --- |
| `NOTIFICATION_EXTERNAL_SEND` | Dispatcher sends before writing its log (`apps/api/src/modules/notification/notification-dispatcher.service.ts:135–141`); log insertion failure is caught at lines 289–298. Match actual external delivery/request identifiers and the bounded stop interval. | Missing log, no running API or process exit proves no external delivery. |
| `IOT_PARTIAL_COMMITS` | Independent history/snapshot/alert writes occur in `apps/api/src/modules/iot/iot-sync.service.ts:340,449,461,490,518`. Establish object-level partial-commit disposition against actual DB/source data. | A final timestamp or stopped process proves every component completed consistently. |
| `CHANJET_AUTH_REQUESTS` | Need actual correlated authentication/callback/remote-read requests and their outcomes. Preserve the independently approved company/account/period and HOLD policy. | Current HOLD false/false proves that no prior request was in flight or externally processed. |
| `DATABASE_TRANSACTIONS` | Attribute actual API/backend connections and inspect open/prepared transactions and other executors. `validateDatabaseQuiescence`, runtime line 68, validates a supplied shape; it does not collect those observations. | API connections disappearing proves no durable prepared transaction or other writer remains. |
| `PERSISTENT_TASKS` | Identify actual queue/task tables, dispatch sources, ownership and queued/running states across all relevant executors. | One queue query or a momentary running=0 proves global quiescence. |

Unknown external effects require actual evidence or a genuine object-scoped
business decision. They must not trigger replay, business mutation or invented
zero counts. Transition `reconcile` supports `SCOPED_NO_REPLAY_ACCEPTED` with a
separate object-level approval (`production-maintenance-transition.mjs:171–176`).
However, current replacement `priorEvidence` at lines 203–206 and typed state
core at `production-deployment-state.mjs:99–106` accept only all five domains
fully RECONCILED with unknown=0. Those paths therefore remain HOLD even if a
different protocol-level disposition has been approved. Compatibility needs a
separate reviewed implementation; it cannot be silently inferred.

## 5. Independent authority gap

`collectMaintenanceGithubAuthority` can read and validate a real independent
exact-head GitHub APPROVE Review, reviewer authority, review body scope and source
containment in the server merge (`production-maintenance-github-authority.mjs:70–83,
123–142`). That source-code/security Review is distinct from production authority
over a future PRE/context and frozen artifact digest.

The protected-environment linkage explicitly returns
`PROTECTED_ENVIRONMENT_ARTIFACT_BINDING_UNIMPLEMENTED` at line 99. Its final result
remains `productionAuthorized:false` at line 169. Even configured reviewers and
observed approval-history entries do not currently prove that a specific exact
context/artifact digest was approved. `verifyGithubMaintenanceAuthority` also
defaults its independent server-record verifier to rejection
(`production-maintenance-receipts.mjs:79`).

This is both a missing engineering binding and a requirement for actual human/
server approval evidence. A registry returning true, labels, run inputs, technical
agent findings or a supplied JSON authority object cannot replace either part.

## 6. Autonomous engineering versus required real authority

The following can continue as source engineering with isolated tests and review:

- Static compiled registry and recursive helper closure validation.
- Fixed, bounded, read-only observation collectors and artifact verifiers.
- Typed source fast-forward and adapters for the owned floor/state cores.
- Actual candidate lease/owned child lifecycle and release verifiers.
- A fixed ingress controller only after its real control point and approved
  topology have been established; include startup-window and crash tests.
- Five-domain evidence collection that preserves UNKNOWN rather than inferring
  business dispositions.
- Immutable artifact/context linkage for independently obtained authority.

The following cannot be supplied by source code alone:

- Real independent exact-head security/frozen-boundary Review.
- Exact old/new SHA and maintenance-window production authority tied to actual
  PRE, recovery materials and frozen evidence digests.
- Actual complete infrastructure classification and authority to exclude
  system services, orchestrators and competing production actors.
- A real recovery operator and verified usable recovery materials.
- Object-scoped business decisions for unresolved external effects, and any
  separate local-write/company/account/period authority needed by Chanjet work.

## 7. Search and verification limits

Search scope was non-test/non-fixture implementations under `scripts/ops`,
`docs/legacy-maintenance-release-integration.md`, notification/IoT/Chanjet source
and `.github/workflows/deploy.yml`. Searches included
`databaseQuiescence|ownershipComplete|persistentQueued|hostInventoryComplete|verifyInfrastructure|CANDIDATE_CONTROL_LEASE|SESSION_PRODUCERS_READY`
and `CANDIDATE_FENCE|candidate.*ingress|observeCandidate|production.*registry|create.*Producers`.
The findings identify interfaces and validators, but no installed production
registry, actual candidate ingress producer or production `databaseQuiescence`
collector in that searched scope. A guessed
`production-maintenance-source-authority.mjs` path did not exist; actual GitHub
authority functionality is in `production-maintenance-github-authority.mjs`.

No tests were executed for this read-only mapping. No live production state,
external approvals, external delivery outcomes or full production integration
was checked. Actual ERP candidate testing belongs to a separate owned fixture
task; this report does not inherit or assert its results.

```ini
COMPILED_REGISTRY=UNIMPLEMENTED
INDEPENDENT_PRODUCTION_ARTIFACT_AUTHORITY=UNIMPLEMENTED
REAL_FIVE_DOMAIN_RECONCILIATION=UNVERIFIED
CONTINUOUS_CANDIDATE_INGRESS=UNIMPLEMENTED
PRODUCTION_CANDIDATE_PG_LEASE_BINDING=UNIMPLEMENTED
TYPED_FLOOR_STATE_CORES=ENGINEERING_IN_PROGRESS_OTHER_OWNER
END_TO_END_PRODUCTION_BINDING=NOT_READY
PRODUCTION_RELEASE_STATUS=HOLD
NEXT_ACTION=IMPLEMENT_AND_REVIEW_FIXED_PRODUCERS_WITHOUT_REPLACING_REAL_APPROVALS
```

# Legacy API maintenance bootstrap: STOP_AND_RECONCILE

This is a separate protocol for an API that does not implement the modern
background-task admission fence. It does not produce `DRAINED`, does not claim
lossless shutdown, and cannot be passed to `BackgroundFenceCoordinator` as a
modern participant. No production operation was executed to develop this module.

## Current engineering status

`production-maintenance-transition.mjs` implements the private state machine and
`production-maintenance-receipts.mjs` implements canonical bindings, independent
authority/evidence interfaces, immutable receipts and pending operation markers.
The isolated tests exercise these interfaces with explicit test doubles. A passing
test double is not evidence of a production approval, ingress control, deployment
or recovery capability.

The default authority verifier, evidence verifier and every missing runtime
adapter deny execution. No production signing key or new approval authority is
created. The protected workflow/operator producer must still connect actual
GitHub approval records and root/FD9 capture operations. An unimplemented producer
or enforcement adapter is an explicit `UNIMPLEMENTED/HOLD` gate.

## Why a maintenance window is necessary

The old notification path can send externally before recording its local send
receipt. IoT history/realtime operations can commit multiple independent writes.
Stopping the old process proves neither that a notification was not delivered nor
that a partially committed business task rolled back. Database session absence,
an isolated `running=0` sample, process-local locks and HTTP readiness do not close
these windows.

Ingress fencing must prevent new user/background admission and old-process
revival throughout the maintenance interval. It must account for every old API
executor, external restarters, queued work and database sessions. A continuously
enforced ingress/no-revival mechanism must be independently verified before any
old executor is stopped. A lease deadline only causes HOLD; it never opens tasks.

## Exact context

Every record binds the canonical SHA-256 digest of this context. Object key order
is normalized; array order is part of the approved content. Undefined values,
non-finite numbers and non-plain objects are rejected.

```text
schema = phoenix.legacy-maintenance-context/v1
protocolVersion = 1
owner = <GitHub run ID>-<attempt>
previousFloorSha = <40 hex>
previousApiSha = <40 hex; equals previousFloorSha for this bootstrap>
previousWebSha = <40 hex>
targetSha = <40 hex; differs from old floor>
window = { start: ISO-UTC, end: ISO-UTC }
candidate = { revision: targetSha, imageId: sha256:<64 hex> }
sourceHelperSha256 = <digest of exact source helper bundle>
schemaEvidenceSha256 = <independently verified target schema evidence digest>
migrationPaths = []
preSnapshot = { api: pin, web: pin, db: dbPin }
executors = [every old API executor pin]
```

`pin` includes the immutable full container `id`, immutable `imageId`, full OCI
`revision`, `startedAt`, `restartCount`, `running:true` and `health:'healthy'`.
The DB pin also includes `mountsSha256`; its OCI revision is not required.
PRE includes a complete host executor classification and all Docker IDs, not just
the one expected API container. The maximum window is bounded by the existing
production contract, not an independently invented timeout.

PRE explicitly requires healthy running API/Web/DB. The installed configuration
guard does **not** imply a running/healthy check; this protocol adds the separate
predicate instead of attributing it to the guard. It also requires actual zero
migration path changes, schema binding, no unfinished transaction, HOLD and both
Chanjet sync flags false. A digest without the independent capture verification
does not establish any of these facts.

## Real authority and immutable evidence

The authority envelope has schema `phoenix.maintenance-authority/v1`, a purpose,
the exact context digest, decision `APPROVED`, the canonical payload and its
`payloadSha256`, and the original server record reference/digest. A maintenance
payload binds `STOP_AND_RECONCILE`, the ordered permitted operations, the recovery
plan digest and PRE snapshot digest.

The operation scope explicitly includes `DISABLE_RESTART_POLICY` and
`DISCONNECT_LEGACY_NETWORKS` when using the controlled
`docker-network-isolation-v1` ingress producer. The exact context must include the
approved isolation plan and complete bridge-network IDs. That producer must deny
host networking, unknown networks, Swarm/unknown orchestrators and unaccounted host
workers. Disconnecting networking is an enforceable maintenance boundary; it does
not make partially committed business effects known or produce a drain receipt.

The producer must fetch the actual GitHub server record under the formal review
or protected production-environment process. It must verify:

- an immutable record ID, APPROVED state, timestamp and exact target commit;
- reviewer identity and current approval authority, independently of the author;
- explicit approved context, scope and payload digest in the approval body;
- an unaltered raw server-record digest and body digest;
- applicable environment/branch/security policies and no stale or dismissed
  approval.

`verifyGithubMaintenanceAuthority` performs the structural bindings and invokes
an independently supplied `verifyServerRecord`. Without that server verifier it
always rejects. A user-supplied reviewer name, JSON boolean, label, COMMENT review
or local file is not a production approval. Producers must not mistake test
injections for an installed production trust source.

Evidence has schema `phoenix.maintenance-evidence/v1`, `kind`, `bindingDigest`,
`capturedAt`, a non-secret `body`, and `evidenceSha256`. The digest covers the whole
envelope except the digest field itself. `createMaintenanceEvidence` only creates
this representation; it does not verify the producer or grant authority.
`verifyEvidence` must independently validate the original protected capture,
identity, exact source helper and current operation. It defaults to rejection.

The default store requires the existing root identity, trusted paths and inherited
FD9 context. It writes only private state-directory records with mode 0600,
`O_NOFOLLOW`, single-link checks, pinned identity checks, fsync and directory
identity checks. Immutable receipts use `O_EXCL` and a content-addressed name;
existing receipts are never rewritten. They form an ordered digest chain. State
and receipts bind the entire context, owner and predecessor digest. No credentials
or raw environment content belong in these records.

## State and effect ordering

| State | Required evidence / effect | Result when incomplete |
| --- | --- | --- |
| PREPARED | Independent exact authority, healthy complete PRE, verified compatible recovery material | No stop allowed |
| INGRESS_FENCED | Continuous ingress freeze, all old executors, enforced no-revival, valid maintenance window | HOLD |
| STOPPING_LEGACY | Durable operation marker expresses this in-progress phase while the exact prior INGRESS_FENCED state/digest remains bound | Interrupted operation remains HOLD |
| STOPPED_UNRECONCILED | Two stopped identity samples, no revival, owned DB sessions/transactions and persistent work zero | **Default HOLD**, not DRAINED |
| LEGACY_RECONCILED | All five domains reconciled or specifically approved unknown objects with no replay | HOLD |
| PROMOTION_PREPARED | Formal exact old/new v3 floor re-anchor, CODE_HOLD, API only, no migration, HOLD flags | HOLD |
| CANDIDATE_REPLACED | Typed controlled API-only Compose replacement; immutable exact removal/candidate lifecycle evidence | HOLD pending candidate revalidation |
| CANDIDATE_FENCED | Exact candidate image/OCI/boot, startup denies admission, Web/DB unchanged | HOLD |
| VERIFIED_FENCED | Formal PRE/POST/startup/readiness/smoke/live evidence, Web/DB unchanged, no unfinished deployment transaction | HOLD |
| COMPLETED_OPEN | Verified immutable deployment SUCCESS, private OPEN authority committed before public OPEN | Pending publication is not SUCCESS |

Every effect writes the global `maintenance-transaction.json` intent before
calling its adapter. Successful completion archives that intent immutably. A
failure preserves it; restarting the process, waiting for a deadline or retrying
the command cannot erase or bypass it. A new run cannot overwrite another run's
marker. A separate `maintenance-current.json` owner/context claim remains for the
**entire** maintenance lifecycle, including gaps between commands. Per-step intent
archival does not release ownership. A second owner cannot PREPARE while the first
is PREPARED, FENCED or STOPPED_UNRECONCILED. Only final formal SUCCESS archives the
lifecycle owner. Every production entry point must respect both maintenance files;
they are not a substitute for holding FD9 during each actual operation.
A crash between state commit and marker archive deliberately remains HOLD
for explicit reconciliation; no automatic retry is implemented.

The STOP adapter receives the unchanged prior private state; the operation marker
contains `effectPhase:STOPPING_LEGACY`. It must not skip a previous-state digest
check simply because stopping is in progress. OPEN is the one necessary exception
to retaining the prior state: its marker embeds the full verified previous state
and digest. `assertOwnedEffectState` accepts only the exact typed private projection
that changes phase/status, appends one chained COMPLETION receipt, and uses the
marker timestamp as that receipt's recorded time and the new state's update time.
It re-reads actual private state and rejects stale/different-operation/arbitrarily
modified projections. No generic intermediate-state authorization is provided.

At final OPEN, the engine first commits `COMPLETED_OPEN/OPEN_COMMIT_PENDING` and the
exact success/manifest receipt privately. Only then may the protected adapter
publish its exact public manifest and release ingress. The adapter must preserve
the existing publisher's own private-before-public ordering. A publication failure
leaves the marker and pending state; it never manufactures a successful release.

## Five reconciliation domains

1. `NOTIFICATION_EXTERNAL_SEND`
2. `IOT_PARTIAL_COMMITS`
3. `CHANJET_AUTH_REQUESTS`
4. `DATABASE_TRANSACTIONS`
5. `PERSISTENT_TASKS`

Each requires independently verified domain evidence. Zero unknown effects and
pending writes with no replay/repair may be `RECONCILED`. Unknown effects otherwise
remain HOLD. A separate genuine authority record may accept **specific identified
objects**, exact reconciliation evidence and approved scope with
`SCOPED_NO_REPLAY_ACCEPTED`, `noReplay:true` and `businessMutation:false`. It does
not make the effects known or recover data. A global risk-acceptance label or a
generic declaration of "no pending tasks" cannot substitute for this record.

Neither reconciliation path permits business repair, notification replay,
historical grade writes, database restore, migration, Chanjet sync or remote
business writes. Those require their own explicit scope and protocol.

## Required recovery material before stopping

The independently verified recovery plan binds the context and has strategy
`COMPATIBLE_CANDIDATE_OR_HOLD`. It names a responsible human operator, a reviewed
procedure digest, exact candidate image and source-helper material, and immutable
PRE evidence. It explicitly disables automatic old-runtime rollback, automatic DB
restore and business replay. Required stop conditions include lost ingress,
unknown side effects, candidate failure and inconsistent floor state.

After a new floor is anchored, the old 22687886 API is not automatically compatible
with that floor. Recovery must use a separately verified compatible candidate or
remain in manual HOLD. No missing receipt, timeout, container failure or HTTP smoke
can authorize starting an incompatible old API. Without real accessible recovery
materials, maintenance is blocked **before stopping** the old API.

## Runtime adapter contract and remaining integration

The engine calls `fenceIngress`, `stopLegacy`, `preparePromotion`, `replaceCandidate`, `startCandidate`,
`verifyCandidate`, and `openCandidate`. Arguments contain the approved cloned
context, context digest and committed state. Each adapter must enforce its own
immediate root/FD9/runtime conditions and return independently verified evidence;
returning a matching JSON body alone is insufficient.

The runtime module provides transport-independent collectors/validators and
explicit adapter boundaries. The formal workflow glue, actual ingress freeze/
no-revival producer, authoritative GitHub record producer, five-domain business
reconciliation producer and promotion/candidate/completion integration must all
exist and pass review before production execution. The modern compose deployment
and modern floor-promotion path must not accept this legacy eligibility as a
modern drain token. A dedicated legacy path must use its own committed receipts.

`REPLACE_CANDIDATE` is an explicit separately bound operation after promotion. Its
typed executor records intent before the formal API-only Compose command, verifies
exact old-container destruction and exact new candidate creation/start, preserves
the old immutable image and Web/DB identities, and emits `CANDIDATE_REPLACEMENT`.
The protocol independently verifies that envelope and links its operation marker,
stopped/reconciliation/recovery receipts, immutable compose/source/command/event
digests, target image/revision and fixed read-only public-control mount. The
tombstone proves only its bounded replacement interval. It does not prove future
continuous fencing or convert an absent old API into DRAINED.

The legacy method/operation name `START_CANDIDATE` now means **registration and
read-only verification of the candidate already started by the typed Compose
replacement**. The adapter must not create or restart another candidate. Its
receipt must reference the committed replacement envelope, match the same immutable
runtime identity, and explicitly attest registration-only/no creation/no restart.
All three graph counts must be zero and the exact boot/control database session
must remain bound through candidate verification. A matching running container or
HTTP readiness alone cannot satisfy this phase.

The current typed replacement producer supports only five-domain reconciliation
with zero unknown effects. Although the core protocol can record object-scoped
no-replay risk acceptance, that path cannot currently proceed through replacement;
it remains HOLD rather than treating approval as proof of known business effects.

## GitHub source review and production-context authority

`production-maintenance-github-authority.mjs` separates three server facts:

1. A genuine independent source security Review binds the full source PR HEAD and
   static reviewed-material digest. It need not predict the merge SHA, Actions run
   ID or future production PRE snapshot.
2. The actual target main is the server PR merge commit and contains that source
   HEAD, verified by the server ancestry response. The Review's `commit_id` remains
   the source HEAD; it is never renamed or fabricated as the target main SHA.
3. Production maintenance authority binds the actual run/attempt, target main,
   complete frozen runtime context, receipt/payload digest, purpose and operation.
   This requires a separate protected-environment authority producer.

The collector uses read-only `gh api --method GET` requests for the current PR,
paginated reviews, the selected Review, reviewer permissions, main ref, ancestry,
Actions run and environment configuration. It never submits approval or changes
labels/rules. The reviewer must be an independent human by both immutable user ID
and login. Dismissal, later review, unresolved CHANGES_REQUESTED, edited body,
changed source HEAD, permissions, main, network failure or expired window yield
HOLD. The original server Review digest must be frozen and supplied on subsequent
verification; a newly edited body cannot silently replace the approved record.

The source Review contains exactly one explicit block:

````text
```phoenix-maintenance-source-review
SCHEMA=phoenix.maintenance-source-review/v1
REPOSITORY=ivanzhao299/phoenix-erp-v3
PR_NUMBER=<number>
SOURCE_HEAD_SHA=<full source HEAD>
SOURCE_REVIEW_RECEIPT_SHA256=<static reviewed report/patch evidence digest>
OPERATIONS=<explicit comma-separated reviewed operation names>
SECURITY_TOUCH_DECISION=APPROVED
FROZEN_BOUNDARY_DECISION=APPROVED
APPROVAL_STATUS=APPROVED
```
````

This block approves the reviewed engineering; it does not authorize a future
runtime transition. Its server submission time must be no later than the actual
server merge time; a post-merge Review cannot prove review-before-merge.
The production workflow must first capture read-only PRE and
freeze its context/artifact digest, then wait for a genuine independent approval
of that frozen run artifact. An implemented authority producer must verify the
actual deployment-approval record, approved reviewer, exact run SHA/attempt,
artifact ID/hash and that approval occurred after artifact freeze. A run status,
an environment name, `approve_production=true` input or the existence of required
reviewer configuration alone is insufficient. Editing an old source Review is
not a substitute for the missing production approval.

The collector currently has **no implemented verifier** for that runtime artifact
and deployment-approval linkage. Its fixed server-only producer can read the
actual workflow-run review history and record a digest and allowlisted observed
review states. The documented GitHub response does not itself establish the
frozen artifact hash or approval-after-artifact timing; the module does not guess
missing fields. This leaves `PROTECTED_ENVIRONMENT_ARTIFACT_BINDING_UNIMPLEMENTED`
and `productionAuthorized=false` on every path. External verifier callbacks or
local proof objects cannot change that result. See the official
[workflow review-history API](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).
An environment with no required
reviewers remains `ENVIRONMENT_REQUIRED_REVIEWERS_NOT_CONFIGURED` even if a caller
supplies a permissive callback. No actual environment or branch rules are changed.

Reviewer roles are strictly `maintain` or `admin`; plain write/custom roles do not
pass. The REST collaborator-permission endpoint maps maintain to legacy
`permission:write`, so the collector verifies the actual `role_name` as well.
This follows [GitHub's collaborator permission API contract](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user).
The local search of `scripts/ops`, `.github` and existing production governance
documents found no reusable automated reviewer-role verifier; this implementation
does not weaken the independent approval requirement to match empty branch rules.

## Executed checks

`node --test scripts/ops/production-maintenance-receipts.test.mjs
scripts/ops/production-maintenance-transition.test.mjs` passes 30 isolated tests.
They cover exact SHA/context, immutable receipt tampering and symlink/hardlink
rejection, self-approval rejection, independent verifier defaults, healthy PRE and
schema/migration predicates, five-domain unknown effects, recovery materials,
marker-before-action crash points, restart HOLD, ingress expiry and private commit
before public OPEN. `production-maintenance-github-authority.test.mjs` adds 18
read-only API-fixture tests for stale/author/revoked/mutated reviews, role and digest
bindings, merge/main changes, transport failures and absent environment approval.
Production adapters, real server approvals, actual production
reconciliation and production release are **NOT_RUN** by these tests.

# Production configuration hardening implementation

Date: 2026-10-08. Repository implementation complete; production transition **not authorized or performed**.

```text
BASE_MAIN=1fda3d2872396d5e19a03eb81d4f5796d9b3cced
IMPLEMENTATION_BASE_MAIN=1fda3d2872396d5e19a03eb81d4f5796d9b3cced
DESIGN_COMMIT=6292f449f80f46f4fe8fc04ae20d8d9200f5fdd7
DESIGN_CHERRY_PICK=c7d5759f
BRANCH=codex/production-config-hardening
CONFIG_HARDENING_PR=363
CONFIG_FLOOR_VERSION=1
CONFIG_FLOOR_CONTRACT=scripts/ops/production-config-contract.json
PRODUCTION_ACTIONS=NONE
PRODUCTION_CHECKOUT_RECOVERY=NO
PRODUCTION_DEPLOY=NO
PRODUCTION_DB_MUTATION=NO
PRODUCTION_SERVICE_RESTART=NO
PRODUCTION_FILE_MUTATION=NO
CHANJET_CHANGE=NO_REMOTE_CHANGE
NEXT_AUTHORIZATION=ONE_TIME_PRODUCTION_CONFIG_FLOOR_TRANSITION
```

The original design commit is retained on its original branch/worktree. Its parent was local audit commit `30e1bd7c`; only the design document was cleanly cherry-picked onto freshly fetched main. That audit commit's other files were not imported. No original/user worktree was reset or reused for implementation.

## Incident and ownership

Storage migration already codified the PGDATA/uploads parameterized interface. The remaining production Compose drift adds two necessary Chanjet environment mappings. Normal previous env rewrite preserved canonical storage/hold keys; omission of their Compose pass-through was the primary defect. Existing dirty-worktree gate correctly prevented an unsafe recreation.

Tracked Compose now passes both flags with false defaults. Storage selectors and `require-phoenix-data-mount.sh` are unchanged. Production `.env` remains the value owner; repository contains no site path literals in Compose or credentials. Restricted external state records approved configuration/identity, not a parallel Compose override or secret store.

Normal code deployment does not rewrite `.env`. Explicit credential rotation owns only the five existing Chanjet credential keys, preserves omitted optional inputs and every unowned record, rejects ambiguous/duplicate/export syntax, validates Compose round-trip privately and replaces atomically with 0600 ownership/gid preservation. Staging must already be approved, 0700, same filesystem and outside checkout. Dollar escaping is tested against an actual **created but never started** disposable container; JSON rendering's escaped dollars are not mistaken for changed container values.

## Execution gates

`chanjet-sync-control.ts` is the canonical policy: only trimmed explicit true (case-insensitive) enables; missing, false, empty, zero and ambiguous inputs disable.

- Scheduler cron, manual enqueue, prepare, deferred execution, bootstrap scheduling and direct recovery all check the policy before recovery/queue/mirror mutations. Disabled manual enqueue returns `accepted=false, reason=SYNC_DISABLED`. Persisted status remains readable.
- Integration service checks full alignment, mirror/resilient mirror, account-book refresh, probe, field-gap refresh and reconciliation at service boundaries, so direct controller/internal invocation cannot bypass the timer's hold.
- AR snapshot refresh and startup/lazy mapping seed respect readonly hold. Existing company/status rows remain readable.
- Scheduled/manual shareholder apply respects the independently explicit ERP inbound gate. AR ledger import also requires that gate for non-dry-run execution; existing financial RBAC and confirmation controls remain. Dry-run/preview reads remain available. Enabling readonly does not enable inbound.
- Existing remote writeback/canary/proxy capability and approval boundaries are not broadened. These switches are not a universal network firewall: ordinary status/auth diagnostics and separately governed integration-review workflows retain their existing boundaries. No Chanjet remote request was made by implementation/tests; Chanjet unit dependencies are mocks.

## Configuration floor and context

`production-config-contract.json` v1 specifies the safety-critical file set and `legacyApiRollback=HOLD`. Actual floor SHA is assigned only after merge and approved C3 setup; no future/self-referential SHA is fabricated in Git.

A runtime `floor.json` must be a 0600 regular file in the approved 0700 external state directory. It contains version, phase READY, reviewed floor SHA, the **actual verified Compose project label**, and the five approved non-secret runtime values. The project is checked against live DB/API/Web labels, not guessed from checkout basename. Runtime values still come from `.env`; the tuple is an admission reference only.

Before FF, the installed trusted helper checks target-tree critical bytes against the approved floor. After FF and before each controlled operation, it checks clean main, current-tree bytes, floor ancestry/high-water anchor, canonical `.env` tuple, private resolved false/false, /data bind paths, sentinel/physical mount and current mounts/flags/project. Descending from F alone is insufficient. Changes to critical infrastructure/gate files require a separately reviewed floor advancement/reconciliation; normal unrelated app/docs changes do not silently relax the contract.

All production callers share host-side FD9 `flock` in `/home/phoenix-codex-deploy/production-deployment-state`. Required directory/state ownership and permissions are checked. All Docker child environments use an explicit minimal whitelist, approved local Unix socket and credential-store path; inherited flags/secrets/Compose routing/remote context cannot override `.env`. No global Git trust or checkout chown is introduced.

## Runtime identity, migration scope and rollback

`capture-production-runtime.mjs` reads actual API/Web immutable image IDs and their image OCI revisions before code sync; it never pulls/tags/builds/restarts or prints environment values. Missing/malformed identity blocks deployment. API Dockerfile now explicitly labels revision from GIT_SHA; both matrix builds receive metadata/GIT_SHA, verify the published immutable digest's OCI revision, and candidates are checked again after pull and actual containers after switching.

Migration comparison uses **running API revision → target**, checks commit existence/ancestry and all six approved migration-path groups. Checkout SHA and Web revision are evidence, not migration baselines. Generic deployment is the code-only track: any migration difference is HOLD before DB/schema commands. It does not restart/recreate DB; it checks existing DB health. Historical generic schema statements are unreachable behind that admission and `RUN_MIG=false`; separately controlled schema authority is not expanded by this PR.

Rollback never resets or moves Git back. It retains current safe configuration and `.env`, uses exact previous image IDs with no pull/build/latest and only services whose switch started, checks image/source-gate eligibility and repeats storage/hold/context checks. Safe proxy configuration is not automatically restored below the floor; database/backups/volumes are not restored. Broad image prune is removed from the three known mutation callers; recorded active/rollback images stay protected.

External records distinguish config SHA, floor SHA, API/Web identities, actual API migration baseline, candidate pins, switch attempts and outcome. A persisted `transaction.json` is installed before switching. Maintenance/new runs reject an unfinished foreign transaction. Outside an owning transaction, actual container identities must match global active pins; restart always compares actual identities. DB/Web operations check the actual API's eligibility to prevent indirect old bootstrap recovery. Only verified success/rollback persists active identity and clears the marker; cancellation, disconnect or recovery HOLD leaves an explicit block for separately authorized operator reconciliation.

The v1 wrapper accepts only exact ps/pull/up/restart profiles; it refuses arbitrary config/exec/run/down/build/routing overrides and does not expose raw resolved config/logs. Child command output is private; errors are sanitized.

## First transition and explicit HOLD boundaries

The implementation chooses the design's fail-closed **operator-controlled recovery** option for pre-floor API images. No zero-job or Nginx-only probe is accepted as an automatic legacy rollback waiver. `017633` remains ineligible even with false/false. If the first API switch fails, retain safe F, image evidence and unfinished transaction; do not recreate P or touch DB.

`verify-config-floor-transition.mjs` is a read-only eligibility checker, not a recovery command. It proves latest exact target/main/ancestry, exact two-line Compose drift and byte equality to target, known dirty paths only, approved operational tuple, backup metadata/hash and archive outside checkout. It never restores, moves, deletes, FFs or invokes Compose. C3 must separately authorize the exact recovery sequence, retain the archive, prohibit every Compose operation in the intermediate old-file interval and install the floor/active state plus its restricted `transition-proof.json`.

A pre-floor forward release additionally requires explicit `one_time_config_floor_transition=true`, full API+Web, credential rotation off and exact C3 proof matching floor and current Compose bytes. Default dispatch does not implicitly authorize that exception. The exception permits forward deployment only; API rollback eligibility remains NO.

Tracked Nginx includes an optional persistent hold-marker interface with default-deny and three reviewed status reads. Disposable real Nginx tests cover every actual controller POST and assert no upstream execution. This does not certify Web/loopback/bridge isolation and is never used to grant legacy rollback. C4 still requires its separately approved maintenance/quiescence and any network-control procedure; nothing here executes it.

The historical Phase1 target predates F and now fails the common floor gate before production mutations. The generic wrapper deliberately does not open schema `run/exec`; that independently approved schema track must be re-reviewed for the new floor/context/state authority before reuse. Disk-maintenance restart of legacy API/DB is also HOLD. Those are explicit safety boundaries, not skipped checks or a hidden gate bypass.

## Files

| Area | Changed implementation |
|---|---|
| Tracked runtime/build | `docker-compose.yml`, `apps/api/Dockerfile`, `nginx/erp.eggslao.com.conf` |
| API policy | `chanjet-sync-control.ts`, readonly scheduler, integration, AR sync, ERP inbound services and affected/new unit tests |
| Operational helpers | capture runtime, config guard/contract, deployment state, production Compose wrapper, managed env updater, maintenance fence, read-only transition verifier |
| Production callers | `deploy.yml`, disk maintenance, Phase1 workflow/wrapper |
| Regression contracts | new env/state/deployment tests; existing storage and Git-state tests updated for image-only rollback |
| Documentation | Design ADR, this report, storage runbook and Chanjet maintenance window |

## Validation evidence

Node20 / pnpm9.15.9 were used. Default host pnpm11 was incompatible with Node20; that tooling failure was corrected with an isolated pnpm9 launcher, without changing project versions/global settings.

| Check | Actual result |
|---|---|
| API typecheck | PASS, 0 errors |
| Web typecheck | PASS, 0 errors; no Web source changes |
| Full API unit tests | 112 passed suites, 979 passed tests; 8 whole suites/161 tests skipped by existing opt-in fixture conditions |
| Chanjet subset within full suite | 16 suites / 288 tests PASS; none skipped |
| Related Node/workflow/storage/env/state tests | 71 tests PASS; none skipped |
| New tests | 76: 39 in three new Node files, 2 additional storage cases, 28 policy/service cases and 7 scheduler cases |
| Real Compose + immutable create-only container | PASS: flags, /data fixtures, dollar/quotes/multiline and exact image ID; container never started |
| Real disposable Nginx | PASS: actual POST route inventory denied; approved status request reaches mock upstream |
| Actual Bash ERR callback | PASS: Web switch failure invokes pinned rollback, preserves failure code and safe config; smoke failure triggers handler |
| YAML/action expressions | actionlint 1.7.12 PASS for all three changed workflows |
| Shell syntax | YAML extracted shell blocks and Phase1 wrapper PASS |
| API lint | 0 errors; existing repository warnings remain |
| Nullable-unique / constraint-drift | PASS: 0 violations/new drift |
| Scope / schema diff | No scope predicates/RBAC declarations changed; no migration-path or mount-guard change |
| Independent review | Reviewer A–G PASS and frontier state/interrupt review PASS after fixes; production authorization remains NO |
| Required CI / merge | GitHub checks on the implementation PR are the authority; must all pass before merge, recorded in task closeout |

The 161 skipped integration tests already have explicit PostgreSQL/HTTP opt-in conditions on baseline main: PACKAGING_HISTORY_PG, RUN_PG_INTEGRATION, RUN_STORE_RECEIVING_PG or isolated DB URL/port. Evidence was read from origin/main in nine files (one is partially skipped). They were not changed/suppressed; all 76 new implementation tests execute. No production credentials or database were used.

Initial regression findings (scheduler return typing, dollar serialization/escaping and failure callback) were fixed and rerun. Independent review also found pre-FF floor validation, indirect DB restart and unfinished-state hazards; those are now enforced and tested. No failure was dismissed as unrelated.

After required CI and merge, the returned `CONFIG_HARDENING_MERGED_MAIN_SHA` is only the **candidate** F. Production stays at the user-reported old mixed revisions and dirty checkout. Do not deploy, reconcile files or restart containers after merge. Obtain ONE_TIME_PRODUCTION_CONFIG_FLOOR_TRANSITION authorization for that exact merged target before C3/C4; Product Acceptance production closeout remains pending.


## CI review authorization trail

First security run `37720531983` failed the existing freeze/security review-admission probes and their W5 aggregate. `.github/workflows/ci-security.yml:41,48,80–81` intentionally flags all app/Chanjet changes unless the PR carries `reviewed-frozen-boundary` and `reviewed-security-touch`. The scanner reported unchanged Chanjet type/interface lines because it scans complete changed files; no callback/signature or JWT bypass was introduced.

The user's explicit CONFIG_HARDENING_IMPLEMENTATION_AUTHORIZED=YES and the two independent completed reviews authorize this exact scope. Existing reviewed labels were applied to PR #363, followed by a fresh synchronize run so its event includes the labels. Gate scripts and ci-security workflow were not modified; nullable/i18n/atomicity and all functional checks remain required. This is an explicit review-authorization gate failure, not a dismissed regression or a clean-worktree override.

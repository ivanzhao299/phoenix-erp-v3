# Production configuration ownership and safe deployment/rollback decision

Date: 2026-10-08, Asia/Singapore. Status: **IMPLEMENTATION READY — repository hardening authorized; production C3/C4 remain unauthorized**.

```text
LATEST_MAIN=1fda3d2872396d5e19a03eb81d4f5796d9b3cced
PRODUCTION_GIT_HEAD=017633c5fb0a090d7b8cda375125d1832668f304
PRODUCTION_API_REVISION=017633c5fb0a090d7b8cda375125d1832668f304
PRODUCTION_WEB_REVISION=5425089bcb51338d4780d6f37782440bade8b90c
PRODUCTION_IMPLEMENTATION_AUTHORIZED=NO
CHECKOUT_RECOVERY_AUTHORIZED=NO
DEPLOY_AUTHORIZED=NO
```

This phase performs source/history review, production read-only checks and a local in-memory experiment. It changes only this design document in tracked files. No production file was written, moved or restored; no container was switched; no workflow was dispatched; no database or Chanjet mutation was performed. Earlier archive actions belong to the preceding recovery investigation, not this phase.

## 1. Decision and root cause

Recommend **A + R2**: tracked base Compose defines a safe parameterized interface; production `.env` owns site values; code deployment preserves that file; a single checked Compose wrapper and persistent image-state manifest drive candidate/rollback operations; rollback restores application images while retaining the current safe Git/configuration revision. Require a monotonic production configuration floor plus semantic validation, not ancestry alone.

The primary incident is missing **container pass-through**, not storage requiring dirty Compose and not the updater necessarily deleting operational keys. The production `.env` contains both Chanjet switches at false, but `main`/`017633` Compose does not reference them. `.env` is an interpolation source, not automatic injection of every key into containers. API Dockerfile has no equivalent declarations. When API is recreated from tracked Compose, scheduler defaults become true/false. The clean-worktree gate correctly stopped that unsafe transition.

The existing updater preserves the five canonical operational keys in normal deployment. Prior reports' objection to rewriting `.env` was a literal execution-authorization restriction; it was not evidence that storage/hold keys were lost. Long-term ownership should permit an explicitly authorized update of the five managed credentials while leaving operator-owned values intact. Ordinary code deployment should skip credential rotation entirely.

A second risk is automatic rollback: current workflow restores an older unsafe Compose before recreating old images. A known-good image does not bring back its previous container environment. A third, distinct application risk is unguarded durable-job recovery at bootstrap; false cron flags alone do not prevent it.

## 2. Evidence and provenance

Source baseline is freshly fetched `origin/main` at the SHA above. Source facts reference that tree; production facts below are from this phase's read-only checks. Historical reports are evidence of their respective executions, not current runtime assertions.

| Configuration | introduced_when / track | tracked or server-local | current authority | restart and rollback requirement |
|---|---|---|---|---|
| `PHOENIX_DATA_MOUNT_GUARD` | M1 interface/guard: `2e8ff111`, 2026-10-05 08:46:39 +08. M2 runbook requires true. Exact production write instant is not recorded in the closeout. | Guard/read interface tracked; actual true value in production `.env`. | M1 guard contract + production operator `.env`; current read confirms true. | Must stay true; `/data` path selection independently forces the guard. Every controlled Compose mutation, including rollback, must check mount/sentinel. |
| `PHOENIX_PG_DATA_DIR` | Same M1 commit adds volume selector. M2 Attempt 2 on 2026-10-05 performs actual storage switch. | Parameterized Compose tracked; actual bind path server-local `.env`. | Successful M2 report + current `.env`, resolved bind mount and physical mount. | Preserve current `/data` PGDATA, PG major and mount; never attach stale named volume or re-copy DB. |
| `PHOENIX_UPLOADS_DIR` | Same M1 commit; M2 Attempt 2 final uploads sync/cutover. | Interface tracked; actual path server-local `.env`. | Successful M2 report + current `.env` and actual uploads mount. | Preserve current uploads bind source and files through API recreate/rollback. |
| `CHANJET_READONLY_SYNC_ENABLED` | Scheduler switch: `33c4b21e`, 2026-07-14, readonly scheduler feature, default true. R1.6 document `52f566cb` (2026-10-06 11:34 +08) records unset/default true. R2 closeout `12da94c4` (12:33 +08) first confirms explicit false hold; R3 confirms it remains false. | Application switch tracked; required Compose mapping is currently server-local; production false value in `.env`. | R2/R3 maintenance governance + operator `.env` + actual container environment. | Explicit false must reach API. Old/default-true images cannot be recreated with a Compose that omits it. Recovery jobs require an additional gate. |
| `CHANJET_ERP_INBOUND_SYNC_ENABLED` | `6d14f992`, 2026-07-22 introduces switch with then-default true; `6e137969`, 2026-07-29 changes default to false. R2/R3 establish production explicit false hold. | Application switch tracked; Compose mapping currently server-local; value server-local `.env`. | R2/R3 governance + `.env` + actual container environment. | Keep false independently of readonly mirror enablement; never infer approval for ERP promotion from readonly approval. |

Document publication times bound when behavior was **documented**, not the exact server write time. The Oct 5 env-backup filename/mtime does not establish the provenance of the Oct 6 Chanjet hold.

Key source records:

- `docs/production-storage-migration-runbook.md:26–68`: M1 parameterization, M2 values, mount checks and reopen sequence; `:153–157` records `.env` changes and execution closeout.
- `docs/production-storage-migration-final-report-20261005.md:8–14,84–122`: execution main `017633`, pinned image references, successful storage paths and checkout relocation. Writes reopened at 2026-10-05 10:43:56 +08; retained named volumes then became stale.
- `docs/production-storage-status-20261005.md:24–28,71`: no lossless reattachment of stale volumes; host `nofail` boot-order risk is accepted/documented separately.
- `docs/production-storage-migration-path-inventory-20261004.md:44–46` is the pre-cutover `/opt`/named-volume snapshot, not current state.
- `docs/uat-data-governance/full-reset-chanjet-maintenance-window.md:20–31,50–55`: hold flags, stop writers, durable-job handling and independent future remote-baseline approval.
- `docs/uat-data-governance/full-reset-r1-6-gate-resolution.md:15–39`: initial defaults and required maintenance isolation.
- `docs/uat-data-governance/full-reset-r2-dry-run-closeout.md:18–27,40`: actual false/false, durable HOLD, and the backup predating that HOLD.
- `docs/uat-data-governance/full-reset-r3-production-closeout.md:13,44–59`: reset epoch 2026-10-06 13:33:09 +08; restored pinned API, false/false, durable/pending jobs zero, three stable rounds. That zero-count fact is historical and must be revalidated before recreating an old API image.
- `docs/product-acceptance/master-name-code-display-fix-report.md`: display PRs and deployment failures, followed by the Oct 8 preservation investigation.

The storage reports use different historical `LATEST_MAIN` values (`2331f6c`, `8a56c2c`); they agree on migration execution main/API `017633` and Web `5425089b`. Neither historical headline replaces current fetched main. Same-content `6b820887` is not an ancestor of the migration execution main; accepted M1 lineage is `2e8ff111`.

## 3. Current state verified read-only

Production checkout `/data/phoenix-erp` is main at `017633`; source `.env` is owned by `phoenix-codex-deploy`, mode 0600. Current non-secret values:

```dotenv
PHOENIX_DATA_MOUNT_GUARD=true
PHOENIX_PG_DATA_DIR=/data/phoenix-erp-data/postgres
PHOENIX_UPLOADS_DIR=/data/phoenix-erp-data/uploads
CHANJET_READONLY_SYNC_ENABLED=false
CHANJET_ERP_INBOUND_SYNC_ENABLED=false
```

`JWT_SECRET`, `DB_PASSWORD`, and all five managed Chanjet keys are **PRESENT**; no secret value is included. Presence is not a credential-validity or remote-connectivity test; none was performed. `/data` is a mountpoint, sentinel exists, and both directory mount targets resolve to `/data`.

Exact semantic local Compose diff is two insertions, zero deletions:

```yaml
      CHANJET_READONLY_SYNC_ENABLED: ${CHANJET_READONLY_SYNC_ENABLED:-false}
      CHANJET_ERP_INBOUND_SYNC_ENABLED: ${CHANJET_ERP_INBOUND_SYNC_ENABLED:-false}
```

No storage, image, port, health, restart or other Compose change exists in that diff. Existing tracked volume sources already use `${PHOENIX_PG_DATA_DIR:-phoenix_pg_data}` and `${PHOENIX_UPLOADS_DIR:-phoenix_uploads}`. Actual values belong in ignored runtime `.env`; storage migration requires **no tracked dirty file**.

| Layer | Current state | Consequence |
|---|---|---|
| Git HEAD / cached production origin ref | `017633` | Not the running Web revision; not a safe Chanjet configuration floor. |
| Latest main | `1fda3d` | Includes #360/#361 app fixes; still lacks flag mappings and safe rollback. |
| Local Compose | Required two mappings above | Keeps site hold values effective. |
| Runtime `.env` | Five non-secret values above | Values persist, but omitted Compose fields cannot reach new containers. |
| API container | Pinned `017633` baseline; flags false/false | Current live environment is isolated; source bootstrap recovery still needs separate consideration. |
| Web container | Pinned `5425089b` baseline | Product feedback fix not installed. |
| DB/uploads | `/data` binds | No migration rerun, DB copy or named-volume rollback allowed. |
| Untracked backup | `.env.pre-verification-20261005T114700+08:00` | Correctly blocks clean gate; copy retained outside checkout. |

```text
DOES_STORAGE_MIGRATION_REQUIRE_TRACKED_COMPOSE_DIRTY_STATE=NO
DIRTY_COMPOSE_STORAGE_DIFF=NO
DIRTY_COMPOSE_CHANJET_DIFF=YES
OTHER_DIRTY_COMPOSE_DIFF=NO
PRODUCTION_ENV_STORAGE_KEYS=PASS
PRODUCTION_ENV_CHANJET_HOLD_KEYS=PASS
```

Current required state is known; a missing/invalid key in a future preflight must STOP, not silently select a development default.

## 4. Ownership boundary and clean checkout

| Boundary | Owner / authority | Location and update rule |
|---|---|---|
| TRACKED_CONFIG | Repository review + CI | Base Compose interfaces/defaults, guards, deployment/rollback wrappers, versioned contract/tests. Never server-edit a tracked file as permanent configuration. |
| RUNTIME_ENV | Production operations | Ignored `/data/phoenix-erp/.env`, 0600, current owner preserved. Storage paths and operational hold switches change only under separate approved operations. Code deploy must not replace them with template/default values. |
| SECRET_CONFIG | Approved credential authority | JWT/DB secrets outside this deploy's managed scope. Five Chanjet credential inputs may be supplied by approved GitHub production secrets during an explicit rotation. Physical `.env` remains restricted; logical allowlist ownership is distinct from runtime-key ownership. |
| RUNTIME_EVIDENCE | Operations/audit | Restricted persistent directories outside checkout, 0700 with files 0600: recovery archive, deployment state/manifests and rollback image evidence. Never Git or temporary directory as final retention. |

`.gitignore:25–28` ignores `.env`, `.env.local`, `.env.*.local`, `.env.docker`. The current `.env.pre-verification-...` does **not** match those patterns. Ignored runtime files can exist without dirtying Git; arbitrary evidence/backups cannot be left in checkout. Do not broaden ignores to hide this incident or add Compose to `.gitignore`.

Git operations should execute as the approved checkout owner; secret updates as the `.env` owner. Privileged host actions are a separate control-plane responsibility. Confirm actual workflow account/capabilities before C3; do not solve access with checkout-wide chown or wildcard/global safe.directory. Use only the verified physical repo path for command-scoped trust. Current deployment-user production fetch has a host-key-verification blocker; provision verified host trust/read credentials through approved operations, never disable SSH verification.

## 5. What the current env updater actually does

`deploy.yml:803–832` manages exactly `CHANJET_APP_KEY`, `CHANJET_APP_SECRET`, `CHANJET_ORG_ID`, `CHANJET_CERT`, `CHANJET_MSG_SECRET`. Each recognized uppercase `KEY=` line outside that set is retained; continuation lines of replaced managed records are omitted. Managed inputs are JSON-quoted and written to a 0600 temporary file, renamed over `.env`, then chmod 0600.

This phase extracts the exact current Node block and executes it with a mocked in-memory filesystem and synthetic inputs. Five cases passed: canonical LF and CRLF fixtures, multiline managed credential, missing managed input, and noncanonical export-format counterexample. No production file is used in those tests.

| Proven result | Meaning |
|---|---|
| All three storage keys retained in normal canonical fixtures | `DEPLOY_ENV_REWRITE_PRESERVES_STORAGE_KEYS=YES` |
| Both false hold keys retained in the same fixtures | `DEPLOY_ENV_REWRITE_PRESERVES_CHANJET_HOLD_KEYS=YES` |
| Unrelated canonical key retained; all five supplied synthetic managed values round-trip through the writer's JSON encoding | Existing writer is an allowlist updater, not a wholesale runtime-template replacement. |
| Writes occur temp → rename → chmod, with 0600 | Atomic replacement shape verified; crash/fsync/ownership preservation is not proven by this mock. |
| Absent managed input removes the existing managed key | Proposed rotation must preserve omitted inputs or require a complete explicitly authorized rotation; no silent clearing. |
| `export KEY=` after a managed block can be dropped | Existing parser is not a general dotenv parser. Reject unsupported/ambiguous input without writing, or preserve those records correctly. |

Do not generalize normal key preservation to every formatting/comment case. JSON encoding alone is also not proof of Compose dotenv round-trip for values containing `$`, quotes or multiline certificates; proposed tests must verify the actual Compose parser without logging credential values.

Recommended updater policy: ordinary code deploy sets credential rotation **off** and does not write `.env`. A separately approved rotation uses the same five-key allowlist, preserves every non-owned record/owner/mode, validates an effective-config round-trip privately, and replaces atomically only after all checks. No automatic whole-env restoration on application rollback. Rotation must run as the approved file owner and preserve UID/GID/mode. Its private staging file must be on the same filesystem as live .env for atomic rename, preferably in an approved 0700 staging directory outside checkout; do not leave raw secret temp/evidence files inside Git.

Compose shell variables have priority over `.env`. Therefore the shared wrapper must strip inherited operational keys and credential inputs from its child environment and read the explicit approved `.env`; only the chosen image references are passed as deliberate overrides. Otherwise merely skipping file rewrite would still permit injected GitHub values to override production credentials. Use a minimal explicit child-environment whitelist, not a short blacklist: fixed Docker local socket, fixed project/file/env paths, approved CLI credential-store path and required system execution variables, plus the selected API/Web pins. Do not inherit DB/JWT/PHOENIX/Chanjet values, COMPOSE_FILE/PROJECT/ENV_FILES, DOCKER_HOST/CONTEXT or alternate config routing. Validate the actual daemon/project identity before mutation; no arbitrary caller-supplied env file/Compose file/context is permitted. This precedence is documented in [Docker interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

## 6. Application defaults and hold coverage

```text
APP_DEFAULT_READONLY_SYNC=true
APP_DEFAULT_ERP_INBOUND=false
REPO_COMPOSE_PASSES_CHANJET_FLAGS=NO
RESTORED_REPO_COMPOSE_RECREATED_API_RECEIVES_ENV_FALSE_FALSE=NO
```

Evidence: scheduler `:65` uses `env || 'true'`; `:236` promotes only explicit inbound true; base Compose `:55–74` has no mappings or `env_file`; API Dockerfile `:57–59` sets neither switch. Host `.env` existing false/false does not compensate for omitted container fields.

Recommend `CHANGE_DEFAULT_TO_FALSE=YES` as defense in depth, using strict explicit-true parsing. This is not a substitute for Compose/floor/rollback controls, nor a current production change. Automatic cron, bootstrap recovery and full-alignment manual entrypoints should share the policy; manual starts still need existing RBAC and separate enablement approval. Existing synchronous alignment (`chanjet-callback.controller.ts:719–734`) must not bypass the same full-cycle hold. No broad permission relaxation or blanket blocking of ordinary local mirror/status reads is proposed.

Current bootstrap `scheduler.ts:55–58,307–377` resumes durable orchestration without checking the readonly switch. The proposed gate must return before queuing, persistent writes or remote work when disabled; status remains readable. Existing manual enqueue also ignores the switch. Add explicit disabled/HOLD behavior for those full-cycle starts. Other legacy mirror-refresh entrypoints must be enumerated in C1 so no equivalent full-cycle bypass remains; do not claim this switch is a universal network firewall.

Tests currently include explicit true/true at scheduler spec `:91–117`, but the inbound-default case `:124–137`, manual/recovery fixtures rely on implicit readonly enablement. Update them to opt in and assert mirror work really occurs; otherwise a skipped run could make the inbound-negative test pass trivially. Add false/unset/empty/invalid cases with **zero queue/query/remote side effects**. Fix environment cleanup to delete an originally absent key rather than assign JS undefined to process.env.

Development and test auto-refresh will stop unless explicitly enabled. Future authorized remote-baseline review must use an explicit, controlled enablement window, with inbound independently false unless separately approved; code deployment never enables it. Scope this behavioral change explicitly in the future hardening PR.

For old API images lacking the bootstrap gate, false flags alone are insufficient. Before any first-transition rollback/recreate of such an image, freshly read the durable-recovery criteria and require no resumable orchestration. R3's historical zero is not a current certificate. If nonzero/unknown, STOP; no new DB HOLD update, cleanup or reset belongs to this configuration track. A single zero read is not enough: the first-deployment and any legacy-image rollback window must fence full-sync/import entrypoints, quiesce the old API and any identified job writers, and repeat the exact recovery-criteria query while concurrency is excluded. See the transition procedure; without that fence, P is not a certified rollback candidate.

## 7. Current rollback truth table

P=`017633` tracked Compose; T=`1fda3d` tracked Compose; D=current local required mappings; F=proposed safe floor/configuration. Production `.env` remains false/false in every row. “Safe” in this table evaluates flag preservation; old-image bootstrap requires the durable-job gate described above.

| STATE | COMPOSE_REVISION | API_IMAGE_REVISION | READONLY_SYNC_EFFECTIVE | ERP_INBOUND_EFFECTIVE | SAFE/UNSAFE |
|---|---|---|---|---|---|
| Current live container | D when created | P | false | false | Flag-safe, currently verified |
| Restore disk file only, no container operation | P on disk; existing container unchanged | P | false | false | Temporary live state safe; disk unsafe for recreate |
| Restart same existing container | P or T on disk, no recreation | P | false | false | Environment retained; bootstrap job gate still matters |
| Candidate up/recreate using today's target | T | T | true | false | UNSAFE |
| Failure before API switch; Git returns to P | P | P existing container | false | false | Latent unsafe disk configuration |
| Git rollback alone after unsafe candidate created | P | T still running | true | false | UNSAFE; file change cannot repair live env |
| Current automatic image rollback after API switch started | P | P recreated | true | false | UNSAFE |
| Subsequent up detects changed env/image or forced recreation | P or T | P or T | true | false | UNSAFE |
| Proposed safe candidate | F or validated descendant | F/descendant | false | false | SAFE after all preflight checks |
| Proposed R2 old-image rollback | F/descendant retained | Captured P immutable image | false | false | SAFE only with compatible schema/env, sustained ingress/writer fence and durable-zero certificate |
| Later operational up after R2 | Same safe config + persisted active image pins | Recorded old image, not latest | false | false | SAFE under same wrapper checks |

Current order is important: `deploy.yml:698–711` tags old images, rolls Git backward with CAS then reset; `:722–728` only afterward calls Compose up with old image tags. CAS guards a ref race, not configuration safety or arbitrary working-file changes.

[Docker restart](https://docs.docker.com/reference/cli/docker/compose/restart/) retains existing container environment. [Docker up](https://docs.docker.com/reference/cli/docker/compose/up/) can recreate on config/image change. Thus restart is not a way to apply repaired variables, and known-good image rollback is not environment rollback.

## 8. Configuration floor

`017633` is sufficient for the **storage interface**: it descends from `2e8ff111`, contains bind selectors and mount guard integration. It is insufficient for Chanjet isolation and safe automatic rollback. `1fda3d` also fails the complete floor. Neither can be the new full floor.

Define `PRODUCTION_CONFIGURATION_FLOOR_SHA=F` after the hardening PR merges. F must include all of:

1. Storage selectors, existing mount/sentinel guard and production validation rejecting named-volume fallback.
2. Both explicit Chanjet mappings with false defaults.
3. Safe Compose invocation/rollback wrapper, no automatic Git rollback/reset, persistent image-state handling.
4. Tests and fail-closed validation for candidate and rollback configuration; proposed application hold defense.

Track a contract version/capability manifest in Git. Store the approved actual floor SHA in restricted deployment state outside checkout (optionally mirrored as a non-secret approved GitHub production variable); reject disagreements. Do not put a commit's own future SHA into its contents: that is self-referential. Set F after merge and validate exact origin/main identity/ancestry.

Require target/config HEAD at or above F **and** semantic capability/effective-config checks. A later descendant can revert a safety feature, so ancestry is insufficient. Require shared host-side mutation locking and a reviewed legacy-image maintenance-fence interface as part of F. Floor may advance only through a reviewed monotonic transition; rollback cannot reduce it. Candidate and rollback must both use the safe config layer. First rollback may use older application images by a recorded compatibility exception, never older operational config.

The deployment record must separate config Git SHA, API image ID/OCI revision, Web image ID/OCI revision, floor SHA, active image references, deployment run and outcome. Store it outside checkout with atomic/locked updates and no secrets. Include the approved non-secret operational tuple captured against actual running mounts; a later env path/hold change requires separate approval, rather than silently accepting any existing directory under /data. After an image rollback HEAD stays at the newer safe commit and remains clean; record the older active app images explicitly.

Do not use retained config HEAD as the next migration baseline. Compare candidate migration paths with the **actual recorded running API revision/approved schema baseline**; otherwise image rollback can hide unexecuted migrations. The Product Acceptance path must require an empty migration diff and abort before DB/schema operations; schema-changing releases remain a separate controlled track.

## 9. Configuration options

| Option | Benefits | Risks/requirements | Decision |
|---|---|---|---|
| A — base Compose parameterization + server .env | Smallest change; same interface in CI/prod; no secrets/site paths in Git; false default; updater can retain site values | Pre-floor Git rollback loses interface; direct app execution still needs safe app defaults | **Recommend**, paired with R2/floor/guard |
| B — external production override | Can survive any Git rollback; clean checkout; independent config layer | Every workflow/operator call must load it; hidden state and extra reproduction/ownership burden; old inline workflow does not discover it automatically | **Not recommended** for this incident; reserve for genuinely site-specific structural config |
| C — tracked production override | Reviewable and testable separation | Adds mandatory `-f` pairing everywhere; pre-floor rollback can lose the file; duplicating two base env fields adds no useful separation | **Not preferred** over A |

An external override could be justified by multiple distinct production topologies requiring structural differences. Two universal safety variables and already parameterized storage do not justify it. No parallel runtime-config system is introduced.

## 10. Rollback alternatives

| Option | Safety and floor behavior | Complexity / compatibility | Clean-worktree / next-deploy result |
|---|---|---|---|
| R1 — CAS + git restore approved tracked paths | No hard reset, but restoring old Compose below F remains unsafe. Needs snapshots, exact path allowlist, CAS, schema compatibility and >=F config validation | Medium; restore still overwrites/deletes selected tracked paths. Preserving F Compose while ref moves below F mixes trees | Full matching restore can be clean only if safe PREV >=F; retaining newer config atop unsafe PREV makes Git dirty. Reject for first transition |
| R2 — keep safe HEAD/config; rollback images | Retains >=F operational controls; validates env/mounts again; compatible pinned old apps only; no DB rollback | Smallest reliable redesign; metadata must distinguish app/config revisions | **Clean** without bypassing gate. Next deploy uses active image state, not HEAD assumptions. **Recommend** |
| R3 — immutable release dirs + active symlink | Clear immutable releases; shared runtime values; requires each rollback config meet floor or share safe layer | Larger change to paths, workflow, symlink CAS, cleanup, probes and project identity | Clean release trees; good future direction, unnecessary for this fix |
| R4 — external override survives Git rollback | Can keep hold/mount config despite old tracked files if mandatory wrapper always includes override | Adds another authority and caller-coverage burden; old workflow commands remain unsafe | Git can be clean, but config drift/hidden inputs increase. Not preferred now |

[Git restore](https://git-scm.com/docs/git-restore) is path-selective and can remove paths absent in the source. [update-ref](https://git-scm.com/docs/git-update-ref) can compare the expected old ref. Neither alone guarantees runtime configuration. Hard reset is **not required** for rollback.

R2 details: retain current safe checkout; roll back only services whose switch began, using captured image IDs and verified local rollback tags/digests, `--no-deps`, no build/latest. Recheck mount guard/effective hold values and old-image compatibility before any rollback up. If preflight fails before a service switch, perform no container rollback. Before old-image rollback, stop/quiesce the candidate under the same maintenance fence and verify there are no concurrent job producers; repeat the exact durable-recovery query before and after restart. If safe rollback cannot be proven, stop for remediation, retain evidence; never recreate an unsafe image/config or restore DB volumes to stale copies.

Persist active image pins outside checkout, including local immutable baseline tags verified against IDs where no registry digest exists. All mutating Compose operations consume the same validated state/transaction image pair. Web-only release must retain the active API pin; later operator up must not fall back to latest after rollback. No secret/env snapshot is restored automatically with application images. Safe proxy/fence controls are part of the retained configuration layer: automatic Nginx rollback may not restore a pre-floor configuration that drops the fence. Credential rotation has its own approved recovery path. Preserve bytes for all active and rollback image IDs: tags alone do not protect unused images from [broad image pruning](https://docs.docker.com/reference/cli/docker/image/prune/). Retention-aware maintenance must not delete manifest-referenced images; disable broad prune during the transition/rollback retention window. No image/volume cleanup is authorized by this proposal.

### All production callers and mutual exclusion

A narrow static audit of `.github/workflows` and `scripts` found three production mutation entrypoints: deploy (including failure rollback), production-disk-maintenance emergency recovery, and phase1 controlled execution. The latter wrapper recreates API/Web (`scripts/phase1-controlled-production-execution.sh:124–128`) without the storage guard; its SSH workflow uses production DEPLOY_PATH and a generated candidate Compose. Existing storage tests cover only deploy/disk maintenance. Candidate/probe generation and phase1 schema authorizations must retain their own contracts, but all runtime recreation paths must use the common mount/floor/env/image validation before the first Compose operation.

The current deploy mount check is once on the forward path, not a fresh check inside rollback. Disk maintenance also needs consistent pins/floor/hold checks before restarting an old API. The local `verify-docker-stack.sh` (which includes down -v) is not a confirmed production caller and must never become one. Dynamic/out-of-repository invocations are outside static coverage; do not claim they were excluded.

Use one host-side lock outside checkout, e.g. the approved deployment-state directory's mutation lock, shared by deploy, rollback, maintenance, phase1 and authorized operators. Workflow-level concurrency alone does not serialize these different workflows. Nonholders STOP/SKIP before Git/config/container mutations. Operator access during C3/C4 must follow the same procedure; no bare Compose calls. Verify main-only deployment/environment protection and approved workflow revision so an older tag/branch workflow cannot use production credentials to bypass the new controls.

For the one-time old-P application exception, a tracked proxy maintenance-fence interface must deny full Chanjet sync/import starts through the normal ingress while keeping approved status reads available. A persistent **non-secret** hold marker outside checkout is derived from the active legacy-image state, with explicitly approved ownership/worker-read permissions (proposed persistent control location `/etc/phoenix/runtime-control/chanjet-sync-hold`, containing no secrets); it is not an external Compose override or a new secret source. A maintenance-window promise alone does not isolate direct API writers. C1 must inventory real routes from both the target and rollback image source, including POST `sync-ar` (:433), `ar-ledger-import` (:503), `integration/mirror/sync` (:678), `integration/mirror/sync-resilient` (:694), `integration/alignment/run` (:719), and `integration/alignment/enqueue` (:753) in `chanjet-callback.controller.ts`; this seed list is not exhaustive. Every sync/import/job-producing entrypoint must have a reviewed deny rule; unmapped or dynamically resolved routes block legacy-image certification. The allowlist contains only reviewed side-effect-free status reads, rather than assuming every GET is safe. Normal ingress is not the whole network boundary: Nginx directly proxies `/api/chanjet/` to 127.0.0.1:3100 (`nginx/erp.eggslao.com.conf:103–104`), and Web uses `API_TARGET=http://api:3100` (`docker-compose.yml:110–111`) with Next `/api/*` rewrites (`apps/web/next.config.ts:24–40`), bypassing host Nginx. C4 must separately authorize and verify a temporary direct-access boundary: only the trusted, fenced proxy may reach the legacy API; unapproved host-loopback, Web/container bridge and worker paths must be denied or quiesced with verified access controls. Inventory concrete network origins and process identities before selecting the host/network enforcement mechanism; an unknown path, unenforceable boundary, or failed disposable-network deny test makes P ineligible for automatic rollback. Do not invent unverified firewall rules during reconciliation. If this boundary cannot be certified, retain safe config and stop failed deployment for remediation rather than launch P. Confirm all Phoenix job-producing processes are quiesced; unknown writers STOP. Keep this fence after rollback while P is active, and remove it only after a verified floor-capable API hold gate is active or separate reenablement approval. An unverifiable fence is a reason not to launch P, not permission to accept the race. Root/privileged operators are trusted principals required to obey the lock and maintenance contract; this is not a claim that filesystem policy can defeat a malicious privileged actor.

## 11. Exact proposed patch scope — not applied

| File | Proposed change |
|---|---|
| `docker-compose.yml` | Add only the two false-default API environment mappings; retain storage parameterization, major version, binds, health/restart settings. No secret literal, env_file bulk injection or volume redesign. |
| `.github/workflows/production-disk-maintenance.yml` | Route mutating emergency actions through shared lock/guard/image state; retain rollback image IDs and refuse cleanup that would remove protected artifacts; reporting remains read-only; retain existing data guard. |
| `.github/workflows/phase1-controlled-production-execution.yml` and `scripts/phase1-controlled-production-execution.sh` | Validate floor/mount/effective flags before first production Compose/probe; use shared context/pins for API/Web recreation. Move generated scripts/evidence outside checkout. Do not widen separate schema-execution authorization. |
| `nginx/erp.eggslao.com.conf` and `scripts/ops/chanjet-maintenance-fence.mjs` (new) | Reviewed real-route inventory/matcher tests and full-sync/import ingress fence for legacy-image windows, persistent non-secret marker, direct-access boundary verification, safe probes and ownership checks; no fallback to pre-floor proxy config during image rollback. |
| `.github/workflows/deploy.yml` | Keep main/clean/exact-SHA/approval gates. Use shared guarded Compose wrapper; remove automatic update-ref/reset rollback; service-switch flags; explicit credential-rotation opt-in default off; code-only/no-migration gate; use actual app/schema baseline. All failure paths share safe config. |
| `scripts/ops/phoenix-production-compose.mjs` (new) | Single mutation entry: shared host lock, fixed local Docker daemon/repo/env/project context, full child-env whitelist, explicit image pins, mount/floor/hold checks before forward and rollback operations. Never print full resolved secret config. |
| `scripts/ops/production-config-guard.mjs` (new) | Parse/reject ambiguous runtime keys; verify production guard true, approved /data binds/sentinel, effective approved operational tuple matching running mounts, false/false, ancestry+capabilities and schema-compatible image pins; read-only durable-job gate for old images. No mutation fallback. |
| `scripts/ops/production-deployment-state.mjs` (new) | Restricted external manifest, locking/CAS/atomic update; distinguish Git/config/API/Web/schema state; retain active pins on rollback. No file inside checkout. |
| `scripts/ops/update-managed-chanjet-env.mjs` (new) | Extract five-key updater with explicit rotation authorization, omitted-key preservation/explicit clear policy, non-owned-record and owner/mode preservation, private Compose round-trip and atomic replacement. Not invoked during normal release. |
| `scripts/ops/production-config-contract.json` (new) | Versioned required capabilities/hold profile; no secrets or self-referential floor SHA. Production profile rejects named-volume fallback. |
| `apps/api/src/modules/chanjet/chanjet-sync-control.ts` (new) | Shared strict explicit-true policy for readonly full-cycle entrypoints; inbound remains independently opt-in. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | Default false; gate cron/bootstrap/recovery/manual enqueue before side effects. Status reads remain available. |
| `apps/api/src/modules/chanjet/chanjet-integration.service.ts` | Guard full readonly-alignment execution consistently so synchronous controller path cannot bypass hold; enumerate equivalent refresh entrypoints before declaring coverage. |
| `docs/production-storage-migration-runbook.md` | Add config/image rollback distinction and wrapper/lock/caller requirement; preserve completed migration/retention history and accepted boot-order boundary. |
| `docs/uat-data-governance/full-reset-chanjet-maintenance-window.md` | Clarify strict enablement, legacy-image durable-job gate and no automatic scheduler recovery while held. No new data-reset authorization. |
| This design + master display closeout report | Update actual rollout IDs/results only after implementation/deployment is authorized and verified. |

`require-phoenix-data-mount.sh` remains the storage checker, with no relaxation. Wrapper adds stricter production-profile validation around its existing development named-volume no-op. Do not add mount/DB migration work, PostgreSQL upgrade, data copy, cleanup, RBAC weakening or filesystem ownership repair to this PR. Current host boot-order residual risk remains separately governed; deployment guard is not a Docker-daemon boot hook.

## 12. Automated test plan

| ID | Required contract / expected result | Proposed coverage |
|---|---|---|
| A | Compose with flags absent/empty resolves false/false | Real `docker compose config --format json` with synthetic isolated env, no container start |
| B | Explicit readonly true only from approved input; inbound false remains false; independent combinations retained | Four flag combinations; strip competing shell values; invalid/missing flag production preflight rejects |
| C | Production-like env resolves /data DB/uploads binds, guard true and false/false; sentinel/mount failures block forward **and rollback** | Extend existing `scripts/ci/phoenix-storage-migration.test.mjs`; add config contract fixtures; no production DB |
| D | Five managed keys rotate atomically; storage/hold/unrelated records survive; no normal-release env write | New `scripts/ops/production-env-update.test.mjs`: canonical/multiline/quotes/dollar Compose round-trip, omitted input, comments/export/duplicates, symlink/owner/mode, crash-before-rename. No credential content in output |
| E | No git reset --hard/stash/clean or implicit ref rollback in deployment paths | New `scripts/ci/deploy-production-config.test.mjs` static checks + fake-Git execution recording commands |
| F | Floor cannot fall backward; old image rollback uses safe config/pinned images; later up cannot use latest; zero/unknown durable gate for legacy images | New `scripts/ops/production-rollback-state.test.mjs`, disposable repo and fake Docker; partial failure before/after API/Web switches; state CAS; protected image pruning is refused; concurrent full-sync requests are fenced; nonzero/unknown recovery state refuses P; no DB/volume restore |
| G | main/clean/exact-SHA gates unchanged; unexpected tracked/untracked/index dirt blocks before mutations | Existing `scripts/ci/deploy-git-trust.test.mjs` + new execution fixtures; no new ignore or bypass label |
| H | App disabled/unset/invalid causes no cron, recovery, queue or mirror-write work; enabled fixtures really execute | Update scheduler/integration/controller specs; explicit readonly true for positive cases, separate inbound default/true cases; status reads still work |
| I | Inline workflow bootstrap uses merged target script/contract; no old workflow rollback executes | Dispatch/source-sha contract fixture; actual workflow ref equals approved merged main |
| J | Migration baseline survives image rollback and is not replaced by safe config HEAD | Mock API/schema state lower than config HEAD; changed migration paths stop code-only release before any DB/migration command |
| K | Shared mutation lock/caller coverage, real-route deny coverage and persistent ingress/direct-access fences are enforced, including old-image rollback and Nginx failure | Extend phase1/storage tests. Enumerate actual target/P controllers and assert every reviewed sync/import route matches the deny policy with zero upstream calls in disposable Nginx/mock-upstream fixtures; method/path variants and new unmapped routes fail. A harmless nonexistent hold-probe checks live activation only, not coverage. Disposable-network tests deny loopback/Web/bridge bypass and permit only the fenced proxy; inability to prove the production boundary refuses P. Concurrent callers lose the lock before mutations |

Implementation validation: Node20/pnpm9; API/Web typecheck and affected/full practical tests; guard/storage/M2 tests; real Compose config fixtures; diff check; independent operational review; required CI before merge. No test uses production credentials. This phase ran only the five current-updater in-memory cases, read-only production checks and source/history validation; proposed new helpers/app changes/tests do not exist yet.

## 13. One-time transition and production recovery proposal

This sequence is a **future authorized procedure**, not execution permission.

1. Merge C1 only after CI/review. Call its approved merged main F; dispatch must later use a workflow revision containing the redesigned rollback. `1fda3d` is not that revision. [GitHub workflow selection](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows) uses the event's associated commit/ref; changing server files cannot repair an already-triggered old inline script.
2. Establish an approved exclusive maintenance window and shared host lock; all other production mutation callers must STOP/SKIP, and no operator may issue raw Compose commands. Resolve/approve floor F outside Git; confirm checkout-owner/credential access and trusted GitHub host verification. Confirm current P is an ancestor and actual running API/Web identities independently. Validate P-to-F app/schema compatibility and empty migration path diff for this release.
3. With running containers unchanged, compare current local Compose D against `git show F:docker-compose.yml`: ideally byte-identical (the two exact insertions); otherwise full privately resolved semantic comparison under the same .env and pinned old images. Compare all flags, binds, ports, health/restart and env values in memory; emit only non-secret comparisons/presence. Any unexplained change STOP.
4. Reverify archive directory/ownership/0600, patch/source hash, and source env-backup exact path/inode/hash against verified copy. Move the original backup to a **new distinct retained filename** in the restricted archive; do not overwrite the verified copy, delete, wildcard, commit it, or touch live `.env`.
5. Only after steps 1–4 and explicit C3 authorization, restore **only** Docker Compose from old HEAD; require empty Git status; immediately ff-only main to approved F and verify exact target/clean state. The host lock/exclusive window must already be active. No Compose operation of any kind is permitted in the intermediate old-file state, including from scheduled maintenance/phase1 callers. Disk-file replacement itself does not change existing containers.
6. Before the intermediate restore, prove write/access/FF prerequisites and retain exact D. If ff fails while HEAD is still verified P, C3 recovery must restore only the approved archived D under exact hash/path checks, return to safe blocked state, and perform no Compose operation. Unexpected HEAD/file changes STOP for operator remediation; no arbitrary restore/reset/clean/stash.
7. After F is clean and its safe interface is proved, initialize the restricted floor/active-image state from actual old running images and rerun config/mount/hold/durable safety checks. Do not permanently set API_IMAGE/WEB_IMAGE to M2 temporary values in `.env`.
8. Separate C4 authorization must include the short API-quiescence, maintenance-fence and any reviewed direct-network access-control actions; none is authorized by this design task. Install/validate the floor-capable proxy fence before any API transition, with candidate Nginx config validated before activation; prove actual route matching offline with zero upstream execution and use a harmless non-job-producing probe only to confirm live fence activation. Verify the approved direct-access boundary for all identified origins; a proxy probe alone cannot certify it. Quiesce old API and any identified job writers, then read the exact resumable-job criteria. Require zero with ingress/direct-writer concurrency excluded. Do not recreate the old API just to test this. Record source-floor readiness separately from activated proxy/runtime capability: before fence activation a failure leaves old containers untouched and may restore only the exact pre-window proxy state under its explicit authorization; after fence activation or any API transition, no pre-floor proxy restoration is permitted. An incomplete floor remains BLOCKED for subsequent mutation callers. Then invoke the official redesigned deploy.yml on current merged main F/descendant, full API+Web, preserve artifacts, code-only/no migration, credential rotation off. Require actual app-baseline migration diff zero before DB/schema operations. No manual SSH deployment commands.
9. On first failure, retain clean F operational config and roll back only affected images through R2. Old P image is allowed solely as a recorded compatible baseline with the sustained proxy/direct-writer fence and repeated resumable-job-zero checks; if those cannot pass, STOP rather than restarting unsafe recovery. Keep the persistent hold fence for as long as P remains active; never restore pre-floor Nginx configuration. Never take operational Compose or Git below F. DB remains current /data, not stale named volumes or old backup.
10. On success verify actual OCI/image/build revisions, DB/API/readiness/Web health, effective container false/false, no new sync/import jobs, mounts and exact active-state manifest. Future successful app baselines are >=F; configuration floor still requires semantic validation.
11. Separately authorized read-only Product Acceptance checks cover price-anomaly HTTP200, flock real name+code, zh/lo/en canonical fallback, four searches and domain smoke. Only then publish docs-only closeout; no redeploy of that docs-only commit is needed.

The intermediate restore/ff is safe **only** as an exclusive, non-Compose file reconciliation with proved target equivalence and recovery procedure. It is not permission to leave old unsafe Compose as a deployable clean checkout. Failure image rollback must not automatically undo the safe file reconciliation.

## 14. Implementation phases and authorization gates

| Stage | Writes? | Rollback / preserved state | Approval needed | Evidence / stop conditions |
|---|---|---|---|---|
| C0 — this audit/ADR | Local doc only; production read-only | Production unchanged | Existing design request | Provenance, approved-key reads, source/mock proofs; ambiguity recorded, no implementation |
| C1 — repo hardening PR | Repo Compose/workflow/helpers/app policy/tests/docs only | Ordinary branch changes; no production | Explicit repository implementation authorization, including app default/manual full-cycle policy | Exact patch scope; stop on scope/schema/RBAC expansion |
| C2 — CI/review/merge | CI ephemeral fixtures, GitHub PR/main | No production rollout | Authorized PR/merge scope; independent operational review | Required CI all green; stop red CI, missing floor capabilities |
| C3 — production reconciliation | Restricted state/evidence, exact backup move, single-file restore and ff | Existing containers untouched; exact D recovery if ff fails | Separate production checkout recovery authorization for explicit F | Hash/permissions/equivalence/clean/ancestry; stop unexplained dirt, host trust/access failure |
| C4 — first safe deploy | Official image/container/Nginx rollout, external state; no env write in normal code mode | R2 safe config retained, pinned images; no DB rollback | Separate production deployment authorization including ingress/direct-access controls and API quiescence | Runtime floor/flags/mounts, schema compatibility, durable gate; stop migration diff, unknown old-image safety |
| C5 — health/hold proof | Read-only | Retain rollback artifacts | Within approved rollout verification | Actual images/builds, false/false, /data, readiness/errors/jobs; fail triggers only proven safe R2 |
| C6 — Product Acceptance closeout | Read-only API/UI; sanitized docs PR | No business data changes | UI/account and docs PR authorization; within separately approved closeout scope | Price/flock/languages/search/domain checks; never CLOSED on partial/empty-only evidence |

No current authorization extends to C1–C6 production actions. Successful design does not revive expired storage-migration, reset, remote cleanup or Chanjet reenablement authorizations. Production clean-worktree gate remains mandatory. Do not ignore tracked Compose, broaden env-backup ignores, accept dirty checkout, or discard arbitrary files.

## 15. Final decision status

```text
LATEST_MAIN=1fda3d2872396d5e19a03eb81d4f5796d9b3cced
STORAGE_MIGRATION_REQUIRES_DIRTY_COMPOSE=NO
CURRENT_DIRTY_COMPOSE_ROOT_CAUSE=R2_R3_CHANJET_HOLD_MAPPING_NOT_CODED_IN_TRACKED_COMPOSE
PRODUCTION_ENV_STORAGE_KEYS=PASS
PRODUCTION_ENV_CHANJET_HOLD_KEYS=PASS
DEPLOY_ENV_REWRITE_PRESERVES_STORAGE_KEYS=YES
DEPLOY_ENV_REWRITE_PRESERVES_CHANJET_HOLD_KEYS=YES
REPO_COMPOSE_PASSES_CHANJET_FLAGS=NO
CURRENT_ROLLBACK_CROSSES_CONFIG_FLOOR=YES (below proposed complete safety floor)
CURRENT_GIT_RESET_HARD_REQUIRED=NO
RECOMMENDED_CONFIG_MODEL=TRACKED_PARAMETERIZED_BASE_COMPOSE_PLUS_SERVER_ENV_PLUS_VALIDATED_CONFIG_FLOOR
RECOMMENDED_ROLLBACK_MODEL=R2_SAFE_CONFIG_RETAINED_PINNED_IMAGE_ROLLBACK_WITH_PERSISTENT_STATE
APP_DEFAULT_READONLY_SYNC_CHANGE=YES (recommendation; include recovery/manual full-cycle gates)
EXTERNAL_COMPOSE_OVERRIDE_RECOMMENDED=NO
ONE_TIME_TRANSITION_REQUIRED=YES
FILES_TO_CHANGE=Section 11; no files implemented in this phase
TESTS_TO_ADD=Section 12 A-K; no new production tests executed
PRODUCTION_IMPLEMENTATION_AUTHORIZED=NO
CHECKOUT_RECOVERY_AUTHORIZED=NO
DEPLOY_AUTHORIZED=NO
NEXT_ACTION=REQUEST_CONFIG_HARDENING_IMPLEMENTATION_AUTHORIZATION
```


## 16. Repository implementation outcome (C1/C2)

The original C0 investigation/alternatives above remain historical evidence. Repository implementation is now recorded in `production-config-hardening-implementation.md`; production actions remain NONE. Original design commit `6292f449` was retained and cleanly cherry-picked onto latest main (`c7d5759f`).

The implementation retains A + R2 and v1 machine-checked floor. It adds the Section 11 components plus reusable runtime capture and a **read-only** transition verifier. Both application defaults fail closed; service-level mirror and inbound gates supplement scheduled/manual/bootstrap controls. Non-dry-run AR ledger import now requires the independently explicit inbound gate; existing financial RBAC/confirmation and dry-run reads remain.

First-transition selection is the fail-closed option described above and explicitly allowed by implementation instructions: **pre-floor API automatic rollback is always HOLD**. There is no legacy-image waiver based only on zero counts or an ingress probe. Consequently no L4 fence is claimed/provisioned by this PR; optional tracked Nginx hold interface is tested but cannot grant rollback eligibility. Any operator-controlled legacy recovery still needs separately proven network/writer isolation and authorization.

A forward pre-floor transition requires explicit one-time dispatch authorization, full API+Web, no credential rotation, approved C3 certificate and safe floor-ready state. The certificate compares exact local/target Compose and verified archive bytes without executing recovery. Compose commands remain forbidden throughout the intermediate file reconciliation. Floor/project/approved tuple and active-image records are outside Git, restricted and set only under future C3 approval.

Floor checks now run against the target Git tree **before** FF and current tree afterward; safety-critical bytes must match the approved floor, and active-state floor is a monotonic anchor. Actual running API revision drives migration scope. Generic deployment holds any migration change and never recreates DB. Historical Phase1 target below F is HOLD; the common wrapper does not authorize schema exec/run, so independent schema authority needs fresh review before reuse.

Image-only rollback keeps safe HEAD, immutable pins and current .env. Persistent unfinished-transaction marker prevents maintenance/new deploys from using stale active records after cancellation/partial failure; nontransaction actual identities must match pins, and restart checks actual identity. DB/Web operations cannot indirectly restart an uncertified old API. No broad image pruning or implicit proxy/config rollback is permitted.

Current automated coverage A–K includes real isolated Compose/Nginx/create-only Docker fixtures, actual Bash ERR handling, env escaping/permissions/atomicity, source/default/manual/recovery gates, floor/ancestry/dirty cases, running API migration baseline after failed deploy, first transition certificate and interrupted-state fences. Independent review findings were fixed; new implementation tests are not skipped. Exact counts/results are in the implementation report.

Remaining authorization: merge/CI belongs to the current repository-only request; production reconciliation/deployment/quiescence/network controls remain **NO**. The merged SHA is a candidate floor, not a deployed revision. Obtain explicit ONE_TIME_PRODUCTION_CONFIG_FLOOR_TRANSITION authorization before any production mutation.

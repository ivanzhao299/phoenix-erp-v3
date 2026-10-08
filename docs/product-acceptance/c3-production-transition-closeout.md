# C3 v2 production transition and product acceptance deployment closeout

Date: 2026-10-08, Asia/Singapore. Explicit one-time authorization applied only to merged main `23c7af86dd122379d01248a3b9542b8165f31498`. Production operations used the formal GitHub Actions `production` environment and existing UID0 SSH identity. No manual SSH production operation was used.

## Outcome

```text
TARGET_SHA=23c7af86dd122379d01248a3b9542b8165f31498
C3_ACTIONS_RUN_ID=37738116329
ROOT_CONTROL_INITIALIZATION=PASS
ARCHIVE_VERIFICATION=PASS
C3_READONLY_ELIGIBILITY=PASS
CHECKOUT_RECONCILIATION=PASS
WORKTREE_CLEAN=YES
CONFIG_FLOOR_VERSION=2
CONFIG_FLOOR_ACTIVATED=PASS
DEPLOY_RUN_ID=37738270604
DEPLOY_MODE=full
ONE_TIME_CONFIG_FLOOR_TRANSITION=true
ROTATE_CHANJET_CREDENTIALS=false
API_DEPLOY=PASS
WEB_DEPLOY=PASS
MIGRATION_BASELINE_SOURCE=RUNNING_API_REVISION
MIGRATION_PATH_DIFF=0
RUN_MIG=false
DATABASE_MIGRATION=NO
EXPLICIT_DATABASE_MUTATION=NO
DATABASE_MUTATION=NO (task-directed schema/business DML; not a database-content snapshot claim)
BUSINESS_DATA_MUTATION=NO
STORAGE_GUARD=PASS
CHANJET_READONLY_SYNC_ENABLED=false
CHANJET_ERP_INBOUND_SYNC_ENABLED=false
CHANJET_REMOTE_MUTATION=NO
PRICE_ANOMALY_API=PASS
FLOCK_FARM_DISPLAY=PASS
FLOCK_HOUSE_DISPLAY=PASS
ZH_DISPLAY=PASS
EN_DISPLAY=PASS
LO_DISPLAY=PASS
SEARCH_BY_FARM_NAME=PASS
SEARCH_BY_FARM_CODE=PASS
SEARCH_BY_HOUSE_NAME=PASS
SEARCH_BY_HOUSE_CODE=PASS
SAME_CLASS_PRODUCTION_SMOKE=PASS (bounded read-only navigation and available labels; empty record branches UNVERIFIED)
PRODUCT_ACCEPTANCE_FEEDBACK_STATUS=CLOSED (reported display defect and authorized deployment; remaining human acceptance/data-quality scope below)
NEXT_ACTION=RETURN_TO_HUMAN_PRODUCT_ACCEPTANCE
```

Evidence runs:

- [C3 initialization and transition 37738116329](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/37738116329).
- [Official exact-main full deploy 37738270604](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/37738270604).
- [Independent read-only runtime/config verification 37738964572](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/37738964572).

## Reviewed initialization entrance and authority

Merged main had no first-initialization entrance: its bootstrap required an existing trusted state directory and lock. The user's authorization expressly permitted a temporary independently reviewed Actions entrance without changing the authorized release SHA.

Temporary branch `codex/c3-transition-23c7af86` reused the registered diagnostic workflow path, bound execution to the separately reviewed full entrypoint commit and program digest, and used the exact formal deploy host/user/key/port/proxy parameters and `production` environment. It was not merged into main. All policy/contract/validator/runtime-capture/state-writer bytes were extracted from the exact merged target, delivered as a digest-checked path-whitelisted package, then independently byte-compared with the production Git target objects before staging in the trusted root tree. No branch application code/configuration was deployed.

C3 entrypoint commit: `30add5ac581d529f9f4e1974b432ef3ea01a9e81`.
Reviewed orchestration SHA256: `2e27fed2792f6217245af976ea60521da2a2f991bc887bce331a8d4a69d6c118`.
Read-only closeout entrypoint commit: `85b8550de73d5d4916a868a446e3781870ea88c0`.
Reviewed closeout program SHA256: `b709d7d67b368b40a6e696a83154af990c857ab1b6902ac84fd9de6fbb158d2f`.

Independent security review identified and corrected hidden Git execution risks before C3: per-command hooks/fsmonitor/attributes/auto-maintenance were disabled, system attributes were excluded, and repository/target attribute sources were rejected. An isolated real Git test proved post-merge and fsmonitor hooks did not run. The later read-only entrance additionally sets `GIT_OPTIONAL_LOCKS=0` so status checks do not optionally refresh/write the index. Both exact entrance revisions received final independent PASS before dispatch.

Local temporary-entrance/deploy/storage validation: 32 tests PASS, no skips; the extended read-only entrance suite: 17 tests PASS. Actionlint, Node syntax and diff checks PASS. Existing target CI and official deployment typecheck/regression both PASS.

## Root control, archive and checkout reconciliation

Admission revalidated UID0; physical paths, complete ancestor ownership/modes, absent extended/default ACLs, mountinfo, and the approved ext4 root mount for `/`, `/var`, `/var/lib`. No control tree or legacy v1 state existed. Exclusive root0700 directory creation and revalidation established:

- `/var/lib/phoenix-erp`
- `/var/lib/phoenix-erp/production-deployment-state`
- `/var/lib/phoenix-erp/production-checkout-recovery`

Merged `atomicState` performed exclusive/no-follow0600, fsync/atomic-rename state writes; FD9 flock was held continuously across reconciliation and admission. A C3-owned transaction marker protected the transition and would have remained on failure. It was cleared only after all post-FF guards, container-identity and evidence checks passed.

Original backup and untouched UID1002 historical copy were independently read through pinned no-follow descriptors and matched the separately approved historical digest:

`637c78b837ebb5f6798e74f175d42718a424c5fe932bc6f02b3ee9f1ff7a9754`.

New root-owned primary copy:

`/var/lib/phoenix-erp/production-checkout-recovery/c3-37738116329-1/.env.pre-verification-20261005T114700+08:00.root-copy`

Preserved original (moved from checkout with exact, non-clobber cross-filesystem move after verification):

`/var/lib/phoenix-erp/production-checkout-recovery/c3-37738116329-1/.env.pre-verification-20261005T114700+08:00.preserved-original`

The historical `/home/phoenix-codex-deploy/production-checkout-recovery/20261008T063137+0800/` material retained its content and checked owner/group/mode/size/mtime/ctime; atime was not asserted unchanged; no chown or overwrite was performed. The original's content/ownership/mode were retained. No env contents were logged or committed. Live production `.env` stayed UID1002/0600, ignored by Git, and byte-identical throughout deployment.

Local dirty Compose was byte-identical to the merged target and differed from old tracked HEAD only by the two safe Chanjet pass-through entries. Current/old Compose and exact patch were archived privately before recovery. Merged `verifyTransition` proved the exact two-path dirty set, main/target/ancestry, full v2 contract, canonical five-key tuple, trusted archive and approved hash.

After backup relocation, only `docker-compose.yml` was restored to old HEAD, immediately followed by FF-only to the target. No Compose/container operation occurred in this bounded intermediate interval. There was no reset, stash, clean, arbitrary restore or global Git trust change. C3 concluded with clean main at the exact target and all three original containers unchanged.

State records `floor.json`, `active.json`, `transition-proof.json` and existing `mutation.lock` use v2/root0600 under root0700 parents. Initial active state recorded the actual old images with `C3_CONFIG_READY`, not an application deployment-success claim. Actual deployment subsequently wrote `SUCCESS`, and post-deploy guard confirmed there was no unfinished transaction, all critical file bytes/floor ancestry matched, and actual runtime pins matched active state.

## Deployment identity, migrations and storage

Before deployment actual API revision was `017633c5fb0a090d7b8cda375125d1832668f304`; actual Web revision was `5425089bcb51338d4780d6f37782440bade8b90c`. Both were captured from immutable running image IDs and OCI labels, separately from the already-current checkout SHA.

Independent C3 and production state checks compared the actual old API revision to the target over all six migration paths. Difference: zero. Workflow recalculated `RUN_MIG=false`; no migration/DDL/business DML/data cleanup or storage copy ran. Both build jobs and full deploy passed. No rollback was needed. Pre-floor API automatic rollback remained forbidden; the operator-controlled HOLD policy was not exercised in production.

Post-deploy identities (OCI comparison performed in-process against full target SHA before PASS; Actions masks an unrelated substring in textual SHA logs):

| Service | Before OCI revision | After OCI revision | After immutable image ID |
|---|---|---|---|
| API | `017633c5fb0a090d7b8cda375125d1832668f304` | `23c7af86dd122379d01248a3b9542b8165f31498` | `sha256:69050540350d1f9f501960e6fe85d56ffb3b8b059b5111cf436371872638503b` |
| Web | `5425089bcb51338d4780d6f37782440bade8b90c` | `23c7af86dd122379d01248a3b9542b8165f31498` | `sha256:92cb26fadc8185aa5f391f36eb303e02cb61a82693c4b72652960bb24ab755e3` |

DB/API/Web: healthy. API health/readiness and Web HTTP checks: 200/200/200. Critical API startup error classes scanned: zero. DB container ID and start time remained unchanged (`2026-10-05T04:03:03.533292753Z`). No DB restart/recreate occurred. This proves container identity/start-time stability, not immutability of all running database contents; authentication and normal service activity were not represented as a before/after database-content audit.

Actual DB bind remains `/data/phoenix-erp-data/postgres` → `/var/lib/postgresql/data`; actual API uploads bind remains `/data/phoenix-erp-data/uploads` → `/app/uploads`. Effective Compose, actual container mounts, `/data` mount, sentinel and mount guard passed. No named-volume fallback, storage migration rerun, Docker-data relocation or DB copy occurred. The small root control/evidence tree is operational metadata, consistent with the completed /data migration of checkout/PostgreSQL/uploads and deferred Docker/backup migration scope.

Strict GitHub SSH checking was enforced per process while preserving the existing identity; no SSH config, key or remote change occurred. No credentials rotated. Running API flags are explicitly false/false. Legal-account GET sync-jobs returned 200 with zero jobs; GET alignment status returned 200 with no run ID. No manual sync/recovery/writeback/start endpoint was called. Existing pending-writeback database inventories were NOT_RUN; this task did not inspect/write their tables or claim an inventory result.

## Real readonly product acceptance

Windows Chrome `--headless=new`, random CDP port and independent temporary profile were used. Credentials came from the previously approved local file, stayed in memory, and were not embedded in scripts/logs/commits. Login was the only POST; all further API operations were GET. No business mutation or Chanjet remote call occurred.

Real flock `LPH_MS_F02`:

| Field | Primary canonical name | Secondary code | zh / en / lo |
|---|---|---|---|
| Farm | 孟赛蛋鸡场 | `LPH_MENGSAI` | PASS / PASS / PASS |
| House | 2号鸡舍 | `HOUSE_MS_02` | PASS / PASS / PASS |

Both scoped lookups return real canonical single names and no locale-name fields for these records. English and Lao correctly retain canonical names plus code; no DOM machine translation, code-only fallback, null/undefined/object rendering or name duplication occurred. Farm/house code and canonical name searches all found the real batch; a negative unmatched search removed it. Price-anomaly GET with `threshold=5&limit=100` returned HTTP200 with zero data rows and no42703. Empty price data proves query/read health, not populated price ordering; the prior isolated regression covers ordering.

All26 fixed routes plus henhouse reference were opened in three locales (27 routes,81 view states). Ten existing scoped lookup domains returned200. Final smoke recorded zero unexpected4xx/5xx, page errors, blocked non-read requests or valid-association code-only labels.

| Domain | Routes | Navigation/API/locale smoke | Actual named-label branches observed |
|---|---:|---|---|
| breeding | 10 | PASS | `/breeding/flock`, `/breeding/henhouse`, `/breeding/henreport` |
| packaging | 2 | PASS | UNVERIFIED — no matching business label in these views |
| quality | 4 | PASS | UNVERIFIED — no matching business label in these views |
| warehouse | 2 | PASS | UNVERIFIED — no matching business label in these views |
| sales | 4 | PASS | `/sales2/pricing` |
| finance | 3 | PASS | UNVERIFIED — no matching business label in these views |
| store | 2 | PASS | UNVERIFIED — no matching business label in these views |

Empty/list/detail branches without a real matching business record are **UNVERIFIED for record-label presentation**, not PASS claims for nonexistent data and not failures. No production fixture/data was created to fill them. Named labels were checked against authoritative permitted lookup names, including current locale/canonical fallback. This bounded smoke does not assert production verification of every detail/tab, every row or every RBAC role. Source/fixture coverage for all actual fixes remains in PR#360 and the historical test report. Human acceptance should exercise populated business workflows as appropriate.

The first harness attempt used Node's direct HTTP transport and timed out before display assertions; its separate seven-second transport reproduction also timed out while Windows Chrome and external/Actions health reads returned200. The second sample waited for a page load/control and timed out on the warehouse view; a separate readonly view returned200 with the control present and no API errors. Final sampling used explicit viewport and DOM readiness rather than those harness waits. Initial incomplete records were retained; neither was reported as a production defect or silently counted as PASS.

A stricter detector initially matched houses only by code and identified historical debug flock `FK-DEBUG-001`: flock farm `F-DEBUG` versus master house `H-DEBUG-A01` farm `LPH_MENGSAI`, name `X`. Both legal GETs returned200 and prove the mismatch. Independent review confirmed `flockMasterLabels` correctly uses farm+house association and cannot apply another farm's name. This record is **SEPARATE_MASTER_DATA_GAP**, with safe code fallback; no record/association was repaired. Final detection used the same composite association for flock labels. Production uniqueness constraints were NOT_RUN; no SQL connection or schema assertion was invented.

## Evidence and remaining scope

Restricted production evidence:

- `/var/lib/phoenix-erp/production-checkout-recovery/c3-37738116329-1/`: authenticated merged helper package, preserved backups, safe/old Compose and patch.
- `/var/lib/phoenix-erp/production-deployment-state/c3-inputs-37738116329-1.json`, `c3-evidence-37738116329-1.json`, floor/active/proof, official `deploy-37738270604-1.json` and runtime-before evidence.
- Local restricted `/tmp/phoenix-c3-37738116329`, `/tmp/phoenix-deploy-37738270604`, `/tmp/phoenix-post-37738964572`, `/tmp/phoenix-production-acceptance-23c7` retain sanitized runtime results, route/locale assertions, screenshots and incomplete harness records. Only sanitized conclusions are committed; no backups/env/credentials/raw logs are uploaded by this documentation PR.

This docs-only closeout does not deploy again or automatically advance the production floor to its documentation merge SHA. Active API/Web/floor remain the authorized `23c7af86...`. Return to human product acceptance. Cross-farm debug association and unpopulated workflow/detail branches remain separate acceptance/data-governance scope; cleanup or new data requires separate authorization.

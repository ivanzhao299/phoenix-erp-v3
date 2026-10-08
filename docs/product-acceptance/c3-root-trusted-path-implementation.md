# C3 root trusted path and Actions identity contract implementation

Date: 2026-10-08, Asia/Singapore. Repository correction; production activation is **not authorized** in this phase.

```text
BASE_MAIN=8d76b551fccae60ebadfec5c85896007e1e0ce51
BRANCH=codex/c3-root-trusted-path-contract
CONFIG_CONTRACT_VERSION=2
ROOT_TRUSTED_CONTROL_ROOT=/var/lib/phoenix-erp
ROOT_TRUSTED_STATE_ROOT=/var/lib/phoenix-erp/production-deployment-state
ROOT_TRUSTED_ARCHIVE_ROOT=/var/lib/phoenix-erp/production-checkout-recovery
ACTIONS_EXECUTION_UID=0
PRODUCTION_MUTATION=NO
C3_EXECUTED=NO
DEPLOY_EXECUTED=NO
NEXT_AUTHORIZATION=NEW_MERGED_SHA_ROOT_DIRECTORY_INITIALIZATION_AND_ONE_TIME_CONFIG_FLOOR_TRANSITION
```

## Problem and actual path verification

PR #363's contract v1 used the manual operator's UID1002 HOME for state/archive admission. Formal Actions SSH instead executes as UID0. Creating root-owned leaves beneath that user-writable parent does not establish a root-controlled namespace. The existing legacy archive and env backup must remain intact.

The previously local proposal was read first and preserved via docs-only cherry-pick `3e9692af` from `8fb2ebb7`; its historical values were not mechanically rewritten.

[Formal Actions read-only verification run 37730169693](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/37730169693), source diagnostic commit `85a590d9`, proved:

- Actual execution UID0.
- `/`, `/var`, `/var/lib`: real directories, canonical paths, UID0 and mode0755.
- Their POSIX access/default ACL xattrs are absent; existing Python3 can read this metadata without installing server packages.
- `/var/lib` resolves on root mount `/`, source `/dev/nvme0n1p3`, filesystem ext4, filesystem-root `/`.
- `/var/lib/phoenix-erp` and the two intended control directories do not exist. They were not created.

This supports the chosen contract; it is not a permanent certificate. Runtime admission rechecks filesystem/mountinfo, ownership, modes, ACLs and canonical paths on every controlled access.

## Implementation and boundaries

`production-config-contract.json` v2 owns control/state/archive paths and execution UID0. The only remaining old state path in active code is `legacyStateDirectory`: its presence deliberately causes HOLD so a v1 transaction/high-water record cannot be silently abandoned. Archive admission uses the new contract field, not a HOME-prefix string.

`production-trusted-paths.mjs` validates every ancestor from `/`, rejects symlink/canonical substitutions, non-root ownership, group/other write, extended/default ACLs, wrong0700 control-directory permissions and unapproved mounts. `/proc/self/mountinfo` detects same-device bind mounts and nested control-tree mounts; st_dev alone is not treated as proof. The reviewed allowed boundary is the ext4 root mount. Files require regular/no-symlink, UID0,0600 and one link, including lock metadata. Unsupported/unavailable ACL or mount metadata is HOLD.

Pinned file reads use O_NOFOLLOW and a single FD, fstat/identity checks before and after reading, then named-file and parent/mount identity checks. State writes use exclusive/no-follow temporary files, checked0600/root ownership, fsync, unchanged-parent/destination/temporary identity checks, atomic rename and directory fsync. Failures retain prior markers and do not delete a foreign replacement temporary.

The threat boundary is explicit: non-root path replacement is rejected; trusted root/capability holders and approved runner code must obey the shared lock. This is not a claim of an openat2 sandbox against a malicious non-cooperating root.

`production-control-bootstrap.sh` is staged with the contract and standalone helper from each caller's reviewed Actions runner checkout. It performs complete read-only path/lock preflight **before** opening existing FD9, uses a non-truncating open and flock, and creates no control directories/lock. All three production callers consume that payload; the maintenance caller now checks out its exact workflow revision too. An old production checkout cannot substitute an old bootstrap before fetch.

Strict Git SSH policy is explicit in the bootstrap and Node Git wrapper: BatchMode, StrictHostKeyChecking=yes, UpdateHostKeys=no and no multiplexed connection reuse. Mandatory options precede weaker supplied options; existing -i/-F and normal ~/.ssh/config identity selection are retained. Opaque custom SSH programs/shell constructs HOLD rather than silently replacing an identity. No key, remote or SSH configuration file is changed.

Version checks reject v1 active/proof/transaction records; floor critical-byte/version checks stay intact. The v2 proof binds execution UID, archive root/path, new target and digest. Begin rechecks its archive before switching. Pre-floor API rollback remains HOLD; running API OCI revision continues to drive migration ancestry/diff, code-only admission and RUN_MIG=false. Clean-main, scope/RBAC, /data guard, storage parameters and Chanjet false/false defaults are unchanged.

## C3 archive contract and future procedure

The verifier is read-only. It checks the full target contract and critical file presence, exact target/main/ancestry/known dirty set, exact Compose bytes and canonical runtime tuple. Its archive copy must be within the v2 trusted archive root, UID0,0600,regular/no-symlink/single-link, with trusted ancestors.

Original UID1002 backup is read through a pinned no-follow FD without changing owner, mode, content or path. The new root copy and original must both match the separately approved historical digest. CLI requires that digest explicitly; matching two newly altered files does not prove historical integrity.

For the current preserved backup the approved digest is:

`637c78b837ebb5f6798e74f175d42718a424c5fe932bc6f02b3ee9f1ff7a9754`

Future separately authorized setup must also reverify the untouched old archived copy, establish the root-owned0700 tree and root-owned0600 new copy/lock, preserve all originals, and initialize floor/active/proof using the actual old images. Verifier CLI shape is:

```text
node scripts/ops/verify-config-floor-transition.mjs <NEW_APPROVED_SHA> <NEW_ROOT_ARCHIVE_COPY> <APPROVED_TUPLE_JSON> <APPROVED_BACKUP_SHA256>
```

The new merge SHA is only a candidate floor. Old `8d76b551...` and v1 state cannot be relabeled version2 or automatically activated. Any preexisting legacy state requires explicit reconciliation; no old pending transaction is discarded. Root versus UID1002 .env credential rotation remains independently HOLD; ordinary deploy does not rewrite .env and this correction does not relax the env owner check.

## Old-reference audit

Whole repository rg scan for both complete old state/archive strings (excluding dependency/generated directories):

| Reference | Classification / treatment |
|---|---|
| Three production workflow STATE_DIR literals | Removed; all resolve paths from the runner-staged v2 contract |
| Transition verifier HOME archive prefix | Removed; canonical contract archive containment and trusted metadata |
| Contract legacyStateDirectory | Intentional retirement/HOLD detector only; never used for new writes |
| New negative test with legacy archive path | Intentional rejection fixture |
| `c3-actions-root-identity-alignment.md` HOME paths | Preserved historical UID1002 evidence/proposal |
| Earlier `production-config-hardening-implementation.md` state path | Preserved v1 historical report with dated v2 correction appended |
| Other UAT evidence roots and existing .docker credential path | Not this state/archive contract; unchanged, no secret reads or permission changes |

No active state/archive path remains separately hardcoded in a workflow/helper.

## Test matrix

All fixtures are unit mocks, private temp files, disposable local containers or SSH -G configuration inspection. No production DB/Chanjet calls.

| Required case | Evidence |
|---|---|
| 1 Root ancestors PASS | Complete virtual root metadata chain and actual read-only parent run |
| 2 UID1002 writable parent FAIL | UID1002 modes0700/0750/0755 rejected despite root-owned leaf |
| 3 Symlink parent FAIL | Symlink/canonical substitution and no-follow file tests |
| 4 Unexpected mount FAIL | Same-device bind, nested/stacked mounts, unknown FS and kernel escapes |
| 5–7 Wrong state/archive owner/file mode FAIL | UID1002,0600 violations, special permission bits and links |
| 8–10 Archive digest mismatch/match/original unchanged | Transition fixture requires pinned history, rejects differing and jointly changed copies; pinned original metadata/bytes retained |
| 11 Paths consistent | Three runner payloads share the sole contract; no active literal drift |
| 12 Strict SSH | Selected -i options retained; real ssh -G confirms yes precedes existing no |
| 13 FD9 | Actual Bash preflight failure creates no lock; success preserves bytes and holds FD9 until shell exit |
| 14 Unfinished transaction HOLD | Existing ownership/foreign-run tests plus v1 legacy/version rejection |
| 15 Pre-floor API rollback HOLD | Existing image rollback/source-floor tests |
| 16 Running API migration baseline | Older actual API vs newer retained checkout migration fixture |
| 17 Chanjet false/false | Existing Compose defaults, independent values and source contracts |
| 18 /data guard | Existing real Compose/storage guard regression |
| 19 Clean worktree | Existing tracked/untracked/index/main gates and scoped Git ownership fixture |
| 20 Explicit first-transition approval | Full/API/Web, rotation-off, v2 proof and separate opt-in tests |

Local validation (Node20/pnpm9):

- 75 related Node tests PASS in the final combined run; all 27 new trusted-path cases execute, none are skipped.
- API and Web typecheck PASS, zero errors; no app source changes.
- actionlint and Bash syntax validation PASS; git diff --check PASS.
- Independent security review PASS with the root/runner trust boundary above.
- Required PR CI is the merge authority; its final results are recorded in the task closeout, not assumed here.

During development a new test had a syntax typo and the combined command initially used a nonexistent test filename. Both were corrected; executed suites were rerun. No implementation failure was suppressed or labeled unrelated.

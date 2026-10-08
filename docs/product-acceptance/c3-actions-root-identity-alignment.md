# C3 formal Actions identity alignment — HOLD and minimal contract proposal

Date: 2026-10-08. This phase performed read-only production inspection. No initialization, SSH configuration change, fetch, checkout reconciliation, floor activation or deployment occurred.

## Verified execution and evidence

- Frozen main remains `8d76b551fccae60ebadfec5c85896007e1e0ce51`.
- Formal Actions execution UID is 0 (root), not the manual operator UID 1002.
- Read-only run: https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/37729168132
- Diagnostic branch: `codex/actions-deploy-identity-precheck`; workflow source `2ad0ca4e`. It uses the production environment and the same target/proxy SSH inputs as deploy.yml. No diagnostic change is merged into main.
- Strict per-command SSH and repository ls-remote PASS; remote main equals the exact authorized target. The existing repository-bound public identity is valid; no replacement key is required.
- Root SSH config file is absent. Effective default is `stricthostkeychecking ask`. Tests explicitly enforce `yes`, disable UpdateHostKeys and connection reuse; the default has not been changed.
- Production HEAD remains `017633c5fb0a090d7b8cda375125d1832668f304`; HEAD and porcelain status are unchanged by the inspection.

| Path | UID | Mode | Actual canonical path |
|---|---:|---:|---|
| `/` | 0 | 0755 | same |
| `/home` | 0 | 0755 | same |
| `/home/phoenix-codex-deploy` | 1002 | 0750 | same |
| `/home/phoenix-codex-deploy/production-checkout-recovery` | 1002 | 0700 | same |
| Recovery archive `20261008T063137+0800` under that directory | 1002 | 0700 | same |
| `/home/phoenix-codex-deploy/production-deployment-state` | absent | — | not initialized |

`floor.json`, `active.json`, `transition-proof.json`, `mutation.lock` and `transaction.json` are absent. Required future state directory is execution-UID-owned 0700; JSON files must be regular, non-symlink, execution-UID-owned 0600. The shared lock also needs an explicit regular-file/owner/mode check and the existing held-FD/inode checks.

The exact original env backup and archived copy are regular files, UID 1002, 0600, 614 bytes. Original inode: 3145758. Both SHA256 values match:

`637c78b837ebb5f6798e74f175d42718a424c5fe932bc6f02b3ee9f1ff7a9754`

Original: `/data/phoenix-erp/.env.pre-verification-20261005T114700+08:00`.

Archived copy: `/home/phoenix-codex-deploy/production-checkout-recovery/20261008T063137+0800/.env.pre-verification-20261005T114700+08:00`.

No contents, private keys or credential values were printed or committed.

## Why v1 initialization is HOLD

Contract v1 fixes the state path inside UID 1002's writable HOME. The transition verifier fixes the archive prefix inside that same tree and requires archive-file owner to equal the execution UID (now 0). Existing archive owner therefore fails the gate.

Creating a root-owned child or new root-owned copy in that tree does not establish an independently controlled root namespace. A writable directory's owner can rename its child within the same parent and occupy the original name without entering that child. Existing leaf owner/realpath checks do not verify all ancestors or close the subsequent path-access race. See [Linux rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html).

Independent source review confirmed this conclusion. The current guard validates only the state leaf; the verifier validates archive file metadata and a literal prefix. This task expressly requires trusted parents and HOLD when the fixed archive path cannot satisfy the model. No leaf-only workaround, HOME-wide chown, broader permissions, unchecked symlink, gate suppression or raw production patch is approved.

## Minimal proposed repository correction — NOT IMPLEMENTED

Keep the formal root Actions model and existing repository identity. Introduce one reviewed root control tree, provisionally `/var/lib/phoenix-production`, subject to read-only verification of every ancestor, ACL and mount boundary before approval. Its state/recovery subdirectories are 0700 and all state/evidence files 0600, owned by UID 0. Existing archives remain intact.

1. Version the ownership/path contract explicitly (proposed v2): define state and archive roots under the approved control tree plus expected execution UID. Do not invent a merge/floor SHA. Centralize both paths instead of independent literal prefixes.
2. Add a shared trusted-path validator: all ancestors must be regular non-symlink directories with approved root ownership and no non-root write access; validate ACLs as applicable. Validate canonical archive containment and regular-file/owner/mode identity. Retain lock exclusivity/inode checks and add lock-file symlink/owner/mode checks.
3. Update all three production callers to the same reviewed contract/lock path. Preserve clean-main, exact target, critical-byte floor, running-API migration baseline, no-migration admission, transaction markers, pinned images and pre-floor API recovery HOLD.
4. Once that correction is reviewed/merged and separately authorized, create the trusted tree. Copy the backup to a new root-owned file without modifying originals; check source/copy metadata, inode and pinned hashes before and after copying. Require original, old archive and new copy hashes to agree. No secret content output.
5. Independently authorize the minimal root `Host github.com` configuration with `StrictHostKeyChecking yes`; preserve existing identity and known_hosts and every other host's policy. Do not create/change a private key or remote.
6. Run the revised transition verifier from the beginning, then perform C3 and the official full deployment only after all gates PASS.

Exact implementation scope:

- `scripts/ops/production-config-contract.json`
- `scripts/ops/production-config-guard.mjs` (shared ancestor/file/lock validation)
- `scripts/ops/verify-config-floor-transition.mjs` (contract archive root, parent validation)
- `.github/workflows/deploy.yml`
- `.github/workflows/production-disk-maintenance.yml`
- `.github/workflows/phase1-controlled-production-execution.yml`
- Corresponding Node deployment/storage/transition tests and operational documents; the diagnostic workflow can be updated to inspect the approved paths.

Other helpers already consuming `CONTRACT.stateDirectory` should retain that single source; confirm by search and tests. No database migration, external Compose override, key replacement or storage relocation is proposed.

Required regression coverage: reject non-root-owned writable ancestors even with a root-owned 0700 leaf; reject symlink/ACL write access/incorrect owner or modes; reject archive escape, hash drift and changed source identity; require a regular owned lock; prove all callers share paths; preserve existing floor, rollback, migration and clean-worktree tests.

Changing contract/callers changes safety-critical bytes. A new merged revision and explicit target/floor authorization are required; the old frozen `8d76b551...` cannot silently deploy modified operational code. This document is a proposal only, not that authorization or implementation.

## Final status

```text
ACTIONS_DEPLOY_UID=0
SSH_STRICT_POLICY=PROBE_PASS_DEFAULT_ASK_UNCHANGED
STATE_DIRECTORY_OWNER=ABSENT
STATE_OWNER_MATCH=NOT_INITIALIZED
ARCHIVE_OWNER_MATCH=FAIL_UID_1002_EXPECTED_0
ARCHIVE_SHA256=PASS
C3_READONLY_ELIGIBILITY=NOT_RUN_PREREQUISITE_HOLD
CONFIG_FLOOR_ACTIVATED=NO
PRODUCTION_CHECKOUT_CLEAN=NO_RECOVERY_PERFORMED
PRODUCTION_DEPLOY_STATUS=NOT_RUN_HOLD
PRODUCTION_FILE_MUTATION=NO
DATABASE_MUTATION=NO
CHANJET_CHANGE=NO
BLOCKER_IF_ANY=ROOT_EXECUTION_AND_V1_NONROOT_CONTROLLED_PARENT_PATHS
NEXT_ACTION=REQUEST_MINIMAL_CONFIG_CONTRACT_CORRECTION_AUTHORIZATION
```

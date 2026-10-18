# Registered native main fast-forward transport

Scope: source engineering only. No production operation was attempted. This
module is not a production admission producer; its observation always says
`productionAdmission:false`. The 17-producer factory remains uninstalled and
default-deny. It cannot be enabled by JSON, an environment flag or a CLI.

## Actual mechanism

The fixed launcher initially inspects FD9 and waits for a bounded single GO.
The controller explicitly duplicates its own original FD9 into the launcher,
registers that actual child with the deployment session, refreshes admission,
rechecks native Git, refreshes admission again and only then grants GO. EOF,
invalid input, registration failure or revoked admission cannot run Git.

The launcher requires an independent lock contender to fail and a nonblocking
flock on inherited FD9 to succeed. Thus inode equality alone is insufficient:
a separately opened descriptor for the same locked inode is rejected. There
is no explicit unlock. The launcher execs `/usr/bin/git` at the same PID,
preserving the held open-file-description if the controller dies.

Git uses fixed main-preserving `merge --ff-only --no-overwrite-ignore`, no
hooks/fsmonitor/auto-maintenance/autostash, one checkout worker and no recursive
submodules. It rejects external filters/signature helpers, merge options,
partial-clone configuration, environment injection, hidden index flags, sparse
indexes, gitlinks, linked worktrees, grafts/replacements and alternate object
stores. It does not silently clear configuration or flags. Target object
closure must already exist locally; this mechanism never fetches.

The trusted caller must durably write an exclusive intent before launch. Any
failed attempt is one-shot; neither success nor failure permits automatic
retry. The actual registered child remains debt through stdio `close`.
Unknown completion after GO retains the inherited lock while the child lives;
no kill/reset/rollback/marker cleanup is issued by the mechanism.

All native reads share the monotonic operation budget, and the final return
also checks it. Raw Git stdout/stderr/config values are consumed but never
included in observations, which contain only hashes and approved identities.

## Evidence and limitations

Actual owned temporary repositories and the real deployment-session child
registry verify: clean main fast-forward; no capabilities/self FD9; registration
refusal; final admission revocation; parent exit before GO; actual `/usr/bin/git`
exec identity and lock retention after parent exit; dirty/untracked/divergent/
detached/remote-ref drift; ignored collision preservation; external executable
config refusal; wrong open-file-description; unlocked FD9; linked worktree;
assume-unchanged/skip-worktree, sparse and gitlink refusal; shared read deadlines and actual Git-exec timeout with retained child debt.
The Git-exec crash fixture signals only its verified owned local Git PID, checks
its `/proc` start identity, then resumes that same PID. No production PID is used.

Initial tests had 7 PASS/2 FAIL because host Python environment injection was
correctly rejected before the intended assertions. Fixtures were isolated;
production environment policy was not weakened. Independent review identified
and the implementation closed hidden-index P1 and deadline/common-directory/
parallel-checkout P2 findings. Tests and final review are recorded per exact PR
HEAD; this document is not a production receipt.

Still required before installation: real typed PREPARE_PROMOTION admission,
fresh independent isolation/remote main and runtime checks, trusted source
helper staging and hashes, exact floor/active/CODE_HOLD/promotion bindings,
immutable owner/context intent and post receipt, and formal begin/candidate
assembly. `revalidate`, `writeIntent`, and registration capabilities must come
from that reviewed compiled factory; test callbacks confer no authority.
Actual production root/trusted paths/FD9, runtime ownership, full deployment
timeout/abort faults and load/performance remain NOT_RUN. Source review and local transport
proof do not satisfy these independent release gates.

Historical verification of implementation HEAD 9ba44c9b, before fixture
isolation and the f4441dd0 base update: 13 transport cases PASS; combined pure
protocol/CI fixtures 399 PASS, 12 SKIP; existing staged-bundle cross-version
contract cases 5 PASS. Tests use Node20 and native Linux Git/flock.
Skipped Docker/PG-gated suites are not claimed as passes. CI and actual production
results must be recorded separately for the eventual exact commit.

The initial hosted pure-suite run 39157739142 failed 10 fixture assertions:
its native preflight reported unsupported executable Git configuration before
the intended cases. This failure is retained; the exact configured category
was not present in that run's log and is UNVERIFIED. Production configuration
refusal remains unchanged. The 13 native cases now run explicitly in a tracked-
source owned image with Git/Python/flock, no network, no writable host mounts,
read-only root, tmpfs and no capabilities. The general host suite records them
as SKIP; a separate mandatory CI step must actually execute all 13. This is
fixture isolation, not a production Git policy override. Do not count host
SKIP as PASS. Current image/CI results must be archived for the updated HEAD.

Post-isolation/base-update code HEAD 4459fa59808f1c396a8cb6a867bbc0232cb10b4b:
local owned image 13 PASS / 0 SKIP, general host suite 391 PASS / 25 SKIP
(the latter includes all 13 explicitly deferred native cases). These receipts
are scoped to that exact code; the updated PR's official CI must run and record
its actual SHA independently. No historical result is a production admission.

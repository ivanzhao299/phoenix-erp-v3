# Native candidate collector fixture

This fixture runs in two separate disposable GitHub-hosted VMs, one for PG16
and one for PG18. It tests default production I/O rather than substituting
Docker, API, catalog, file, mount or root/FD9 callbacks. Native acceptance is
NOT_RUN until both exact-source hosted jobs and their receipts have passed.

The host script rejects existing fixed paths, an existing `/data`, containers
already on the daemon, a containerized host, wrong source or wrong UID. It
checks the real ext4 root, ancestors and ACLs before creating paths. It records
intent before its owned loopback ext4 volume and uses native `/var/lib` control
paths. The source checkout has an independent `.git`; tracked source is clean.
Dependencies are links to the same hosted checkout's frozen-lockfile install;
their installation source and lock digest are distinct from the Git SHA.

A protected fixture marker binds the same parent shell, source, PG major and
owned backing-file directory. The parent shell retains genuine FD9. The native
PG hook checks the empty fixed data directory and actual loop device/backing
file. Production paths and guard/mount rules are unchanged. No production
secrets, environment, SSH or workflow_dispatch is used.

The source-built ERP starts FENCED with an actual readonly public bind, uploads
bind and Compose identity labels. Its API/control identities, real PG database
and original root transport are correlated through default collectors in:

- PRE_ADOPTION during the actual local VERIFY intent;
- ADOPTED with actual private/public generation-2 files;
- ADOPTED through the actual local VERIFIED_FENCED phase archive.

Maintenance authority, old runtime/Web identities, historical replacement and
five-domain records remain SYNTHETIC_TEST_ONLY. The fixture does not execute
Compose replacement, first-switch maintenance, ingress enforcement, formal
deployment completion or Web HTTP. `productionReceipt=false`, registry=false
and continuousIngressProof=false remain mandatory. It does not install the
17-producer factory or produce a complete candidate lease.

Real negative cases cover missing parent FD9, wrong FD9 inode, an additional
public bind mount and a storage path on the wrong mount. The public bind's
native rejection is checked independently; the collector's generic sanitized
HOLD is preserved. Only an exact source/inode/mount reinspection permits its
unmount. Unknown mount completion stays failed and retained.

Each original control child is retained through bounded stdio close; server
backend absence is checked independently. Container creation names/intents,
source/image IDs and unknown outcomes remain in failure receipts. Only complete
IDs verified by capsule owner labels may be stopped. Files, images, networks,
data volume and mount are retained until hosted-VM disposal; that is not a
completed recovery or all-resources cleanup proof. There is no retry of a failed
collector or production action.

The root fixture has bounded native commands, root operation deadlines and a
bounded child join, supervised by the isolated job's 40-minute outer timeout.
A runner kill or infrastructure loss cannot guarantee final archive delivery;
missing receipts or failed jobs cannot be accepted as native PASS. Only fixed
non-secret JSON receipts are exported, with failure-path exit status retained.

The first hosted source397a0d4a run39165263567 failed API startup before acquiring
a root lease. Its failed receipts remain separate from subsequent acceptance.
Code inspection identified an initial manifest written as0400 under umask077;
the fixture now explicitly sets0444 on the new descriptor and tests restrictive
umask plus refusal to overwrite. Startup diagnostics export only fixed boolean
error signals and a log digest. The old failure lacked those signals, so its
unique root cause is UNVERIFIED until the new native execution is assessed.

The second source7e3b51d3 run39165669011 also failed startup: both receipts now
prove EACCES and exit1 with no original root child created. Source-built runtime
files also inherited the private host umask, while the image executes as UID1000.
Only the runtime build now temporarily uses022 and restores077 even on failure;
private state modes are unchanged. A separate owned network-disabled container
must prove the actual image payload is readable as UID1000 before API startup.
The EACCES signal alone does not identify every denied path or a unique cause.

Source4c1afecf run39166098845 failed the new image probe before PG/API creation.
A separate local owned image with a normal source checkout was readable as
UID1000; this diagnostic is not native acceptance. The VM clone is created under
077, so its physical tracked package.json can be0600. The builder now copies that
file from the exact Git archive (tracked mode) instead of inheriting the private
checkout mode. Probe receipts retain fixed per-file access codes/metadata, and
the host requires all four actual checks to succeed. New native CI remains
required; the prior failure is retained without assigning an unproved unique
cause.

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

Source972ccb2f run39166743042 passed actual UID1000 image reads, API startup and
original root acquisition on both PG majors, then failed the first default
collector with generic HOLD. All three owned containers stopped with exit0 and
the original root child closed. A new pure counterexample reproduced
REPLACEMENT_CANDIDATE_IDENTITY: the phase fixture dropped Docker State.Status.
The builder now validates/copies that actual field before hashing the material,
and the native fixture validates its synthetic replacement before root acquire.
The production validator is unchanged; new native acceptance remains required.

Source12dac871 run39167738187 passed the replacement-material precheck and failed
both majors at RUNTIME_READ. The original root release and owned child closure
were verified; all three containers stopped exit0. A separate read-only inspect
of an already-owned local capsule reproduced Docker's exact template error:
`len .HostConfig.CapAdd` receives nil when the optional list is unset. The
collector format now falls back to an empty string for nil CapAdd/Devices/
DeviceRequests before len; actual nonempty lists still yield nonzero counts and
remain prohibited. Runtime validation rules are unchanged. New native acceptance
is required for this production-reader correction.

Each native major also evaluates the same exported production list expressions
in Docker's actual template engine: actual nil/empty host lists return0;
synthetic empty/nonempty list values return0/1. These template cases do not add
capabilities or devices to a container. Existing validator negative cases still
reject each nonempty list. This matrix is not a privileged runtime acceptance.

B9f7 source run39168403700 passed the list-template matrix and reached the public
bind counterexample on both majors, then failed an assertion (unique assertion
cause not exported). The owned shadow mount was released, original root release
verified and three containers stopped exit0. The shadow directory used mkdir555
under umask077, which yields500 and does not isolate the intended mount-only
negative. The fixture now creates a new owned shadow, writes an exact0444
manifest and fchmods the same open directory to0555 without changing umask or
production guard rules. Stages and fixed guard-code diagnostics distinguish
future counterexample failures; partial successful observations are exported
with outcomeFAIL/completefalse and never accepted as a completed fixture.

Source1726b819 run39168909584 completed real PRE_ADOPTION and ADOPTED default
observations and all4 guard counterexamples on both majors, then failed the
committed phase-aware collector with generic OBSERVATION_UNVERIFIED. Exported
partial observations are FAIL/completefalse; original root release and owned
container stops remain verified. A separate committed-anchor precheck and bounded
timestamps now distinguish anchor failure from later reads. The collector retains
only a small allowlist of fixed private anchor/root-deadline categories on its
generic error; arbitrary messages/paths/stderr/causes are discarded, public error
text and rejection behavior stay unchanged. No deadline is raised or guard cached.

Sourceaed27688 run39169684442 is mixed, not accepted: PG18 completed all three
default observations and four guard negatives; PG16 failed the committed-phase
observation with the private fixed category ROOT_CONTROL_OPERATION_DEADLINE.
Its measured interval was about32.44s against the existing30s root operation
budget. Both original roots were released and all three owned containers per
major stopped exit0. This confirms a deadline failure, not a unique attribution
of every prior generic HOLD or all elapsed time to one helper.

Receipt state reads now use a private call-local pinned snapshot to avoid
repeating the external root/ACL checks for every receipt. Each call still runs
fresh beginning and ending guards and trusted-directory inspection. Linux reads
fixed basenames through an open directory FD; every file is regular, same UID,
0600, single-link and at most1MiB, with nanosecond metadata pinned before/after
bounded reads. Complete state/context/digest/sequence/previous-digest chain
verification remains required. All files and the named/open directory are swept
again after the ending guard/inspection. Missing state follows the same ending
checks. There is no cross-call cache or caller-accessible skip-guard capability.
Phase anchors reuse only those already verified receipts and retain a final
fresh state/marker read. Public independent read/readReceipt remain fresh.

File opens use NOFOLLOW and NONBLOCK: a FIFO substituted after lstat is rejected
by fstat without waiting for a writer. Actual owned-filesystem tests cover this
race under an independent child watchdog, growth during the current read,
earlier-file mutation/inode replacement, links, permissions, directory replacement,
missing-state appearance, ending-inspection mutation, semantic chain tampering
and descriptor closure. Guard fault tests are injected, not native FD9/ACL proof.

The snapshot's default maximum10s monotonic budget rejects over-budget returns;
it cannot interrupt every synchronous syscall or the existing ACL helper.
Separate snapshot calls and archive reads do not create a single hard10s phase
anchor deadline. Outer operation deadlines and process supervision remain
necessary. This is call-local consistency under the existing continuously held
FD9/trusted-root-writer model, not an atomic kernel snapshot or proof against
privileged ACL/mount/lock ABA. Native PG16/PG18 acceptance on the updated exact
HEAD is still required; reducing repeated checks alone is not performance PASS.

Snapshot source564b60c7 run39171206939 passed both native majors: default PRE,
ADOPTED and committed VF observations measured7.616/7.713/9.153s on PG16 and
10.893/11.295/14.153s on PG18, all below the unchanged30s root budget. Original
root release, child closure, four native guard negatives and three owned-container
exit0 stops were verified on each. Those observations remain isolated and do
not prove every composed session read fits its separate10s budget.

The same workflow failed one general-suite test (491PASS/1FAIL/27SKIP): the
false-handshake fixture returned after transport exit, before the registered
child's stdio close. No runtime refusal was relaxed. The fixture now captures the
original child close promise before handshake and joins it before returning from
rejected-registration paths and fixture cleanup. Native PASS from that SHA does
not override its aggregate failed CI; the updated exact HEAD requires fresh CI.

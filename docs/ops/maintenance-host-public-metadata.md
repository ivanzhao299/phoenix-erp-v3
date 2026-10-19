# Restricted public host-process metadata

This is a read-only enhancement of the existing protected diagnostic runner.
It adds no deployment operation, stop/signal, database write, permission grant,
credential reader or synchronization operation. The existing SSH fingerprint,
direct endpoint, reviewed payload, root trusted paths, original FD9, workflow
concurrency and pre/post GitHub-main checks remain unchanged.

For at most sixteen root Node processes without a recognized container cgroup,
the collector can now project a constrained script basename and path digest.
Arguments, options and script contents are never exported. PM2 wrappers are
identified as wrappers; they do not prove which application is executing.
Invalid UTF-8, unknown options, malformed paths and sensitive-looking public
names produce UNVERIFIED metadata.

A CWD package contributes only constrained name/version metadata, and only
when the process mount namespace matches PID1. Root-owned, non-writable path
components, original regular-file FD, no-follow/nonblocking open, single link,
bounded bytes, full pre/post file identity and directory checks are required.
The CWD package is not evidence that the process executes that package.
Only stable proc/stat/UID/exe/cwd/cgroup/namespace/argv observations and a matching
systemd process/cgroup relation permit a constrained public unit-name hint.
These are sequential snapshot observations, not continuous process identity.

All new observations retain `businessOwner=UNKNOWN`, `stopAuthorized=false`.
The four topology admission/drain/mutation booleans remain false. A trusted
registry must independently interpret the facts; the observer cannot declare
an unknown service unrelated, safe to stop or authorized for deployment.

Before freezing this source on 2026-10-19, 71 local tests passed with zero skips.
They include the original transport/diagnostic contracts, real owned Docker
projection, and a network-none root fixture with fourteen native checks. The
latter covers actual regular-file reads, symlink/hardlink/writable-path refusal,
real path/FIFO replacement and deadline expiry after lstat/open/read with zero
new normal IO and original FD cleanup. No production service was used in these
tests. An early test-fixture counter shared across two synthetic PIDs failed;
the test was corrected to track the intended original PID, and its failure log
was retained. Independent technical review's FIFO and identity/budget findings
were corrected and re-reviewed before source freeze.

The dedicated audit workflow remains audit-only. Its historical comparison
target is 9155dcccd7578288a2ccedc9f2ec3f0dd0bf1f7e; that does not represent current
main, a production floor, or release eligibility. Dispatch must separately pin
the new runner commit, unchanged diagnostic-program digest, new topology digest
and the actual current GitHub main. Live production findings remain UNVERIFIED
until that exact new run produces valid protected receipts.

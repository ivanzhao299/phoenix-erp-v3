# Isolated session authority dependency

This CI-only dependency uses an actual separate owned Node process with an
ephemeral Ed25519 key and an immutable initial set of simulated records. It is
not an actual GitHub review, human decision, production release authority or an
independent observation recorder. All records/responses explicitly say
SIMULATED_GITHUB_PROTOCOL, fixtureOnly=true and productionAuthorized=false.
The GitHub-shaped fields exist only to exercise the unchanged core protocol;
the unchanged default server verifier still refuses them.

The trusted fixture supervisor starts/registers the original child before INIT,
freezes context/payloads and receives separate reader/controller capabilities.
The runner reader can only read and verify existing records. It cannot sign,
issue, update or revoke. The supervisor may revoke for fault tests. Every
verification fetches a nonce-bound signed response from that same live child,
checks exact context/owner/target/purpose/payload/source/window and the complete
record, and rejects revocation/version changes. This proves revocation state at
the READ processing point, not continuous authorization until a future effect.
The assembled runner must independently revalidate before each effect.

A single monotonic/wall budget covers IPC, signature/semantic validation and
the final return. Rollback, deadline, abort and window violations refuse success.
Each IPC message is capped at64KiB before parent send, at16 pending requests,
with response structure/size checks and fail-closed send backpressure. Node IPC
deserializes before the receiving application checks size; the original compiled
child and its parent supervisor are trusted. This is not isolation against a
malicious process with the same UID/root, debugger or arbitrary source changes.

INIT failure and close share bounded original-child join handling. Normal
shutdown requests child-owned IPC disconnect and waits for its actual close
event. Node20 parent-side disconnect alone does not account the IPC close in the
ChildProcess close event. Failure cleanup may send SIGTERM only to the saved,
locally forked issuer object, never a discovered PID, Docker exec process,
production service or remote resource. No automatic SIGKILL/retry exists.
Unsettled cleanup retains PID/debt and HOLD; late close cannot turn the cached
failed close into success. Child closure proves only this local issuer resource.

Tests use actual child IPC/signatures/close and owned SIGSTOP/SIGCONT fault
injection; final clock faults and one send failure are explicitly synthetic.
They cover immutable records/caller mutations, exact-context denial, changed
payload/digest/reviewer/target/source, default production denial, live revocation,
valid signature then wrong key/nonce/tampering, byte/capacity bounds, failed
CLOSE, INIT timeout, late close and final verification deadline/abort/rollback.

No production entry imports/selects this fixture. Complete17-producer assembly,
independent actual observation recorder, continuous ingress and executor
inventory, formal writer integration and whole-session acceptance remain absent.
This dependency alone cannot install or approve a release factory.

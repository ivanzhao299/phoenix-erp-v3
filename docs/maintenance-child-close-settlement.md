# Registered helper settlement includes stdio close

The maintenance session previously removed ordinary child-process debt at the
Node exit event. A helper can exit while a descendant still owns inherited
stdout/stderr. A producer or cleanup join could then see zero children and
advance or release the root control lease before the registered resource had
fully settled. Independent review classified this as P1.

Register an ordinary helper while its original process is still live, retain
its entry through exit/error, and remove it only after observing close. A child
already exited or signalled at registration is refused: exitCode, killed or
stream flags cannot prove an earlier close event that was never observed.
The dedicated control-session ownership transfer, its independent close waiter
and immediate exit/error fatal behavior are unchanged. Its old ordinary entry
callback can only delete that same entry, never the transferred control entry.

Four new tests use actual owned local Node processes. A parent exits while its
owned descendant keeps inherited pipes open; the session must retain child
debt until close. A post-snapshot producer returning in this state with a false
zero-child join receipt gets bounded HOLD, retains the marker, cannot commit
formal completion or public OPEN, and cannot close the control lease. Late
registration is refused both before and after eventual pipe closure. A normal
registered helper can proceed after actual close. Fixture gate release is in
finally and the descendant has a 5-second fail-safe exit; no unrelated process
is signalled. A machine stalled past that deadline can fail the pending-pipe
assertion, never manufacture a false pass.

Before the fix, these four tests reproduced 3 FAIL / 1 PASS. After the fix on
main b83e0c9288f9a4c09f56c00bda96e8f728b2bc99: 49 session tests PASS, all
maintenance protocol tests 327 PASS / 12 explicitly SKIPPED, Node20. Existing
real-control transport, ownership transfer and failure scenarios also passed.
An independent read-only review found the original P1 closed and no new P0/P1;
the reviewer did not execute tests. Existing local test cleanup now waits for
close instead of just exit.

This proves settlement only for registered process and stdio resources. It
does not discover detached descendants or join Promises launched by arbitrary
close listeners. Such work still requires separate registration and admission.
The 17-producer production factory remains default-deny and uninstalled. No
production action, database write, deployment, floor promotion, Web release or
Chanjet operation occurred; production admission remains HOLD.

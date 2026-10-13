# R3.c M6 verified-abort recovery binding

The failed API-only transaction `38321168296-1` is bound to target M6
`797eeca1db229f5e4d288da88d83888ad92b35c5` and previous floor M4
`f46f651dcebeb11210c8e577f3c0caed87f356c2`. It is the only additional
verified-abort transaction admitted by the recovery CLI. The earlier frozen
transaction `38217361863-1@M4` remains independently bound.

The protected workflow invocation uses:

```text
operation=recovery
approved_main_sha=<current merged main runner SHA>
recovery_target_sha=797eeca1db229f5e4d288da88d83888ad92b35c5
recovery_previous_floor_sha=f46f651dcebeb11210c8e577f3c0caed87f356c2
bound_run_id=38321168296-1
confirmation=APPROVE_EXACT_RECOVERY_TRANSACTION
startup_error_receipt=<phoenix.verified-abort-recovery-receipt/1 for 38321168296-1>
```

The M6 path requires the on-disk floor to remain M4 while the candidate API,
startup evidence and live runtime are M6. It then rechecks the receipt, replay
digest, `verifyEvidenceFiles`, live TOCTOU identity, readiness, flags, expiry and
all ten integer DB baseline fields before archive-first staged finalization.

A receipt for any other target (including M7) or a previous floor other than M4
is rejected. `approved_main_sha` is runner/bundle provenance only and is never
implicitly treated as the transaction target. Ordinary `PASS_REDACTED_SUMMARY`
evidence remains unrecoverable.
No recovery execution is implied by this document; production mutation still
requires a separately approved workflow dispatch.

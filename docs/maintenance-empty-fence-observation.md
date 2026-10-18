# Protected empty legacy-fence observation

## Problem and behavior

The legacy replacement entry needs to inspect the already-published empty FENCED manifest. Its existing public-control API has a bootstrap writer and candidate-adoption writer; a production reader must reuse the protected read path and tie it to real private intent and independently verified historical evidence.

`LegacyMaintenancePublicControl.observeEmptyFence({ expectedStateDigest, bootstrapEvidence })` reads existing files. It first requires current PROMOTION_PREPARED state, owned REPLACE_CANDIDATE intent, root/trusted-path/FD9 guard and a valid current state timestamp. Existing protocol verifiers must independently accept authority and the historical LEGACY_PUBLIC_FENCED bootstrap. Both defaults reject.

The method clones and hash-pins the envelope before awaits, rejects verifier mutation, and rechecks current state/intent afterward. It reads the protected private intent through MaintenanceReceiptStore and the public manifest through the existing NOFOLLOW/inode/uid/mode/nlink/directory-pinned reader. Owner, context, old/new SHA, phase, generation, capture time and both evidence hashes must match actual files. Modern ownership, changed intent or changed persisted data reject.

The bootstrap private stateDigest is historical: it belongs to LEGACY_RECONCILED and normally differs from current PROMOTION_PREPARED. Independent historical bootstrap verification binds the complete private bytes; expectedStateDigest separately binds the current state. The method does not invent an equality between those digests.

## Validation

Node20: public-control + controlled replacement + deployment session tests, 66 PASS, 0 FAIL, 0 SKIP (`/tmp/phoenix-public-fence-observation-final-tests.log`). Positive observation preserves private/public directory bytes. Negative coverage includes default authority/evidence rejection, invalid current digest, wrong owner/target/generation/phase, nonempty participants, symlink/hardlink, private tampering, capture time, asynchronous intent/state/modern-owner races, caller/verifier mutation, default root guard and expired window. Coherent state/intent negatives reject invalid, future and out-of-window state timestamps explicitly. Independent frontier read-only review found no new P0/P1; it read the executed test result and did not claim a separate test run.

## Boundaries and remaining work

This is OBSERVATION_ONLY. The result explicitly sets continuousDrainProof=false, admissionOrApprovalGranted=false and registryInstalled=false. No CLI, environment bypass, bootstrap, state writer, public OPEN, Docker operation, database call or producer-registry installation is added. No production read or mutation was executed by these tests.

The eventual compiled producer must retain its bounded, tracked read lifecycle while this asynchronous method verifies independent sources. A hash alone is not source authentication. This observation cannot prove persistent-task drain, external-side-effect reconciliation, continuous ingress or host no-revival. Production registry, independent GitHub/artifact authority, complete executor attribution, five-domain reconciliation and final exact old/new floor authorization remain separate HOLD conditions.

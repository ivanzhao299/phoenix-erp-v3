# Candidate server binding observations

Source baseline: `f126fe276102fe8facd12844ebb5b172d8f04271`. This component
correlates existing resources. It does not start a candidate, adopt a participant,
open ingress, issue approval, install any production producer or certify drain.

## Contract

`collectCandidateServerBinding()` requires the genuine existing `RootControlLease`
and current private maintenance state/owned operation intent. It reads the unique
formal `CANDIDATE_REPLACEMENT` from that state's receipt chain; an independently
well-formed caller replacement for another container is refused. If the state is
`CANDIDATE_FENCED`, its formal candidate receipt must also match the API identity,
boot, replacement digest and raw control-session identity.

The observer checks the exact Docker ID/image/OCI revision/start/PID/restart,
Compose project/service, complete two-bind inventory, private namespaces and
disabled restart policy. Added capabilities/devices, alternate public-directory
aliases, socket mounts and all unapproved mounts are refused. The target Floor
must be v3 READY/HOLD, with the complete five-key storage tuple, expected project,
mount guard enabled and both Chanjet switches false. Uploads and DB sources must
be distinct, nonoverlapping canonical `/data/` directories. Default storage reads
check real paths, the exact `/data` mount and sentinel; no state is modified.

PRE_ADOPTION requires the empty generation-1 public FENCED projection. ADOPTED
requires the private/public generation-2 singleton HOLD participant. Both require
the API FENCED with the same owner/generation and no pending business work. The
one live control connection correctly reports `cleanup.debt=true`; pending
acquisition, queries, retirement, release or a broken connection is refused.

Before/after root observations remain on the original held client. A fixed
read-only PG query independently binds the candidate and root PID, native
six-digit backend timestamps, database/cluster identity and both exclusive locks.
Runtime, private/public state, storage Floor and root identity must remain stable.
Every bounded operation checks one absolute deadline and abort signal; no later
storage operation starts after the budget is exhausted. Synchronous filesystem
reads and Docker observer children still require outer process supervision.

## Executed isolated validation

- Node 20 synthetic unit suite: **52 PASS**. Includes receipt substitution,
  candidate recreation, writable/shadow/alternate mounts, capabilities/devices,
  matching-but-invalid Floor and mount sources, raw timestamp aliases, state
  drift, timeout/abort, and redaction.
- Owned PostgreSQL 16.14 and 18 orchestration: **12 PASS, 0 SKIP** (five scenarios
  per server plus the parent tests). Actual original root transport, server
  locks/catalog and a separate actual PG candidate connection were exercised.
  The two positive observations per server retain the raw independent catalog
  rows. Both owned local clients closed and both owned containers were removed.
- The candidate Docker/API status, storage, private authority and replacement
  material in that orchestration test are **synthetic test doubles**. This is not
  actual ERP/Docker-candidate end-to-end evidence or a real replacement transaction.
- Combined pure maintenance/ERP contract suite: **296 PASS, 12 SKIP**. The skipped
  tests require explicit isolated-Docker/PG enable flags; the new PG test was run
  separately with its flag as recorded above.

The independent review closed receipt-chain, complete mount/storage and absolute
deadline P1 findings before publication. No approval or production evidence was
fabricated. CI adds this PG test to the existing isolated maintenance job and
uploads only its bounded JSON fixture receipts.

## Remaining release blockers

Actual source-built ERP/candidate-mount integration for this observer is
**NOT_RUN**. Container-parent-directory tampering against the actual ERP reader
is **NOT_RUN**. The normal API image has a root entrypoint which drops Node to
`phoenix`; neither Docker Config.User nor PID1 root alone proves the Node UID.
This observer does not certify executable integrity or production query load.

All output remains `OBSERVATION_ONLY`, with continuous drain/ingress proof,
persistent ownership completeness, producer registry installation, admission and
production mutation flags false. Full old-runtime isolation, executor ownership,
five-domain reconciliation, supervised production factory, complete recovery
materials, final target schema/Floor checks and exact release authority remain
separate unmet requirements. No production workflow is dispatched by this change.

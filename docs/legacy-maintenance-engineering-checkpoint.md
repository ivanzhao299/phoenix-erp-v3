# Legacy maintenance engineering checkpoint — 2026-10-18

This checkpoint is a source integration increment. Production remains HOLD. It
neither authorizes a maintenance window nor supplies a production release receipt.
The existing API has no unified drain protocol: stopping it is never DRAINED.

The library implements immutable owned intent/receipt chains, lifetime exclusion
from modern release entries, typed stop-and-reconcile phases, public FENCED
bootstrap and candidate adoption, constrained Compose replacement, a fixed
API-only session, and distinct floor/deployment-state cores. The uninstalled
production registry and missing independent authority refuse before effects.
No plan field, environment flag, callback name or CI result supplies approval.

Observed component checks, on Node 20:

- Protocol and source-authority unit checkpoint: 48 PASS.
- Public projection/adoption unit checkpoint: 19 PASS.
- Session failure checkpoint: 22 PASS, including pending evidence validators,
  late writes, child ownership, false join, timeout and post-OPEN release incident.
- Modern entrypoints plus typed state/floor: 181 PASS / 2 existing SKIP / 0 FAIL;
  this includes 27 new exact-intent state/floor cases.
- Owned runtime mechanism/Docker checkpoint: 26 PASS, PG16 and PG18.
- Replacement checkpoint: 17 PASS including two real Compose tests. Its HTTP
  fixture is not the production ERP and its event receipt covers a fixed interval.
- Real current ERP candidate helper: 4 pure PASS. Final owned PG16/PG18
  archival captured real Cron rejection, four readonly mutation canaries per
  database, unchanged data/schema/sequence fingerprints and same-boot
  OPEN→FENCE behavior. Final summary SHA256:
  `a0c79482d8b13aba8bcdf959a74d7d9053b8a051d3300b9e6b6ab2864a0de723`.
  Its production authority, root FD9 and formal release receipt are NOT_RUN.
- Hosted maintenance workflow run `39088978630` succeeded on checkpoint
  `a3af165f19b7dd8f220850d0abb2a9c043fb43b7`, including actual isolated PG16/PG18,
  Compose and current ERP image checks. This is neither production acceptance
  nor proof for subsequent source changes.
- A separate local combination with the Web v3 evidence protocol passed 337
  pure/CLI cases with 3 conditional skips. API full unit tests passed 1116 with
  330 skips; API/Web typecheck passed. Typed maintenance transactions require
  v3 API-only receipts; historical v2 is limited to genuinely unbound ordinary
  API records. This local combination has not been merged to main.

Independent technical reviews closed the reported library P0/P1 issues. They
are not formal independent GitHub/security or production approval. Exact source
hashes and logs are retained in local artifacts; final integrated CI remains
required. Conditional skipped tests are not promoted to PASS.

Outstanding engineering and governance:

1. Real compiled production registry, immutable artifact authority, and complete
   five-domain collectors are not installed. Unknown effects remain HOLD.
2. Real candidate ingress enforcement and continuous host executor exclusion are
   not provided by a readiness response, process-local count or old-container stop.
3. Source-built old `22687886` Nest ERP observations now retain real minute-Cron
   activity, a blocked startup Chanjet auth attempt, forced PID1 exit 137, and
   remaining idle PostgreSQL backends after network isolation and stop. These
   facts remain HOLD; no lock/open transaction at a sample does not prove
   connection disappearance or past business-effect reconciliation. They are
   not equivalent to the actual production OCI image. Notification delivery,
   IoT partial commits and all five business domains still need real evidence.
4. Formal exact-head source/security approval and a real independently approved
   maintenance context/window/recovery responsible person remain required.
5. Any new merged SHA changes the release target. The earlier 22687886→9155dccd
   authorization cannot approve a later floor, helper graph or runtime.

See legacy-maintenance-protocol.md, legacy-maintenance-release-integration.md,
and legacy-maintenance-producer-gap-audit.md for contracts and explicit gaps.
No production mutation, main merge, migration, Web deployment or Chanjet operation
has been executed by this checkpoint.

Production readonly entry status: the newer protected audit run `39087791034`
failed its pinned SSH host-key fingerprint before collecting remote diagnostics.
The last successful production audit `39053475664` is historical only; its
healthy state must not be presented as a current reinspection. The direct local
alias verified only UID 1002, not the protected root/FD9 entry. No fingerprint
bypass, production retry, server mutation or deployment was performed.

Old-source negative archival is now complete for PG16 and PG18 as distinct owned
experiments. PG18 owner `76ce19ab-2dce-4c8d-bbaf-57c2d4a62cad` observed real
02:42 UTC Cron, exit137 and one remaining idle backend; its PG16 is NOT_RUN.
PG16 facts are separately referenced from owner8, never joined into one release
transaction. Aggregate SHA256:
`7fabec91cd8aa55057db8afd241fce274d374dea2246978c48c6a4f52af4e449`.
The new strict route checker passed an offline recheck of immutable original
snapshots, SHA256 `ca38965d0f6bb9deb202ea648a32b0e9e7296fd89ccf7d17761133ec5945f8e6`;
`originalRunUsedNewChecker=false`. The original broader checker, all failed
owners, the READY-window bug and external Nginx lifecycle deviation remain
recorded. Nine pure observer tests pass; no failed observation is rewritten.

A newly confirmed upstream control-I/O P1 is under remediation: heartbeat queue
coalescing and bounded owned-session retirement. Existing green functional CI
is not evidence that this later finding is closed. Source approval and production
eligibility remain blocked until the repaired exact source and integration tests
are independently reviewed. PostgreSQL socket closure alone cannot prove the
server backend disappeared or that still-running business work has drained.

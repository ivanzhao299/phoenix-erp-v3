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
- Real current ERP candidate helper: 4 pure PASS. The first actual PG16/PG18
  behavior run passed, but expanded final raw fingerprint/canary archival is
  still running. Its production authority, FD9 and release receipt are NOT_RUN.
- The newly added hosted maintenance workflow has not run on this checkpoint.

Independent technical reviews closed the reported library P0/P1 issues. They
are not formal independent GitHub/security or production approval. Exact source
hashes and logs are retained in local artifacts; final integrated CI remains
required. Conditional skipped tests are not promoted to PASS.

Outstanding engineering and governance:

1. Real compiled production registry, immutable artifact authority, and complete
   five-domain collectors are not installed. Unknown effects remain HOLD.
2. Real candidate ingress enforcement and continuous host executor exclusion are
   not provided by a readiness response, process-local count or old-container stop.
3. A genuine old-version Nest ERP transition remains to be tested. Source-built
   old images must be labeled separately from the actual production image.
4. Formal exact-head source/security approval and a real independently approved
   maintenance context/window/recovery responsible person remain required.
5. Any new merged SHA changes the release target. The earlier 22687886→9155dccd
   authorization cannot approve a later floor, helper graph or runtime.

See legacy-maintenance-protocol.md, legacy-maintenance-release-integration.md,
and legacy-maintenance-producer-gap-audit.md for contracts and explicit gaps.
No production mutation, main merge, migration, Web deployment or Chanjet operation
has been executed by this checkpoint.

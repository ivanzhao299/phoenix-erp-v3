# Background Fence/Drain engineering status

Base main: `9155dcccd7578288a2ccedc9f2ec3f0dd0bf1f7e`.
This report separates isolated engineering evidence from production acceptance.

## Implemented behavior

- A root-published, nonsecret manifest is directory-mounted read-only into API.
  Missing, invalid, writable, stale or ungranted control state denies admission.
  The private floor/transaction paths remain root-only; no business settings
  table or manual `ALLOW_*` switch controls the fence.
- Dedicated PostgreSQL control sessions and admission/execution advisory locks
  serialize admission against drain across processes. Root verifies the actual
  session in its fixed database using a random boot-bound application name,
  PID, database OID and backend start identity.
- Async task graphs retain detached children and nested work until settlement.
  Ten Cron methods, manual shared services, startup work, approval notifications,
  Web Push, audit writes and the menu timer are covered. Ordinary domain
  permissions and Chanjet scope/policy checks remain active.
- HTTP mutation admission wraps downstream interceptors. Shutdown first denies
  admission and drains before disposing domain leases. Session/process loss,
  timeout and unprovable identities hold rather than masquerading as quiescence.
- The deployment supervisor retains the coordinator session and FD9 across the
  complete protected transaction. Exact main is rechecked; success requires
  formal protected receipts and independent live inspection before OPEN.
- The currently implemented deployment contract is exact double-SHA API-only
  HOLD re-anchor, with no migration. Unsupported ordinary API/full paths fail
  closed; they are not advertised as validated generic release capabilities.

## Executed isolated checks

The final commit receipt and CI links must bind the latest source snapshot.
Earlier test counts below are checkpoints, not permission to reuse results
after a relevant code change.

| Checkpoint | Actual result | Limit |
|---|---|---|
| API full unit suite | 1,113 PASS / 330 SKIP | Final corrected fixture snapshot, Node 20 |
| API/Web type checks | PASS | Local Node 20 |
| Core PG16 and PG18 | 34 PASS each | Node 20; owned loopback fixtures; includes two real API processes |
| Notification/audit integration | 25 PASS | Mock domain I/O with real task-graph service |
| Non-Chanjet entry integration | 25 PASS | Fenced Cron/manual paths and awaited dispatch |
| Chanjet targeted suites | 61 PASS / 101 SKIP | Existing optional PG suites not run in that command |
| Startup SQL proof | Five profiles PASS | Final v3 receipt binds runtime/harness hashes, unique boot/session identity, and zero provider calls |
| Coordinator/failure/legacy/supervisor | 60 PASS | Node 20 mock and contract suite; real PG coordinator separately passed on both versions |
| Static/bootstrap schema contracts | 23 PASS | Includes 19 mutation cases |
| Changed API lint | 0 errors / 147 warnings | No rule or baseline was relaxed |
| Production release | NOT_RUN | Legacy transition and governance remain blocked |

The 100-task local PG18 no-op control benchmark used one concurrent caller and
400 control queries. It measured approximately 174 ms total, p50 1.71 ms and
p95 2.14 ms. It bypassed host filesystem access using an in-memory validated
test manifest and contained no business queries. It is **not** production load
evidence. Each isolated outer task adds four PostgreSQL round trips; each API
also holds one dedicated connection and probes at 1 Hz. Capacity planning must
include request rate, the existing uncached authorization queries, filesystem
checks, connection headroom and failure/latency budgets.

## Production and governance boundaries

Protected audit `39053475664` observed the old API/floor `22687886`, Web
`23c7af86`, healthy services, no unfinished markers and Chanjet HOLD false/false.
It did not prove old Cron drain. No release attempt was consumed by this work.

The legacy API cannot participate in the new protocol. Its transition and the
first root-public projection installation remain **not implemented production
capabilities**. See [the maintenance plan](legacy-runtime-transition-release-plan.md).
The pure legacy assessor rejects unknown notifications/partial commits and
unverified approvals; that is not a successful old-runtime deployment.

Independent technical agents reviewed source and identified defects that were
fixed and retested. Their conclusions do not supply a formal human security or
frozen-boundary approval. Required GitHub checks, real governance approval and
exact final merged-SHA floor authority are still required. No approval label or
GitHub APPROVE may be fabricated by this engineering change.

The Web evidence remediation is prepared independently and must receive its own
review and CI before integration. No production UAT or Chanjet restore outcome
is inherited from isolated tests. Issue #407 remains HOLD.

## CI compatibility repair checkpoint

The initial PR run exposed three integration gaps; none was treated as an
approval exemption.

- PG18 emits `DETAIL: Parameters:` while PG16 emits `DETAIL: parameters:`.
  Capture now parses the anchored PostgreSQL record header before handling the
  fixed parameter field. SQL comments containing the same words remain SQL and
  cannot suppress rejected-DDL evidence. Unique setter, boot nonce, PID, database,
  backend start and advisory-lock namespace/key checks remain enforced.
- Positive HTTP regression jobs start through an explicitly disposable,
  GitHub-hosted fixture. Root creates the fixed read-only directory mount, the
  real API starts FENCED, and OPEN requires its actual PostgreSQL control-session
  binding. This is a CI host identity, not an OCI or production receipt. Unknown
  residual mounts, metadata errors and a live process with a missing cwd HOLD.
  No production reader or default-deny startup rule gains a test bypass.
- Chanjet fixture constructors now provide the real background service using an
  exact owned PostgreSQL container and loopback provider proof. The standalone
  production prepare CLI instead fails closed **before imports, registration or
  database initialization** with `BACKGROUND_CLI_PARTICIPANT_NOT_REGISTERED`.
  A durable production CLI participant/journal is a separate unfinished task;
  the isolated adapter is never substituted into the production entry point.

Root independently reran the disposable adapters: 24 PASS, zero skips. Deployment,
legacy and effective-compose contracts: 37 PASS, zero skips. The modified
production prepare entry point is added to the formal critical-files contract.
Official checks must rerun on the new commit; local evidence does not satisfy
missing formal security or freeze approval.

Final PG18 capture repair verification: 25 static tests PASS; five real startup
profiles PASS with five unique boot/session proofs, zero provider requests and
unchanged schema/data/sequence fingerprints. Four actual readonly mutation
canaries were rejected without writes; the SQL-comment DDL was detected in both
LOG and STATEMENT records. Two intermediate failed runs are retained: one startup
NOT_READY remains unexplained, while the marker failure was traced to legitimate
empty pre-authentication log fields and fixed without weakening SQL identity.

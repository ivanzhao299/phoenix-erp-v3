# Admission transaction ownership and ambiguous settlement HOLD

The API scheduler's admission store races an absolute deadline against a
TypeORM manager transaction. Returning HOLD does not cancel pool acquisition,
commit, rollback or release. Previously the caller's task graph could finish
while that manager promise was still pending.

The API now supplies a lazy transaction owner. It registers a CHANJET_SYNC child
before calling manager.transaction and awaits that entire original promise,
including the manager's finally/release. Both deadline and no-deadline paths use
it. FENCED admission rejects before the starter is invoked. Already admitted
children retain their original grants and remain in-flight until actual promise
settlement. The one real API construction site is wired; independent root CLI
one-argument storage callers retain their existing separate supervision contract.
Their cancellation/resource guarantees are not upgraded by this change.

## Unknown outcome is HOLD

Independent review identified that TypeORM 0.3.29 manager rejection cannot prove
cleanup: its rollback error may be swallowed and release can also reject. Before
the child is decremented, any started manager rejection synchronously and
permanently poisons the participant. In-flight count may eventually be zero,
but the original execution control lock is retained and successful drain is
refused. Later OPEN manifests do not clear this state. No raw exception, SQL
arguments, credentials or driver message is emitted by the owner helper.

This deliberately sacrifices availability: an ordinary callback rejection with
a successful rollback also enters HOLD because this interface cannot independently
prove cleanup. Controlled inspection/recovery is required; no automatic restart,
replay, release retry or marker cleanup is introduced. Retaining the manager
promise is not proof that an already-started commit did not occur. Persistent
execution HOLD/reconciliation and the standalone stop executor remain unchanged.
The helper does not grant sync permission or enable any provider operation.

## Validation and resource boundaries

Local API typecheck passed. Changed-file lint passed with zero errors/warnings
after correcting a test-only unsafe-finally construct without changing rules.
The combined full API run passed 1,187 tests and skipped 341; the final targeted
unit suite passed 11, including the real scheduler singleton wiring and lazy
FENCED denial. The first test command incorrectly used package.json as a Jest
config and did not run tests; the actual repository Jest configuration was then
used. No failed invocation is counted as PASS.

Actual isolated PG16 and PG18 each passed five cases: occupied single-connection
pool; delayed real commit, rollback and public QueryRunner release; and release
acknowledgement rejection after real release completed. This tests conservative
HOLD, not a reproduction of an actual leaked connection or low-level release
failure. Unknown business session cleanup is not proven by poison. PostgreSQL/TypeORM and the control-lock backend are
real; the manifest is mocked. An independent PG observer proves the global execution lock blocks
deployment during pending/unknown states. Public lifecycle calls are gated by
fixture promises to make races deterministic. SQL is SELECT plus transaction
and timeout/control statements only: no Chanjet table/schema creation, business
DML, provider request or production connection. Unit lifecycle managers are
explicit fakes; they do not replace the real PG cases.

Local exact historical owned container identities, loopback ports, image,
PID 1, no bind mounts and readiness were rechecked BEFORE these tests. Fixture
teardown closes only its own original control sessions after asserting HOLD;
this is not successful production drain/recovery. Production environment/host,
capacity and latency remain UNVERIFIED. No connection pool sizing changes or
extra per-statement database queries are introduced; task-graph registration and
settlement add bookkeeping. Production workload/performance is not inferred
from these fixtures.

The new runtime helper is added to criticalFiles. No protected file is removed.
Required hosted CI, exact-HEAD delegated review and legitimate PR label-derived
security checks remain mandatory. This is source engineering only: production
remains HOLD, full 17-producer factory/phase bridge and maintenance admission
are not completed by this patch.

## Security scan disposition

The unapproved scanner examines entire changed files, not only added lines.
Every hit below is retained. Fixture callback/Chanjet names are broad lexical
matches; the production store/owner/scheduler are genuinely sensitive resource
and admission paths reviewed for this exact change. Existing authentication,
request caps, company/book/period bindings, standalone stop, provider transport
and policy checks are unchanged. No scanner rule, allowlist or ALLOW_* injection
is used. These findings require delegated exact-HEAD governance before labels.

| File | Line | Classification and disposition |
| --- | ---: | --- |
| `apps/api/src/modules/background-control/background-admission-transaction-owner.ts` | 2 | Actual sensitive ownership wiring; register before lazy start, rejection poisons before finish; independently reviewed. |
| `apps/api/src/modules/background-control/background-admission-transaction-owner.ts` | 9 | Actual sensitive ownership wiring; register before lazy start, rejection poisons before finish; independently reviewed. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.pg.spec.ts` | 9 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.pg.spec.ts` | 12 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.pg.spec.ts` | 52 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.pg.spec.ts` | 55 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.pg.spec.ts` | 63 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.pg.spec.ts` | 77 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 1 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 7 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 10 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 16 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 26 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 34 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 35 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 36 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 43 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 45 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 50 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 68 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 70 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 81 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 97 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 98 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 99 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 108 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 112 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 118 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 119 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 131 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 132 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 136 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 137 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 150 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 151 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/background-control/chanjet-admission-transaction-ownership.spec.ts` | 154 | Isolated fixture symbol/callback; unit + real PG lifecycle tests, no provider or production access. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 2 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 5 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 33 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 46 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 62 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 63 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 66 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 75 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 77 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 79 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 85 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 95 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 100 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 117 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 122 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 127 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 133 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 147 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 150 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 165 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 168 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 171 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 172 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 183 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 186 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 187 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 188 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 199 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 201 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 221 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 237 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 265 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 280 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 298 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 307 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 311 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-execution-admission.store.ts` | 312 | Sensitive storage source scanned in full; lazy owner/deadline wording changed, SQL/binding/cap/stop semantics unchanged and regression tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 2 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 4 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 5 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 6 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 13 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 14 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 16 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 17 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 18 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 19 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 20 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 22 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 71 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 72 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 78 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 81 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 89 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 99 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 109 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 114 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 118 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 131 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 169 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 178 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 194 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 197 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 201 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 203 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 207 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 210 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 225 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 271 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 291 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 313 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 324 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 433 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 436 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 450 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 461 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 522 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 524 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 529 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 539 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 540 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 559 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 560 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 561 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 599 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 611 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 669 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 684 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 727 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 729 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 737 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 742 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 771 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 808 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 842 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 851 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |
| `apps/api/src/modules/chanjet/chanjet-readonly-sync.scheduler.ts` | 861 | Sensitive scheduler scanned in full; singleton owner wiring only; policy/auth/provider logic unchanged, actual wiring unit tested. |

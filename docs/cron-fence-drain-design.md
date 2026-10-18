# Unified background admission and drain — working design

Base main 9155dcccd7578288a2ccedc9f2ec3f0dd0bf1f7e. Production last observed API/floor226878 and Web23c7af86. This is an engineering design, not a production maintenance or business-side-effect approval.

## Protocol and ownership

A root-owned non-secret public manifest is directory-mounted read-only into API at /run/phoenix-background-control. Existing root0700 production-deployment-state remains private; business/API cannot write the authoritative control record or published projection. No sys_settings control key, no production schema/migration. Manifest missing/invalid/unreadable, unauthorized participant, owner/run/SHA mismatch or failed coordinator means default DENY/HOLD. OPEN is explicit and bound to participant boot UUIDs and immutable container/revision identity verified by root. A restarted process gets a different boot UUID and remains denied. No TTL may auto-unfence.

PostgreSQL two-int advisory namespace17455, admission key1, execution key2. Admission holds shared admission lock, rereads manifest, registers work and holds a shared execution lock before releasing admission lock. Coordinator publishes durable FENCED first, holds exclusive admission lock, then waits for exclusive execution lock. Gate+execution lock ordering prevents TOCTOU. One dedicated control session per API process may hold the shared execution lock while its local task graph is nonempty, keeping connection cost bounded. Session loss poisons the participant and refuses new work; coordinator must additionally verify every expected boot/container participant alive/unpoisoned/local task graph empty. Missing/crashed participant is HOLD even when PG locks vanish. Controller crash releases SQL locks but the durable FENCED manifest remains denied.

Every outer task owns an AsyncLocalStorage graph. All registered child/spawn promises stay counted through completion; nested calls reuse the admitted graph without deadlock. Fence prevents new outer admissions; existing admitted children finish under the original allowed-kind grant. All mutating HTTP requests are outer tasks via interceptor, so post-commit notifications remain attached to an admitted parent. Startup callbacks and timers are explicit tracked admissions. No raw args, credentials, approval JSON or business rows in status/evidence.

## API interface for integration workers

Module path apps/api/src/modules/background-control. BackgroundTaskService injectable global; imports from ../background-control/background-task.service or appropriate relative path.

- run<T>(name:string, kind:BackgroundTaskKind, work:()=>Promise<T>):Promise<T> — rejects BackgroundAdmissionDeniedError before new work when fenced; nested work tracked.
- runScheduled<T>(name:string, kind, work):Promise<T|undefined> — admission deny means skip, actual operation failures propagate.
- spawn(name:string, kind, work:()=>Promise<unknown>):void — registers immediately and tracks child task; no unhandled rejection, default deny/skip startup. Caller logging may remain inside work. It MUST count children until settled even if parent returns early.
- status() — safe protocolVersion, bootId, phase, inFlight, pendingChildren, poisoned, owner/generation metadata only.
- shutdown/drain deadline method and Nest lifecycle hook — deny new admissions then await whole graphs, fail HOLD on timeout; no silent force-success.

Kinds: LOCAL, EXTERNAL_READ, NOTIFICATION, CHANJET_AUTH, CHANJET_SYNC. Root publication allowlist excludes CHANJET_AUTH/CHANJET_SYNC under HOLD unless a separate exact policy operation explicitly authorizes them. Core performs grant checks; domain guards/permissions remain in effect. Do not add an implicit production-open fallback. Unit fixtures override provider; full isolated test fixture mode must be explicitly restricted to NODE_ENV=test and never accepted in production.

Read-only status GET /api/internal/background/status is public-auth but raw TCP loopback-only (docker exec fetch127.0.0.1), never trusts forwarded headers; no control mutation endpoint. Root binds returned bootId to independently inspected container/revision before authorizing OPEN. Startup creates no schema, does not schedule external/provider side effects while fenced.

## Work division

Core worker: new background-control module/service/manifest/PG backend/interceptor/loopback controller/tests ONLY. Parent wires app.module/main and owns root ops/deploy/public mount contracts/tests. Cron worker: 7 non-Chanjet Cron services plus shared manual service methods and associated tests. Notification worker: approval deferred notifications, dispatcher, workflow notifications and Web Push child promises. Chanjet worker: auth startup/token/health and readonly scheduler admission wrappers/tests, preserve scope/policy/lease semantics. No concurrent edits to shared app.module/main/workflow.

## Legacy bootstrap

Old226 does not read this manifest or locks. It cannot produce DRAIN_PASS. A separate STOP_AND_RECONCILE state machine defaults HOLD, requires explicit maintenance scope, all executor inventory, external ingress freeze, no revival, stop/abort evidence, transaction status and per-domain partial-commit/external-side-effect reconciliation. Old notification send-before-ledger and IoT multi-commit cases remain UNKNOWN/HOLD without real receipts or an approved business treatment; no automatic replay or old image fallback. New startup-fenced code cannot retroactively prove old safety. Implement/test fail-closed protocol without executing production maintenance absent necessary approvals.

## Acceptance

PG16 and PG18 when available, multiprocess admission vs fence races, nested detached children, timeout, control/session/process crash, invalid/stale manifest/identity, failed startup, old runtime refusal and reconciled/unknown bootstrap cases. Actual production load remains unverified until bounded approved read-only evaluation; tests are not performance proof. Real independent governance approvals still required for sensitive PR/floor targets. New critical changes require new merged SHA/floor authorization; no carryover of9155 approval.

# Actual IoT and notification domain evidence

These are isolated operation fixtures, not complete maintenance-factory or
production release receipts. They invoke actual application services, actual
PostgreSQL and independently owned provider processes. The background manifest
is a synthetic test boundary. Application startup and the public-schema startup
contract are not exercised by these direct-method fixtures.

## IoT

`apps/api/src/modules/iot/iot-sync.pg.spec.ts` constructs the real `IotSyncService`,
`SysAlertsService`, `CronMonitorService` and background-control services. Before
any operation, it assigns only known fields of its dedicated service instance to
dummy credentials and its own loopback provider. It neither reads the original
configuration values nor replaces fetch, SQL or business methods. This does not
add a configurable production endpoint.

`scripts/ci/maintenance-iot-provider.fixture.mjs` is a separate process. It accepts
only the synthetic authentication and realtime-property requests. It records
request/response hashes in an fsynced original journal before responding, keeps
pending/held-response counts and sticky errors, and requires protected CLOSE,
the final original journal hash and the original process's successful close.
No request credentials or authorization header enter exported evidence.

The observer compares the operation's actual provider response hash with all
snapshot/history rows and zero expected alerts in the isolated schema. It does
not infer consistency from task count, HTTP readiness or service success alone.

| Actual scenario | Required observation |
| --- | --- |
| One auth/data exchange and both commits | Isolated operation reconciles |
| PG CHECK rejects history after snapshot commit | HOLD, even though service reports success |
| An extra history row exists | HOLD |
| Two real service instances repeat the operation | HOLD despite hourly history dedupe |
| Data response is held while admission is fenced | Execution lock remains held; new work is denied; release and actual commits must settle before drain |

The real history-write exception is currently swallowed by application code.
This fixture detects that inconsistency; it does not claim to repair the IoT
business contract or prove a production operation was consistent. Readings have
no thresholds, so alert-generation behavior is outside this fixture's scope.

The first local run timed out because a same-instance repeat invoked the real
rate limiter. That draft failed on both PG versions and its logs remain
retained. The corrected repeat uses two genuine isolated service instances,
without changing production timing. Any work left at a case boundary causes
HOLD and must be accounted for before database reset.

## Notification and shared PG identity

The real dispatcher, Web Push encryption and independent TLS sink fixture
continues to verify real send/commit divergence, dedupe and in-flight drain.
Encrypted payload plaintext matching remains unverified. Its connection and
container checks now share `src/test-fixtures/owned-background-pg.ts` with IoT.

The helper permits only fixed test database/user/loopback ports, rejects URL
overrides, uses explicit connection options and verifies an original complete
Docker ID, runtime pin, fixture label, absence of bind mounts, published port,
actual readiness and actual server address before the first schema write.
The fixture creates a unique schema and retains it; it never accesses production.

## Verification and limits

On 2026-10-19, actual PG16 and PG18 runs each passed 17 tests: five IoT cases,
six notification cases and six connection-redirection refusals. The API type
check passed. Changed API-file lint passed with zero errors and 20 existing-rule
warnings; no rule or baseline was relaxed. CI runs these fixtures against its
original service-container IDs and uploads only each domain's `result.json` and
`sink.jsonl`, never keys, certificates or full runtime logs.

The test source and provider hashes, service Git blob, original database runtime
identity, original provider close and per-operation outcomes are recorded in
each result. Every assertion for a case precedes adding its completed observation.
The two-domain fixtures do not establish five-domain reconciliation, continuous
ingress proof, the full 17-producer session, old-to-new switching, production
authorization, or a maintenance window. Those remain independent release gates.

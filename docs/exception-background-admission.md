# Exception side effects participate in deployment fencing

`AllExceptionsFilter` previously started error-log, database-alert and webhook
promises after the HTTP response without registering their true settlement.
This includes failures of GET requests that do not enter the mutation HTTP
interceptor. A response or zero HTTP requests therefore did not establish that
those effects had ended.

The filter now requires the global `BackgroundTaskService`. Error-log writes
use LOCAL. Both database alert creation and webhook delivery use NOTIFICATION:
`SysAlertsService.createAlert()` also awaits a station-notification INSERT, so
its entire call chain requires that grant. Registered work awaits its original
promise through success or rejection. HTTP responses remain synchronous. The
webhook throttle is updated only after admission; a rejected task consumes no
future throttle slot. Errors are caught by the existing spawn handler with a
fixed log code, without recursively entering the exception filter.

FENCED, missing/untrusted manifest, a held coordinator gate, poison and stopping
refuse new root tasks. Existing live task graphs retain their original grants
and may register children while draining, as defined by the existing control
protocol. Denied diagnostic effects are dropped without automatic replay; the
filter still emits its existing host logger entry. An unresponsive effect remains
counted; a drain timeout remains poisoned HOLD, even if it settles later. No
cancellation, exactly-once delivery or production drain proof is claimed.

## Security scan disposition

The unapproved static scan returned FAIL for the following 19 lines. Every hit
uses its broad callback/webhook keyword rule. No authentication, Chanjet callback,
signature, company scope, grant source or synchronization policy is modified.
The test callbacks/URL are owned mock material. The application lines really
concern alert webhook delivery, so they require review rather than being hidden
or removed from scanning. The change narrows their admission and tracks true
settlement; the existing destination and payload behavior remain unchanged.
Independent review identified the transitive in-app notification classification
and confirmed its correction plus a test using the real service method.

| File | Line | Classification and disposition |
| --- | ---: | --- |
| `apps/api/src/common/filters/all-exceptions.filter.spec.ts` | 32 | Owned test callback or mocked alert webhook; no real remote call; denial, grant and settlement tests. |
| `apps/api/src/common/filters/all-exceptions.filter.spec.ts` | 50 | Owned test callback or mocked alert webhook; no real remote call; denial, grant and settlement tests. |
| `apps/api/src/common/filters/all-exceptions.filter.spec.ts` | 55 | Owned test callback or mocked alert webhook; no real remote call; denial, grant and settlement tests. |
| `apps/api/src/common/filters/all-exceptions.filter.spec.ts` | 58 | Owned test callback or mocked alert webhook; no real remote call; denial, grant and settlement tests. |
| `apps/api/src/common/filters/all-exceptions.filter.spec.ts` | 61 | Owned test callback or mocked alert webhook; no real remote call; denial, grant and settlement tests. |
| `apps/api/src/common/filters/all-exceptions.filter.spec.ts` | 69 | Owned test callback or mocked alert webhook; no real remote call; denial, grant and settlement tests. |
| `apps/api/src/common/filters/all-exceptions.filter.spec.ts` | 120 | Owned test callback or mocked alert webhook; no real remote call; denial, grant and settlement tests. |
| `apps/api/src/common/filters/all-exceptions.filter.spec.ts` | 172 | Owned test callback or mocked alert webhook; no real remote call; denial, grant and settlement tests. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 16 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 17 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 36 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 105 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 176 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 177 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 180 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 183 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 184 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 203 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 204 | Actual alert webhook path or comment; NOTIFICATION admission and awaited original promise; no Chanjet/auth change. Reviewed sensitive touch. |

## Validation and limits

Node 20: 35 targeted tests passed (15 filter cases plus 20 existing task-graph
cases). They include the real `createAlert→sys_notifications` method chain with
only its database boundary mocked, delayed effects, parent/child races, denied
permissions, drain timeout and rejection without recursive alerts. These are
not real PostgreSQL or production tests. Two additional cases run actual Nest
GET and POST requests through the real interceptor/filter chain with an owned
HTTP server; original response and asynchronous settlement are both verified.
API typecheck passed. Changed-file
ESLint has zero errors and six existing `any` warnings; no rule was relaxed.

The first full API invocation used the repository directory rather than
`apps/api`, causing eight source-contract file lookup failures. This failed
run is retained. The supported package-directory rerun passed 1,151 tests, with
332 explicitly skipped. The two subsequent real HTTP cases passed in the
35-case targeted run; the hosted final revision must run the complete inventory.
Local Web typecheck could not resolve the existing broken dependency links;
its result is not PASS. Official CI must perform clean dependency installation
and all Required Checks on the final revision before merge.

No workflow dispatch, production mutation, service stop, migration, floor
promotion, Web deployment or Chanjet operation is performed. Production
environment protection, live host ownership and the complete 17-producer
factory remain independent blockers.

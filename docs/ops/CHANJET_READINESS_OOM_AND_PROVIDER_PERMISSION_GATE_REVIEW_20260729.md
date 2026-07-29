# Chanjet Readiness OOM and Provider Permission Gate Review

Date: 2026-07-29

## Result

Decision: `HOLD`

The production readiness path is stable again. The remaining HOLD is not an ERP
runtime failure and must not be retried blindly: the Chanjet `openToken` lacks
readonly access to six targets.

Next Gate: `CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR`

## Root Cause and Repair

The readiness endpoints previously loaded large compressed snapshot payloads from
PostgreSQL and expanded them inside a Node.js process with a 320 MB heap and a
512 MB container limit. The production snapshot set was about 80 MB while stored,
but its expanded JavaScript representation exceeded the available heap and could
restart the API.

The repair:

1. Replaced full snapshot hydration with scalar SQL evidence extraction.
2. Added bounded readiness caching and in-flight request coalescing.
3. Kept response payloads compact and excluded raw snapshot bodies.
4. Classified Chanjet error `50111` as a non-retryable provider permission HOLD.
5. Propagated the exact baseline next Gate into production readiness and current
   state instead of returning a generic repair Gate.

## Production Evidence

- Production revision: `64fb5558e815871bf67da3147f0dbaed370fb7cf`
- CI/CD run: `30464528298`
- CI/CD result: `SUCCESS`
- API health: `healthy`
- Web health: `healthy`
- API restart count after readiness probes: `0`
- OOM log matches after deployment: `0`
- Production readiness: HTTP 200, `HOLD`, score `83`, grade `B`
- Current state: HTTP 200, `HOLD`
- Readiness next Gate: `CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR`
- Current-state next Gate: `CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR`

## Readonly Baseline

| Metric | Result |
| --- | ---: |
| Read contracts | 29 |
| Expected targets | 85 |
| Fresh targets | 79 |
| Stale targets | 0 |
| Missing targets | 6 |
| Provider permission HOLD targets | 6 |
| Fresh coverage | 92.94% |

All six missing targets return Chanjet provider code `50111`:

- `OTHER_STOCK_IN` for three enabled account books
- `RETAIL_STOCK_OUT` for three enabled account books

The other 79 targets are fresh. Automatic retry is disabled for these six targets
because ERP cannot repair an external provider grant.

## Mapping Review

The system-confirm exact-mapping precheck completed with HTTP 201. It found no
unresolved exact candidates or conflicts:

- Counterparty mappings already approved: 451
- Exact matched counterparties: 51
- Source-only counterparties retained: 400
- Master-data rows reviewed and unchanged: 91
- Pending/conflicting exact candidates: 0

This operation did not write Chanjet and did not modify ERP inventory or finance
business facts.

## Verification

- Chanjet service tests: 78/78 PASS
- Chanjet module tests: 10 suites, 180/180 PASS
- API TypeScript: PASS
- Web TypeScript: PASS
- W5 closeout: 20/20 PASS with the approved freeze/security touch flags
- Full CI/CD regression and deployment: PASS

## Boundaries

- Chanjet write/delete/modify: not executed
- ERP inventory promotion: not executed
- ERP finance transaction mutation: not executed
- Migration: not executed
- Destructive retry or cleanup: not executed

## Next Action

1. Grant the current `openToken` readonly access to `OTHER_STOCK_IN` and
   `RETAIL_STOCK_OUT` for all three enabled books.
2. Rerun only those six readonly targets.
3. Require the baseline to reach 85/85 fresh before clearing this provider HOLD.
4. Continue reconciliation of the five non-OK finance comparisons and improve
   authority coverage; do not enable Chanjet external writes.

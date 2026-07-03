# Chanjet Handshake / Token Health Check - 2026-07-03

## Goal

Check the production Chanjet / 好业财 connection handshake before starting the next integration round, with special attention to whether `openToken` can remain valid through the existing `appTicket + certificate -> openToken` flow.

## Scope

- Production API / DB health: read-only checks.
- Chanjet auth state table: read-only checks.
- Chanjet cron heartbeat: read-only checks.
- Public callback reachability: safe GET / unsigned POST test.
- Chanjet appTicket resend trigger: called once through the official OpenAPI resend endpoint.

No business data was written. No migration, deployment, push, seed, reset, or cleanup was executed.

## Current Result

**HOLD - Chanjet token is not currently healthy.**

The ERP service is reachable and the callback endpoint is public, but the stored `appTicket` is expired and no valid `openToken` is cached. The resend request to Chanjet returned success, but no new callback reached the production API/Nginx logs during the observation window.

## Evidence

### Production Service Health

- Production code: `34467c3e`
- API container: healthy
- Web container: healthy
- DB container: healthy
- `/api/health`: database connected

### Chanjet Auth State

Read-only query against `sys_chanjet_state`:

```text
key=singleton
has_app_ticket=true
has_certificate=true
token_count=0
updated_at=2026-06-24 08:19:07.308817+00
```

Interpretation:

- `appTicket` exists in DB, but it is stale.
- `certificate` exists.
- No `openToken` is persisted/cached.
- Auth state has not been refreshed since 2026-06-24.

### Cron Heartbeat

Recent cron heartbeat showed:

```text
chanjet-health-check: FAILED
detail: 好业财 appTicket 已过期... code=4041

chanjet-refresh-token: FAILED
detail: 好业财 appTicket 已过期... code=4041
```

Interpretation:

- The refresh path is working far enough to detect the expired ticket.
- Token refresh cannot complete without a fresh appTicket callback.

### Callback Reachability

Safe external checks:

```text
GET https://erp.eggslao.com/api/chanjet/callback?ping=1 -> 200 {"result":"success"}
POST https://erp.eggslao.com/api/chanjet/callback without signature -> 403 expected
```

Interpretation:

- The callback route is reachable from the internet.
- Unsigned callback requests are rejected as designed.

### AppTicket Resend

The appTicket resend endpoint returned success:

```json
{
  "http": 200,
  "response": {
    "code": "200",
    "message": "成功",
    "result": "success"
  }
}
```

Follow-up checks showed:

- `sys_chanjet_state` remained unchanged.
- `token_count` remained `0`.
- API logs had no Chanjet callback hit.
- Nginx access logs only showed the manual test requests from the operator IP, not a Chanjet platform callback.

## Root Cause Assessment

Most likely root cause:

1. The Chanjet Open Platform message callback URL is not configured, not saved, disabled, or pointed somewhere other than:

   ```text
   https://erp.eggslao.com/api/chanjet/callback
   ```

2. Or the Chanjet platform is sending a callback format/signature that our strict callback handler does not currently accept.

Current evidence favors case 1 because no platform callback request appeared in Nginx access logs after `appTicket/resend`.

## Existing ERP Auth Flow

Current code path:

1. Chanjet pushes `appTicket` to `/api/chanjet/callback`.
2. ERP stores `appTicket` in `sys_chanjet_state`.
3. ERP combines `appTicket + certificate` to call:

   ```text
   https://openapi.chanjet.com/v1/common/auth/selfBuiltApp/generateToken
   ```

4. ERP caches/persists `openToken`.
5. Cron refreshes token every 4 days and runs a daily health check.

The flow is structurally present, but blocked at step 1 because the fresh appTicket callback is not arriving.

## Required Fix Before Business API Integration

Before expanding 好业财 module integration, complete this gate:

### CHANJET-CALLBACK-DELIVERY-GATE

1. In Chanjet Open Platform console, verify the message callback URL is exactly:

   ```text
   https://erp.eggslao.com/api/chanjet/callback
   ```

2. Verify the configured message secret matches production `CHANJET_MSG_SECRET`.

3. Save / re-enable the callback configuration after the new modules were opened.

4. Trigger appTicket resend again.

5. Confirm Nginx access logs show a Chanjet platform callback, not only manual curl tests.

6. Confirm `sys_chanjet_state.updated_at` advances and a fresh `appTicket` is stored.

7. Run token generation and verify `token_count >= 1`.

8. Run account book health check.

9. Only after the above passes, run the module permission probe and start business API mapping.

## If Callback Reaches Server but Fails

If Nginx logs show callback POSTs from Chanjet but API returns 403 or fails to decrypt:

1. Capture request shape safely without logging secrets.
2. Add compatibility for Chanjet's actual signature parameter names and encrypted body format.
3. Keep replay protection and secret verification.
4. Re-run resend and token probe.

## Current Recommendation

Do **not** start expanded 好业财 API integration yet. First restore the appTicket callback and openToken refresh chain. Starting module mapping while `openToken` is unavailable would create noisy failures and false negatives.

## Safety Confirmation

- Business code changed: No
- DB write executed: No
- Migration executed: No
- Deployment executed: No
- Push executed: No
- Production data modified: No


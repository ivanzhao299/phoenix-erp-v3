# Bug Intake Runner Stuck Task Root Cause And Hardening Report

## 1. Conclusion

- Platform decision: **GO**
- Queue decision: **GO**
- Resident runner decision: **GO**
- Release decision: the implementation commit is integrated into `main`; CI, deployment, production smoke and lifecycle writeback are mandatory before the administrator status can become `FIX_READY_FOR_UAT`.
- Business verification remains separate from technical completion. The runner must not mark a report `RESOLVED` without administrator or business verification.

## 2. Incident Summary

The administrator-facing Bug Intake workflow appeared stuck even though several Agent workers had already produced implementation and validation evidence. This was not one isolated failure. Multiple runtime and lifecycle defects amplified each other:

1. The resident process was stale and continued running old code after repository updates.
2. API inbox synchronization created full timestamp snapshots every 30 seconds.
3. The result Outbox grew without compaction and was read into one V8 string.
4. A child Agent process could emit `exit` while inherited output pipes prevented the parent from receiving `close`.
5. Verified Agent evidence could be overwritten by a later detached-worker HOLD.
6. Late A1 validation evidence could arrive after the parent had already decided HOLD.
7. Queue event files were incorrectly treated as business-code dirty files.
8. Successful Agent results were posted repeatedly on every idle cycle.
9. A cycle with no release attempt could overwrite production report status as HOLD because push/CI/smoke were intentionally skipped.
10. The macOS LaunchAgent installer could report installed while the service was not actually running.
11. Tasks archived while the remote report was `NOT_READY` stayed archived after administrator approval unless the remote redispatch generation changed.
12. The evidence classifier checked "already fixed/not applicable" wording before respecting an explicit HOLD conclusion.
13. The packaging warehouse handover page caught an API failure but still displayed "入库成功".
14. If another safe integration step had already pushed the verified release to `origin/main`, the runner treated zero unpushed commits as "no release" and skipped CI, production smoke and lifecycle writeback.

## 3. Root Cause Evidence

| Finding | Evidence | Impact |
| --- | --- | --- |
| Unbounded inbox snapshots | 7,365 legacy snapshot directories, 14,978,254,404 bytes | Disk growth and increasingly expensive scans |
| Oversized result Outbox | `result-outbox.jsonl` reached about 512 MB | `Cannot create a string longer than 0x1fffffe8 characters` |
| Child process close stall | Worker process exited but parent retained inherited stdout/stderr pipes | Task remained running indefinitely |
| Evidence overwrite | 16 HOLD tasks already had passing Worker evidence | False HOLD and repeated redispatch |
| Validation race | A1 result could be written after the first queue read | Parent emitted HOLD despite valid validation evidence |
| Runtime dirty false positive | `docs/ops/agent-queue/events.jsonl` blocked integration | Valid fixes were not released |
| Duplicate result delivery | Idle cycles repeatedly posted identical result payloads | Timeline noise and unnecessary API load |
| Idle lifecycle regression | 21 reports were changed to HOLD when no push was attempted | Administrator saw false failure after successful Agent work |
| LaunchAgent false readiness | Service label absent or stopped at the interpreter/kickstart layer | New approved reports were not consumed |
| Approved task remained archived | `BUG-20260722-0003` became executable remotely but local A3/A4/A1 tasks remained archived | Administrator approval did not restart the repair |
| HOLD classification order | Explicit HOLD evidence containing "already present" text was accepted as not applicable | A failed implementation could appear complete |
| False warehouse success | UI set success state after the request catch path | Operator saw success while inbound detail remained unchanged |
| Already-pushed lifecycle gap | Verified commit existed on `origin/main`, but zero unpushed commits caused release steps to be skipped | Code could deploy while the administrator report stayed HOLD |

## 4. Implemented Hardening

### 4.1 Storage And Streaming

- API inbox now uses stable current snapshots instead of a full timestamp copy per cycle.
- Sync reads are bounded and legacy snapshots are pruned.
- Outbox JSONL processing is streaming instead of `readFileSync(..., "utf8")`.
- Delivered Outbox rows are compacted.
- Historical production cleanup reclaimed 14,978,254,404 bytes.
- Current inbox size is approximately 6.9 MB and the result Outbox is empty.

### 4.2 Worker Lifecycle

- Parent process settles after child `exit` with a bounded output-drain window.
- Remaining child streams are closed after the drain window.
- Timeout handling escalates from TERM to KILL instead of waiting forever.
- Verified evidence recovery permits a guarded HOLD-to-completed transition.
- Queue state is re-read before a HOLD decision so late A1 evidence is accepted.
- Detached-worker state cannot overwrite terminal implementation or validation evidence.
- A task archived specifically because the remote report was `NOT_READY` is reactivated after administrator approval, without requiring an artificial generation increment.
- Route-refinement and other intentional archives remain immutable.
- Explicit HOLD/FAIL conclusions are evaluated before idempotent "already fixed/not applicable" wording.
- A terminal success status without a passed evidence gate is now an invalid
  state. The runner automatically requeues it once for clean verification and
  then fails closed to HOLD instead of silently publishing success.
- A4 must emit exactly one canonical conclusion. Mixed conclusions such as
  `NOT APPLICABLE / HOLD` are forbidden and cannot satisfy release evidence.

### 4.3 Queue And Release Safety

- `docs/ops/agent-queue/**` and other generated runner state are classified as runtime audit files.
- Result deliveries use deterministic identifiers and durable receipts.
- Existing successful deliveries were bootstrapped into the receipt store.
- Idle cycles do not write runner-level HOLD.
- Lifecycle writeback only occurs after a real release attempt.
- Release task identifiers are deterministic for the released commit.
- Push remains blocked by non-runtime business changes, but generated queue state no longer creates a false block.
- A verified release already present on `origin/main` resumes at CI wait, production smoke and lifecycle writeback instead of being mistaken for an idle cycle.

### 4.4 Business Repair Verified By The Pipeline

- `BUG-20260722-0003` root cause: warehouse inbound confirmation posted inventory and completed the header but did not persist `wms_inbound_items.actual_qty` and `broken_qty`.
- The backend now persists inbound detail quantities in the same transaction before inventory posting.
- The frontend now validates the handover result and never displays success after an unsuccessful request.
- The implementation commit was integrated as `a4d61541`.

### 4.5 Resident Process

- LaunchAgent uses explicit `/bin/bash` instead of relying on shebang resolution.
- All `launchctl` calls have bounded timeouts.
- Installation performs bootstrap, enable and a real PID/running-state inspection.
- Failed startup exits non-zero and is no longer reported as success.
- The installed service now executes the Node runner directly and retains the configured 30-second interval.

## 5. Recovery Result

- Queue total: 379.
- Active tasks: 0.
- False-complete tasks: 0.
- Terminal evidence coverage: 100%.
- Status distribution:
  - archived: 213
  - completed: 3
  - COMPLETED_MERGED: 75
  - VALIDATION_COMPLETED: 70
  - SKIPPED_NOT_APPLICABLE: 18
- Platform health: **GO**.
- Production result delivery:
  - reports checked: 23
  - previous successful delivery receipts imported: 106
  - duplicate result posts after restart: 0
- Resident LaunchAgent:
  - label: `com.phoenix.erp.bug-intake-runner`
  - state: running
  - process: Node `bug-intake-local-runner.mjs`
  - auto release: enabled

## 6. Verification

- Focused Bug Runner tests: **45/45 PASS**.
- Warehouse service tests: **7/7 PASS**.
- Packaging handover client tests: **2/2 PASS**.
- Focused platform and business regression total: **54/54 PASS**.
- API TypeScript: **PASS**.
- Web TypeScript: **PASS**.
- Locale parity: **PASS**.
- Translation JSON validation: **PASS**.
- CI security for `a4d61541`: **PASS**.
- CI Web Unit Tests for `a4d61541`: **PASS**.
- CI Build for `a4d61541`: **PASS**.
- W5 closeout with the documented freeze/security review flags: **PASS**.
- CI/CD deployment and production route smoke are recorded by the same lifecycle before status writeback.

## 7. Guardrails

- No migration was executed.
- No database schema was changed.
- No production database record was edited by this remediation.
- No destructive rollback was executed.
- A technical Agent result does not equal business acceptance.
- Reports awaiting business verification remain visible to administrators.
- A failed real release may write HOLD; an idle or no-push cycle may not.
- `SKIPPED_NOT_APPLICABLE` without a passed evidence gate may not unlock a
  dependency or reach lifecycle writeback.

## 8. Business Closure Boundary

The technical lifecycle restores a successfully released report to `FIX_READY_FOR_UAT`. It does not claim that the operator scenario is business-accepted. The administrator must re-run the exact inbound scenario and confirm that the received quantity and inventory query agree before changing the report to `RESOLVED`.

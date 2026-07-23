# Bug Intake Runner Stuck Task Root Cause And Hardening Report

## 1. Conclusion

- Platform decision: **GO WITH CONDITIONS**
- Queue decision: **GO**
- Resident runner decision: **GO**
- Release decision: pending the final CI/deploy/smoke evidence for the hardening commit.
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

### 4.3 Queue And Release Safety

- `docs/ops/agent-queue/**` and other generated runner state are classified as runtime audit files.
- Result deliveries use deterministic identifiers and durable receipts.
- Existing successful deliveries were bootstrapped into the receipt store.
- Idle cycles do not write runner-level HOLD.
- Lifecycle writeback only occurs after a real release attempt.
- Release task identifiers are deterministic for the released commit.
- Push remains blocked by non-runtime business changes, but generated queue state no longer creates a false block.

### 4.4 Resident Process

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
  - archived: 216
  - completed: 3
  - COMPLETED_MERGED: 74
  - VALIDATION_COMPLETED: 69
  - SKIPPED_NOT_APPLICABLE: 17
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

- Focused Bug Runner tests: **54/54 PASS**.
- Locale parity: **PASS**.
- Translation JSON validation: **PASS**.
- Web TypeScript: **PASS**.
- CI Security for `784e9909`: **PASS**.
- CI Web Unit Tests for `784e9909`: **PASS**.
- W5 closeout with the documented freeze/security review flags: **PASS**.
- CI Build and deploy/smoke evidence: recorded after the workflow reaches a terminal state.

## 7. Guardrails

- No migration was executed.
- No database schema was changed.
- No production database record was edited by this remediation.
- No destructive rollback was executed.
- A technical Agent result does not equal business acceptance.
- Reports awaiting business verification remain visible to administrators.
- A failed real release may write HOLD; an idle or no-push cycle may not.

## 8. Remaining Condition

The false HOLD reports must be restored using one real release lifecycle with passing CI and production smoke. This restoration is evidence-driven and must not be performed by directly editing production report status.

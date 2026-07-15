# Bug Intake Full Closure Report - 2026-07-15

## Final Conclusion

- Technical repair and release lifecycle: **GO**.
- Production Bug Intake pipeline: health score **100**, 21 active reports all at `FIX_READY_FOR_UAT`; 0 active HOLD, failed, stale-running, or stale-approved reports.
- Local Bug Intake queue: 275 tasks, all terminal (`archived` 158, `COMPLETED_MERGED` 56, `VALIDATION_COMPLETED` 49, `SKIPPED_NOT_APPLICABLE` 9, `completed` 3); 0 pending, claimed, running, HOLD, or failed tasks.
- Production reports: 43 total (`CLOSED` 2, `RESOLVED` 19, `IN_PROGRESS` 21, `REJECTED` 1). The 21 `IN_PROGRESS` reports are technically deployed and smoke-verified, but deliberately await administrator business acceptance instead of being falsely auto-resolved.
- The single `HOLD` repair status belongs to a rejected report and is excluded from the active queue. It is retained as audit history, not unresolved execution backlog.
- No report is treated as resolved merely because an Agent returned text. A report advances to `FIX_READY_FOR_UAT` only after implementation evidence, independent A1 validation, push, CI/CD, and authenticated production smoke pass; `RESOLVED` still requires administrator business verification.

## Root Causes And Fixes

### 1. Verified fixes returned to HOLD after redispatch

**Root cause:** a production redispatch increased `redispatch_count`, while the queue merge reset every selected Agent in the new generation. Successful implementation evidence from the previous generation was discarded. The Agent then saw an already-fixed tree, produced no new diff, and the evidence gate correctly but misleadingly returned `Missing implementation evidence`.

**Fix:** `bug-task-to-agent-queue.mjs` now carries forward verified successful terminal evidence into a newer redispatch generation. Failed or unfinished ownership is requeued, while `COMPLETED_MERGED`, `VALIDATION_COMPLETED`, and `SKIPPED_NOT_APPLICABLE` evidence is retained. This prevents both duplicate code churn and false HOLD.

**Regression:** 3 queue-generation tests and 17 resident-runner tests pass, including mixed-generation retry, verified-existing implementation, and later-cycle release backlog.

### 2. Procurement payment failed with stale AP ledger ID

**Root cause:** payment allocations relied on a mutable numeric AP row ID. Existing drafts could retain an old `ap_id` after AP records were rebuilt or imported, so confirming payment failed with `AP 台账 ID=11 不存在`. The finance-to-procurement prefill also previously copied a finance AP ID into the procurement AP ID field.

**Fix:** the frontend no longer serializes the cross-domain finance ID as procurement `apId`. The backend resolves allocations by stable references (`apNo`, `poId`, `poNo`) when the numeric ID is stale, rejects conflicting matches, updates the stale reference to the canonical AP row, and verifies the persisted allocation before continuing.

**Regression:** procurement payment tests cover successful stable-reference recovery and conflict fail-closed behavior.

### 3. Purchase order ID was unavailable to logistics users

**Root cause:** the API already returned the order ID, but the purchase-order list and form did not expose it. A logistics order created outside the purchase-order shortcut therefore asked users for a value they could not discover.

**Fix:** the list shows a dedicated purchase-order ID column and the form exposes the saved record ID as read-only reference data. Responsive help text keeps the identifier understandable without adding editable fields.

**Regression:** purchase-order identifier UI tests pass.

### 4. Farm master CRUD returned permission errors and lacked a direct entry

**Root cause:** the generic CRUD bridge applied a legacy table permission before the farm-specific atomic menu guard. Users with the correct farm-master permission could still receive a 403. The master-data navigation also had no direct farm archive entry, and the farm page emphasized editing existing records rather than creating a governed record.

**Fix:** farm CRUD uses its specific menu guard without the conflicting legacy bridge check. The master-data menu now includes the farm archive, and the page includes the governed create action with existing permission and validation rules.

**Regression:** generic CRUD permission tests and farm-menu/UI tests pass.

### 5. Workflow todo count and operations-workbench navigation drifted

**Root cause:** the todo summary and visible list used different filtering/counting paths, while the operations workbench assumed the dashboard permission even when the user only held a child procurement permission.

**Fix:** todo counters share the same normalized result source as the visible list. The workbench resolves the first permitted procurement destination instead of forcing an unauthorized dashboard route.

**Regression:** workflow service/UI and home navigation tests pass.

### 6. Release lifecycle could report text success without technical closure

**Root cause:** result writeback, release push, CI confirmation, and production smoke occurred in separate cycles, but the old runner only considered workers launched in the current cycle. Verified commits could remain indefinitely ahead of `origin/main`, and the administration UI stayed in HOLD.

**Fix:** the runner now includes verified release-ready backlog and unpushed integrated commits in later release cycles. It refuses release when any selected Agent lacks evidence, waits for GitHub Actions, performs authenticated production route smoke, and only then writes `PASS_WITH_CONDITIONS` for administrator business acceptance.

### 7. Refined Agent routing could leave completed reports in HOLD

**Root cause:** the administrator repair plan recorded a broad advisory Agent set, while the local runner correctly refined execution to only the Agents required by the changed paths. The old writeback posted results only for the locally executed Agents. The backend still waited for every Agent in the broad plan, so `agentPlanCompleted` never became true and the lifecycle remained `AGENT_RUNNING`/`HOLD`. Repeated cycles also appended timestamped runner receipts, which could make the administrator result panel surface stale release evidence instead of the latest lifecycle state.

**Fix:** the runner now writes deterministic `NOT_APPLICABLE` results for advisory Agents omitted by refined routing before it writes actual worker results. The backend deduplicates runner receipts, keeps a bounded result history, and treats `implementation_verified_existing` as valid implementation evidence. The broad plan, refined execution, evidence gate, and administrator result now converge on one terminal state without manufacturing work for unnecessary Agents.

**Regression:** resident-runner regression now passes 18 tests, including omitted-advisory-Agent backfill; Bug Intake service regression passes 12 tests, including receipt deduplication and verified-existing implementation evidence.

### 8. Repeated successful release receipts could downgrade UAT-ready reports

**Root cause:** the release receipt transition accepted only `AGENT_EXECUTION_FINISHED`. A later reconciliation cycle legitimately re-posted successful CI/CD and production-smoke evidence for a report already in `FIX_READY_FOR_UAT`; the strict pre-state check treated that success as invalid and downgraded the report to HOLD.

**Fix:** successful runner lifecycle verification is now idempotent for both `AGENT_EXECUTION_FINISHED` and `FIX_READY_FOR_UAT`. Earlier states such as `AGENT_APPROVED` and `AGENT_RUNNING` remain blocked, so release evidence still cannot bypass implementation and A1 gates.

**Regression:** Bug Intake lifecycle regression passes 13 tests, including a repeated successful release receipt that must retain `FIX_READY_FOR_UAT` and one runner receipt only.

### 9. Resident runner was configured but not reliably resident

**Root cause:** the LaunchAgent wrapper still depended on an interactive username/password login path and an environment-dependent Node.js lookup. Historical login retries reached API rate limits, while launchd's minimal environment could not reliably resolve the intended runtime. The worker therefore appeared installed but could stop consuming approved reports.

**Fix:** the private runner wrapper now uses a fixed Node.js executable, loads the dedicated least-privilege runner token from its protected local token file, and starts the existing watch-mode runner directly. The LaunchAgent remains isolated from user shell state and keeps the existing no-migration/no-direct-DB-write safety boundaries.

**Regression:** `com.phoenix.erp.bug-intake-runner` is loaded and running; the live process is `bug-intake-local-runner.mjs --watch`, token mode is present, and no new stderr entry was produced after restart. Historical 429 lines predate this repair.

### 10. Idle resident cycles could create an audit commit and deployment loop

**Root cause:** release-ready backlog selection included reports already at `FIX_READY_FOR_UAT`. An idle cycle therefore performed an empty `git push`, reused the completed CI result for the same HEAD, reran production route smoke, and rewrote the smoke artifact with a new timestamp and elapsed times. The next cycle committed that runtime-only diff, which triggered another CI/CD deployment despite there being no new repair.

**Fix:** `FIX_READY_FOR_UAT`, `BUSINESS_VERIFIED`, and `AGENT_COMPLETED` reports are excluded from release backlog. The release push gate now also requires at least one real commit in `origin/main..HEAD`; complete evidence alone cannot trigger push, CI wait, production smoke, or lifecycle writeback on an idle cycle.

**Regression:** resident-runner regression passes 20 tests, including UAT-ready backlog exclusion and the requirement for a real unpushed release commit.

## Local Retest Results

| Validation | Result |
| --- | --- |
| API TypeScript | PASS, 0 errors |
| Web TypeScript | PASS, 0 errors |
| API focused regression | PASS, 4 suites / 26 tests |
| Web focused regression | PASS, 5 files / 20 tests |
| Resident runner regression | PASS, 20 tests |
| Queue redispatch regression | PASS, 3 tests |
| Bug Intake service lifecycle regression | PASS, 13 tests |
| Refined-route result backfill regression | PASS, resident runner 18 tests |
| W5 closeout gate | PASS with reviewed `ALLOW_FREEZE_TOUCH=true` and `ALLOW_SECURITY_TOUCH=true` flags |
| Freeze/security/static gates | PASS in reviewed authorization mode; the default historical-diff scan correctly reports the already-reviewed application/security changes |
| Active local queue | PASS, no non-terminal task |

## Release And Production Retest

Final code release evidence:

- Release commit: `308fe9101d3bf89e1c45928d3df0af5183992d3f` on `origin/main`.
- GitHub Actions: security, Web unit, build, and full CI/CD deploy all completed successfully.
- Production route smoke: 17/17 affected routes returned HTTP 200, including farm master, purchase orders, procurement payments, workflow todos, warehouse, finance, dashboard, pilot run, and Bug Intake administration.
- Production Bug Intake pipeline: `GO`; queue health 100; 21/21 active reports have release evidence and are `FIX_READY_FOR_UAT`; 0 active technical HOLD.
- Local queue: 275/275 Bug Intake tasks terminal; 0 non-terminal tasks.
- Production error log after final deployment: 2 entries, both expected 403 `MENU_PERMISSION_DENIED` responses from read-only system-error-log probes made with the deliberately restricted runner account; 0 HTTP 500, PG, or unhandled server errors.
- Resident lifecycle: LaunchAgent loaded and running in token mode; no manual repository command is required for the next approved report.

Final release workflow runs:

- Security: `29419622458` - PASS.
- Build: `29419622541` - PASS.
- Web unit tests: `29419622348` - PASS.
- CI/CD build and deploy: `29419622396` - PASS.

## Safety

- No force push.
- No migration.
- No direct database write in this closure cycle.
- Production database verification was read-only.
- No destructive cleanup.
- Business acceptance remains an administrator action after technical production evidence passes.

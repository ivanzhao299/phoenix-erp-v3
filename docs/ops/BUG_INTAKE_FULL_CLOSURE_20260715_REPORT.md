# Bug Intake Full Closure Report - 2026-07-15

## Conclusion Before Release

- Local repair queue: technically closed and release-ready.
- Active bug-intake task evidence: 118 terminal tasks; 0 pending, claimed, running, HOLD, or failed tasks.
- Production administration UI: 21 reports still show HOLD until push, CI/CD, and authenticated production smoke evidence are written back.
- No report is treated as resolved merely because an Agent returned text. A report can advance only after implementation evidence, independent A1 validation, release, and production smoke pass.

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

## Local Retest Results

| Validation | Result |
| --- | --- |
| API TypeScript | PASS, 0 errors |
| Web TypeScript | PASS, 0 errors |
| API focused regression | PASS, 4 suites / 26 tests |
| Web focused regression | PASS, 5 files / 20 tests |
| Resident runner regression | PASS, 17 tests |
| Queue redispatch regression | PASS, 3 tests |
| Bug Intake service lifecycle regression | PASS, 12 tests |
| Refined-route result backfill regression | PASS, resident runner 18 tests |
| W5 closeout gate | PASS |
| Freeze/security/static gates | PASS |
| Active local queue | PASS, no non-terminal task |

## Release And Production Retest

First release cycle evidence:

- Push result: `64c6bb0a` pushed to `origin/main`.
- GitHub Actions: security, Web unit, build, and CI/CD deploy all passed.
- Production route smoke: 17/17 routes returned HTTP 200.
- Lifecycle follow-up: exposed the refined-route result backfill defect described in root cause 7; `f0c901bf` contains the repair and is pending the final release cycle recorded below.

Final release evidence is updated after `f0c901bf` is pushed and the production backlog is reconciled.

## Safety

- No force push.
- No migration.
- No direct database write in this closure cycle.
- No destructive cleanup.
- Business acceptance remains an administrator action after technical production evidence passes.

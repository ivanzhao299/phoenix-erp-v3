# Bug Intake HOLD Queue and Runtime Clearance

Date: 2026-07-26

Decision: **GO WITH CONDITIONS**

## Scope

This closeout covers the repeated HOLD reports, the local Runner backlog, release-evidence writeback, and the production API restart/OOM condition observed while processing Bug Intake work.

It does not declare business acceptance for reports that have not passed administrator retest.

## Report State

The production Bug Intake API currently exposes 14 active reports:

| State | Count | Meaning |
| --- | ---: | --- |
| `FIX_READY_FOR_UAT` | 13 | Code/release evidence is present; business retest is still required |
| `BUSINESS_VERIFIED` | 1 | Administrator acceptance is complete |
| `HOLD` | 0 | No report is blocked in the repair lane |
| `AGENT_EXECUTION_FINISHED` | 0 | No report is stranded between execution and release evidence |

The local Agent queue contains 405 historical task records and **zero active tasks**. Its latest dashboard decision is `GO`, `false_complete_count=0`, and terminal evidence coverage is 100%.

## Priority Business Retests

1. `BUG-20260725-0001`: sales delivery creation.
2. `BUG-20260724-0004`: inventory outbound and inventory-ledger linkage.
3. `BUG-20260722-0003`: packaging workbench inbound status after page re-entry.

The implementation for these three flows was committed in `3abdc810` and the related i18n status coverage in `69781363`. API/Web checks and W5 passed before deployment.

The remaining UAT-ready reports cover mobile henhouse creation, expense approval, purchase-order counts, daily egg inbound prefill, medicine stock, flock edit refresh, stock totals, warehouse-code display, dashboard cards, and the UAT page.

## Root Causes

### 1. Docs-only CI barrier starvation

The local Runner always waited for both:

- `AI Delivery CI Security`
- `CI/CD - Build & Deploy`

GitHub intentionally does not create the Security workflow for docs/ops-only audit commits. The Runner therefore waited for an impossible workflow and left the report at `AGENT_EXECUTION_FINISHED` or HOLD even after the deploy workflow passed.

**Fix:** derive required workflows from the committed paths. Ops-only audit commits now require the deploy workflow but do not wait for a workflow that cannot exist.

### 2. Stale HOLD routes survived remote UAT readiness

The synchronizer preserved the latest approved local route for every active remote report. That included reports already advanced to `FIX_READY_FOR_UAT`, so old A1/A3/A4 HOLD tasks remained active and were repeatedly reconsidered.

**Fix:** preserve a local route only while the remote repair lifecycle is `AGENT_APPROVED`, `AGENT_RUNNING`, `AGENT_EXECUTION_FINISHED`, or `HOLD`. `FIX_READY_FOR_UAT` and `BUSINESS_VERIFIED` now archive stale local routes.

Four stale tasks were archived:

- `BUGTASK-20260717-0001-A4`
- `BUGTASK-20260717-0001-A1`
- `BUGTASK-20260716-0002-A3`
- `BUGTASK-20260716-0002-A1`

### 3. Production API restart/OOM loop

An interrupted Chanjet readonly job was recovered on every API boot without a strict terminal retry boundary. At the same time, the global audit interceptor serialized oversized response payloads and duplicated them in memory.

**Fix:** readonly recovery is bounded and cooled down, exhausted jobs enter HOLD, full alignment runs sequentially, and audit payloads are size-limited. Commit `416591c1` is deployed.

Post-deploy evidence:

- API health: HTTP 200
- Container restart count: 0
- OOM killed: false
- Observed memory: approximately 85.74 MiB of 512 MiB

### 4. W5 used a stale local main baseline

The freeze and security gates preferred the local `main` branch over `origin/main`. In a long-lived worktree, that local branch was stale and made one current ops change appear to touch 2,104 historical files.

**Fix:** both gates now prefer `origin/main` and fall back to local `main` only when the remote-tracking ref is unavailable. A normal W5 invocation now evaluates the actual current change set without requiring manual environment overrides.

## Release Evidence

`BUG-20260718-0004` now has a dedicated lifecycle receipt:

- Receipt: `docs/ops/runs/BUG-20260718-0004-release-lifecycle-receipt.json`
- Release commit: `bfd64a08cc8e65c1281b39d0d9b6898240757652`
- CI/CD run: `30165198894`
- CI result: PASS
- Production health: HTTP 200

The receipt advances the report only to `FIX_READY_FOR_UAT`; it does not claim business acceptance.

## Validation

- Runner platform and lifecycle tests: 69/69 PASS.
- Synchronization: 14 reports fetched, zero fetch errors.
- Controlled Runner cycle: zero runnable, zero blocked, zero worker executions.
- Resident LaunchAgent: running; three consecutive post-release cycles completed with zero runnable and zero blocked tasks.
- Platform fix revision: `502f9a56761b86b95f24dfa0dd803a70d4ab9e87`.
- GitHub Actions: Security, Web Unit, Build, and CI/CD run `30165837632` all PASS.
- Production API: healthy, database connected, restart count zero, `OOMKilled=false`.
- Local dashboard: `GO`.
- False completion count: zero.

## Operating Rule

Technical evidence and deployment may advance a report to `FIX_READY_FOR_UAT`. Only an explicit successful administrator/business retest may advance it to `BUSINESS_VERIFIED`.

Failed retests may be redispatched, but the redispatch must create a new active route and may not revive superseded HOLD tasks.

## Final Result

**GO WITH CONDITIONS**

The queue blockage is cleared and the platform is ready to consume new approved reports. Thirteen reports still require genuine business UAT and must not be described as solved until those acceptance checks pass.

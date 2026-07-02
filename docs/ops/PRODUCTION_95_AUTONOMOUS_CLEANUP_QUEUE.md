# Production 95 Autonomous Cleanup Queue

Generated at: 2026-07-02

## Purpose

This queue turns the remaining production-readiness debt into executable, evidence-producing cleanup batches. The goal is to stop relying on ad hoc prompts and keep moving through local fixes, CI checks, controlled push/deploy gates, and production verification until the system is stable enough for daily production use.

## Execution Rules

1. Work starts from the local repository and local worktree state.
2. Every batch must produce a run artifact under `docs/ops/runs/` or a dated ops report.
3. Static gates are not enough for UI regressions; high-value pages require browser or authenticated smoke evidence.
4. Production DB writes, migration execution, deploy, and push require explicit approval or an already approved gate.
5. If a batch discovers a business-code defect, fix locally first, then validate, commit, push, deploy, and verify three-end consistency only through the approved release path.

## Active Queue

| priority | task_id | title | owner | output | status |
|---|---|---|---|---|---|
| P0 | PROD95-BROWSER-VISUAL-SMOKE | Browser screenshot smoke for high-value pages | Codex-Orchestrator | `scripts/ops/browser-visual-smoke.mjs` + latest run report | in_progress |
| P0 | PROD95-AUTH-ROLE-SMOKE | Execute role-specific smoke with approved credentials | A1/A2 | `docs/ops/runs/role-business-smoke-latest.*` | blocked_on_credentials |
| P0 | PROD95-ALERT-TO-HUMAN | Prove alert sink reaches a human/operator channel | A1/A6 | alert delivery evidence | done_with_conditions |
| P0 | PROD95-RESTORE-DRILL | Run non-production backup restore drill | A1/A6 | restore drill report | pending |
| P1 | PROD95-LEGACY-MASTER-DATA-REFERENCES | Continue reducing `brd_farms`, `prc2_projects`, `shr_projects` references | A3/A5 | legacy reference delta report | pending |
| P1 | PROD95-UI-PRODUCT-POLISH | Browser-driven UI cleanup for dashboard, health, alerts, UAT, inventory, IoT | A4/A1 | screenshot before/after evidence | pending |
| P1 | PROD95-RBAC-MATRIX-FINAL | Authenticated per-role menu/button smoke | A2/A1 | role matrix evidence | blocked_on_credentials |

## Current Batch

`PROD95-BROWSER-VISUAL-SMOKE`

This batch adds a Playwright-backed visual smoke runner that opens production routes, captures screenshots, and fails on obvious page-error text, 404/5xx responses, blank-like output, or missing expected page signals.

## Next Automatic Step

After this batch lands, run:

```bash
node scripts/ops/browser-visual-smoke.mjs --base-url=https://erp.eggslao.com --output-dir=docs/ops/runs --screenshots-dir=output/playwright/product-pages
```

If the run finds failures, fix the local page/API cause before any deploy. If the run is blocked by credentials, keep the task in HOLD and proceed to the next non-credential cleanup item.

## Completed Follow-up

`PROD95-ALERT-TO-HUMAN`

The alert human reachability smoke is now available at `scripts/ops/alert-human-reachability-smoke.mjs`.

- Static source reachability: PASS.
- Runtime delivery-health proof: WARN until `PHOENIX_SMOKE_TOKEN` is provided.
- CI manual target: `alert-human-production`.

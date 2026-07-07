# BUG-20260707-0006 A7 Final QA Gate Report

Date: 2026-07-08

Agent: A7-Final-QA-Gate

Route: `/breeding/daily`

Issue: 近期日报记录下的淘汰原因不显示中文

Acceptance criteria: 近期日报记录下的淘汰原因显示中文。

## 1. Final Decision

HOLD.

The repair direction is valid, but release evidence is incomplete. A3 backend evidence shows `brd_daily_logs` reason codes are translated to Chinese labels in the generic CRUD read response and API validation passed. A4 frontend evidence shows a static frontend fallback/display repair, but A4 explicitly ended `PASS WITH CONDITIONS / HOLD` because Web typecheck and browser UAT could not run. A6 also ended `PASS WITH CONDITIONS / HOLD`.

This A7 gate does not approve merge, push, deployment, database writes, or migration execution.

## 2. Preflight

| Check | Result |
| --- | --- |
| `pwd` | `/Users/mac/phoenix-erp-worktrees/a7-final-qa-gate` |
| `git branch --show-current` | `w5-a7-final-qa-gate` |
| initial `git status --short` | clean |
| initial HEAD | `c5c7577e docs(ops): record BUG-20260707-0005 A7 final QA gate` |

## 3. Evidence Reviewed

| Source | Evidence | Gate reading |
| --- | --- | --- |
| Bug context | Page snapshot contains raw `INJURY`, `SICKNESS`, `LOW_PRODUCTION`, `AGE` under recent daily records. Attachment download failed with 404. | Bug reproduced by text snapshot; screenshot artifact unavailable. |
| A2 worker log | `Conclusion: PASS WITH CONDITIONS`; follow-up requires RBAC/DataScope/menu gates preserved and no deploy/DB/migration/push outside gate. | No security GO blocker reported, but conditions remain. |
| A3 report | `GO`; changed `apps/api/src/modules/generic-crud/generic-crud.service.ts` and spec; no migration/schema/entity/DB write/deploy/push. | Backend repair evidence is acceptable. |
| A3 validation | Jest: 3 suites passed, 11 tests passed. API TypeScript: 0 errors. | API-side validation passed in A3 environment. |
| A3 code review | `enrichDailyLogReasonLabels()` translates `culling_reason` and `mortality_reason`, preserves `*_code`, and only applies to `brd_daily_logs`. | Fix is read-layer scoped and additive. |
| A5 worker log | `Conclusion: GO WITH CONDITIONS`; requires proof of data source and display semantics. | Data readiness is conditional, not final GO. |
| A1 worker log | Only runner/script syntax checks ran: `run-agent-task.mjs`, `agent-worker.mjs`, `bug-intake-local-runner.mjs`. | Does not satisfy app-level API/Web validation for release. |
| A4 report | `PASS WITH CONDITIONS / HOLD`; static check passed but `pnpm --filter web typecheck` failed because `tsc`/`node_modules` were missing; browser UAT not run. | Frontend/UAT gate remains open. |
| A4 code evidence | A4 branch adds `cullingReasonLabel()`, `BRD_CULLING_REASON` map, fallback labels, recent table label rendering, and CSV label conversion. | Useful static evidence, but not integrated into `origin/main` and not browser-verified. |
| A6 runbook | `PASS WITH CONDITIONS`; deployment execution decision `HOLD`. | Staging plan exists; deployment is not authorized. |

## 4. Unresolved Blockers

1. No real browser UAT evidence for `/breeding/daily` after repair. Required labels `严重外伤`, `患病`, `产蛋率低`, `老龄` were not verified on a running target.
2. Web TypeScript check is not complete. A4 recorded `tsc: command not found`; A7 local dependency probe also found `apps/web/node_modules/.bin/tsc` unavailable.
3. A1 did not run app-level `apps/api` or `apps/web` typechecks for this final candidate. A3 ran API checks; Web remains uncovered.
4. The A4 frontend report/fix is on `w5-a4-frontend-uat-smoke`, while `origin/main` contains A3/A6 evidence but not `docs/ops/BUG-20260707-0006_A4_FRONTEND_UAT_REPORT.md`.
5. The source screenshot attachment was not synced locally; the bug text snapshot is sufficient for diagnosis, but release evidence still needs a post-fix screenshot or browser log.
6. The final release candidate SHA is not explicitly named and frozen for this bug. A7 cannot approve a broad branch diff with unrelated migrations/modules as a bug-only release candidate.

## 5. Risk Summary

Risk level: Medium until validation completes.

Primary risk is not the backend code path; A3 evidence is narrow and covered. The release risk is evidence and candidate composition: without a dependency-complete Web check and browser smoke, A7 cannot prove the user-facing table no longer renders raw codes. If a broad candidate is deployed instead of an isolated bug fix, rollback complexity increases because unrelated migrations and module changes may be included.

RBAC, DataScope, audit, and attachment ACL were not changed by the reviewed A3 backend repair or A4 frontend display repair. No evidence shows a bypass, but this remains conditional on the final candidate matching the reviewed scope.

## 6. Release Recommendation

Recommendation: HOLD.

Do not deploy to production. Do not run migrations. Do not write database data. Do not push or merge as a release action from this A7 gate.

Required conditions before reconsidering GO:

1. Freeze a specific release candidate SHA and list the exact files included for BUG-20260707-0006.
2. Confirm the candidate includes the chosen repair path. If backend-only, prove `/api/crud/brd_daily_logs` now returns Chinese labels for known codes. If frontend fallback is included, merge/cherry-pick it into the candidate and rerun validation.
3. Run `cd apps/web && ./node_modules/.bin/tsc --noEmit` or the repo-approved equivalent in a dependency-complete environment.
4. Run browser UAT on `/breeding/daily` and capture evidence that recent records display:
   - `INJURY` -> `严重外伤`
   - `SICKNESS` -> `患病`
   - `LOW_PRODUCTION` -> `产蛋率低`
   - `AGE` -> `老龄`
5. Confirm no raw known code remains visible in the recent report culling reason column.
6. If export is in scope, verify exported culling reason values also use Chinese labels.
7. Confirm no migration/schema/entity/table/column changes are part of the bug-only candidate, or route the candidate through a separate release gate.
8. Re-run A2 security/DataScope confirmation on the final candidate if it differs from the reviewed A3/A4 scope.

## 7. Rollback Readiness

Rollback readiness: CONDITIONAL.

For the reviewed A3 backend-only repair, rollback is code-only: revert the generic CRUD service/spec commit and redeploy the previous known-good API image. No migration rollback is needed for that narrow fix.

Rollback is not ready for a broad candidate until the previous known-good SHA/image is recorded and unrelated migrations/modules are excluded or separately approved. If the deployed candidate includes schema or data migrations, this A7 report does not provide rollback approval.

## 8. Changed Files

Changed by A7:

- `docs/ops/BUG-20260707-0006_A7_FINAL_QA_GATE_REPORT.md`

Reviewed repair files:

- `apps/api/src/modules/generic-crud/generic-crud.service.ts`
- `apps/api/src/modules/generic-crud/generic-crud.service.spec.ts`
- `apps/web/src/app/(admin)/breeding/daily/page.tsx` on `w5-a4-frontend-uat-smoke`

## 9. Validation Commands

Commands executed by A7:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
rg -n "BUG-20260707-0006|BUGTASK-20260707-0006|淘汰原因|breeding/daily|cull" docs apps scripts .github --glob '!node_modules' --glob '!*.png'
git branch --list --all
git log --all --oneline --decorate --grep='0006' -30
git show origin/main:docs/ops/BUG-20260707-0006_A6_STAGING_DEPLOY_RUNBOOK.md
git show origin/main:docs/ops/BUG-20260707-0006_A3_BACKEND_CRITICAL_PATH_REPORT.md
git show w5-a4-frontend-uat-smoke:docs/ops/BUG-20260707-0006_A4_FRONTEND_UAT_REPORT.md
git show origin/main:docs/ops/runs/BUGTASK-20260707-0006-01-A2-worker-log.md
git show origin/main:docs/ops/runs/BUGTASK-20260707-0006-04-A5-worker-log.md
git show origin/main:docs/ops/runs/BUGTASK-20260707-0006-05-A1-worker-log.md
git show origin/main:apps/api/src/modules/generic-crud/generic-crud.service.ts
git show origin/main:apps/api/src/modules/generic-crud/generic-crud.service.spec.ts
git show w5-a4-frontend-uat-smoke:apps/web/src/app/'(admin)'/breeding/daily/page.tsx
test -x apps/api/node_modules/.bin/tsc
test -x apps/web/node_modules/.bin/tsc
```

Local dependency probe:

```text
api_tsc_executable=1
web_tsc_executable=1
```

Note: exit code `1` means the local A7 worktree did not have executable `tsc` binaries at those paths. This matches the A4 blocker and prevents A7 from independently completing local app typechecks.

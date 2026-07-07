# BUG-20260707-0005 A7 Final QA Gate Report

Date: 2026-07-08

Agent: A7-Final-QA-Gate

Route: `/breeding/daily`

Issue: 日生产日报不选择鸡舍也能提交成功

Acceptance criteria: clicking `提交日报` without a selected hen house, including selector placeholder/loading state, must stop submission and show `请先选择鸡舍后再提交`.

## 1. Gate Result

A7 result: HOLD.

Release recommendation: HOLD, not GO / GO WITH CONDITIONS.

Reason: the backend repair evidence is directionally correct, but final release evidence is incomplete. Required A1/A2/A4/A5 bug-specific gate reports are missing in this worktree, staging/UAT was not executed, local screenshot evidence was unavailable, and A7 could not re-run test/typecheck commands because dependencies are not installed in the current worktree.

No merge, push, deploy, migration execution, database write, task-board update, or business-code edit was performed by A7.

## 2. Execution Precheck

Required checks:

| Check | Result |
| --- | --- |
| `pwd` | `/Users/mac/phoenix-erp-worktrees/a7-final-qa-gate` |
| `git branch --show-current` | `w5-a7-final-qa-gate` |
| `git status --short` | clean before A7 report creation |
| `git log --oneline --decorate -8` | HEAD `34ab86a6 docs(ops): record baseline lifecycle report`; branch also points at `main` and `w5-a6-staging-deploy-runbook` |

Precheck passed for directory, branch, and initial worktree cleanliness.

## 3. Evidence Reviewed

Existing reports:

| Evidence | Finding |
| --- | --- |
| `docs/ops/BUG-20260707-0005_A3_BACKEND_CRITICAL_PATH_REPORT.md` | A3 reports `PASS WITH CONDITIONS / Backend GO`. A3 says API unit test and API tsc passed, while Web tsc failed on missing `vitest` / `vitest/config` types. |
| `docs/ops/BUG-20260707-0005_A6_STAGING_DEPLOY_RUNBOOK.md` | A6 reports `PASS WITH CONDITIONS`, but staging execution and production execution are both HOLD. It requires A1/A2/A4/A5/A7 validation before GO. |
| `rg -n "BUG-20260707-0005|0005" docs/ops` | Only A3 and A6 bug-specific reports were present, plus A6 lifecycle files. No A1/A2/A4/A5 bug-specific reports were found. |
| Local attachment evidence from task prompt | Screenshot download failed with HTTP 404 and no local attachment path exists. |

Code evidence:

| File | Finding |
| --- | --- |
| `apps/api/src/modules/farm/farm.service.ts:143` | `normalizeRequiredHouseCode` trims `house_code` and rejects empty, `加载中`, and `请选择`. |
| `apps/api/src/modules/farm/farm.service.ts:146` | Throws `BadRequestException('请先选择鸡舍后再提交')`. |
| `apps/api/src/modules/farm/farm.service.ts:153` | Required-house guard runs before subsequent DB read/write logic. |
| `apps/api/src/modules/farm/farm.service.spec.ts:17` | Empty `house_code` is covered and asserts no DB query/transaction. |
| `apps/api/src/modules/farm/farm.service.spec.ts:31` | Loading placeholder `加载中…` is covered and asserts no DB query/transaction. |
| `apps/api/src/modules/farm/farm.controller.ts:30` | Submit endpoint remains `POST /api/v3/farm/daily-logs`. |
| `apps/api/src/modules/farm/farm.controller.ts:31` | Submit endpoint remains protected by `MENU_FARM_DAILY:E`. |
| `apps/web/src/app/(admin)/breeding/daily/page.tsx:293` | Frontend submits `house_code: selectedHouse`. |
| `apps/web/src/app/(admin)/breeding/daily/page.tsx:326` | Non-2xx backend response is converted to an Error using response `message` / `msg`. |
| `apps/web/src/app/(admin)/breeding/daily/page.tsx:344` | Failed shifts show a toast containing the backend error message. |

Scope evidence:

| Check | Finding |
| --- | --- |
| `git diff --name-only 7837c762^ 7837c762` | The BUG-0005 repair commit changed only `apps/api/src/modules/farm/farm.service.ts` and `apps/api/src/modules/farm/farm.service.spec.ts`. |
| Migration/schema/entity scan of BUG-0005 repair files | No migration, schema, entity, table, or column edit was found in the bug repair files. |
| `git show --name-only 7837c762 11fa71a9 89d076cd 34ab86a6` | BUG-0005 evidence chain consists of backend repair, A3 report, A6 runbook, and A6 lifecycle docs. |

## 4. A7 Validation Commands

Commands attempted by A7:

| Command | Result |
| --- | --- |
| `cd apps/api && pnpm test -- farm.service.spec.ts --runInBand` | FAIL to execute: `sh: jest: command not found`. |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | FAIL to execute: `./node_modules/.bin/tsc: no such file or directory`. |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | FAIL to execute: `./node_modules/.bin/tsc: no such file or directory`. |
| `ls node_modules/.bin \| rg 'jest\|tsc\|vitest'` in `apps/api` | FAIL: `node_modules/.bin` does not exist. |

Interpretation: A7 could not independently reproduce A3's PASS claims in this worktree because dependencies are absent. This is a release evidence gap, not a business-code finding.

## 5. Unresolved Blockers

1. Missing A1 CI/runtime gate evidence for BUG-20260707-0005 on the current target commit.
2. Missing A2 security/RBAC/DataScope regression report for BUG-20260707-0005.
3. Missing A4 frontend UAT/browser smoke report proving the user sees `请先选择鸡舍后再提交` on `/breeding/daily?action=create&date=today`.
4. Missing A5 data readiness report confirming active hen-house master data assumptions and no data repair is required.
5. Missing screenshot evidence: the task's attachment download failed with HTTP 404 and no local copy is available.
6. A7 local verification cannot run until dependencies are installed or CI artifacts are supplied.
7. A3 recorded Web typecheck failure on missing `vitest` / `vitest/config`; no later BUG-0005 evidence clears that condition.

## 6. Risk Summary

Backend data-integrity risk is reduced: the current service guard rejects empty/loading/placeholder `house_code` before DB access, and the test file covers that intent.

Release confidence remains incomplete: frontend does not preflight `selectedHouse` in `handleSubmit`; it relies on backend rejection and error-toast propagation for the daily submit path. That may still display the required message, but A4 browser evidence is required because the visible text can include a prefix such as `部分班次提交失败：`.

Rollback risk for the BUG-0005-specific change is low because it is code-only and has no migration. Candidate-level rollback risk is higher unless the release SHA is isolated, because the current recent history also contains unrelated BUG-0004 warehouse frontend changes.

## 7. Conditions To Clear HOLD

1. Provide or run A1 validation on the exact target SHA: API test, API typecheck, Web typecheck, and any required CI gate.
2. Provide A2 report confirming `MENU_FARM_DAILY:E`, DataScope, audit boundaries, and attachment ACL are unchanged or not applicable.
3. Provide A4 browser/UAT evidence on `/breeding/daily?action=create&date=today` showing the required message when no hen house is selected or selector is loading.
4. Provide A5 data readiness evidence for active hen-house selector data and no migration/data repair requirement.
5. Resolve or explicitly accept the existing Web Vitest typecheck blocker with release-owner approval.
6. Record target commit SHA, rollback owner, and previous known-good SHA/image before any staging or production GO.

## 8. Rollback Readiness

BUG-0005-specific rollback path: code-only `git revert 7837c762` followed by API/Web validation. No migration rollback is required for this bug.

Production rollback readiness: not GO. Production deploy is not approved, previous known-good image/SHA was not recorded in this A7 run, and staging smoke evidence is missing.

## 9. Final Recommendation

HOLD.

Do not deploy this bug fix to production from A7 evidence alone. Backend guard evidence is promising, but final release requires completed A1/A2/A4/A5 gates or equivalent CI/UAT artifacts, plus dependency-backed validation on the target SHA.

# Acceptance Criteria Library

> Purpose: reusable acceptance criteria for Phoenix ERP delivery tasks. A requirement spec should reference the relevant rows instead of inventing one-off gates.

## Core Runtime

| Area | Minimum criteria | Evidence |
| --- | --- | --- |
| Login | Valid user can log in; invalid credentials are rejected; dev login is disabled outside approved non-production environments. | API/browser smoke, env matrix confirmation. |
| Current user | `/api/auth/me` or equivalent current-user path returns correct identity, roles, org, and permissions; unauthorized requests return 401. | HTTP smoke and role fixture evidence. |
| Menu permissions | Visible menus match assigned role permissions; hidden menus cannot be reached by direct URL/API if protected. | RBAC audit, frontend UAT path. |
| RBAC | Protected endpoints enforce role/menu/API permission; admin and non-admin expected paths are both tested. | `scripts/g5c-rbac-audit.sh` or equivalent regression. |
| DataScope | User sees only allowed organization/site/company data; cross-scope reads/writes are rejected or filtered. | Role/data fixture checks. |

## Security And Integrations

| Area | Minimum criteria | Evidence |
| --- | --- | --- |
| Notification / Presence / SSE | Auth is required; reconnect behavior is bounded; payloads contain no secrets; offline/online state is consistent. | SSE smoke, log review, browser path if UI-visible. |
| JWT / Auth | JWT secret has a single source per environment; previous secret behavior is explicit; expired/invalid tokens fail closed. | Auth regression and env review. |
| Chanjet / Yonyou interface | Signature, timestamp, tenant/company mapping, and error handling are verified without leaking secrets. | Probe script output, masked logs, external API contract review. |
| Log masking | Tokens, passwords, cookies, signatures, phone numbers where required, and third-party secrets are redacted. | Log sample review or automated scan. |

## Business Paths

| Area | Minimum criteria | Evidence |
| --- | --- | --- |
| Procurement basic path | List/detail/create/update/approval state behavior remains compatible; no financial or stock side effect changes without spec. | API regression and UI smoke. |
| Finance basic path | Amount precision, accounting direction, receivable/payable status, and audit trail are preserved. | Finance regression and targeted data assertions. |
| Frontend page | Page loads; loading/empty/error states render; primary workflow succeeds; role-limited actions are hidden/disabled as expected. | Browser/UAT smoke, screenshot when useful. |
| Data baseline | Required reference data exists; test data is deterministic; scripts do not mutate production data unexpectedly. | Baseline check script or read-only SQL evidence. |
| Master data | Codes are stable, lifecycle/status rules are respected, imports are idempotent when applicable. | A5 data readiness report. |

## Engineering Gates

| Area | Minimum criteria | Evidence |
| --- | --- | --- |
| Compile | API and web compile or type-check according to affected scope. | `pnpm build`, `pnpm --filter phoenix-erp-v3-nest exec tsc --noEmit`, `pnpm --filter web run typecheck`. |
| Unit tests | Affected unit tests pass; skipped tests are listed with reason. | `pnpm --filter phoenix-erp-v3-nest test` or targeted command. |
| e2e | Critical user path passes in CI/staging where available. If no e2e exists, record gap and smoke substitute. | e2e output or documented gap. |
| Smoke | API health, login/current-user, and one critical module path pass. | `scripts/smoke-test.sh` or staging smoke report. |
| CI | Required GitHub Actions checks are green or explicitly pending under `PASS WITH CI CONDITIONS`. | Workflow run links/results. |

## Release Gates

| Area | Minimum criteria | Evidence |
| --- | --- | --- |
| Staging deploy | Candidate is deployed to staging, health checks pass, smoke tests pass, logs are clean for the observation window. | A6 staging report. |
| Production release | GO or GO WITH CONDITIONS is recorded; approver, commit, rollback owner, and monitoring window are known. | `PRODUCTION_GO_NO_GO` decision record. |
| Rollback | Previous known-good commit/image and rollback validation steps are available before release. | `ROLLBACK_RUNBOOK` checklist. |

## Verdict Rules

| Verdict | Criteria |
| --- | --- |
| PASS | All required criteria passed with evidence. |
| PASS WITH CI CONDITIONS | Local/docs verification passed, but CI/staging evidence is pending and explicitly required before release/merge. |
| HOLD | Required criteria failed, evidence is missing for high-risk areas, or frozen items were touched without approval. |
| ROLLBACK | Production/staging release caused critical regression or data/security risk. |

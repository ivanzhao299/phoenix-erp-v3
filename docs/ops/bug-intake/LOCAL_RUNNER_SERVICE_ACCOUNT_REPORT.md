# Bug Intake Local Runner Service Account Report

## Summary

- Account: `bug_intake_runner`
- Role: `ROLE_BUG_INTAKE_RUNNER`
- Scope: Bug Intake local repair runner only
- Credential storage: `/Users/mac/.phoenix-erp/bug-intake-runner.env`
- Secret committed to git: No
- Static token committed to git: No

## Least-Privilege Permission

The dedicated account is intentionally not an admin account. It has one role and one menu grant:

| Grant | Permission |
| --- | --- |
| `MENU_BUG_REPORT` | `V,E` |

Required capabilities:

- Login through `/api/auth/login`.
- Read approved bug reports from `/api/bug-intake/reports`.
- Read bug report details from `/api/bug-intake/reports/:bugNo`.
- Write agent results through `/api/bug-intake/reports/:bugNo/agent-result`.

Explicitly not granted:

- User management.
- Finance operations.
- Procurement operations.
- Deployment operations.
- Database administration.
- Admin wildcard permission.

## Runtime Configuration

The macOS LaunchAgent sources the local env file:

```text
/Users/mac/.phoenix-erp/bug-intake-runner.env
```

The file is outside the repository and has mode `0600`. The runner uses username/password refresh rather than relying on a long-lived static JWT, because JWT tokens can expire and should not be stored in git.

## LaunchAgent

- Label: `com.phoenix.erp.bug-intake-runner`
- Plist: `/Users/mac/Library/LaunchAgents/com.phoenix.erp.bug-intake-runner.plist`
- Wrapper: `/Users/mac/.phoenix-erp/bug-intake-runner.sh`
- Logs: `/Users/mac/Library/Logs/phoenix-erp/bug-intake-runner.out.log` and `.err.log`

The wrapper now sets a stable macOS PATH before resolving `node`, so launchd can find the local Node.js binary.

## Verification

- Production login with `bug_intake_runner`: PASS
- JWT roles: `ROLE_BUG_INTAKE_RUNNER`
- JWT permissions: `MENU_BUG_REPORT:V,E`
- Wildcard permission present: No
- Bug Intake list API: PASS
- Local runner dry-run: PASS
- LaunchAgent state: running
- First live runner cycle: executed; no runnable tasks found

## Guardrails

- This account is for Bug Intake repair orchestration only.
- Do not add `ROLE_ADMIN`.
- Do not grant system settings, finance, procurement, deployment, or database permissions.
- Rotate the password by updating production `sys_user.password_hash` and `/Users/mac/.phoenix-erp/bug-intake-runner.env` together.

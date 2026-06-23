# Production Server Remediation Next Gate Recommendation

Date: 2026-06-23

## Recommendation

Recommend approving one single next Gate:

`REMOTE_CODE_ALIGNMENT_EXECUTION_GATE`

## Decision Matrix

| Question | Recommendation |
| --- | --- |
| Should the next Gate align remote code? | yes |
| Should the next Gate execute migration? | no |
| Should the next Gate deploy? | no |
| Should the next Gate restart service? | no |
| Should the next Gate push main? | no |
| Should the next Gate write DB? | no |

## Why

The remote target lacks `1782042418112-CreateFileMetadata.ts`. Until remote code contains the approved migration file, File Metadata migration execution cannot follow the reviewed TypeORM migration path.

## Next Gate Scope

Allowed only after explicit approval:

- align remote code to a user-approved commit.
- verify migration file presence.
- record rollback commit.
- produce evidence.

Forbidden:

- migration execution.
- DB write.
- deploy.
- service restart.
- push main.
- env/nginx/compose modification.
- cleanup/reset.

## Required User Approval

User should approve exactly:

`APPROVE_REMOTE_CODE_ALIGNMENT_EXECUTION_GATE`

After that completes, the next approval should be Store Payment schema drift reconciliation, not blind migration execution.


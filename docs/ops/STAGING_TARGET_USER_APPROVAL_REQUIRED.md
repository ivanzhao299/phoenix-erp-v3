# Staging Target User Approval Required

Date: 2026-06-23

## Current Conclusion

The server card can produce a staging host candidate, but execution remains blocked until the user approves each staging isolation item.

## Required Approvals

| Approval Item | Required Decision | Current Status |
| --- | --- | --- |
| Use the production server as staging host | approve / reject | waiting |
| Create `/opt/phoenix-erp-staging` | approve / reject | waiting |
| Create independent staging DB `phoenix_erp_staging` | approve / reject | waiting |
| Create independent staging file storage `/data/phoenix-erp-staging/files` | approve / reject | waiting |
| Configure GitHub `staging` environment secrets | approve / reject | waiting |
| Run `.github/workflows/staging-deploy.yml` manually | approve / reject | waiting |
| Continue blocking production deploy | confirm | required |
| Continue blocking production DB migration | confirm | required |
| Continue blocking production DB write | confirm | required |

## Recommended Approval Wording

Approve same-host staging only if all isolation boundaries are accepted:

1. Staging deploy path is separate from production.
2. Staging Docker compose project name is separate from production.
3. Staging DB is separate from production.
4. Staging file storage is separate from production.
5. Staging ports and URL do not interfere with production.
6. Staging GitHub secrets are separate from production secrets.
7. Production deploy remains HOLD.

## Not Approved By This Document

- No deploy.
- No push.
- No migration.
- No remote DB write.
- No production workflow execution.
- No service restart.


# Production Server Remediation R2 Uploads Exposure Hardening Report

Date: 2026-06-24

## Conclusion

GO WITH CONDITIONS.

The approved `/uploads` exposure hardening Gate completed. The active Nginx `/uploads/` location was changed from proxying to the API static file server to returning `403`. Nginx config test passed and Nginx was reloaded. API and Web health remained available.

This Gate did not delete files, move files, write DB, execute migration, deploy application code, restart API, or push.

Condition:

- The API container internal static file server on `127.0.0.1:3100/uploads/contracts/[file]` still returns `200`. That is not publicly exposed through Nginx after this Gate, but it remains a P1 compatibility risk and must be handled by the next legacy upload-to-file-metadata Gate.

## Remote Execution Directory

`/opt/phoenix-erp-backups/remediation-r2-uploads-exposure-hardening-20260624-011703`

Generated evidence files:

- `manifest.json`
- `before_uploads_exposure_check.txt`
- `before_nginx_config_snapshot.txt`
- `before_api_static_config_snapshot.txt`
- `before_service_state.txt`
- `rollback_plan.txt`
- `change_summary.txt`
- `nginx_test.log`
- `nginx_reload.log`
- `after_uploads_exposure_check.txt`
- `after_https_uploads_exposure_check.txt`
- `after_nginx_config_snapshot.txt`
- `health_and_protected_endpoint_check.txt`

## Exposure Source

The exposure source was a combination of:

1. Active Nginx config for `erp.eggslao.com` had a `/uploads/` location that proxied requests to the API container.
2. The API process serves `process.cwd()/uploads` through static assets at `/uploads`.
3. The legacy upload endpoint `POST /api/upload/contract` stores files under `uploads/contracts` and returns `/uploads/contracts/${file.filename}`.

The public hardening point for this Gate was Nginx. API static serving was not changed because that would require an application-code/deploy path and risks breaking legacy modules. It is deferred to the next Gate.

## Modified Files On Server

Changed remote server files:

- `/etc/nginx/conf.d/erp.eggslao.com.conf`
- `/opt/phoenix-erp/nginx/erp.eggslao.com.conf`

The active `/uploads/` block is now:

```nginx
# R2 uploads exposure hardening: public raw /uploads access is disabled.
# Use protected application endpoints for any file preview/download.
location ^~ /uploads/ {
    return 403;
}
```

## Backup Files

Backups created:

- `/opt/phoenix-erp-backups/remediation-r2-uploads-exposure-hardening-20260624-011703/erp.eggslao.com.conf.before`
- `/etc/nginx/conf.d/erp.eggslao.com.conf.bak-uploads-hardening-20260624-011703`
- `/opt/phoenix-erp-backups/remediation-r2-uploads-exposure-hardening-20260624-011703/repo-erp.eggslao.com.conf.before`
- `/opt/phoenix-erp/nginx/erp.eggslao.com.conf.bak-uploads-hardening-20260624-011703`

## Executed Configuration Change

Nginx `/uploads/` handling was changed from API proxying to `return 403`.

Nginx validation:

- `nginx -t`: PASS, with pre-existing warnings unrelated to this Gate.
- `nginx -s reload`: executed and returned success.

API restart:

- Not executed.

Application deploy:

- Not executed.

## /uploads Before State

Evidence before this Gate:

- Previous precheck confirmed `http://127.0.0.1:3100/uploads/contracts/[REDACTED_BASENAME]` returned `200` from the API static file server.
- Active Nginx config proxied `/uploads/` to `http://127.0.0.1:3100`.
- During this Gate, HTTP vhost probing returned `301` because the Nginx HTTP entry redirects to HTTPS before serving the path.

## /uploads After State

HTTPS vhost probe after hardening:

- `https://127.0.0.1/uploads/` with `Host: erp.eggslao.com`: `403`
- `https://127.0.0.1/uploads/contracts/` with `Host: erp.eggslao.com`: `403`

HTTP vhost probe still returns `301` to HTTPS, which is acceptable as long as HTTPS returns `403`.

Internal API probe after hardening:

- `http://127.0.0.1:3100/uploads/contracts/[REDACTED_BASENAME]`: `200`

Interpretation:

- Public Nginx exposure is hardened.
- Internal API static serving remains and is deferred to `APPROVE_LEGACY_UPLOAD_TO_FILE_METADATA_GATE`.

## Store Payment Protected Endpoint Verification

Store Payment protected endpoint probes on the current running API returned `404` for missing routes / missing files. This remains fail-closed and did not expose `rawUrl`, `storage_path`, or `/uploads`.

The current running API image is still older than the remote source code alignment state, so the protected Store Payment route behavior should be revalidated after a future controlled deploy Gate. This hardening Gate did not deploy or restart API.

## API / Web Health

- API health: `200`
- Web health: `307` redirect to `/login`
- Docker compose services remained healthy / running.

## Rollback Plan

Rollback plan is stored remotely:

`/opt/phoenix-erp-backups/remediation-r2-uploads-exposure-hardening-20260624-011703/rollback_plan.txt`

Summary:

1. Restore `/etc/nginx/conf.d/erp.eggslao.com.conf` from the remote backup.
2. Restore `/opt/phoenix-erp/nginx/erp.eggslao.com.conf` from the remote backup if needed.
3. Run `nginx -t`.
4. Run `nginx -s reload`.
5. Re-run `/uploads` and health probes.

Do not delete or move upload files during rollback.

## Boundary Confirmation

| Action | Executed |
| --- | --- |
| Delete uploads files | No |
| Move uploads files | No |
| Write DB | No |
| Execute migration | No |
| Deploy app code | No |
| Push main | No |
| Modify Store Payment protected endpoint to raw URL | No |
| Open new public file path | No |
| Expose `storage_path` | No |
| Reload Nginx | Yes |
| Restart API | No |

## A1 Review

PASS WITH CONDITIONS.

- Manifest exists.
- Rollback plan exists.
- API health is `200`.
- Web health is `307` to login.
- No DB write.
- No migration.
- No push.
- W5 gate must pass after local docs update.

Condition:

- The manifest was updated with supplemental HTTPS evidence because the initial HTTP probe recorded a `301` redirect, not the final HTTPS response.

## A2 Review

PASS WITH CONDITIONS.

- Public HTTPS `/uploads` now returns `403`.
- The active Nginx `/uploads/` block is hardened.
- No raw URL is introduced.
- Store Payment remains isolated from legacy `/uploads`.
- Internal API static `/uploads` remains `200` and must be remediated by the next Gate before considering legacy uploads safe.

## A5 Review

GO WITH CONDITIONS.

- Store Payment protected attachment readiness improves because public raw `/uploads` is blocked at Nginx.
- `file_metadata` row count remains `0`; no metadata backfill was attempted.
- Legacy upload-to-metadata migration remains required before broader attachment readiness can be claimed.

## Current Conclusion

GO WITH CONDITIONS.

Next single Gate:

`APPROVE_LEGACY_UPLOAD_TO_FILE_METADATA_GATE`


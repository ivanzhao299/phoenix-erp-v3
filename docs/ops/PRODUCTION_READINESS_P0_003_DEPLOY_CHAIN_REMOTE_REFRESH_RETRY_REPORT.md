# Production Readiness P0-003 - Deploy Chain Remote Refresh Retry Report

Date: 2026-06-24

Task ID: `PRD-P0-003`

## Purpose

Retry the production deploy-chain remote refresh after the upload compatibility fix had been pushed and CI/CD deploy succeeded.

This run was read-only. It did not push, deploy, restart, reload Nginx, mutate remote config, write DB, run migration, seed, cleanup, or reset.

## Evidence Directory

`docs/ops/runs/deploy-chain-remote-refresh-20260624-192349`

## Attempted Probes

| Probe | Mode | Result |
| --- | --- | --- |
| full remote deploy-chain refresh | `ssh -F /dev/null`, no ControlMaster | FAIL: banner exchange timeout |
| default SSH config refresh | default local SSH config | INTERRUPTED locally after no output beyond header |
| short identity probe | single short command | FAIL: banner exchange timeout |
| short docker ps probe | single short command | FAIL: banner exchange timeout |
| short repo head probe | single short command | INTERRUPTED locally after no output beyond header |

## Finding

`PRD-P0-003` remains blocked by remote SSH command instability. The failure is reproducible even with:

1. no ControlMaster;
2. short connect timeout;
3. BatchMode;
4. short serial commands.

This prevents reliable refresh of:

- `/opt/phoenix-erp` checkout status;
- remote Nginx tracked diff;
- untracked backup artifact list;
- runtime container image evidence;
- rollback/compose evidence.

## Current Impact

Push and CI/CD deploy can complete through GitHub Actions, as proven by commit `8833269c`, but operator-side remote inspection remains unreliable.

This means production deployment can work, but production-grade release governance remains conditional until the remote evidence channel is stable enough to prove:

1. remote checkout hygiene;
2. Nginx hardening state;
3. backup artifact locations;
4. compose and rollback paths;
5. previous known-good image IDs.

## A6 Review

Conclusion: `HOLD_WITH_CONDITIONS`.

The deploy-chain local plan is still valid. Remote reconciliation is not complete.

## A2 Review

Conclusion: `PASS_WITH_CONDITIONS`.

Do not perform blind config reconciliation while remote inspection is unreliable. Do not overwrite Nginx upload hardening.

## A1 Review

Conclusion: `PASS_WITH_CONDITIONS`.

This report is docs/runs only. No production command that mutates state was executed. W5 closeout must remain required after commit.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Push executed by this Gate | No |
| Deploy executed by this Gate | No |
| Restart executed | No |
| Nginx reload executed | No |
| Remote config changed | No |
| DB write executed | No |
| Migration executed | No |
| Cleanup/reset executed | No |

## Current Conclusion

`HOLD_WITH_CONDITIONS`.

`PRD-P0-003` cannot be closed until remote SSH command stability is repaired or an alternate trusted evidence channel is established.

## Next Recommendation

1. Keep production deploy-chain hardening in HOLD for evidence refresh.
2. Do not ask the business user to run routine sync/deploy commands.
3. If the next business priority is Store Payment UAT data readiness, request explicit approval for `APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_EXECUTION` because it is a production DB write.
4. Otherwise, run a dedicated SSH/remote evidence channel repair Gate before further production governance claims.

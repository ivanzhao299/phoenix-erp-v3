# Production 95 Cleanup Batch - Role Business Smoke Matrix

## Goal

Turn role-specific RBAC/DataScope and high-frequency business-flow validation into a repeatable smoke harness.

## Added

- `docs/ops/ROLE_BUSINESS_SMOKE_MATRIX.json`
- `scripts/ops/role-business-smoke.mjs`
- `docs/ops/runs/role-business-smoke-latest.json`
- `docs/ops/runs/role-business-smoke-latest.md`

## Covered Profiles

1. procurement
2. finance
3. shareholder
4. production-device
5. warehouse
6. system-monitor
7. store-payment-pilot

Each profile defines:

- required menu codes,
- forbidden menu codes,
- read-only endpoint probes,
- accepted fail-closed statuses.

## Credential Policy

The script never ships or invents credentials. It reads one of:

- `ROLE_SMOKE_CREDENTIALS_JSON`
- `--credentials <local-untracked-json>`

If credentials are missing, it returns `SKIP_CREDENTIALS` unless `--strict` is enabled.

## Validation

- `node --check scripts/ops/role-business-smoke.mjs`: PASS
- `node scripts/ops/role-business-smoke.mjs --output-dir docs/ops/runs`: SKIP_CREDENTIALS

## Score Impact

| Dimension | Before | After | Why |
|---|---:|---:|---|
| Security / RBAC / DataScope | 91 | 92 candidate | Multi-role expected/forbidden menu smoke is now executable. |
| Testing / CI/CD | 87 | 88 candidate | Role-specific business smoke now has a standard harness. |

## Remaining Condition

To claim full PASS rather than `SKIP_CREDENTIALS`, approved smoke accounts must be supplied for each profile. The harness is ready; credentials are the remaining controlled input.

## Safety

- DB write executed: No.
- Migration executed: No.
- Deployment executed: No.
- Push executed: No.

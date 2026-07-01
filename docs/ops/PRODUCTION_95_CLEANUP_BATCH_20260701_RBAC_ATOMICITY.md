# Production 95 Cleanup Batch - RBAC Atomicity

Generated at: 2026-07-01 13:20 CST

## Objective

Move Phoenix ERP toward production-grade 95+ readiness by clearing the highest-priority RBAC/menu-gating debt from the latest production standard rescore:

- `role_permission_matrix_coarse_parent_grants=56`
- Affected coarse parent menus: `MENU_FIN2`, `MENU_PRC2`, `MENU_PRC2_MASTER`, `MENU_WORKFLOW`, `MENU_MASTER`, `MENU_SETTINGS_IT`
- Risk: non-admin roles can inherit broad parent menu visibility, causing unauthorized submenu exposure or confusing "no permission" pages.

## Scope

This batch only repairs the role-permission matrix and audit tooling.

Allowed:

- `scripts/ops/repair-role-permission-matrix.mjs`
- `docs/ops/runs/role-permission-matrix-*.json`
- `docs/ops/runs/role-permission-matrix-*.md`
- this report

No business code was modified.

## Root Cause

`repair-role-permission-matrix.mjs --apply` originally generated duplicate upsert rows for the same `(role_code, target_menu)` when one role held multiple coarse source grants that mapped to the same atomic target menu.

PostgreSQL correctly rejected this with:

```text
ERROR: ON CONFLICT DO UPDATE command cannot affect row a second time
HINT: Ensure that no rows proposed for insertion within the same command have duplicate constrained values.
```

## Fix

The repair script now consolidates planned grants by `role_code + target_menu` before writing:

- merges source menus for reporting;
- unions action bits in stable `V,C,E,D,A,X` order;
- writes one deterministic upsert row per target role/menu pair;
- preserves `ROLE_ADMIN` coarse grants as an explicit exception.

## Local Execution Evidence

Command:

```bash
node scripts/ops/repair-role-permission-matrix.mjs --apply --output-dir=docs/ops/runs
node scripts/ops/audit-role-permission-matrix.mjs --dry-run --output-dir docs/ops/runs
```

Result:

- Repair decision: `APPLIED`
- Menu inserts/updates: `1`
- Atomic grant upserts: `423`
- Coarse non-admin grants removed: `56`
- Writes executed: `yes`
- Follow-up audit: `PASS`
- Findings after repair: `0`

Evidence files:

- `docs/ops/runs/role-permission-matrix-repair-latest.json`
- `docs/ops/runs/role-permission-matrix-repair-latest.md`
- `docs/ops/runs/role-permission-matrix-audit-latest.json`
- `docs/ops/runs/role-permission-matrix-audit-latest.md`

## Production Evidence Status

Remote SSH read-only production query was attempted after local repair.

Short connection probe succeeded once, but the actual DB evidence query failed twice during SSH banner exchange:

```text
Connection timed out during banner exchange
Connection to 47.236.122.224 port 22 timed out
```

This is a transport-level SSH stability issue, not a SQL failure. Production DB parity remains `PENDING_REMOTE_EVIDENCE` until a stable SSH window or CI/CD deploy evidence confirms the migration state and coarse-grant count.

Follow-up read-only evidence succeeded after the CI/CD deploy SSH window recovered:

```text
RepairRolePermissionMatrixAtomicity1782052418112|1
```

The remaining production residue was:

```text
ROLE_CEO|集团总裁|MENU_MASTER|V
```

Because the migration had already been recorded, it would not re-run automatically. A controlled single-transaction DB repair was executed only for this residue:

- derived `ROLE_CEO` `MENU_MASTER` view permission into six atomic master-data permissions;
- deleted the one non-admin `MENU_MASTER` parent grant;
- no schema change;
- no migration execution;
- no deploy command;
- no cleanup/reset;
- no production push from the server.

Execution result:

```text
BEGIN
6|1
COMMIT
```

Final production read-only verification:

```text
RepairRolePermissionMatrixAtomicity1782052418112|0
```

Production RBAC atomicity parity is now `PASS`.

## Current Score Impact

| Dimension | Before | Batch-local evidence | Production status |
|---|---:|---|---|
| Security / RBAC / DataScope | 84 | coarse parent grants: 56 -> 0 locally | production coarse parent grants: 1 -> 0 |
| Data layer / Migration / Consistency | 82 | unchanged | unchanged |
| Frontend / Performance / i18n | 76 | unchanged | unchanged |
| Observability / Operations | 69 | SSH instability reconfirmed | still needs alert/restore drills |
| Testing / CI/CD | 74 | pending this batch validation | pending |

Conservative overall readiness is improved, but remains below 95 until runtime smoke automation, alert-to-human, restore drill, and remaining legacy master-data references are closed.

## Local Self-Test

| Check | Result |
|---|---|
| `node --check scripts/ops/repair-role-permission-matrix.mjs` | PASS |
| `node scripts/ops/audit-role-permission-matrix.mjs --dry-run --output-dir docs/ops/runs` | PASS, findings `0` |
| `node scripts/ci/check-menu-permission-atomicity.mjs` | PASS, inspected `864` source files, findings `0` |
| `ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |
| `cd apps/api && ./node_modules/.bin/jest --runInBand` | PASS, `52/52` tests |
| `cd apps/web && ./node_modules/.bin/vitest run` | PASS, `65/65` tests |

## Next Cleanup Order

1. **P0-2 Production parity for RBAC atomicity**
   - Status: `DONE`.
   - Production `RepairRolePermissionMatrixAtomicity1782052418112` migration state confirmed.
   - Production non-admin coarse grants confirmed `0`.

2. **P0-3 Runtime smoke automation**
   - Make `/uat`, `/system-monitor`, alert center, dashboard cards, mobile device monitor, approval center, procurement payment project selector, and upload flows part of repeatable smoke checks.

3. **P0-4 Observability closeout**
   - Prove alert-to-human delivery.
   - Execute and document restore drill.

4. **P1-1 Master-data legacy reference cleanup**
   - Continue eliminating legacy direct references that bypass canonical runtime selectors.

5. **P1-2 Attachment and file metadata parity**
   - Finish protected endpoint adoption for historical upload surfaces.

## Current Conclusion

`GO_WITH_CONDITIONS`

Local and production RBAC atomicity cleanup is complete and audited.

# Production Readiness Remediation Batch - 2026-06-25 Next

## Goal

Continue the P0/P1 audit remediation sequence after the previous production deploy. This batch stays local-first: modify the local repository, validate locally, push to `main`, and let CI/CD deploy.

## Completed Changes

### P0 Permission Set API Gate

The active production-mounted controller is:

- `apps/api/src/modules/permission-sets/permission-sets.controller.ts`

It now uses:

- `AuthGuard('jwt')`
- `MenuGuard`
- `@RequireMenu('MENU_SETTINGS_IT', ...)`

Endpoint permission mapping:

| Endpoint type | Required menu bit |
| --- | --- |
| list/detail | `MENU_SETTINGS_IT:V` |
| create | `MENU_SETTINGS_IT:C` |
| update / item overwrite / bind / unbind | `MENU_SETTINGS_IT:E` |
| delete permission set | `MENU_SETTINGS_IT:D` |

This fixes the gap where the duplicate controller under `modules/permissions` had been hardened, while the mounted `modules/permission-sets` controller still only required login.

### P0 Upload and OCR Gate

The generic contract upload endpoint now requires menu authorization:

- `POST /api/upload/contract`
- Main permission: `MENU_PRC2_ORDER:E`
- Alternative menu domains: procurement master, finance shareholder, expense, AP, Store Payment, workflow.

The document intelligence OCR endpoint now requires menu authorization:

- `POST /api/document-intelligence/extract`
- Main permission: `MENU_PRC2_ORDER:E`
- Alternative menu domains: procurement master, AP, expense, shareholder.

Both changes keep protected upload behavior:

- `rawUrl: null`
- no `/uploads` public URL returned
- file metadata remains protected.

### P1 Lookup DataScope

High-frequency lookup endpoints now apply company scope for non-global users:

- `/api/lookup/projects`
- `/api/lookup/sites`
- `/api/lookup/customers`
- `/api/lookup/stores`
- `/api/lookup/warehouses`
- `/api/lookup/cash-accounts`

Supplier lookup keeps group-shared suppliers but filters company/project-scoped suppliers:

- `/api/lookup/suppliers`

Inventory batch lookup now uses `allowedWarehouseCodes` when available:

- `/api/lookup/batches`

This reduces cross-company candidate leakage in procurement, finance, sales, and inventory forms.

### P1 Static Guard Scanner

Added:

- `scripts/ci/check-sensitive-menu-guards.mjs`

Current mode is warn-only. It inspects API controllers and reports sensitive controllers without explicit `MenuGuard` / `RequireMenu`, while keeping documented login-only exceptions.

Latest local output:

- inspected controllers: 106
- documented login-only exceptions: 4
- remaining warn findings: 8

Remaining findings are now explicit backlog items instead of hidden risk.

## Validation

Local validation:

- API typecheck: PASS
- `node --check scripts/ci/check-sensitive-menu-guards.mjs`: PASS
- `git diff --check`: PASS

Final validation and CI/CD deploy are executed after this report is committed.

## Business Code / DB / Deploy Boundary

| Item | Result |
| --- | --- |
| Business code modified | Yes, backend access-control logic only |
| Frontend modified | No |
| Migration added/executed | No |
| DB write executed manually | No |
| Seed executed | No |
| Production deploy | Pending CI/CD after push |

## Remaining Ordered Plan

1. P0: Harden remaining sensitive controllers from the scanner output:
   - analytics
   - BFF dashboard
   - data-quality
   - master-data runtime and biz-projects
   - notification stream
   - legacy procurement controller
2. P0: Promote `check-sensitive-menu-guards.mjs` from warn-only to CI fail mode after the current findings are either fixed or documented as exceptions.
3. P0/P1: ROLE_ADMIN and `perms_version` freshness enforcement:
   - verify token payload version behavior
   - invalidate stale permissions where safe
   - avoid silent stale-button exposure in frontend.
4. P1: Frontend high-risk button gate sweep:
   - settings roles/users/permission sets
   - approval transfer / reject / void
   - finance export / destructive actions
   - procurement submit/approve high-frequency flows.
5. P1: Attachment chain:
   - retire remaining legacy `/uploads` consumers
   - add protected generic file endpoint for non-Store-Payment modules
   - continue owner correlation for unresolved historical uploads.
6. P1: Production data readiness:
   - supplier
   - project
   - cash account
   - product/material
   - bank account
   - warehouse
   - role/user store range.
7. P1/P2: Ops hardening:
   - fully split deploy and proxy SSH keys
   - document required GitHub secrets
   - add rollback smoke evidence after deploy.

## Conclusion

GO WITH CONDITIONS. This batch closes the active permission-set API gap, tightens upload/OCR entry points, and reduces lookup DataScope leakage. Remaining findings are now ordered for the next remediation batch.

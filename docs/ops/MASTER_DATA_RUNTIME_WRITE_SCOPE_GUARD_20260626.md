# Master Data Runtime Write Scope Guard - 2026-06-26

## Scope

This remediation closes a DataScope gap in the shared master-data runtime write path.

Affected service:

- `apps/api/src/modules/master-data/master-data-runtime.service.ts`

## Issue

Read paths already filter company-scoped master data by `DataScope.allowedCompanyCodes`, and direct reads fail closed when scope cannot be resolved.

Before this change, create / quick-create / update paths relied on validation of company existence, but did not explicitly verify that the target `company_code` is inside the current user's writable DataScope. A user with access to the master-data feature could therefore attempt to create or reassign company-scoped master data under a company outside their visible scope.

## Fix

Added `assertWritableCompanyScope()` and applied it to:

- `create()`
- `createQuick()`
- `update()`

For company-scoped master data:

- internal no-user calls remain unrestricted;
- global DataScope users remain unrestricted;
- failed DataScope resolution returns `DATA_SCOPE_DENIED`;
- empty or out-of-scope target `company_code` returns `DATA_SCOPE_DENIED`;
- update validates the merged post-change record, preventing cross-company reassignment.

## Risk

Low to medium. This is a stricter RBAC/DataScope enforcement change. It may expose existing misconfigured user scopes as permission failures instead of allowing cross-company writes.

## Validation

Planned validation:

- API typecheck
- Web typecheck
- W5 closeout gate
- `git diff --check`

## Production Impact

No migration, no DB write, no deployment script change. The change is runtime authorization logic only.

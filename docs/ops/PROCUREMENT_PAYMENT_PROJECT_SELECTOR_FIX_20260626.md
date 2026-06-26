# Procurement Payment Project Selector Fix - 2026-06-26

## Issue

User Liu Hantao reported that the project dropdown on `/procurement2/payments/new` had no selectable projects after selecting a company.

## Root Cause

The payment form reused `ProjectSelector`, but `ProjectSelector` still queried `/api/biz/projects/active`. That endpoint is guarded by `MENU_PRC2_PROJECT`, which is a project master-data/procurement-project permission. A payment user may correctly have `MENU_PRC2_PAYMENT` without having project maintenance permission, so the dropdown could become empty even though the user is allowed to create procurement payments.

A second compatibility risk existed in the company/project code chain: `/api/lookup/companies` returned `orgCode` only, while `biz_projects` filters by `company_code`. If the organization code and company code diverge, the selected company could over-filter projects to an empty list.

## Fix

1. `ProjectSelector` now uses `/api/lookup/projects`, which is the standard JWT + DataScope lookup endpoint for business entry forms.
2. `/api/lookup/projects` now supports `companyCode` and `company_code` query filters.
3. `/api/lookup/companies` now returns `companyCode` using `COALESCE(company_code, org_code)`.
4. `CompanySelector` now uses `companyCode || orgCode` as the form value.
5. Payment form project name extraction now supports both `projectName` and `project_name`.

## Security / Permission Boundary

- Project maintenance permission is still not granted to payment users.
- Project lookup remains read-only.
- DataScope filtering remains enforced in `/api/lookup/projects`.
- No DB write, migration, seed, deploy script, or production configuration change was introduced by this fix.

## Validation Plan

- API TypeScript check.
- Web TypeScript check.
- W5 closeout gate.
- Production smoke after deployment.

## Expected Result

A user with procurement payment access and appropriate company DataScope should see ACTIVE projects for the selected company in the procurement payment project dropdown.

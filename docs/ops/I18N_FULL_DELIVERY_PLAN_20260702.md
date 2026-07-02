# i18n Full Delivery Plan and Execution Record

Date: 2026-07-02

## Problem

Previous internationalization work proved locale key parity and `t()` references, but it did not prove that every page had removed hardcoded Chinese UI text. Production therefore still displayed Chinese on many pages when the user switched language.

## Root Cause

1. `scripts/check-i18n-keys.js` only validates locale parity and referenced i18n keys.
2. It did not audit JSX text, placeholders, titles, aria labels, or business UI literals.
3. Many high-frequency pages still contained hardcoded Chinese text.
4. The first production bridge covered only literals already present in zh/en/lo language packs.

## Delivery Plan

### Phase 1: Production Stabilization

Status: Done

- Add a runtime hardcoded Chinese bridge in `LanguageContext`.
- Generate `auto.literal.*` locale keys for all audited hardcoded UI literals.
- Ensure zh/en/lo locale files stay key-aligned.
- Avoid visible fallback text such as `Localized UI text ...`.

### Phase 2: Audit Gate

Status: Done

- Add `scripts/ci/check-i18n-hardcoded-literals.mjs`.
- Export full findings, not only top samples.
- Ignore internal i18n key strings such as `ui.*` so the report does not count non-UI keys as visible text.
- Report covered vs uncovered hardcoded literals.

### Phase 3: Reusable Auto Literal Generator

Status: Done

- Add `scripts/ci/generate-i18n-auto-literals.mjs`.
- Read the hardcoded literal audit report.
- Generate stable `auto.literal.<hash>` keys.
- Fill zh/en/lo locale files.
- Prefer existing language-pack phrase translations.
- Use ERP business glossary for production-readable English fallback.

### Phase 4: Manual Componentization Backlog

Status: Next

Runtime coverage is now complete, but long-term maintainability still requires replacing high-frequency files with explicit `t()` calls.

Priority files:

1. `apps/web/src/components/layout/Sidebar.tsx`
2. `apps/web/src/components/master-data/detail-configs.tsx`
3. `apps/web/src/lib/workflow-templates.ts`
4. `apps/web/src/app/(admin)/workflow/designer/[id]/page.tsx`
5. `apps/web/src/lib/dict-type-labels.ts`
6. Procurement, finance, approval, inventory, and master-data high-frequency pages.

## Current Execution Result

- Hardcoded literal findings: 2654
- Affected files: 167
- Unique generated literals: 1626
- Auto-translatable findings: 2654
- Manual uncovered findings: 0
- Generated fallback text count: 0
- Locale key counts: zh/en/lo aligned

## Boundaries

- DB write: No
- Migration: No
- Backend API change: No
- Production deployment: via normal web CI/CD only

## Decision

GO WITH CONDITIONS

The production-visible i18n coverage gap is closed by runtime bridge plus generated language keys. Manual componentization remains as maintainability debt, not a production blocker.

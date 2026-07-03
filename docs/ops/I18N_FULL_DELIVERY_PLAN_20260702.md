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

Status: Started

Runtime coverage is now complete, but long-term maintainability still requires replacing high-frequency files with explicit `t()` calls.

Executed in this follow-up:

1. Sidebar menu keys are now explicit for every registered menu item.
2. `menu.<id>` keys were added for all 155 sidebar menu ids in zh/en/lo.
3. Core navigation labels, tooltips, and aria labels no longer depend on Chinese fallback text.
4. CI security workflow now runs the hardcoded UI literal coverage gate with `--fail-on-uncovered`.
5. Master data detail drawer now translates config-driven center names, KPI labels, suffixes, field labels, section titles, statuses, and reference labels through `translateLiteral()`.
6. Master data detail layout now translates tab labels, object titles, lifecycle status chips, and audit action labels through the shared language context.
7. Master data runtime panel and full-page form now translate config-driven column headers, field labels, status labels, select option labels, group titles, and validation messages.
8. Data dictionary editor and master-data governance dictionary coverage panels now translate `dictTypeLabel()` fallback labels instead of rendering Chinese-only fallback text.

Remaining priority files:

1. `apps/web/src/lib/workflow-templates.ts`
2. `apps/web/src/app/(admin)/workflow/designer/[id]/page.tsx`
3. Procurement, finance, approval, and inventory high-frequency pages.
4. Replace selected config literals in `apps/web/src/components/master-data/detail-configs.tsx` with first-class locale keys where long-term ownership requires semantic keys instead of literal keys.

## Current Execution Result

- Hardcoded literal findings: 2654
- Affected files: 167
- Unique generated literals: 1626
- Auto-translatable findings: 2654
- Manual uncovered findings: 0
- Generated fallback text count: 0
- Locale key counts: zh/en/lo aligned
- Sidebar menu explicit key coverage: 155/155
- CI hardcoded literal coverage gate: enabled
- Master-data shared renderer explicit i18n: completed for drawer, detail layout, runtime panel, full-page form, dictionary editor, and governance dictionary coverage

## Boundaries

- DB write: No
- Migration: No
- Backend API change: No
- Production deployment: via normal web CI/CD only

## Decision

GO WITH CONDITIONS

The production-visible i18n coverage gap is closed by runtime bridge plus generated language keys. Manual componentization remains as maintainability debt, not a production blocker.

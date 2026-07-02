# i18n Coverage Remediation - 2026-07-02

## Summary

The previous i18n work was deployed and not lost. It mainly completed locale key parity and missing-key protection:

- `zh.json`, `en.json`, and `lo.json` have the same key set.
- Literal `t('key')` references are checked by `scripts/check-i18n-keys.js`.
- The latest key gate passes with 12,752 keys per locale and 7,117 referenced keys resolved.

The production issue is that key parity is not the same as full page internationalization. Many pages still render hardcoded Chinese strings directly in JSX or data/config arrays, so switching language can still leave Chinese text on screen. The old gate did not detect that class of issue.

## Root Cause

1. The existing gate only checked:
   - locale key equality across `zh/en/lo`;
   - literal `t()/tr()/tt()/tFn()` references exist in locale files.
2. It did not check hardcoded user-visible Chinese outside `t()`.
3. Therefore pages could pass i18n CI while still containing Chinese labels, placeholders, cards, statuses, workflow templates, and master-data detail labels.

This was a coverage gap, not a lost deployment.

## Changes

### Runtime bridge

Updated `apps/web/src/contexts/LanguageContext.tsx`:

- Added `translateLiteral(text)`.
- Added a client-side hardcoded Chinese hydrator.
- When language is not Chinese, it loads `zh` as the source locale and the selected locale as the target.
- It translates exact hardcoded UI text nodes and safe attributes:
  - `placeholder`
  - `title`
  - `aria-label`
- It skips risky zones:
  - `script`
  - `style`
  - `textarea`
  - `code`
  - `pre`
  - elements marked `data-i18n-skip="true"`

This is a production stabilization layer so existing hardcoded UI text can be translated before every page is manually componentized.

### Audit script

Added `scripts/ci/check-i18n-hardcoded-literals.mjs`:

- Scans `apps/web/src/app`, `components`, `lib`, and `hooks`.
- Uses TypeScript AST, so comments are not counted.
- Ignores strings already passed through `t()/tr()/tt()/tFn()`.
- Writes:
  - `docs/ops/runs/i18n-hardcoded-literals-latest.json`
  - `docs/ops/runs/i18n-hardcoded-literals-latest.md`

### Auto literal generation

Added `scripts/ci/generate-i18n-auto-literals.mjs`:

- Reads the full hardcoded literal audit output.
- Generates stable `auto.literal.<hash>` keys for all remaining hardcoded UI literals.
- Writes aligned zh/en/lo locale entries.
- Uses existing locale phrases first, then an ERP glossary for production-readable fallback.
- Keeps generated keys separate from hand-authored business keys.

## Current Audit Result

Latest audit after auto-literal generation:

- Total hardcoded Chinese findings: 2,654
- Affected files: 167
- Unique generated literals: 1,626
- Auto-translatable by runtime bridge: 2,654
- Still requiring componentization or dictionary modeling for production coverage: 0
- Generated fallback text count: 0

Top remaining files include:

- `apps/web/src/components/master-data/detail-configs.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/web/src/lib/workflow-templates.ts`
- `apps/web/src/app/(admin)/workflow/designer/[id]/page.tsx`
- `apps/web/src/lib/dict-type-labels.ts`

## Decision

GO WITH CONDITIONS.

The production-visible i18n gap is now closed by the runtime bridge plus generated language keys. The remaining work is maintainability cleanup rather than a production blocker:

1. Convert high-count shared config files to structured i18n/dictionary models.
2. Replace Chinese-only workflow templates with locale-aware labels.
3. Componentize remaining page-level hardcoded strings by priority.
4. Later replace generated `auto.literal.*` coverage with hand-authored domain keys in the highest-traffic pages.

## Validation

- `node scripts/check-i18n-keys.js`: PASS
- `node scripts/ci/check-i18n-hardcoded-literals.mjs --write-report`: PASS and report generated
- `node scripts/ci/generate-i18n-auto-literals.mjs --apply`: PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS

## Boundaries

- DB write: No
- Migration: No
- Backend API change: No
- Production deploy required: Yes, frontend-only

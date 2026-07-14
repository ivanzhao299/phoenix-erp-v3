# Global i18n Debt Clearance Report

Date: 2026-07-14

## Decision

GO. The production-visible Chinese, English, and Lao locale coverage is complete for the current frontend source. Missing keys, untranslated Chinese residue, placeholder translations, and runtime-bridge coverage gaps are all zero.

## Cleared Debt

- Restored full parity across `zh`, `en`, and `lo`: 13,637 keys per locale.
- Verified all 7,331 static `t()` references resolve in all three locales.
- Covered all 3,240 detected hardcoded Chinese literals across 176 frontend files through the existing runtime literal bridge.
- Reduced uncovered hardcoded literals from 33 to 0.
- Replaced 212 historical `Localized UI text ...` placeholder values with usable English and Lao translations.
- Removed all Chinese residue from English and Lao locale values.
- Added the missing explicit keys `system.bugIntake.repairResult` and `ui.确认删除价格册`.
- Added 88 newly discovered runtime literal translations, including reviewed terminology for Chanjet, finance, reconciliation, account books, vouchers, and production readiness.

## Regression Prevention

`scripts/ci/check-i18n-hardcoded-literals.mjs` now rejects:

- uncovered hardcoded Chinese literals;
- empty or source-equal translations;
- `Localized UI text ...` placeholders;
- Chinese residue anywhere in English or Lao locale values.

`scripts/ci/generate-i18n-auto-literals.mjs` now:

- preserves reviewed existing translations by default;
- updates existing translations only with explicit `--refresh-existing`;
- reports placeholder counts;
- contains reviewed translations for newly introduced high-risk finance and operations labels.

## Verification

| Check | Result |
| --- | --- |
| Locale JSON parse | PASS |
| i18n key/reference gate | PASS: 13,637 keys per locale; 7,331 references resolved |
| Hardcoded literal audit | PASS: 3,240/3,240 runtime-covered; 0 uncovered |
| Locale quality audit | PASS: 0 placeholders; 0 Chinese residue |
| Auto-literal generator dry-run | PASS: 0 new/updated keys required |
| Web unit tests | PASS: 27 files, 140 tests |
| Web TypeScript | PASS |
| API TypeScript | PASS |
| Web production build | PASS: 228 routes generated with Webpack |
| Security regression gate | PASS |
| W5 closeout gate | PASS: 19/19 gates |

The default Turbopack build cannot follow the worktree's shared `node_modules` symlink outside its configured filesystem root. The production-equivalent Webpack build completed successfully; this is an isolated worktree tooling constraint, not an application or i18n defect.

## Remaining Maintainability Work

The 3,240 literals are translated at runtime by the established `auto.literal.*` bridge. They no longer create a user-visible i18n gap. Converting high-change pages to explicit semantic `t()` keys remains a maintainability improvement and must be incremental to avoid destabilizing 176 files in one release. The strengthened CI gate prevents any new untranslated or placeholder debt in the meantime.

## Safety

- Database write: No
- Migration: No
- Deployment configuration change: No
- Business data change: No

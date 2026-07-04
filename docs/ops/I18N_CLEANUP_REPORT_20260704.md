# i18n Legacy Cleanup Report - 2026-07-04

## Goal

Clear the remaining i18n CI blockers before continuing the next production-hardening task batch.

## Scope

- Locale parity: `apps/web/src/locales/zh.json`, `en.json`, `lo.json`
- Hardcoded literal coverage report: `docs/ops/runs/i18n-hardcoded-literals-latest.*`
- Auto literal bridge report: `docs/ops/runs/i18n-auto-literals-latest.*`

## Changes

1. Added the 19 missing runtime translation keys used by dashboard, user archive, role picker, and mobile notification pages.
2. Applied the existing `generate-i18n-auto-literals.mjs` bridge for historical hardcoded Chinese UI literals.
3. Updated hardcoded literal audit reports.

## Verification

- `node scripts/check-i18n-keys.js`: PASS
  - Three locales are aligned at 13,028 keys each.
  - 7,132 `t()` referenced keys all resolve.
- `node scripts/ci/check-i18n-hardcoded-literals.mjs --fail-on-uncovered --write-report`: PASS
  - Total scanned findings: 2,864
  - Auto-translatable findings: 2,864
  - Manual componentization findings: 0
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS

## Result

GO WITH CONDITIONS.

The CI-blocking i18n debt is cleared. Remaining i18n work is quality polish: replacing legacy auto-literal coverage with explicit semantic keys when high-value pages are actively redesigned.

## Production Boundaries

- DB write: No
- Migration: No
- Deploy: No
- Push: Pending this commit
- Business logic change: No

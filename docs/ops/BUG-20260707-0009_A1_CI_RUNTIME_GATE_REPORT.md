# BUG-20260707-0009 A1 CI Runtime Gate Report

## Result

PASS WITH CONDITIONS

The recovered backend and frontend repairs for BUG-20260707-0009 were validated in the main workspace with full local dependencies.

## Scope

- A3 backend repair: medicine inbound now upserts stock before ledger write; outbound requires an existing stock row before ledger write.
- A4 frontend repair: mobile/admin medicine stock pages refresh stock and return to stock overview after successful inbound/outbound submit.

## Validation Commands

- `cd apps/api && ./node_modules/.bin/jest src/modules/farm/farm-medicine.service.spec.ts --runInBand`: PASS before A4 recovery.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`: PASS.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS.
- `node scripts/check-i18n-keys.js`: PASS.
- `git diff --check`: PASS.
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS.

## Safety Checks

- Migration executed: No.
- DB write executed by validation: No.
- Production deploy executed by validation: No.
- Push executed before final commit: No.
- Business-code scope: approved backend Store/Farm medicine service repair and approved frontend medicine stock refresh repair only.

## Queue Status Recommendation

- Mark `BUGTASK-20260707-0009-05-A1` as `completed`.
- Keep BUG0009 ready for deployment verification after push.

## Conclusion

GO WITH CONDITIONS. Local gates passed; live behavior should be smoke-tested after CI/CD deployment.

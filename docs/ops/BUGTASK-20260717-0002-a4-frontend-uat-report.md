# BUGTASK-20260717-0002 A4 Frontend/UAT Report

## Result

**PASS WITH CONDITIONS — release decision: HOLD**

The frontend-owned crash path is repaired and local static/test gates pass. Do not claim
BUG-20260717-0002 resolved until CI/CD, a production smoke test, and business acceptance
are complete. Browser viewport smoke is additionally pending because this execution
environment denied binding the local Next.js server.

## Source bug

- Bug: `BUG-20260717-0002`
- Task: `BUGTASK-20260717-0002`
- Route: `/daily-work` → `/breeding/feed?action=create&date=today`
- Symptom: the feed ledger initially paints, then the global error boundary displays
  “当前页面加载失败” after its asynchronous data response arrives.
- Captured console signal: `Failed to execute 'removeChild' on 'Node'` during React error
  recovery.

## Root cause and repair

The feed ledger trusted every API row to match a non-null TypeScript interface. Rendering
called `toLocaleString()` on stock quantities and indexed `outbound_detail` directly.
Legacy/partial rows containing `NULL` therefore threw during the post-load render. The
new response normalizer converts nullable/invalid numeric values to `0`, invalid detail
maps to `{}`, nullable text to an empty string, and preserves the meaningful nullable
`days_left` state.

The `/daily-work` feed card also checked `MENU_FARM_FEED:C`, while the target page and its
documented endpoint guard use `MENU_BREEDING`. The card now requires
`MENU_BREEDING:V`; edit/save remains gated by the existing `MENU_BREEDING:E` check.
This preserves read-only visibility and prevents a dangling permission entry.

Loading, empty, inline error, and read-only/edit UI branches remain present. No API,
schema, migration, database, deployment, or production operation was performed.

## Changed files

- `apps/web/src/app/(admin)/daily-work/page.tsx`
- `apps/web/src/app/(admin)/breeding/feed/page.tsx`
- `apps/web/src/lib/feed-ledger.ts`
- `apps/web/src/lib/feed-ledger.test.ts`
- `docs/ops/BUGTASK-20260717-0002-a4-frontend-uat-report.md`

## Verification

| Check | Result |
|---|---|
| Focused nullable/malformed response regression | PASS, 2/2 tests |
| Target-file ESLint | PASS, 0 errors/warnings |
| Web TypeScript (`tsc --noEmit`) | PASS, exit 0 |
| Patch whitespace (`git diff --check`) | PASS, exit 0 |
| Permission review | PASS: view uses `MENU_BREEDING:V`; save uses `MENU_BREEDING:E` |
| Loading/empty/error review | PASS: all existing branches preserved |
| Desktop responsive source review | PASS: table remains horizontally scrollable; toolbar/actions wrap |
| Mobile responsive source review | PASS: same overflow/wrapping behavior; no fixed viewport width added |
| Real local desktop/mobile browser smoke | BLOCKED: `listen EPERM 127.0.0.1:3000` |

Commands:

```bash
cd apps/web
./node_modules/.bin/eslint \
  'src/app/(admin)/daily-work/page.tsx' \
  'src/app/(admin)/breeding/feed/page.tsx' \
  src/lib/feed-ledger.ts src/lib/feed-ledger.test.ts
./node_modules/.bin/vitest run src/lib/feed-ledger.test.ts
./node_modules/.bin/tsc --noEmit
git -C ../.. diff --check
```

Attempted browser prerequisite:

```text
next dev --hostname 127.0.0.1 --port 3000
Error: listen EPERM: operation not permitted 127.0.0.1:3000
```

## Conditions to move from HOLD

1. CI passes on the repair commit.
2. In an environment permitted to bind/serve the app, verify desktop and mobile widths
   for normal data, nullable legacy data, loading, empty, 403/error, and read-only roles.
3. Production smoke confirms the admin click path no longer reaches the global error
   boundary and an authorized non-admin sees only the correct controls.
4. Business owner accepts the feed-ledger workflow.

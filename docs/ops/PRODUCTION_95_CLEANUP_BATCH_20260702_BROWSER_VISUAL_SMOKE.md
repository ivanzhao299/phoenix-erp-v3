# Production 95 Cleanup Batch: Browser Visual Smoke

Generated at: 2026-07-02

## Objective

Add a real browser-level smoke gate for the pages that have repeatedly produced visual or runtime issues in screenshots: dashboard aggregate cards, system monitor, system alerts, UAT readiness, inventory turnover, IoT device monitor, procurement payment/order pages, approval todo, shareholder capital, and mobile operational surfaces.

## Why This Matters

The previous gates caught source-level and HTTP-level failures, but they did not capture actual rendered screenshots. That left a gap where a page could pass static checks while still looking broken, blank, misaligned, or showing a generic page failure in the browser.

## New Capability

- Script: `scripts/ops/browser-visual-smoke.mjs`
- Default base URL: `https://erp.eggslao.com`
- Output JSON: `docs/ops/runs/browser-visual-smoke-latest.json`
- Output Markdown: `docs/ops/runs/browser-visual-smoke-latest.md`
- Screenshots: `output/playwright/product-pages/`

The script uses Playwright through `npx --package playwright` and fails or warns on:

1. 5xx response.
2. 404 route.
3. Generic page failure text.
4. React/runtime error text.
5. Known PostgreSQL parameter-cast error text.
6. Missing expected page signal.
7. Very low visible text.
8. Login wall when the route requires authenticated evidence.

## CI Integration

`.github/workflows/ci-smoke.yml` now validates the script with `node --check` and exposes a manual smoke target:

```bash
browser-visual-production
```

## Safety

- DB write executed: No.
- Migration executed: No.
- Deployment executed: No.
- Push executed: No.
- Business code changed: No.

## Current Result

Local execution completed after installing the missing local Playwright Chromium browser binary.

- Decision: `GO_WITH_WARNINGS`
- PASS: 0
- WARN: 12
- FAIL: 0
- SKIP: 0
- Report: `docs/ops/runs/browser-visual-smoke-latest.md`
- Screenshots: `docs/ops/runs/browser-visual-screenshots/`

The warnings are expected for this unauthenticated run: most protected business routes redirect anonymous traffic to login, so screenshots were captured but product-page content could not be verified. This is not a production-page GO by itself; it is the new evidence layer that must be paired with authenticated role smoke.

## Remaining Gaps

1. Authenticated screenshot smoke still needs approved smoke credentials.
2. Role-specific screenshot smoke still needs the role credential fixture.
3. Visual smoke can detect broken pages but does not replace targeted functional UAT.

## Conclusion

`GO_WITH_CONDITIONS`: browser visual smoke has been added as a repeatable production-readiness gate and produced screenshot evidence. The next lift is authenticated role screenshot smoke so the page bodies, buttons, and data surfaces can be verified after login.

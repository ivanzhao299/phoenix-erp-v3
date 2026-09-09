import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(
  join(process.cwd(), 'src/app/(terminal)/terminal/packaging/warehouse-handover/page.tsx'),
  'utf8',
);
const css = readFileSync(
  join(process.cwd(), 'src/app/(terminal)/terminal/packaging/warehouse-handover/warehouse-handover.module.css'),
  'utf8',
);

describe('BUG-20260722-0003 warehouse handover', () => {
  it('only reports success and redirects after the confirm API resolves', () => {
    const request = page.indexOf('await packagingApi.confirmHandover');
    const success = page.indexOf('setDone(true)', request);
    const failure = page.indexOf('catch (e)', success);

    expect(request).toBeGreaterThan(-1);
    expect(success).toBeGreaterThan(request);
    expect(failure).toBeGreaterThan(success);
    expect(page.slice(failure)).not.toContain('setDone(true)');
  });

  it('keeps the form available and exposes an accessible API failure', () => {
    expect(page).toContain("setSubmitError(e instanceof Error");
    expect(page).toContain('role="alert"');
    expect(page).toContain('finally');
    expect(page).toContain('setSubmitting(false)');
  });

  it('stacks the affected workflow for mobile viewports', () => {
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('flex-direction: column');
    expect(css).toContain('grid-template-columns: 1fr !important');
    expect(css).toContain('width: 100% !important');
  });

  it('distinguishes PACKAGING posting from reconciled TEMP ownership', () => {
    expect(page).toContain("activeHandoverStatus.inventoryMode === 'TEMP_PRODUCTION_INBOUND'");
    expect(page).toContain('交接完成，库存由日产蛋入口持有');
    expect(page).toContain('枚日产蛋库存批次/流水已对平');
    expect(page).toContain('库存已入账');
  });
});

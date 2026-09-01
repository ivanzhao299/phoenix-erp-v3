import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('sales orders workflow action contract', () => {
  const pageSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/(admin)/sales2/orders/page.tsx'),
    'utf8',
  );

  it('reloads the server-authoritative list after a successful action', () => {
    const actionHandler = pageSource.slice(
      pageSource.indexOf('const doAction = async'),
      pageSource.indexOf('// ── 渲染'),
    );

    expect(actionHandler).toContain('await loadOrders();');
    expect(actionHandler).not.toContain('setOrders(prev =>');
  });

  it('shows list action failures and prevents duplicate action requests', () => {
    expect(pageSource).toContain('role="alert"');
    expect(pageSource).toContain('{actionError && !detailOrder && !showCreate');
    expect(pageSource).toMatch(/disabled=\{actionLoading\} onClick=\{\(\) => doAction\(o\.sourceId/);
  });
});

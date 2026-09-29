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

  it('renders missing customer master guidance without creating master data', () => {
    expect(pageSource).toContain("err.errorCode");
    expect(pageSource).toContain("actionErrorCode === 'CREDIT_CUSTOMER_MASTER_NOT_FOUND'");
    expect(pageSource).toContain('请重选当前公司的有效客户');
    expect(pageSource).toContain('href="/master-data/customers"');
    expect(pageSource).not.toMatch(/api\(['"]POST['"],\s*['"]\/api\/master-data/);
  });

  it('keeps structured business reasons visible when the API uses msg and errors', () => {
    expect(pageSource).toContain('body?.msg');
    expect(pageSource).toContain('body.errors.join');
    expect(pageSource).toContain('apiErrorMessage(err, res.status)');
  });
});

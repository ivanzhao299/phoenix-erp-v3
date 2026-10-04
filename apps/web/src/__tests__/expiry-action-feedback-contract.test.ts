import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'src/app/(admin)/warehouse/expiry/page.tsx'),
  'utf8',
);

describe('expiry alert action feedback contract', () => {
  it('keeps the alert visible and exposes a business error when outbound creation fails', () => {
    expect(source).toContain('const [actionError, setActionError] = useState<string | null>(null);');
    expect(source).toContain('setActionError(err instanceof Error && err.message ? err.message');
    expect(source).toContain('role="alert"');
    expect(source).not.toContain('.catch(() => {});');
  });

  it('removes the alert only after the outbound request succeeds', () => {
    const createStart = source.indexOf('await crudApi.create("wms_outbound"');
    const removeAlert = source.indexOf('setAlerts(prev => prev.filter(a => a.id !== confirm.item!.id));');
    const actionCatch = source.indexOf('} catch (err) {', createStart);
    expect(createStart).toBeGreaterThanOrEqual(0);
    expect(removeAlert).toBeGreaterThan(createStart);
    expect(actionCatch).toBeGreaterThan(removeAlert);
  });
});

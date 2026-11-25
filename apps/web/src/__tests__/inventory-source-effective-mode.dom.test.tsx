/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import SourceModePage from '@/app/(admin)/warehouse/source-mode/page';

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ canView: true, canApprove: false }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/components/shared-selectors/MasterDataSelectors', () => ({
  HouseSelector: ({ onChange }: { onChange: (code: string) => void }) =>
    <button type="button" onClick={() => onChange('HOUSE-MS')}>测试鸡舍</button>,
}));

it('shows the effective farm override beside the group setting and exposes config load failure', async () => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let configAvailable = true;
  const routedFetch = vi.fn(async (path: string) => {
    if (path === '/api/v2/inventory/source/configs') return configAvailable
      ? Response.json([{ scope_level: 'GROUP', scope_code: 'ALL', mode: 'TEMP_PRODUCTION_INBOUND' }])
      : Response.json({ message: 'configuration unavailable' }, { status: 403 });
    if (path.startsWith('/api/v2/inventory/source/audit?')) return Response.json([]);
    if (path === '/api/v2/inventory/source/mode?houseCode=HOUSE-MS') return Response.json({
      houseCode: 'HOUSE-MS', companyCode: 'COMP', farmCode: 'FARM-MS', siteCode: 'SITE-1',
      mode: 'PACKAGING_INBOUND', modeScope: { level: 'SITE', code: 'FARM-MS' }, state: 'OFF',
    });
    throw Error(path);
  });
  vi.stubGlobal('fetch', routedFetch);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  async function click(label: string) {
    const button = [...host.querySelectorAll('button')].find(node => node.textContent?.trim() === label);
    expect(button, label).toBeDefined();
    await act(async () => button?.click());
  }
  try {
    await act(async () => root.render(<SourceModePage/>));
    await click('测试鸡舍');
    expect(host.querySelector('[role=status]')?.textContent).toContain('包装入库 · HOUSE-MS · COMP · SITE/FARM-MS');
    expect(host.textContent).toContain('临时生产入库');
    configAvailable = false;
    await click('刷新');
    expect(host.querySelector('[role=alert]')?.textContent).toContain('暂时无法核实');
    expect(host.textContent).not.toContain('暂无配置（默认 临时生产入库）');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

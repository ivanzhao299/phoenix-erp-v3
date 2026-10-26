/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const fetchRecords = vi.hoisted(() => vi.fn(async (_table: string, query: Record<string, unknown>) => {
  // Model unrelated rows consuming the global list cap.
  if (!query.dict_type) return Array.from({ length: 1000 }, (_, i) => ({ dict_type: 'OTHER', dict_code: String(i), status: 'ACTIVE' }));
  return [{ dict_type: String(query.dict_type), dict_code: 'SALE', dict_label_zh: '字典销售', status: 'ACTIVE' },
    { dict_type: String(query.dict_type), dict_code: 'OLD', dict_label_zh: '旧值', status: 'INACTIVE' }];
}));
vi.mock('@/lib/api-client', () => ({ crudApi: { list: fetchRecords } }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ lang: 'zh', t: (_key: string, fallback: string) => fallback }) }));
import { useDictOptions } from './useDictOptions';
import DictSelect from '@/components/shared-selectors/DictSelect';
it('filters dictionary before the global cap and makes a forbidden current value visibly unavailable', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    await act(async () => root.render(<DictSelect dictType="INV_OUTBOUND_TYPE" value="RETURN" allowedValues={['SALE']} onChange={() => {}} />));
    expect(fetchRecords).toHaveBeenCalledWith('sys_dict', { dict_type: 'INV_OUTBOUND_TYPE', status: 'ACTIVE', limit: 1000 });
    const options = [...host.querySelectorAll('option')];
    expect(options.map(option => option.value)).toEqual(['', 'RETURN', 'SALE']);
    expect(options.find(option => option.value === 'RETURN')?.disabled).toBe(true);
    expect(host.querySelector('select')?.value).toBe('RETURN');
    expect(host.textContent).toContain('字典销售');
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it('keeps successful dictionaries when another type fails and does not cache a partial combination', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let fail = true;
  fetchRecords.mockImplementation(async (_table, query) => {
    if (query.dict_type === 'FAILURE_TEST' && fail) throw Error('fixture outage');
    return [{ dict_type: String(query.dict_type), dict_code: String(query.dict_type), dict_label_zh: String(query.dict_type), status: 'ACTIVE' }];
  });
  const Consumer = () => { const { optionPairs } = useDictOptions(['SUCCESS_TEST', 'FAILURE_TEST']); return <span>{optionPairs.map(p => p.value).join(',')}</span>; };
  const host = document.createElement('div'); let root = createRoot(host);
  try {
    await act(async () => root.render(<React.StrictMode><Consumer /></React.StrictMode>));
    expect(host.textContent).toBe('SUCCESS_TEST');
    await act(async () => root.unmount()); fail = false; root = createRoot(host);
    await act(async () => root.render(<Consumer />));
    expect(host.textContent).toBe('SUCCESS_TEST,FAILURE_TEST');
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

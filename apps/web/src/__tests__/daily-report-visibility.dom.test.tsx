/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  reports: [] as Record<string, unknown>[], fetchReports: vi.fn(), fetchHouses: vi.fn(), fetchFlocks: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
  fetchContext: vi.fn(),
  saveReport: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => fixtures.toast }));
vi.mock('@/contexts/DialogContext', () => ({ useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(false) }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ can: () => false, canCreate: true, canEdit: true, canExport: false }) }));
vi.mock('@/hooks/useDictOptions', () => ({ useDictOptions: () => ({ optionPairs: [], codeMap: {} }) }));
vi.mock('@/hooks/useProductGrades', () => ({ useProductGrades: () => ({ grades: [] }) }));
vi.mock('@/hooks/useCrud', () => ({ useCrud: (table: string) => ({ fetchRecords: table === 'brd_daily_logs' ? fixtures.fetchReports : table === 'brd_houses' ? fixtures.fetchHouses : fixtures.fetchFlocks }) }));
vi.mock('@/components/shared-selectors/MasterDataSelectors', () => ({ HouseSelector: ({value,onChange,placeholder}: {value:string;onChange:(value:string)=>void;placeholder:string}) =>
  <select value={value} onChange={event => onChange(event.target.value)}><option value="">{placeholder}</option><option value="HOUSE-A">House A</option><option value="HOUSE-B">House B</option></select> }));
vi.mock('@/components/shared-selectors/DictSelect', () => ({ default: () => null }));
vi.mock('@/components/PageHeader', () => ({ default: ({actions}: {actions:React.ReactNode}) => <header>{actions}</header> }));
vi.mock('@/components/design-system/dialogs/ModalV2', () => ({ ModalV2: () => null }));
import DailyPage from '@/app/(admin)/breeding/daily/page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const setInput = async (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const mount = async () => act(async () => root.render(<DailyPage />));
const historyRows = () => host.querySelector('tbody')!;

beforeEach(() => {
  window.history.replaceState(null, '', '/breeding/daily');
  sessionStorage.clear();
  sessionStorage.setItem('phoenix_user', JSON.stringify({username:'fixture_reporter',storeCode:'LPH_FARM_A'}));
  fixtures.reports = [{house_code:'HOUSE-B',log_date:'2026-10-17',note:'AUTHORIZED_B',feed_consumed:7}];
  fixtures.fetchReports.mockReset().mockImplementation(async (query: Record<string, unknown> = {}) => fixtures.reports.filter(row =>
    (!query.house_code || row.house_code === query.house_code) && (!query.log_date || row.log_date === query.log_date)));
  fixtures.fetchHouses.mockReset().mockResolvedValue([{house_code:'HOUSE-A',house_name:'House A',farm_code:'FARM-A'}, {house_code:'HOUSE-B',house_name:'House B',farm_code:'FARM-A'}]);
  fixtures.fetchFlocks.mockReset().mockResolvedValue([{house_code:'HOUSE-A',flock_no:'FLOCK-A',current_qty:100}]);
  fixtures.toast.error.mockReset();
  const ok = (body: unknown) => ({ok:true,json:async()=>body});
  fixtures.fetchContext.mockReset().mockResolvedValue(ok({state:'OFF',firstProductionDate:null}));
  fixtures.saveReport.mockReset().mockImplementation(async (report: Record<string, unknown>) => {
    fixtures.reports.push(report);
    return ok({code:200});
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const { pathname, searchParams } = new URL(url, window.location.origin);
    if (pathname === '/api/v3/farm/daily-logs' && options?.method === 'POST') {
      return fixtures.saveReport(JSON.parse(String(options.body)));
    }
    if (pathname === '/api/lookup/egg-source-profile') return ok({code:200,data:null});
    if (pathname === '/api/lookup/houses') {
      return ok({code:200,data:[{houseCode:'HOUSE-A',companyCode:'COMP-A',ownershipResolved:true}]});
    }
    if (pathname === '/api/v2/inventory/production-inbound-documents/context') {
      return fixtures.fetchContext(searchParams.get('companyCode'), searchParams.get('houseCode'));
    }
    if (pathname === '/api/v3/farm/daily-hen-report') {
      return ok({rows:[
        {house_code:'HOUSE-A',flock_no:'FUTURE-FLOCK',occupancy_id:null,entry_candidate:false},
        {house_code:'HOUSE-A',flock_no:'FLOCK-ON-REPORT-DATE',occupancy_id:null,entry_candidate:true,entry_verified:true,has_daily_log:false,current_qty:100},
      ]});
    }
    return ok({data:{}});
  }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('does not hide an authorized report behind the entry form default house', async () => {
  await mount();
  expect((host.querySelectorAll('select')[0] as HTMLSelectElement).value).toBe('HOUSE-A');
  expect(historyRows().textContent).toContain('AUTHORIZED_B');
  expect(fixtures.fetchReports).toHaveBeenCalledWith({limit:30});
});

it('queries the selected historical house and date before the page limit', async () => {
  await mount();
  const historyHouse = host.querySelectorAll('select')[1];
  await act(async () => { historyHouse.value='HOUSE-B'; historyHouse.dispatchEvent(new Event('change',{bubbles:true})); });
  const historyDate = host.querySelectorAll('input[type="date"]')[1] as HTMLInputElement;
  await setInput(historyDate, '2026-10-17');
  expect(fixtures.fetchReports).toHaveBeenLastCalledWith({house_code:'HOUSE-B',log_date:'2026-10-17',limit:30});
  expect(historyRows().textContent).toContain('AUTHORIZED_B');
});

it('shows the saved business date immediately and remains visible on refresh and a new session', async () => {
  await mount();
  const date = host.querySelector('input[type="date"]') as HTMLInputElement;
  await setInput(date, '2026-10-17');
  // Death-only input avoids egg/inventory flows.
  const deaths = Array.from(host.querySelectorAll('span')).find(span => span.textContent === '死亡(羽)')!.parentElement!.querySelector('input')!;
  await setInput(deaths, '3');
  const submit = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('提交日报'))!;
  expect(fixtures.fetchContext).toHaveBeenLastCalledWith('COMP-A', 'HOUSE-A');
  expect(submit.disabled).toBe(false);
  await act(async () => submit.click());
  expect(fixtures.saveReport).toHaveBeenCalledWith(expect.objectContaining({house_code:'HOUSE-A',log_date:'2026-10-17',flock_no:'FLOCK-ON-REPORT-DATE',mortality_qty:3}));
  expect(fixtures.toast.error).not.toHaveBeenCalled();
  expect(fixtures.fetchReports).toHaveBeenLastCalledWith({house_code:'HOUSE-A',log_date:'2026-10-17',limit:30});
  expect(historyRows().textContent).toContain('House A');
  expect(historyRows().textContent).toContain('3');
  expect(window.location.search).toContain('historyDate=2026-10-17');
  await act(async () => root.unmount()); root=createRoot(host); await mount();
  expect(historyRows().textContent).toContain('House A');
  await act(async () => root.unmount()); root=createRoot(host);
  sessionStorage.clear(); sessionStorage.setItem('phoenix_user',JSON.stringify({username:'fixture_reporter',storeCode:'LPH_FARM_A'}));
  await mount(); expect(historyRows().textContent).toContain('House A');
});

it('requires verified context after a date change before enabling submission', async () => {
  await mount();
  const submit = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('提交日报'))!;
  expect(submit.disabled).toBe(false);
  fixtures.fetchContext.mockResolvedValue({ok:false,status:403,json:async()=>({message:'Unavailable scope'})});
  await setInput(host.querySelector('input[type="date"]')!, '2026-10-17');
  expect(submit.disabled).toBe(true);
  await act(async () => submit.click());
  expect(fixtures.saveReport).not.toHaveBeenCalled();
});

it('discards an older history response after the user selects a different house', async () => {
  let resolveOld!: (rows: Record<string, unknown>[]) => void;
  fixtures.fetchReports.mockImplementationOnce(() => new Promise<Record<string, unknown>[]>(resolve => { resolveOld=resolve; }));
  fixtures.reports=[{house_code:'HOUSE-A',log_date:'2026-10-17',note:'CURRENT_SELECTION'}];
  await mount();
  const historyHouse=host.querySelectorAll('select')[1];
  await act(async()=>{historyHouse.value='HOUSE-A';historyHouse.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(historyRows().textContent).toContain('CURRENT_SELECTION');
  await act(async()=>resolveOld([{house_code:'HOUSE-B',note:'STALE_RESPONSE'}]));
  expect(historyRows().textContent).toContain('CURRENT_SELECTION');
  expect(historyRows().textContent).not.toContain('STALE_RESPONSE');
});

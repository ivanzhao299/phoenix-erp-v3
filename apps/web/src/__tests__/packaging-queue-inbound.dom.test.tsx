/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  t: (key: string, fallback?: string) => fallback ?? key,
}));
vi.mock('next/navigation', () => ({useSearchParams:()=>new URLSearchParams(window.location.search)}));
vi.mock('@/lib/api-client', () => ({default:mocks.request}));
vi.mock('@/contexts/LanguageContext', () => ({useLanguage:()=>({t:mocks.t,lang:'zh'})}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission:(menu?:string)=>({user:{id:'7'},roles:[],canView:menu==='MENU_PROD_INBOUND',canCreate:true,canEdit:false,canApprove:false}),
}));
vi.mock('@/hooks/useProductGrades', () => ({useProductGrades:()=>({grades:[],loading:false})}));
vi.mock('@/hooks/useEggSourceProfile', () => ({useEggSourceProfile:()=>({profile:null,loading:false}),varietyShortLabel:()=>''}));
vi.mock('@/hooks/useDictOptions', () => ({useDictOptions:()=>({codeMap:{}})}));
vi.mock('@/contexts/DialogContext', () => ({useDialog:()=>({showConfirm:vi.fn()})}));
vi.mock('@/components/shared-selectors/MasterDataSelectors', () => ({
  HouseSelector:({value}:{value:string})=><input aria-label="source house" readOnly value={value}/>,
  CompanySelector:()=>null,
  WarehouseSelector:({onChange}:{onChange:(value:string)=>void})=><button onClick={()=>onChange('W-A')}>choose authorized warehouse</button>,
  LocationSelector:()=>null,
  SpecSelector:()=>null,
}));
vi.mock('@/components/breeding/SourceProfileBanner', () => ({SourceProfileBanner:()=>null}));
vi.mock('@/components/breeding/RawCollectionReceipts', () => ({
  default:()=>null,
  RawCollectionSourcePicker:({value}:{value:string})=><input aria-label="authorized RAW row" value={value} readOnly/>,
}));
vi.mock('@/components/breeding/InventoryConversions', () => ({default:()=>null}));
vi.mock('@/components/breeding/ProductionStockTrace', () => ({default:()=>null}));
vi.mock('@/components/shared-selectors/DictSelect', () => ({default:()=>null}));
vi.mock('@/components/design-system/forms/AttachmentUploader', () => ({AttachmentUploader:()=>null}));

import DailyInbound from '@/app/(admin)/breeding/daily-inbound/page';
import ProductionInboundWorkbench from '@/components/breeding/ProductionInboundWorkbench';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;
beforeEach(()=>{
  sessionStorage.clear();
  mocks.request.mockReset();
  container=document.body.appendChild(document.createElement('div'));
  root=createRoot(container);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  container.remove();
  history.replaceState(null,'','/');
});

const range='companyCode=C1&siteCode=SITE1&houseCode=HOUSE1&eggDate=2026-09-10';

it('opens legacy TEMP on the specified house-day and reads authorization before posting',async()=>{
  history.replaceState(null,'','/breeding/daily-inbound?queueAction=LEGACY_TEMP_INBOUND&'+range);
  mocks.request.mockResolvedValue({houseCode:'HOUSE1',siteCode:'SITE1',companyCode:'C1',state:'OFF',mode:'TEMP_PRODUCTION_INBOUND'});
  await act(async()=>root.render(<DailyInbound/>));
  expect(container.querySelector<HTMLInputElement>('input[aria-label="source house"]')?.value).toBe('HOUSE1');
  expect(container.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe('2026-09-10');
  expect(mocks.request).toHaveBeenCalledWith('/v2/inventory/production-inbound/availability?houseCode=HOUSE1&eggDate=2026-09-10',
    expect.objectContaining({silent:true}));
  expect(mocks.request.mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true);
});

it('prefills only a RAW source returned by the selected authorized warehouse',async()=>{
  history.replaceState(null,'','/breeding/production-inbound?queueAction=FORMAL_RAW&sourceBatchCode=SOURCE-A&'+range);
  mocks.request.mockImplementation(async(path:string)=>{
    if(path.includes('/context?'))return {state:'ACTIVE',firstProductionDate:'2026-09-01'};
    if(path.includes('/balance?'))return {scopeState:'ACTIVE',sourceBalances:[],sourceStatus:'VERIFIED',grades:{},currentStock:{},reports:[]};
    if(path.includes('/raw-collection-receipts/sources?'))return [{id:'other',batch_code:'SOURCE-B'},{id:'exact',batch_code:'SOURCE-A'}];
    return [];
  });
  await act(async()=>root.render(<ProductionInboundWorkbench/>));
  expect(container.textContent).toContain('SOURCE-A');
  expect(container.querySelector<HTMLInputElement>('input[aria-label="authorized RAW row"]')?.value).toBe('');
  const warehouse=[...container.querySelectorAll('button')].find(button=>button.textContent==='choose authorized warehouse');
  expect(warehouse).toBeDefined();
  await act(async()=>warehouse?.click());
  expect(container.querySelector<HTMLInputElement>('input[aria-label="authorized RAW row"]')?.value).toBe('exact');
  expect(mocks.request.mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true);
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
const mocks=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('@/lib/api-client',()=>({default:mocks.request}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({lang:'zh',t:(_key:string,fallback:string)=>fallback})}));
import {SkuSelector} from './MasterDataSelectors';

type SelectProps={loader:()=>Promise<Array<{value:string;label:string;raw:unknown}>>;preserveValue:boolean;reloadDeps:unknown[]};
function props(companyCode?:string,usage:'any'|'sale-stock'='sale-stock'){
  // This selector is a pure wrapper around ScopedSelect. Exercise the actual
  // loader and props; this is not claimed as a browser/DOM permission test.
  return (SkuSelector({value:'',onChange:vi.fn(),companyCode,usage}) as ReactElement<SelectProps>).props;
}
describe('company-aware SKU selector loader',()=>{
  beforeEach(()=>mocks.request.mockReset());
  it('uses the scoped commercial API and never persists a foreign unavailable selection',async()=>{
    mocks.request.mockResolvedValue({code:200,data:[{sku_code:'R1',sku_name:'红壳蛋',status:'ACTIVE'},{sku_code:'OLD',status:'FROZEN'}]});
    const p=props('C-A');
    expect(p.preserveValue).toBe(false);
    expect(p.reloadDeps).toContain('C-A');
    const options=await p.loader();
    expect(mocks.request).toHaveBeenCalledWith('/product-master/skus/commercial-candidates?status=ACTIVE&usage=sale-stock&companyCode=C-A');
    expect(options.map(o=>o.value)).toEqual(['R1']);
    expect(options[0].label).toContain('红壳蛋');
  });
  it('keeps the authenticated legacy MDM reference path when no company is supplied',async()=>{
    mocks.request.mockResolvedValue([{sku_code:'LEGACY',status:'ACTIVE'}]);
    const p=props(undefined,'any');
    expect(p.preserveValue).toBe(true);
    await p.loader();
    expect(mocks.request).toHaveBeenCalledWith('/product-master/skus?status=ACTIVE&usage=any');
  });
  it('changes both loader scope and reload key when the company changes',async()=>{
    mocks.request.mockResolvedValue([]);
    const a=props('C-A'),b=props('C-B');
    await a.loader();await b.loader();
    expect(a.reloadDeps).not.toEqual(b.reloadDeps);
    expect(mocks.request.mock.calls[1][0]).toContain('companyCode=C-B');
  });
});

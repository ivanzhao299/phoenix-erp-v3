import { afterEach, describe, expect, it, vi } from 'vitest';
import { mobileApi } from './mobile-api';
describe('mobile API',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('requests KPI endpoint',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({eggs:1})});vi.stubGlobal('fetch',fetch);await expect(mobileApi.getKpi()).resolves.toEqual({eggs:1});expect(fetch.mock.calls[0][0]).toBe('/api/dashboard/kpi');});
  it('surfaces HTTP errors',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:403,json:async()=>({message:'forbidden'})}));await expect(mobileApi.getKpi()).rejects.toThrow();});
  it('builds packaging report date',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({})});vi.stubGlobal('fetch',fetch);await mobileApi.getPackagingReport('2026-08-22');expect(fetch.mock.calls[0][0]).toContain('date=2026-08-22');});
});

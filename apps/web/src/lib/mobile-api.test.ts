import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateCache, mobileApi } from './mobile-api';
describe('mobile API',()=>{
  afterEach(()=>{ invalidateCache('feedHousesDetail'); invalidateCache('flocks'); vi.unstubAllGlobals(); });
  it('requests KPI endpoint',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({eggs:1})});vi.stubGlobal('fetch',fetch);await expect(mobileApi.getKpi()).resolves.toEqual({eggs:1});expect(fetch.mock.calls[0][0]).toBe('/api/dashboard/kpi');});
  it('surfaces HTTP errors',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:403,json:async()=>({message:'forbidden'})}));await expect(mobileApi.getKpi()).rejects.toThrow();});
  it('builds packaging report date',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({})});vi.stubGlobal('fetch',fetch);await mobileApi.getPackagingReport('2026-08-22');expect(fetch.mock.calls[0][0]).toContain('date=2026-08-22');});
  it('does not reuse a scoped house list after the mobile token changes',async()=>{
    let token = 'farm-token';
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => token) });
    const fetch = vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>[{house_code:'HOUSE-FARM'}]})
      .mockResolvedValueOnce({ok:true,json:async()=>[{house_code:'HOUSE-ADMIN'}]});
    vi.stubGlobal('fetch',fetch);

    await expect(mobileApi.getFeedHouses()).resolves.toEqual(['HOUSE-FARM']);
    token = 'admin-token';
    await expect(mobileApi.getFeedHouses()).resolves.toEqual(['HOUSE-ADMIN']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('requests all laying flocks for egg production entry',async()=>{
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => 'farm-token') });
    const fetch = vi.fn().mockResolvedValue({ok:true,json:async()=>({code:200,data:[]})});
    vi.stubGlobal('fetch',fetch);

    await mobileApi.getFlocks();

    expect(fetch.mock.calls[0][0]).toBe('/api/crud/brd_flocks?status=LAYING&status=PEAK&status=DECLINING&limit=100');
  });
  it('does not reuse a flock list after the mobile token changes',async()=>{
    let token = 'farm-token';
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => token) });
    const fetch = vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>({code:200,data:[{flock_no:'FARM-FLOCK'}]})})
      .mockResolvedValueOnce({ok:true,json:async()=>({code:200,data:[{flock_no:'ADMIN-FLOCK'}]})});
    vi.stubGlobal('fetch',fetch);

    await expect(mobileApi.getFlocks()).resolves.toEqual([{flock_no:'FARM-FLOCK'}]);
    token = 'admin-token';
    await expect(mobileApi.getFlocks()).resolves.toEqual([{flock_no:'ADMIN-FLOCK'}]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

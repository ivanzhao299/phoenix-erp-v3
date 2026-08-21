import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDictCache, fetchDictMap } from './dict-cache';
describe('dict cache',()=>{
  afterEach(()=>{clearDictCache();vi.unstubAllGlobals();});
  it('filters active rows by type',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[{dict_type:'T',dict_code:'A',dict_label_zh:'甲',status:'ACTIVE'},{dict_type:'T',dict_code:'B',dict_label_zh:'乙',status:'INACTIVE'},{dict_type:'X',dict_code:'C',dict_label_zh:'丙',status:'ACTIVE'}]})}));expect(await fetchDictMap('T')).toEqual({A:'甲'});});
  it('shares cache across calls',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[]})});vi.stubGlobal('fetch',fetch);await fetchDictMap('T');await fetchDictMap('T');expect(fetch).toHaveBeenCalledTimes(1);});
  it('returns empty on HTTP failure',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));expect(await fetchDictMap('T')).toEqual({});});
  it('returns empty on network failure',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));expect(await fetchDictMap('T')).toEqual({});});
});

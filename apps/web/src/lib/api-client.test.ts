import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_LOGIN_KEY, markBrowserLogin, refreshAndPersistSession } from './auth-session';
import request, { authApi, captureBoundSession, crudApi } from './api-client';
const response = (body: unknown, ok=true, status=200) => ({ ok, status, json:vi.fn().mockResolvedValue(body), text:vi.fn().mockResolvedValue(JSON.stringify(body)), headers:{ get:()=> 'application/json' } });
describe('api client',()=>{
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
  it('parses successful JSON',async()=>{const fetch=vi.fn().mockResolvedValue(response({data:1}));vi.stubGlobal('fetch',fetch);await expect(request('/x')).resolves.toEqual({data:1});expect(fetch).toHaveBeenCalledWith('/api/x',expect.any(Object));});
  it('posts login credentials',async()=>{const fetch=vi.fn().mockResolvedValue(response({token:'t'}));vi.stubGlobal('fetch',fetch);await authApi.login('u','p');expect(fetch.mock.calls[0][1]).toMatchObject({method:'POST',body:'{"username":"u","password":"p"}'});});
  it('maps CRUD pagination',async()=>{const fetch=vi.fn().mockResolvedValue(response({data:[]}));vi.stubGlobal('fetch',fetch);await crudApi.list('t',{page:2,pageSize:10,status:'ACTIVE'});expect(fetch.mock.calls[0][0]).toBe('/api/crud/t?limit=10&offset=10&status=ACTIVE');});
  it('does not redispatch an uncertain bound write when retries are disabled',async()=>{
    const fetch=vi.fn().mockRejectedValue(new Error('connection closed'));
    vi.stubGlobal('fetch',fetch);
    await expect(request('/production',{method:'POST',bindSession:true,retry:false})).rejects.toMatchObject({code:'NETWORK'});
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('accepts a bound result after a verified token renewal in the same tab',async()=>{
    const session = new Map([['phoenix_token','access-before']]);
    const local = new Map(session);
    for (const [name,storage] of [['sessionStorage',session],['localStorage',local]] as const) {
      vi.stubGlobal(name,{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
    }
    vi.stubGlobal('window',{});
    vi.stubGlobal('document',{cookie:''});
    const fetch=vi.fn(async(path:string)=>{
      if (path.endsWith('/auth/refresh')) return response({code:200,token:'access-after'});
      expect(await refreshAndPersistSession('access-before')).toBe('access-after');
      return response({id:'receipt'});
    });
    vi.stubGlobal('fetch',fetch);
    await expect(request('/production',{method:'POST',bindSession:true,retry:false})).resolves.toEqual({id:'receipt'});
    expect(fetch.mock.calls.filter(([path])=>path.endsWith('/production'))).toHaveLength(1);
  });
  it('uses the refreshed token for the same login in a second tab',async()=>{
    const before='header.payload.before', after='header.payload.after';
    const local = new Map([['phoenix_token',before]]);
    const browserTab = () => new Map([['phoenix_token',before]]);
    const first = browserTab(), second = browserTab();
    let active=first;
    vi.stubGlobal('window',{});
    vi.stubGlobal('document',{cookie:''});
    vi.stubGlobal('sessionStorage',{getItem:(key:string)=>active.get(key)??null,setItem:(key:string,value:string)=>active.set(key,value)});
    vi.stubGlobal('localStorage',{getItem:(key:string)=>local.get(key)??null,setItem:(key:string,value:string)=>local.set(key,value)});
    const marker=markBrowserLogin(before);
    second.set(BROWSER_LOGIN_KEY,marker);
    const fetch=vi.fn(async(path:string,options:RequestInit)=>{
      if (path.endsWith('/auth/refresh')) return response({code:200,token:after});
      expect(new Headers(options.headers).get('Authorization')).toBe('Bearer '+after);
      return response({id:'receipt'});
    });
    vi.stubGlobal('fetch',fetch);
    active=second;
    expect(await refreshAndPersistSession(before)).toBe(after);
    active=first;
    await expect(request('/finance-detail')).resolves.toEqual({id:'receipt'});
    await expect(request('/next',{bindSession:true})).resolves.toEqual({id:'receipt'});
    expect(first.get('phoenix_token')).toBe(after);
  });
  it.each(['access-other',null])('discards a bound result when another tab replaces the shared login with %s',async(next)=>{
    const storage=(getter:()=>string|null)=>({getItem:(key:string)=>key==='phoenix_token'?getter():null});
    let shared:string|null='access-tab';
    vi.stubGlobal('window',{});
    vi.stubGlobal('sessionStorage',storage(()=> 'access-tab'));
    vi.stubGlobal('localStorage',storage(()=>shared));
    const fetch=vi.fn(async()=>{shared=next;return response({id:'other-result'});});
    vi.stubGlobal('fetch',fetch);
    await expect(request('/production',{method:'POST',bindSession:true,retry:false})).rejects.toMatchObject({name:'AbortError'});
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not send an action captured before preparation when a different login replaces it',async()=>{
    const before='header.payload.alice', after='header.payload.bob';
    const session=new Map([['phoenix_token',before]]);
    const shared=new Map(session);
    for(const [name,store] of [['sessionStorage',session],['localStorage',shared]] as const){
      vi.stubGlobal(name,{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>store.set(key,value)});
    }
    vi.stubGlobal('window',{});
    markBrowserLogin(before);
    const pending=captureBoundSession();
    markBrowserLogin(after);
    session.set('phoenix_token',after);
    shared.set('phoenix_token',after);
    const fetch=vi.fn();
    vi.stubGlobal('fetch',fetch);
    await expect(request('/production',{method:'POST',bindSession:pending,retry:false})).rejects.toMatchObject({name:'AbortError'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not retry ordinary 404',async()=>{const fetch=vi.fn().mockResolvedValue(response({message:'missing'},false,404));vi.stubGlobal('fetch',fetch);await expect(request('/missing')).rejects.toThrow('missing');expect(fetch).toHaveBeenCalledTimes(1);});
  it('preserves structured validation errors and the backend msg on 400',async()=>{
    const fetch=vi.fn().mockResolvedValue(response({msg:'出库业务校验失败',errors:['去向类型不匹配','数量必须大于 0']},false,400));
    vi.stubGlobal('fetch',fetch);
    const error=await request('/outbound/standalone').catch(value=>value);
    expect(error).toMatchObject({
      status:400,
      errors:['去向类型不匹配','数量必须大于 0'],
      message:'出库业务校验失败：去向类型不匹配；数量必须大于 0',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

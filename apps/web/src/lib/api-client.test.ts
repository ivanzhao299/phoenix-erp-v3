import { afterEach, describe, expect, it, vi } from 'vitest';
import request, { authApi, crudApi } from './api-client';
const response = (body: unknown, ok=true, status=200) => ({ ok, status, json:vi.fn().mockResolvedValue(body), text:vi.fn().mockResolvedValue(JSON.stringify(body)), headers:{ get:()=> 'application/json' } });
describe('api client',()=>{
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
  it('parses successful JSON',async()=>{const fetch=vi.fn().mockResolvedValue(response({data:1}));vi.stubGlobal('fetch',fetch);await expect(request('/x')).resolves.toEqual({data:1});expect(fetch).toHaveBeenCalledWith('/api/x',expect.any(Object));});
  it('posts login credentials',async()=>{const fetch=vi.fn().mockResolvedValue(response({token:'t'}));vi.stubGlobal('fetch',fetch);await authApi.login('u','p');expect(fetch.mock.calls[0][1]).toMatchObject({method:'POST',body:'{"username":"u","password":"p"}'});});
  it('maps CRUD pagination',async()=>{const fetch=vi.fn().mockResolvedValue(response({data:[]}));vi.stubGlobal('fetch',fetch);await crudApi.list('t',{page:2,pageSize:10,status:'ACTIVE'});expect(fetch.mock.calls[0][0]).toBe('/api/crud/t?limit=10&offset=10&status=ACTIVE');});
  it('does not retry ordinary 404',async()=>{const fetch=vi.fn().mockResolvedValue(response({message:'missing'},false,404));vi.stubGlobal('fetch',fetch);await expect(request('/missing')).rejects.toThrow('missing');expect(fetch).toHaveBeenCalledTimes(1);});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { enterImpersonation, getImpersonation } from './impersonate';
describe('impersonation',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('is SSR safe',()=>expect(getImpersonation()).toBeNull());
  it('reads active impersonation',()=>{vi.stubGlobal('window',{});vi.stubGlobal('sessionStorage',{getItem:()=>'{"impersonatedBy":{"username":"admin"},"realNameZh":"刘杰"}'});expect(getImpersonation()).toEqual({by:'admin',as:'刘杰'});});
  it('rejects entry without login token',async()=>{vi.stubGlobal('sessionStorage',{getItem:()=>null});await expect(enterImpersonation('u','r')).rejects.toThrow('未登录');});
});

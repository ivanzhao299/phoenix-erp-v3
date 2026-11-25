import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAccessTokenCookie, persistRefreshedSession, refreshAndPersistSession } from './auth-session';

function jwt(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `x.${payload}.y`;
}

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
}

describe('auth session persistence', () => {
  afterEach(()=>vi.unstubAllGlobals());

  it('preserves the newer shared login when an earlier tab finishes a token refresh',async()=>{
    const session=memoryStorage(),local=memoryStorage(),page={cookie:''};
    session.setItem('phoenix_token','first');
    local.setItem('phoenix_token','first');
    vi.stubGlobal('window',{});
    vi.stubGlobal('document',page);
    vi.stubGlobal('sessionStorage',session);
    vi.stubGlobal('localStorage',local);
    let release!:()=>void;
    vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{
      release=()=>resolve({ok:true,json:async()=>({code:200,token:'refreshed-first'})});
    })));
    const refreshing=refreshAndPersistSession('first');
    local.setItem('phoenix_token','second');
    local.setItem('phoenix_cookie_token','second-cookie');
    page.cookie='second-cookie';
    release();
    await expect(refreshing).resolves.toBeNull();
    expect(local.getItem('phoenix_token')).toBe('second');
    expect(local.getItem('phoenix_cookie_token')).toBe('second-cookie');
    expect(page.cookie).toBe('second-cookie');
  });

  it('leaves a shared logout in place when an older tab still holds its session',async()=>{
    const session=memoryStorage(),local=memoryStorage();
    session.setItem('phoenix_token','signed-out');
    vi.stubGlobal('window',{});
    vi.stubGlobal('sessionStorage',session);
    vi.stubGlobal('localStorage',local);
    const fetch=vi.fn();
    vi.stubGlobal('fetch',fetch);
    await expect(refreshAndPersistSession('signed-out')).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(local.getItem('phoenix_token')).toBeNull();
  });

  it('aligns cookie max-age with JWT exp', () => {
    expect(buildAccessTokenCookie(jwt(4600), 1000)).toContain('max-age=3600;');
  });

  it('writes refreshed access/cookie tokens to session, local storage and cookie together', () => {
    const session = memoryStorage();
    const local = memoryStorage();
    let cookie = '';
    persistRefreshedSession({ accessToken: 'full', cookieToken: jwt(8200), session, local, nowSeconds: 1000, writeCookie: (v) => { cookie = v; } });
    expect(session.getItem('phoenix_token')).toBe('full');
    expect(local.getItem('phoenix_token')).toBe('full');
    expect(session.getItem('phoenix_cookie_token')).toBe(local.getItem('phoenix_cookie_token'));
    expect(cookie).toContain('max-age=7200;');
  });
});

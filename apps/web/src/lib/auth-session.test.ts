import { describe, expect, it } from 'vitest';
import { buildAccessTokenCookie, persistRefreshedSession } from './auth-session';

function jwt(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `x.${payload}.y`;
}

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
}

describe('auth session persistence', () => {
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { authHeader, getMobileToken } from './mobile-auth-token';

const storage = (values: Record<string, string | null>) => ({ getItem: vi.fn((key: string) => values[key] ?? null) });

describe('mobile auth token', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('is SSR safe', () => expect(getMobileToken()).toBe(''));
  it('prefers session token', () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('sessionStorage', storage({ phoenix_token: 'session' })); vi.stubGlobal('localStorage', storage({ phoenix_token: 'local' }));
    expect(getMobileToken()).toBe('session');
  });
  it('falls back to local token', () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('sessionStorage', storage({})); vi.stubGlobal('localStorage', storage({ phoenix_token: 'local' }));
    expect(getMobileToken()).toBe('local');
  });
  it('supports legacy auth_user', () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('sessionStorage', storage({})); vi.stubGlobal('localStorage', storage({ auth_user: '{"token":"legacy"}' }));
    expect(getMobileToken()).toBe('legacy');
  });
  it('returns empty for malformed legacy JSON', () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('sessionStorage', storage({})); vi.stubGlobal('localStorage', storage({ auth_user: '{' }));
    expect(getMobileToken()).toBe('');
  });
  it('builds auth headers', () => expect(authHeader()).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer ' }));
});

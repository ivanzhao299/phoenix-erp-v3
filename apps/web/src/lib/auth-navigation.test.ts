import { describe, expect, it } from 'vitest';
import { canAccessLoginReturn, isSafeInternalReturn, resolveLoginDestination } from './auth-navigation';

describe('login return navigation', () => {
  it.each(['/terminal/packaging/dashboard', '/sales2/orders?tab=open', '/路径'])('accepts internal path %s', (path) => {
    expect(isSafeInternalReturn(path)).toBe(true);
  });

  it.each(['https://evil.example/x', '//evil.example/x', '/\\evil.example/x', 'javascript:alert(1)', '', null])('rejects external or invalid return %s', (path) => {
    expect(isSafeInternalReturn(path)).toBe(false);
  });

  it('prefers an authorized return over the role landing page', () => {
    expect(resolveLoginDestination({
      returnPath: '/terminal/packaging/dashboard',
      subject: { roles: ['ROLE_ADMIN'], permissions: ['*'] },
      roleFallback: '/dashboard',
    })).toBe('/terminal/packaging/dashboard');
  });

  it('falls back when the return is unsafe or unauthorized', () => {
    expect(resolveLoginDestination({ returnPath: '//evil.example', subject: {}, roleFallback: '/home' })).toBe('/home');
    expect(canAccessLoginReturn('/settings/security', { roles: ['ROLE_PKG_OP'] })).toBe(false);
    expect(canAccessLoginReturn('/settings/security?tab=sessions', { roles: ['ROLE_PKG_OP'] })).toBe(false);
    expect(canAccessLoginReturn('/dashboard', { roles: ['ROLE_PKG_OP'], permissions: ['MENU_PKG_OP:V'] })).toBe(false);
    expect(canAccessLoginReturn('/dashboard', { permissions: ['MENU_DASHBOARD:V'] })).toBe(true);
    expect(resolveLoginDestination({
      returnPath: '/settings/security', subject: { roles: ['ROLE_PKG_OP'] }, roleFallback: '/terminal/packaging/dashboard',
    })).toBe('/terminal/packaging/dashboard');
  });
});

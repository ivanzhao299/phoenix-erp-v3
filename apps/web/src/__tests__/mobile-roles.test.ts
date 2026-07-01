import { describe, it, expect } from 'vitest';
import {
  getAccessLevel,
  canAccess,
  canWrite,
  expandRoles,
  getMobileAccessFromJWT,
  getAccessLevelMulti,
  getMobileAccessLevel,
  canAccessMobile,
  getVisibleMobilePages,
  R,
} from '@/lib/mobile-roles';

/**
 * 安全相关：手机端权限矩阵。
 * 重点验证 fail-closed —— 未知页面 / 缺角色 / 缺权限 一律拒绝（none / false）。
 */

describe('getAccessLevel (single role)', () => {
  it('grants write to a role listed in the page write set', () => {
    // feed.write 含 FARM_MGR
    expect(getAccessLevel('feed', R.FARM_MGR)).toBe('write');
  });

  it('grants read to a role listed only in the page read set', () => {
    // feed.read 含 CEO（不在 write）
    expect(getAccessLevel('feed', R.CEO)).toBe('read');
  });

  it('fail-closed: returns none for a role not in either set', () => {
    expect(getAccessLevel('feed', R.DRIVER)).toBe('none');
  });

  it('fail-closed: returns none for an unknown pageKey', () => {
    expect(getAccessLevel('this_page_does_not_exist', R.ADMIN)).toBe('none');
  });

  it('fail-closed: returns none when role is null/undefined', () => {
    expect(getAccessLevel('feed', null)).toBe('none');
    expect(getAccessLevel('feed', undefined)).toBe('none');
  });
});

describe('canAccess / canWrite helpers', () => {
  it('canAccess is true for both read and write levels', () => {
    expect(canAccess('feed', R.FARM_MGR)).toBe(true); // write
    expect(canAccess('feed', R.CEO)).toBe(true); // read
  });

  it('canAccess is false (fail-closed) for an unlisted role', () => {
    expect(canAccess('feed', R.DRIVER)).toBe(false);
  });

  it('canWrite is true only for write-level, false for read-level', () => {
    expect(canWrite('feed', R.FARM_MGR)).toBe(true);
    expect(canWrite('feed', R.CEO)).toBe(false);
  });
});

describe('expandRoles (alias expansion)', () => {
  it('expands a real DB role code to its canonical matrix alias', () => {
    // ROLE_FARMER -> R.BREEDER
    const expanded = expandRoles(['ROLE_FARMER']);
    expect(expanded).toContain('ROLE_FARMER');
    expect(expanded).toContain(R.BREEDER);
  });

  it('dedupes and drops null/undefined entries', () => {
    const expanded = expandRoles([R.ADMIN, R.ADMIN, null, undefined]);
    expect(expanded.filter((r) => r === R.ADMIN)).toHaveLength(1);
    expect(expanded).not.toContain(null);
  });

  it('leaves a role without an alias unchanged (no phantom entries)', () => {
    expect(expandRoles([R.ADMIN])).toEqual([R.ADMIN]);
  });
});

describe('getAccessLevelMulti (multi-role, highest wins)', () => {
  it('returns the highest level across the user roles', () => {
    // CEO=read on feed, FARM_MGR=write on feed -> write wins
    expect(getAccessLevelMulti('feed', [R.CEO, R.FARM_MGR])).toBe('write');
  });

  it('resolves access via an aliased role even if primary role is unlisted', () => {
    // ROLE_FARMER aliases to BREEDER which has write on feed
    expect(getAccessLevelMulti('feed', ['ROLE_FARMER'])).toBe('write');
  });

  it('fail-closed: none when no role (or alias) matches', () => {
    expect(getAccessLevelMulti('feed', [R.DRIVER, null])).toBe('none');
  });
});

describe('getMobileAccessFromJWT (atomic menu permissions)', () => {
  it('grants write via wildcard "*" (super admin)', () => {
    expect(getMobileAccessFromJWT(['*'], 'feed')).toBe('write');
  });

  it('grants write only when a menu code carries view plus a write action (V + C/E/A)', () => {
    // feed.write menu MENU_FARM_DAILY with V+E action
    expect(getMobileAccessFromJWT(['MENU_FARM_DAILY:V,E'], 'feed')).toBe('write');
  });

  it('fail-closed: write actions without V do not make a mobile page visible', () => {
    expect(getMobileAccessFromJWT(['MENU_FARM_DAILY:E'], 'feed')).toBe('none');
  });

  it('grants read when only a view (V) action is present', () => {
    expect(getMobileAccessFromJWT(['MENU_FARM_DAILY:V'], 'feed')).toBe('read');
  });

  it('honors legacy MOBILE_<PAGEKEY> entries', () => {
    expect(getMobileAccessFromJWT(['MOBILE_FEED:V'], 'feed')).toBe('read');
    expect(getMobileAccessFromJWT(['MOBILE_FEED:V,E'], 'feed')).toBe('write');
    expect(getMobileAccessFromJWT(['MOBILE_FEED:E'], 'feed')).toBe('none');
  });

  it('fail-closed: none for empty / missing permissions', () => {
    expect(getMobileAccessFromJWT([], 'feed')).toBe('none');
    expect(getMobileAccessFromJWT(null, 'feed')).toBe('none');
    expect(getMobileAccessFromJWT(undefined, 'feed')).toBe('none');
  });

  it('fail-closed: none when permissions exist but match no menu for the page', () => {
    expect(getMobileAccessFromJWT(['MENU_UNRELATED:E'], 'feed')).toBe('none');
  });
});

describe('getMobileAccessLevel (unified gate: JWT first, then role matrix)', () => {
  it('JWT permission takes priority over role matrix', () => {
    expect(
      getMobileAccessLevel('feed', { permissions: ['MENU_FARM_DAILY:E'], role: R.DRIVER }),
    ).toBe('none');
    expect(
      getMobileAccessLevel('feed', { permissions: ['MENU_FARM_DAILY:V,E'], role: R.DRIVER }),
    ).toBe('write');
  });

  it('falls back to role matrix when JWT has no entry for the page', () => {
    // permissions present but none relevant to a page without a menu map -> uses role.
    // Use a page mapped in PAGE_MENU_PERMS but with empty/irrelevant perms -> blocked,
    // so instead test the pure role fallback (no permissions provided at all).
    expect(getMobileAccessLevel('feed', { role: R.FARM_MGR })).toBe('write');
  });

  it('fail-closed: when permissions exist but none match a mapped page, deny (do NOT fall through to role)', () => {
    // feed IS in PAGE_MENU_PERMS; non-matching perms => none, role ignored.
    expect(
      getMobileAccessLevel('feed', { permissions: ['MENU_UNRELATED:E'], role: R.FARM_MGR }),
    ).toBe('none');
  });

  it('fail-closed: empty subject yields none', () => {
    expect(getMobileAccessLevel('feed', {})).toBe('none');
  });
});

describe('canAccessMobile + getVisibleMobilePages', () => {
  it('canAccessMobile mirrors a non-none access level', () => {
    expect(canAccessMobile('feed', { role: R.FARM_MGR })).toBe(true);
    expect(canAccessMobile('feed', { role: R.DRIVER })).toBe(false);
  });

  it('getVisibleMobilePages returns only pages the subject can access', () => {
    const pages = getVisibleMobilePages({ role: R.DRIVER });
    // DRIVER can see dashboard (read) and delivery (write) but NOT feed.
    expect(pages).toContain('dashboard');
    expect(pages).toContain('delivery');
    expect(pages).not.toContain('feed');
  });

  it('getVisibleMobilePages is empty for a subject with no roles/perms', () => {
    expect(getVisibleMobilePages({})).toEqual([]);
  });
});

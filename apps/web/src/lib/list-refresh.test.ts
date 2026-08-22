import { describe, expect, it, vi } from 'vitest';
import { saveAndReturn, withRefreshToken, withoutRefreshToken } from './list-refresh';

describe('one-shot list refresh URLs', () => {
  it('adds a refresh token while preserving query and hash', () => {
    expect(withRefreshToken('/settings/users?status=ACTIVE#top', 'abc'))
      .toBe('/settings/users?status=ACTIVE&_refresh=abc#top');
  });

  it('removes only the consumed refresh token', () => {
    expect(withoutRefreshToken('/settings/users?status=ACTIVE&_refresh=abc#top'))
      .toBe('/settings/users?status=ACTIVE#top');
  });

  it('returns with replace so the edit route is not left in history', () => {
    const replace = vi.fn();
    saveAndReturn('/master-data/customers', { replace });
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/master-data\/customers\?_refresh=/));
  });
});

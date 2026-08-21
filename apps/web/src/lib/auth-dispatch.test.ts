import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchAuthExpired } from './auth-dispatch';

describe('dispatchAuthExpired', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('is SSR safe', () => expect(() => dispatchAuthExpired()).not.toThrow());
  it('dispatches reason detail', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string, public init: unknown) {} });
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    dispatchAuthExpired('perms_changed');
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({ type: 'api:auth-expired', init: { detail: { reason: 'perms_changed' } } });
  });
  it('coalesces events during cooldown', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('CustomEvent', class {});
    vi.spyOn(Date, 'now').mockReturnValueOnce(10_000).mockReturnValueOnce(11_000).mockReturnValueOnce(14_000);
    dispatchAuthExpired(); dispatchAuthExpired(); dispatchAuthExpired();
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
  });
});

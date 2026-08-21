import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptic } from './haptic';

describe('haptic', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('is safe without navigator', () => expect(() => haptic()).not.toThrow());
  it.each([
    ['light', 10], ['success', [10, 60, 20]], ['error', [30, 30, 30]], ['warning', [20, 40, 20]],
  ] as const)('vibrates %s pattern', (type, pattern) => {
    const vibrate = vi.fn(); vi.stubGlobal('navigator', { vibrate }); haptic(type); expect(vibrate).toHaveBeenCalledWith(pattern);
  });
  it('swallows browser vibration errors', () => {
    vi.stubGlobal('navigator', { vibrate: () => { throw new Error('denied'); } });
    expect(() => haptic('error')).not.toThrow();
  });
});

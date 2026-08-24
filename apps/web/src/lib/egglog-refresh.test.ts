/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getFlocks } = vi.hoisted(() => ({ getFlocks: vi.fn() }));

vi.mock('./mobile-api', () => ({
  mobileApi: { getFlocks },
}));

import {
  EGGLOG_FOREGROUND_REFRESH_INTERVAL_MS,
  loadEgglogFlocks,
  registerEgglogVisibilityRefresh,
} from './egglog-refresh';

describe('egglog flock refresh', () => {
  beforeEach(() => {
    getFlocks.mockReset();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('loads fresh flocks and preserves house/flock locale sorting', async () => {
    getFlocks.mockResolvedValue({
      data: [
        { flock_no: 'F-2', house_code: 'H-2' },
        { flock_no: 'F-1', house_code: 'H-1' },
      ],
    });

    await expect(loadEgglogFlocks()).resolves.toEqual([
      { flock_no: 'F-1', house_code: 'H-1' },
      { flock_no: 'F-2', house_code: 'H-2' },
    ]);
    expect(getFlocks).toHaveBeenCalledTimes(1);
  });

  it('reloads flocks when the page becomes visible and removes the listener', () => {
    const refreshFlocks = vi.fn();
    const cleanup = registerEgglogVisibilityRefresh({
      refreshFlocks,
      refreshLogs: vi.fn(),
      getLastLogLoadedAt: () => Date.now(),
    });

    document.dispatchEvent(new Event('visibilitychange'));
    expect(refreshFlocks).toHaveBeenCalledTimes(1);

    cleanup();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refreshFlocks).toHaveBeenCalledTimes(1);
  });

  it('throttles repeated visible events within 60 seconds', () => {
    let now = 100_000;
    const refreshFlocks = vi.fn();
    const refreshLogs = vi.fn();
    const cleanup = registerEgglogVisibilityRefresh({
      refreshFlocks,
      refreshLogs,
      getLastLogLoadedAt: () => 0,
      now: () => now,
    });

    document.dispatchEvent(new Event('visibilitychange'));
    now += EGGLOG_FOREGROUND_REFRESH_INTERVAL_MS - 1;
    document.dispatchEvent(new Event('visibilitychange'));

    expect(refreshFlocks).toHaveBeenCalledTimes(1);
    expect(refreshLogs).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('refreshes logs only when their last load is at least 60 seconds old', () => {
    let now = 120_000;
    let lastLogLoadedAt = now - EGGLOG_FOREGROUND_REFRESH_INTERVAL_MS + 1;
    const refreshLogs = vi.fn();
    const cleanup = registerEgglogVisibilityRefresh({
      refreshFlocks: vi.fn(),
      refreshLogs,
      getLastLogLoadedAt: () => lastLogLoadedAt,
      now: () => now,
    });

    document.dispatchEvent(new Event('visibilitychange'));
    expect(refreshLogs).not.toHaveBeenCalled();

    now += EGGLOG_FOREGROUND_REFRESH_INTERVAL_MS;
    lastLogLoadedAt = now - EGGLOG_FOREGROUND_REFRESH_INTERVAL_MS;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refreshLogs).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

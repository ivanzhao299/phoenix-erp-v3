import { describe, it, expect, vi, afterEach } from 'vitest';
import { cachedGet, invalidateBatchLookups, invalidateCache, invalidateCashAccountLookups, TTL } from '@/lib/request-cache';

/**
 * 通用取数缓存：并发去重 + TTL 命中 + 失败不缓存 + 前缀失效。
 * 这是数据正确性关键路径（缓存污染会让用户看到陈旧/错误主数据）。
 */

afterEach(() => {
  invalidateCache(); // 清空全部，隔离用例
  vi.useRealTimers();
});

describe('cachedGet — concurrency dedup', () => {
  it('reuses a single in-flight promise for the same key', async () => {
    let calls = 0;
    const loader = () =>
      new Promise<number>((resolve) => {
        calls++;
        setTimeout(() => resolve(42), 0);
      });

    const [a, b] = await Promise.all([
      cachedGet('dedup-key', 1000, loader),
      cachedGet('dedup-key', 1000, loader),
    ]);

    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(calls).toBe(1); // loader 只跑一次
  });
});

describe('cachedGet — TTL hit', () => {
  it('returns cached value within TTL without re-invoking loader', async () => {
    const loader = vi.fn().mockResolvedValue('v1');
    const first = await cachedGet('ttl-key', 10_000, loader);
    const second = await cachedGet('ttl-key', 10_000, loader);
    expect(first).toBe('v1');
    expect(second).toBe('v1');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('re-invokes loader after the entry expires', async () => {
    vi.useFakeTimers();
    const loader = vi
      .fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new');

    expect(await cachedGet('expire-key', 1000, loader)).toBe('old');
    vi.advanceTimersByTime(1500); // 越过 TTL
    expect(await cachedGet('expire-key', 1000, loader)).toBe('new');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('cachedGet — failure not cached', () => {
  it('does not cache a rejected loader; next call retries', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');

    await expect(cachedGet('fail-key', 10_000, loader)).rejects.toThrow('boom');
    // 失败未污染缓存 → 再次调用应重试并成功
    expect(await cachedGet('fail-key', 10_000, loader)).toBe('ok');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('invalidateCache — prefix matching', () => {
  it('invalidates every cash-account query and no unrelated lookup', async () => {
    const cashCny = vi.fn().mockResolvedValue('cny');
    const cashUsd = vi.fn().mockResolvedValue('usd');
    const customer = vi.fn().mockResolvedValue('customer');
    await cachedGet('lookup:/lookup/cash-accounts?currency=CNY', 10_000, cashCny);
    await cachedGet('lookup:/lookup/cash-accounts?currency=USD&company=C1', 10_000, cashUsd);
    await cachedGet('lookup:/lookup/customers', 10_000, customer);

    invalidateCashAccountLookups();
    await cachedGet('lookup:/lookup/cash-accounts?currency=CNY', 10_000, cashCny);
    await cachedGet('lookup:/lookup/cash-accounts?currency=USD&company=C1', 10_000, cashUsd);
    await cachedGet('lookup:/lookup/customers', 10_000, customer);

    expect(cashCny).toHaveBeenCalledTimes(2);
    expect(cashUsd).toHaveBeenCalledTimes(2);
    expect(customer).toHaveBeenCalledTimes(1);
  });

  it('invalidates batch lookups without evicting other lookups', async () => {
    const batches = vi.fn().mockResolvedValue('batches');
    const warehouses = vi.fn().mockResolvedValue('warehouses');
    await cachedGet('lookup:/lookup/batches', 10_000, batches);
    await cachedGet('lookup:/lookup/warehouses', 10_000, warehouses);
    invalidateBatchLookups();
    await cachedGet('lookup:/lookup/batches', 10_000, batches);
    await cachedGet('lookup:/lookup/warehouses', 10_000, warehouses);
    expect(batches).toHaveBeenCalledTimes(2);
    expect(warehouses).toHaveBeenCalledTimes(1);
  });
  it('invalidates only keys matching the prefix', async () => {
    const dictLoader = vi.fn().mockResolvedValue('dict');
    const lookupLoader = vi.fn().mockResolvedValue('lookup');

    await cachedGet('dict:currency', 10_000, dictLoader);
    await cachedGet('lookup:customer', 10_000, lookupLoader);

    invalidateCache('dict:'); // 只失效 dict 前缀

    await cachedGet('dict:currency', 10_000, dictLoader); // 重新加载
    await cachedGet('lookup:customer', 10_000, lookupLoader); // 仍命中缓存

    expect(dictLoader).toHaveBeenCalledTimes(2);
    expect(lookupLoader).toHaveBeenCalledTimes(1);
  });

  it('exposes sane default TTL constants', () => {
    expect(TTL.dict).toBe(5 * 60_000);
    expect(TTL.brand).toBe(10 * 60_000);
  });

  it('does not let an invalidated in-flight request repopulate a new session cache', async () => {
    let resolveOld!: (value: string) => void;
    const oldLoader = vi.fn(() => new Promise<string>(resolve => { resolveOld = resolve; }));
    const oldRequest = cachedGet('lookup:/lookup/companies', 10_000, oldLoader);

    invalidateCache();
    resolveOld('old-account');
    await expect(oldRequest).resolves.toBe('old-account');

    const newLoader = vi.fn().mockResolvedValue('new-account');
    await expect(cachedGet('lookup:/lookup/companies', 10_000, newLoader)).resolves.toBe('new-account');
    expect(newLoader).toHaveBeenCalledTimes(1);
  });
});

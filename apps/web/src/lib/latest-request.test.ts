import { describe, expect, it } from 'vitest';
import { LatestRequestRunner } from './latest-request';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};

describe('LatestRequestRunner', () => {
  it('does not publish an older request that completes after the latest request', async () => {
    const oldRequest = deferred<string[]>();
    const newRequest = deferred<string[]>();
    const runner = new LatestRequestRunner<string[]>();

    const oldResult = runner.run(() => oldRequest.promise);
    const newResult = runner.run(() => newRequest.promise);
    newRequest.resolve(['new']);
    await expect(newResult).resolves.toEqual(['new']);
    oldRequest.resolve(['old']);
    await expect(oldResult).resolves.toEqual(['new']);
  });

  it('aborts the previous request when a newer request starts', () => {
    const runner = new LatestRequestRunner<never>();
    let oldSignal: AbortSignal | undefined;
    runner.run(signal => { oldSignal = signal; return new Promise(() => {}); });
    runner.run(() => new Promise(() => {}));
    expect(oldSignal?.aborted).toBe(true);
  });
});

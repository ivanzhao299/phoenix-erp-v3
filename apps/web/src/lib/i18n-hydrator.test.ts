import { describe, expect, it } from 'vitest';
import { resolveHydrationValue } from './i18n-hydrator';

const translate = (source: string) => `lo:${source}`;

describe('resolveHydrationValue', () => {
  it('uses a new Chinese React value as the latest source in a non-Chinese language', () => {
    expect(resolveHydrationValue('300羽', '150羽', 'lo', translate)).toEqual({
      source: '300羽',
      output: 'lo:300羽',
    });
  });

  it('restores the latest source when switching back to Chinese', () => {
    expect(resolveHydrationValue('lo:300羽', '300羽', 'zh', translate, true)).toEqual({
      source: '300羽',
      output: '300羽',
    });
  });

  it('does not mistake a hydrator-written translation containing Chinese for a new source', () => {
    expect(resolveHydrationValue('译文300羽', '300羽', 'lo', translate, true)).toEqual({
      source: '300羽',
      output: 'lo:300羽',
    });
  });

  it('captures a newly inserted Chinese node on its first observation', () => {
    expect(resolveHydrationValue('共 2 条', undefined, 'en', source => `translated:${source}`)).toEqual({
      source: '共 2 条',
      output: 'translated:共 2 条',
    });
  });

  it('leaves an unknown non-Chinese value untouched', () => {
    expect(resolveHydrationValue('300 birds', undefined, 'en', translate)).toEqual({
      output: '300 birds',
    });
  });
});

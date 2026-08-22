export type HydrationDecision = {
  source?: string;
  output: string;
};

const HAS_CHINESE = /[\u4e00-\u9fff]/;

/**
 * Resolve one hydrator observation without depending on the DOM.
 *
 * A Chinese value written by React is always the newest source, regardless of
 * the active language. A value written by the hydrator itself must not replace
 * that source, because translated strings can still contain Chinese glyphs.
 */
export function resolveHydrationValue(
  current: string,
  storedSource: string | undefined,
  lang: string,
  translate: (source: string) => string,
  isHydratorWrite = false,
): HydrationDecision {
  const source = !isHydratorWrite && HAS_CHINESE.test(current)
    ? current
    : storedSource;

  if (!source) return { output: current };
  return {
    source,
    output: lang === 'zh' ? source : translate(source),
  };
}

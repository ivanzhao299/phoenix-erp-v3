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
  const currentHasChinese = HAS_CHINESE.test(current);
  const source = !isHydratorWrite && currentHasChinese ? current : storedSource;

  // In a non-Chinese locale, a non-Chinese React value is already localized.
  // The hydrator must not replace it with a translation of an older Chinese
  // source. Hydrator-authored values are also final for this observation,
  // including target-language strings which still contain Chinese glyphs.
  if (lang !== 'zh' && (isHydratorWrite || !currentHasChinese)) {
    return source === undefined ? { output: current } : { source, output: current };
  }

  if (!source) return { output: current };
  return {
    source,
    output: lang === 'zh' ? source : translate(source),
  };
}

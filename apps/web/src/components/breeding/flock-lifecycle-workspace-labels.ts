import { useLanguage } from '@/contexts/LanguageContext';

export function useLifecycleLabels() {
  const { lang, t } = useLanguage();
  const label = (key: string, values?: Record<string, string | number>) => {
    const value = t(`breeding.lifecycleWorkspace.${key}`, key);
    return values ? value.replace(/\{(\w+)\}/g, (match, token) => String(values[token] ?? match)) : value;
  };
  const blockerLabel = (code: string) => {
    const fallback = code.startsWith('FLOCK_HOUSE_ENTRY_') ? label('FLOCK_HOUSE_ENTRY_NOT_READY') : label('blockerFallback');
    return t(`breeding.lifecycleWorkspace.${code}`, fallback);
  };
  return { label, blockerLabel, locale: lang === 'en' ? 'en-SG' : lang === 'lo' ? 'lo-LA' : 'zh-CN' };
}

'use client';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ProductGrade } from '@/hooks/useProductGrades';
import { gradeQuantities, reportGradeColumns } from '@/lib/daily-report-export';

export function useDailyGradeLabel() {
  const { t, lang } = useLanguage();
  return (code: string, grade?: ProductGrade) => {
    const translated = grade as unknown as Record<string, unknown> | undefined;
    if (lang === 'zh' && grade?.grade_name) return grade.grade_name;
    return (lang !== 'zh' && translated?.[`grade_name_${lang}`] as string)
      || t(`breeding.daily.grade.${code}`, grade?.grade_name || code);
  };
}

export function DailyGradeDetails({ value, grades }: { value: unknown; grades: ProductGrade[] }) {
  const { t } = useLanguage();
  const label = useDailyGradeLabel();
  const quantities = gradeQuantities(value);
  return <dl aria-label={t('breeding.daily.gradeDetails', '九档分级明细')} style={{ display: 'grid', gridTemplateColumns: 'max-content max-content', gap: '2px 12px', margin: 0, minWidth: 140 }}>
    {reportGradeColumns(grades, [value]).map(({ code, grade }) => <div key={code} style={{ display: 'contents' }}>
      <dt title={code}>{label(code, grade)}</dt><dd style={{ margin: 0 }} title={quantities[code] == null ? t('breeding.daily.gradeMissing', '未记录') : undefined}>{quantities[code] ?? '—'}</dd>
    </div>)}
  </dl>;
}

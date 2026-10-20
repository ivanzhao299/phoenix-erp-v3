/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DailyGradeDetails } from '@/components/breeding/DailyGradeDetails';
import type { ProductGrade } from '@/hooks/useProductGrades';
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ lang: 'lo', t: (_key: string, fallback: string) => fallback }) }));
it('distinguishes missing from explicit zero and preserves localized master names and legacy codes', async () => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const grades = [{ grade_code: 'GRADE_1', grade_name: '1号蛋', grade_name_lo: 'ໄຂ່ເບີ 1' }, { grade_code: 'GRADE_2', grade_name: '2号蛋' }] as ProductGrade[];
  await act(async () => root.render(<DailyGradeDetails grades={grades} value={{ GRADE_1: 0, OLD_CODE: 12 }} />));
  expect([...host.querySelectorAll('dd')].map(n => n.textContent)).toEqual(['0', '—', '12']);
  expect(host.textContent).toContain('ໄຂ່ເບີ 1'); expect(host.textContent).toContain('OLD_CODE');
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});

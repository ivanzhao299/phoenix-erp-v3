'use client';
import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { ModalV2 } from '@/components/design-system/dialogs/ModalV2';
import { secondaryActionButton, primaryActionButton } from '@/components/design-system/cockpit-styles';
import type { ProductGrade } from '@/hooks/useProductGrades';
import request from '@/lib/api-client';
import { dailyReportsCsv, fetchDailyExport, localDateOnly, reportGradeColumns, type DailyExportRow } from '@/lib/daily-report-export';
import { useDailyGradeLabel } from './DailyGradeDetails';

export function DailyReportExport({ grades }: { grades: ProductGrade[] }) {
  const { canExport } = usePermission('MENU_FARM_DAILY');
  const { t } = useLanguage();
  const toast = useToast();
  const label = useDailyGradeLabel();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(localDateOnly);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const close = () => { controller.current?.abort(); controller.current = null; setOpen(false); };
  if (!canExport) return null;

  const exportReports = async () => {
    if (!date || busy) return;
    setBusy(true); setError(''); setCount(0);
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 120000);
    try {
      // Export scope is all authorized houses on this date, independent of the entry form.
      const rows = await fetchDailyExport(date, '', async query => {
        const response = await request<{ data: DailyExportRow[] } | DailyExportRow[]>(`/crud/brd_daily_logs/export?${query}`, { cache: 'no-store', signal: abort.signal, silent: true });
        return Array.isArray(response) ? response : response.data;
      }, setCount);
      if (!rows.length) { setError(t('breeding.daily.exportEmpty', '所选日期没有可导出的日报')); return; }
      const fields = [
        ['log_date', 'common.date', '日期'], ['farm_code', 'ui.农场', '农场'], ['house_code', 'ui.鸡舍', '鸡舍'],
        ['shift', 'ui.班次', '班次'], ['eggs_produced', 'ui.产蛋数', '产蛋数'],
        ['dirty_eggs', 'ui.脏蛋', '脏蛋'], ['broken_eggs', 'ui.破损蛋', '破损蛋'],
        ['mortality_qty', 'ui.死亡', '死亡'], ['mortality_reason', 'ui.死亡原因', '死亡原因'],
        ['elimination_qty', 'ui.淘汰数', '淘汰数'], ['culling_reason', 'ui.淘汰原因', '淘汰原因'],
        ['feed_consumed', 'ui.饲料kg', '饲料kg'], ['water_consumed', 'ui.用水L', '用水L'],
        ['self_use_qty', 'ui.自用蛋(枚)', '自用蛋(枚)'], ['temp', 'ui.温度', '温度'], ['humidity', 'ui.湿度', '湿度'], ['note', 'common.remark', '备注'],
      ].map(([key, translation, fallback]) => ({ key, label: t(translation, fallback) }));
      const gradeFields = reportGradeColumns(grades, rows.map(row => row.eggs_by_grade)).map(({ code, grade }) => ({ key: `grade:${code}`, label: `${label(code, grade)} (${code})` }));
      const csv = dailyReportsCsv(rows, [...fields, ...gradeFields]);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `daily-report_${date}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${t('breeding.daily.exportSuccess', '已导出日报条数')}：${rows.length}`);
      setOpen(false);
    } catch (err) {
      if (!open || (abort.signal.aborted && controller.current !== abort)) return;
      const code = err instanceof Error ? err.message : '';
      setError(t(code === 'EXPORT_TOO_LARGE' ? 'breeding.daily.exportTooLarge'
        : code === 'EXPORT_CHANGED' ? 'breeding.daily.exportChanged'
        : abort.signal.aborted ? 'breeding.daily.exportTimeout' : 'breeding.daily.exportFailed',
      '导出失败，请重试'));
    } finally { clearTimeout(timeout); setBusy(false); }
  };

  return <>
    <button type="button" style={secondaryActionButton} onClick={() => { setError(''); setOpen(true); }}><Download size={14} />{t('ui.导出报表', '导出报表')}</button>
    <ModalV2 open={open} title={t('breeding.daily.exportTitle', '导出已保存的日报')} onClose={close} footer={<>
      <button type="button" style={secondaryActionButton} onClick={close}>{t('common.cancel', '取消')}</button>
      <button type="button" style={primaryActionButton} disabled={busy || !date} onClick={exportReports}>{busy ? `${t('breeding.daily.exportLoading', '正在读取日报')} (${count})` : t('ui.导出报表', '导出报表')}</button>
    </>}>
      <p>{t('breeding.daily.exportScope', '导出所选日期所有有权查看的鸡舍日报（最多 20,000 条）；与录入表单的鸡舍选择无关。')}</p>
      <label>{t('common.date', '日期')}<input aria-label={t('common.date', '日期')} type="date" value={date} disabled={busy} required onChange={event => setDate(event.target.value)} /></label>
      <p>{t('breeding.daily.gradeMissingHint', '未记录的等级显示为 —，导出留空；不会根据产蛋总数推算。')}</p>
      {error && <p role="alert" style={{ color: 'var(--status-danger)' }}>{error}</p>}
    </ModalV2>
  </>;
}

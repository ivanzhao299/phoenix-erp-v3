'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useProductGrades } from '@/hooks/useProductGrades';
import { packingIdentity } from '@/lib/packing-history-api';

type HandoverState = 'PENDING' | 'COMMITTED' | 'HANDOVER_ONLY' | 'INVENTORY_ONLY';
type EvidenceQuality = 'VERIFIED' | 'UNKNOWN';

interface SummaryRecord {
  code: string;
  shiftId: string;
  shiftDate: string;
  productionDate: string;
  totalEggs: number;
  totalBoxes: number;
  inventoryMode: 'PACKAGING_INBOUND' | 'TEMP_PRODUCTION_INBOUND';
  handoverEligible: boolean;
  handover: {
    state: HandoverState;
    quality: EvidenceQuality;
    issues: string[];
  };
}

export interface SummaryResult {
  basis: string;
  aggregation: 'DAY' | 'SHIFT';
  shiftId: string | null;
  dateFrom: string;
  dateTo: string;
  totalEggs: number;
  totalBoxes: number;
  shiftPackedEggs?: number;
  gradingOutputs?: Record<string, number> | null;
  committedBoxes: number;
  voidCount: number;
  shiftIds: string[];
  unassigned: { state: string; count: number | null; message: string };
  days: Array<{ date: string; totalEggs: number; totalBoxes: number }>;
  records: SummaryRecord[];
}

type ReportError = 'FORBIDDEN' | 'SESSION' | 'UNAVAILABLE';
type ReportState = { key: string; result: SummaryResult | null; error: ReportError | null };
type ShiftState = { key: string; result: SummaryResult | null; error: ReportError | null };

function singaporeToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
}

function offsetDate(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function dayQuery(date: string, days = 1) {
  const start = offsetDate(date, -(days - 1));
  return new URLSearchParams({ dateFrom: start, dateTo: date, aggregation: 'DAY' }).toString();
}

async function loadSummary(query: string, signal: AbortSignal): Promise<SummaryResult> {
  const token = typeof window === 'undefined'
    ? ''
    : sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
  const response = await fetch(`/api/packaging/terminal/reports/production-summary?${query}`, {
    cache: 'no-store',
    signal,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 403) throw 'FORBIDDEN' satisfies ReportError;
  if (response.status === 401) throw 'SESSION' satisfies ReportError;
  if (!response.ok) throw 'UNAVAILABLE' satisfies ReportError;
  const body = await response.json();
  if (body?.code !== 200 || !body.data || !Array.isArray(body.data.records)) throw 'UNAVAILABLE' satisfies ReportError;
  return body.data as SummaryResult;
}

function errorKind(error: unknown): ReportError {
  return error === 'FORBIDDEN' || error === 'SESSION' ? error : 'UNAVAILABLE';
}

export default function PackingProductionReport(props: { historyPath?: string }) {
  const { user } = useAuth();
  const identity = packingIdentity(user);
  return <PackingProductionReportView key={identity} identity={identity} historyPath={props.historyPath} />;
}

function PackingProductionReportView({ identity, historyPath = '/packaging/history' }: { identity: string; historyPath?: string }) {
  const { t } = useLanguage();
  const { grades: productGrades } = useProductGrades();
  const [date, setDate] = useState(singaporeToday);
  const [query, setQuery] = useState(() => dayQuery(singaporeToday()));
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [reportState, setReportState] = useState<ReportState>({ key: '', result: null, error: null });
  const [selectedShift, setSelectedShift] = useState<{ id: string; date: string } | null>(null);
  const [shiftQuery, setShiftQuery] = useState('');
  const [detailLimit, setDetailLimit] = useState(50);
  const [shiftRefreshVersion, setShiftRefreshVersion] = useState(0);
  const [shiftState, setShiftState] = useState<ShiftState>({ key: '', result: null, error: null });
  const reportKey = JSON.stringify([identity, query, refreshVersion]);
  const shiftKey = JSON.stringify([identity, shiftQuery, shiftRefreshVersion]);
  const report = reportState.key === reportKey ? reportState.result : null;
  const reportError = reportState.key === reportKey ? reportState.error : null;
  const shiftReport = shiftState.key === shiftKey ? shiftState.result : null;
  const shiftError = shiftState.key === shiftKey ? shiftState.error : null;
  const reportLoading = !!identity && !!query && !report && !reportError;
  const shiftLoading = !!shiftQuery && !shiftReport && !shiftError;

  useEffect(() => {
    if (!identity || !query) return;
    const controller = new AbortController();
    loadSummary(query, controller.signal)
      .then(result => setReportState({ key: reportKey, result, error: null }))
      .catch(error => {
        if (!controller.signal.aborted) setReportState({ key: reportKey, result: null, error: errorKind(error) });
      });
    return () => controller.abort();
  }, [identity, query, reportKey]);

  useEffect(() => {
    if (!identity || !shiftQuery) return;
    const controller = new AbortController();
    loadSummary(shiftQuery, controller.signal)
      .then(result => setShiftState({ key: shiftKey, result, error: null }))
      .catch(error => {
        if (!controller.signal.aborted) setShiftState({ key: shiftKey, result: null, error: errorKind(error) });
      });
    return () => controller.abort();
  }, [identity, shiftQuery, shiftKey]);

  const queryDay = (event: FormEvent) => {
    event.preventDefault();
    setSelectedShift(null);
    setShiftQuery('');
    setDetailLimit(50);
    setQuery(dayQuery(date));
    setRefreshVersion(value => value + 1);
  };
  const queryWeek = () => {
    setSelectedShift(null);
    setShiftQuery('');
    setDetailLimit(50);
    setQuery(dayQuery(date, 7));
    setRefreshVersion(value => value + 1);
  };
  const retry = () => setRefreshVersion(value => value + 1);
  const viewShift = (record: SummaryRecord) => {
    const next = new URLSearchParams({
      dateFrom: record.shiftDate,
      dateTo: record.shiftDate,
      aggregation: 'SHIFT',
      shiftId: record.shiftId,
    }).toString();
    setSelectedShift({ id: record.shiftId, date: record.shiftDate });
    setShiftQuery(next);
  };

  const records = report?.records ?? [];
  const visibleRecords = records.slice(0, detailLimit);
  const pending = records.filter(record => record.handoverEligible
    && record.handover.state === 'PENDING' && record.handover.quality === 'VERIFIED');
  const heldRoute = records.filter(record => !record.handoverEligible && record.handover.state === 'PENDING');
  const review = records.filter(record => record.handover.state === 'HANDOVER_ONLY'
    || record.handover.state === 'INVENTORY_ONLY'
    || (record.handoverEligible && record.handover.quality === 'UNKNOWN'));
  const pendingBoxes = pending.reduce((sum, record) => sum + record.totalBoxes, 0);
  const exactShiftAvailable = !!selectedShift && records.some(record =>
    record.shiftId === selectedShift.id && record.shiftDate === selectedShift.date);

  const reportErrorText = reportError === 'FORBIDDEN'
    ? t('packaging.report.forbidden', '当前账号无权查看包装生产统计')
    : reportError === 'SESSION'
      ? t('packaging.report.sessionExpired', '登录已失效，请重新登录后查看')
      : t('packaging.report.loadFailed', '包装统计暂不可用，请重试');
  const evidenceLabel = (value: string) => value === 'VERIFIED'
    ? t('packaging.report.quality.VERIFIED', '已核实')
    : t('packaging.report.quality.UNKNOWN', '待核');
  const stateLabel = (record: SummaryRecord) => !record.handoverEligible
    && record.handover.state === 'PENDING'
    ? t('packaging.report.status.HELD', '原入库路径或切换管控待核，不按包装交库处理')
    : t(`packaging.report.status.${record.handover.state}`, record.handover.state);
  const modeLabel = (value: SummaryRecord['inventoryMode']) => t(`packaging.report.mode.${value}`, value);

  return (
    <section aria-label={t('packaging.report.title', '包装生产日报')} style={{
      background: 'var(--bg-card, #fff)',
      border: '1px solid var(--border, #e5e7eb)',
      borderRadius: 14,
      padding: 18,
      margin: '16px 0',
      display: 'grid',
      gap: 14,
    }}>
      <header>
        <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>
          {t('packaging.report.title', '包装生产日报')}
        </h2>
        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
          {t('packaging.report.instructions', '按包装原单的生产日和原班次统计，交库状态单独显示。')}
        </p>
      </header>

      <form onSubmit={queryDay} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
          {t('packaging.report.productionDate', '原生产日')}
          <input type="date" value={date} onChange={event => setDate(event.target.value)} style={{ minHeight: 38 }} />
        </label>
        <button type="submit" disabled={reportLoading || !date} style={{ padding: '9px 14px' }}>
          {t('packaging.report.load', '查询')}
        </button>
        <button type="button" onClick={queryWeek} disabled={reportLoading || !date} style={{ padding: '9px 14px' }}>
          {t('packaging.report.last7Days', '近七日')}
        </button>
        <button type="button" onClick={retry} disabled={reportLoading || !query} style={{ padding: '9px 14px' }}>
          {t('packaging.report.refresh', '刷新')}
        </button>
      </form>

      {reportLoading && <p role="status" style={{ margin: 0 }}>{t('packaging.report.loading', '查询中…')}</p>}
      {reportError && <div role="alert" style={{ color: 'var(--status-danger, #b91c1c)' }}>
        {reportErrorText} <button type="button" onClick={retry}>{t('packaging.report.retry', '重试')}</button>
      </div>}

      {report && <>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12 }}>
          {t('packaging.report.sourceBasis', '数据口径：包装原单')}
          {' · '}{report.dateFrom} – {report.dateTo}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 10 }}>
          {[
            [t('packaging.report.packagedEggs', '包装原单枚数'), report.totalEggs.toLocaleString(), t('ui.枚', '枚')],
            [t('packaging.report.packagedBoxes', '包装箱数'), report.totalBoxes.toLocaleString(), t('ui.箱', '箱')],
            [t('packaging.report.committedBoxes', '已交库箱数'), report.committedBoxes.toLocaleString(), t('ui.箱', '箱')],
            [t('packaging.report.pendingBoxes', '待交库箱数'), pendingBoxes.toLocaleString(), t('ui.箱', '箱')],
            [t('packaging.report.heldRoute', '入账路径待核原单'), heldRoute.length.toLocaleString(), t('ui.个', '个')],
            [t('packaging.report.reviewCount', '待核原单'), review.length.toLocaleString(), t('ui.个', '个')],
            [t('packaging.report.voidCount', '作废包装单'), report.voidCount.toLocaleString(), t('ui.个', '个')],
          ].map(([label, value, unit]) => (
            <div key={String(label)} style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</div>
              <strong style={{ display: 'block', marginTop: 4, fontSize: 22 }}>{value}</strong>
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{unit}</span>
            </div>
          ))}
        </div>

        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12 }}>
          {t('packaging.report.unassigned', '无法归属的历史数量不推断为零')}
        </p>

        {report.gradingOutputs != null && (
          <section aria-label={t('packaging.report.gradingOutput', '分级产出')} style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 12 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>{t('packaging.report.gradingOutput', '分级产出')}</h3>
            <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: 12 }}>
              {t('packaging.report.shiftPackedEggs', '包装原单枚数')}：{(report.shiftPackedEggs ?? report.totalEggs).toLocaleString()}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
              {productGrades.map(grade => <div key={grade.grade_code}>
                <span>{grade.grade_name || grade.grade_code}</span>{'：'}<strong>{Number(report.gradingOutputs?.[grade.grade_code] ?? 0).toLocaleString()}</strong>{' '}{t('ui.枚', '枚')}
              </div>)}
            </div>
          </section>
        )}

        {report.days.length > 1 && <div style={{ overflowX: 'auto' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>{t('packaging.report.dailyTotals', '按原生产日统计')}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead><tr>
              <th>{t('packaging.report.productionDate', '原生产日')}</th>
              <th>{t('packaging.report.packagedEggs', '包装原单枚数')}</th>
              <th>{t('packaging.report.packagedBoxes', '包装箱数')}</th>
            </tr></thead>
            <tbody>{report.days.map(day => <tr key={day.date}>
              <td>{day.date}</td><td>{day.totalEggs.toLocaleString()}</td><td>{day.totalBoxes.toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
        </div>}

        <div style={{ overflowX: 'auto' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>{t('packaging.report.originals', '原包装单明细')}</h3>
          {records.length === 0
            ? <p style={{ color: 'var(--text-secondary)' }}>{t('packaging.report.empty', '此日期无包装原单')}</p>
            : <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 760 }}>
              <thead><tr>
                <th>{t('packaging.report.code', '原单号')}</th>
                <th>{t('packaging.report.productionDate', '原生产日')}</th>
                <th>{t('packaging.report.shiftDate', '班次日')}</th>
                <th>{t('packaging.report.shift', '原班次')}</th>
                <th>{t('packaging.report.packagedEggs', '枚数')}</th>
                <th>{t('packaging.report.packagedBoxes', '箱数')}</th>
                <th>{t('packaging.report.state', '交库状态')}</th>
                <th>{t('packaging.report.mode', '当前库存来源模式')}</th>
                <th>{t('packaging.report.quality', '凭据核验')}</th>
                <th />
              </tr></thead>
              <tbody>{visibleRecords.map(record => <tr key={record.code}>
                <td><Link href={`${historyPath}/${encodeURIComponent(record.code)}`}>{record.code}</Link></td>
                <td>{record.productionDate}</td><td>{record.shiftDate}</td><td>{record.shiftId}</td>
                <td>{record.totalEggs.toLocaleString()}</td><td>{record.totalBoxes.toLocaleString()}</td>
                <td>{stateLabel(record)}</td><td>{modeLabel(record.inventoryMode)}</td>
                <td>{evidenceLabel(record.handover.quality)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => viewShift(record)}>{t('packaging.report.exactShift', '班次明细')}</button>
                </td>
              </tr>)}</tbody>
            </table>}
          {records.length > visibleRecords.length && <button type="button" onClick={() => setDetailLimit(limit => limit + 50)}>
            {t('terminal.queueLoadMore', '加载更多')} ({visibleRecords.length}/{records.length})
          </button>}
        </div>
      </>}

      {exactShiftAvailable && <>
        <div style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: 12 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>
            {t('packaging.report.exactShift', '班次明细')} · {selectedShift.date} · {selectedShift.id}
          </h3>
          {shiftLoading && <p role="status">{t('packaging.report.loading', '查询中…')}</p>}
          {shiftError && <p role="alert" style={{ color: 'var(--status-danger, #b91c1c)' }}>
            {shiftError === 'FORBIDDEN'
              ? t('packaging.report.forbidden', '当前账号无权查看包装生产统计')
              : shiftError === 'SESSION'
                ? t('packaging.report.sessionExpired', '登录已失效，请重新登录后查看')
                : t('packaging.report.loadFailed', '包装统计暂不可用，请重试')}
            {' '}<button type="button" onClick={() => setShiftRefreshVersion(value => value + 1)}>{t('packaging.report.retry', '重试')}</button>
          </p>}
          {shiftReport && <p style={{ margin: 0 }}>
            {t('packaging.report.packagedEggs', '包装原单枚数')} {shiftReport.totalEggs.toLocaleString()} {t('ui.枚', '枚')}
            {' · '}{t('packaging.report.packagedBoxes', '包装箱数')} {shiftReport.totalBoxes.toLocaleString()} {t('ui.箱', '箱')}
            {' · '}{t('packaging.report.committedBoxes', '已交库箱数')} {shiftReport.committedBoxes.toLocaleString()} {t('ui.箱', '箱')}
          </p>}
        </div>
      </>}
    </section>
  );
}

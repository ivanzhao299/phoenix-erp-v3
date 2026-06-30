'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { RefreshCw, BookOpen } from 'lucide-react';
import {
  inputField, kpiCard, tableContainer,
} from '@/components/design-system/cockpit-styles';
import { currencySymbol } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * 应收总账（G41）— 刘杰（集团财务总监）
 * 按场 / 期间查看往来单位的期初 / 本期应收 / 本期已收 / 期末余额，含本币折算。
 * 只读；数据来源 fin_ar_ledger（导入，OCR 待核对项会标注）。
 */

interface Row {
  id: string; farmCode: string; farmName: string;
  counterpartyCode: string | null; counterpartyName: string;
  periodDate: string; currencyCode: string;
  openingAmount: string; periodCharge: string; periodReceived: string;
  closingAmount: string; closingAmountBase: string | null; baseCurrency: string;
  source: string;
}
interface Totals {
  openingAmount: string; periodCharge: string; periodReceived: string;
  closingAmount: string; closingAmountBase: string; rowCount: number;
}

const fmt = (v: string | number | null) =>
  v == null || v === '' ? '—'
    : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// 金额带币种符号（凡有资金必带货币单位，避免看错币种）
const money = (v: string | number | null, code?: string | null) =>
  v == null || v === '' ? '—' : `${currencySymbol(code)}${fmt(v)}`;

export default function ArLedgerPage() {
  const { t } = useLanguage();
  const [farms, setFarms] = useState<{ farmCode: string; farmName: string }[]>([]);
  const [periods, setPeriods] = useState<{ periodDate: string }[]>([]);
  const [farmCode, setFarmCode] = useState('');
  const [periodDate, setPeriodDate] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    request<{ farms: any[]; periods: any[] }>('/v2/finance/ar-ledger/dimensions')
      .then(d => { setFarms(d.farms || []); setPeriods(d.periods || []); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (farmCode) qs.set('farmCode', farmCode);
      if (periodDate) qs.set('periodDate', periodDate);
      const d = await request<{ rows: Row[]; totals: Totals }>(`/v2/finance/ar-ledger${qs.toString() ? `?${qs}` : ''}`);
      setRows(d.rows || []); setTotals(d.totals || null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t('fin2.common.load_failed', '加载失败')); }
    finally { setLoading(false); }
  }, [farmCode, periodDate]);

  useEffect(() => { load(); }, [load]);

  const pendingCount = rows.filter(r => r.source === 'OCR_PENDING_VERIFY').length;

  return (
    <div className="animate-fade-in" style={{ padding: '24px 32px' }}>
      <PageHeader title={t('fin2.arledger.page_title', '应收总账')} subtitle={t('fin2.arledger.page_subtitle', '集团应收往来余额台账 · 期初 / 本期应收 / 本期已收 / 期末')} breadcrumb={[t('fin2.common.finance_mgmt', '财务管理'), t('fin2.arledger.breadcrumb', '应收总账')]} />

      {/* 筛选 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 0 16px', flexWrap: 'wrap' }}>
        <select value={farmCode} onChange={e => setFarmCode(e.target.value)} style={{ ...inputField, width: 'auto', minWidth: 160 }}>
          <option value="">{t('fin2.arledger.all_farms', '全部场')}</option>
          {farms.map(f => <option key={f.farmCode} value={f.farmCode}>{f.farmName}</option>)}
        </select>
        <select value={periodDate} onChange={e => setPeriodDate(e.target.value)} style={{ ...inputField, width: 'auto', minWidth: 160 }}>
          <option value="">{t('fin2.arledger.all_periods', '全部期间')}</option>
          {periods.map(p => <option key={p.periodDate} value={p.periodDate}>{p.periodDate}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="bg-bg-muted border border-border text-text-muted"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {t('fin2.common.refresh', '刷新')}
        </button>
      </div>

      {pendingCount > 0 && (
        <div style={{ padding: '8px 14px', borderRadius: 8, marginBottom: 14, fontSize: 12.5,
          background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', color: 'var(--status-warning)' }}>
          ⚠️ {t('fin2.arledger.ocr_warn_1', '本页')} {pendingCount} {t('fin2.arledger.ocr_warn_2', '行来自图片识别（OCR），状态「待核对」——金额请以财务核对为准，核对后由财务确认转正式账。')}
        </div>
      )}
      {error && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger-border)', color: 'var(--status-danger)', fontSize: 13 }}>{error}</div>}

      {/* 合计 KPI（明细表配汇总） */}
      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
          {([
            { label: t('fin2.arledger.kpi_opening', '期初余额合计'), v: totals.openingAmount, mixed: true },
            { label: t('fin2.arledger.kpi_charge', '本期应收合计'), v: totals.periodCharge, mixed: true },
            { label: t('fin2.arledger.kpi_received', '本期已收合计'), v: totals.periodReceived, mixed: true },
            { label: t('fin2.arledger.kpi_closing', '期末余额合计'), v: totals.closingAmount, mixed: true },
            { label: t('fin2.arledger.kpi_closing_base', '期末本币合计'), v: totals.closingAmountBase, cny: true },
          ] as { label: string; v: string; mixed?: boolean; cny?: boolean }[]).map(k => (
            <div key={k.label} style={{ ...kpiCard, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                {k.label}
                {k.mixed && <span title={t('fin2.arledger.mixed_tip', '多币种原币相加，仅作参考，不可直接比较')} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--bg-muted)', color: 'var(--text-disabled)', whiteSpace: 'nowrap' }}>{t('fin2.arledger.badge_mixed', '原币混合')}</span>}
                {k.cny && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--status-success-bg-light)', color: 'var(--status-success)', whiteSpace: 'nowrap' }}>{t('fin2.arledger.badge_base', '本币·可比')}</span>}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{k.cny ? currencySymbol('CNY') : ''}{fmt(k.v)}</div>
            </div>
          ))}
        </div>
      )}

      {/* 明细表 */}
      <div style={{ ...tableContainer, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
              {[['farm', '场'], ['cp_code', '往来单位编码'], ['cp_name', '结算往来单位 / 客户'], ['period', '期间'], ['currency', '币种'], ['opening', '期初余额'], ['charge', '本期应收'], ['received', '本期已收'], ['closing', '期末余额'], ['closing_base', '期末本币(CNY)']].map(([k, h], i) => (
                <th key={k} style={{ padding: '10px 12px', textAlign: i >= 5 ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{t(`fin2.arledger.col_${k}`, h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: 28, textAlign: 'center', color: 'var(--text-dim)' }}>{t('fin2.common.loading', '加载中…')}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 28, textAlign: 'center', color: 'var(--text-dim)' }}>{t('fin2.arledger.empty', '暂无应收总账数据')}</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{r.farmName}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{r.counterpartyCode ?? '—'}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{r.counterpartyName}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{r.periodDate}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{r.currencyCode}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.openingAmount, r.currencyCode)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: Number(r.periodCharge) ? 'var(--status-info, #2563eb)' : undefined }}>{money(r.periodCharge, r.currencyCode)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: Number(r.periodReceived) ? 'var(--status-success, #16a34a)' : undefined }}>{money(r.periodReceived, r.currencyCode)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(r.closingAmount, r.currencyCode)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{money(r.closingAmountBase, "CNY")}</td>
              </tr>
            ))}
          </tbody>
          {totals && rows.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--bg-muted)', fontWeight: 700 }}>
                <td colSpan={5} style={{ padding: '10px 12px' }}>{t('fin2.arledger.total_label', '合计')}（{totals.rowCount} {t('fin2.arledger.rows_unit', '行')}）</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.openingAmount)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.periodCharge)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.periodReceived)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.closingAmount)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(totals.closingAmountBase, "CNY")}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

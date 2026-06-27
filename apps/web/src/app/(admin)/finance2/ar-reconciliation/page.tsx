'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { RefreshCw, Scale, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';

/**
 * g199-C AR 三方对账视图
 *   业务侧 fin_ar_invoices ↔ ERP fin_ar_ledger ↔ 好业财 chanjet_ar_snapshot
 *   维度:公司 + 客户 + 期间
 *   差异行飘红 + 差异原因 chip
 *
 * 权限:MENU_FIN2_AR_LEDGER:V(同总账)
 */

interface ReconRow {
  companyCode: string;
  customerKey: string;
  customerCode: string | null;
  customerName: string;
  invoiceBalance: number;
  invoiceCount: number;
  ledgerClosing: number;
  ledgerSource: string | null;
  chanjetEndbalance: number;
  deltaInvLedger: number;
  deltaInvChanjet: number;
  deltaLedgerChanjet: number;
  diffReason: string[];
  status: 'OK' | 'WARN' | 'MISMATCH';
}

interface ReconResp {
  success: boolean;
  companyCode?: string;
  periodDate?: string;
  rows?: ReconRow[];
  totals?: { invoiceBalance: number; ledgerClosing: number; chanjetEndbalance: number };
  counts?: { ok: number; warn: number; mismatch: number };
  error?: string;
}

interface DimResp {
  companies: Array<{ code: string; name: string }>;
  periods: string[];
}

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 当前月初(YYYY-MM-01)作默认期间
const todayMonthStart = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
})();

export default function ArReconciliationPage() {
  const { canView } = usePermission('MENU_FIN2_AR_LEDGER');

  const [companies, setCompanies] = useState<Array<{ code: string; name: string }>>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [companyCode, setCompanyCode] = useState('');
  const [periodDate, setPeriodDate] = useState(todayMonthStart);
  const [rows, setRows] = useState<ReconRow[]>([]);
  const [totals, setTotals] = useState<{ invoiceBalance: number; ledgerClosing: number; chanjetEndbalance: number } | null>(null);
  const [counts, setCounts] = useState<{ ok: number; warn: number; mismatch: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WARN' | 'MISMATCH'>('ALL');

  useEffect(() => {
    request<DimResp>('/v2/finance/ar-reconciliation/dimensions')
      .then(d => {
        setCompanies(d.companies || []);
        setPeriods(d.periods || []);
        if (d.periods && d.periods.length && !d.periods.includes(periodDate)) {
          setPeriodDate(d.periods[0]);
        }
      })
      .catch(() => { /* 静默 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!periodDate) { setError('请选期间'); return; }
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ periodDate });
      if (companyCode) qs.set('companyCode', companyCode);
      const d = await request<ReconResp>(`/v2/finance/ar-reconciliation?${qs}`);
      if (!d.success) {
        setError(d.error || '查询失败'); setRows([]); setTotals(null); setCounts(null);
      } else {
        setRows(d.rows || []); setTotals(d.totals || null); setCounts(d.counts || null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [companyCode, periodDate]);

  useEffect(() => { if (canView) load(); }, [load, canView]);

  if (!canView) {
    return (
      <div style={{ padding: 32 }}>
        <PageHeader title="应收三方对账" />
        <div style={{ color: '#ef4444' }}>无权限(需 MENU_FIN2_AR_LEDGER:V)</div>
      </div>
    );
  }

  const visibleRows = statusFilter === 'ALL' ? rows : rows.filter(r => r.status === statusFilter);

  return (
    <div className="animate-fade-in" style={{ padding: '24px 32px', maxWidth: 1800 }}>
      <PageHeader
        title="应收三方对账"
        subtitle="业务发票 ↔ ERP 应收总账 ↔ 好业财应收 · 按客户+期间对齐 · 差异飘红"
        breadcrumb={['财务管理', '应收三方对账']}
      />

      {/* 筛选区 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'end', margin: '8px 0 16px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>公司</label>
          <select
            value={companyCode}
            onChange={e => setCompanyCode(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, minWidth: 220, fontSize: 13 }}
          >
            <option value="">集团 / 全部允许公司</option>
            {companies.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>期间(月初)</label>
          {periods.length > 0 ? (
            <select
              value={periodDate}
              onChange={e => setPeriodDate(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, minWidth: 160, fontSize: 13 }}
            >
              {periods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <input
              type="date"
              value={periodDate}
              onChange={e => setPeriodDate(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, width: 160 }}
            />
          )}
        </div>
        <button onClick={load} disabled={loading} style={{
          padding: '8px 16px', background: '#3b82f6', color: 'white',
          border: 'none', borderRadius: 6, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? '加载中…' : '对账'}
        </button>

        {/* 状态过滤 chips */}
        {counts && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button onClick={() => setStatusFilter('ALL')}
              style={chipStyle(statusFilter === 'ALL', '#6b7280')}>全部 {rows.length}</button>
            <button onClick={() => setStatusFilter('WARN')}
              style={chipStyle(statusFilter === 'WARN', '#d97706')}>
              <AlertCircle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />预警 {counts.warn}
            </button>
            <button onClick={() => setStatusFilter('MISMATCH')}
              style={chipStyle(statusFilter === 'MISMATCH', '#dc2626')}>
              <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />差异 {counts.mismatch}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', color: '#dc2626', borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* 三方合计 KPI */}
      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: '业务发票合计(RMB)', v: totals.invoiceBalance, color: '#0ea5e9', sub: 'fin_ar_invoices.balance_amount_base' },
            { label: 'ERP 总账合计(RMB)',   v: totals.ledgerClosing,   color: '#059669', sub: 'fin_ar_ledger.closing_amount(_base)' },
            { label: '好业财合计(RMB)',     v: totals.chanjetEndbalance, color: '#6366f1', sub: 'chanjet_ar_snapshot.endbalance' },
            { label: '总账 vs 好业财差额',    v: totals.ledgerClosing - totals.chanjetEndbalance, color: '#dc2626', sub: '正数=总账高 / 负数=好业财高' },
          ].map((k, i) => (
            <div key={i} style={{ padding: '14px 16px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color, ...NUM_ALIGN }}>{fmt(k.v)}</div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* 对账表 */}
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ backgroundColor: '#f9fafb' }}>
            <tr>
              <th style={th(80)}>状态</th>
              <th style={th(140, 'left')}>公司</th>
              <th style={th(220, 'left')}>客户</th>
              <th style={th(140, 'right')}>① 业务发票<br/><span style={subTh}>(笔)</span></th>
              <th style={th(140, 'right')}>② ERP 总账<br/><span style={subTh}>(closing)</span></th>
              <th style={th(140, 'right')}>③ 好业财<br/><span style={subTh}>(endbalance)</span></th>
              <th style={th(110, 'right')}>① − ②</th>
              <th style={th(110, 'right')}>② − ③</th>
              <th style={th(260, 'left')}>差异原因猜测</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  {loading ? '加载中…' : '无数据(可能本期还没拉好业财同步,或没业务发票)'}
                </td>
              </tr>
            ) : visibleRows.map(r => {
              const cmp = companies.find(c => c.code === r.companyCode);
              return (
                <tr key={r.customerKey} style={{
                  borderTop: '1px solid #f3f4f6',
                  background: r.status === 'MISMATCH' ? '#fef2f2' : r.status === 'WARN' ? '#fffbeb' : undefined,
                }}>
                  <td style={td()}>
                    {r.status === 'OK' && <CheckCircle2 size={16} color="#059669" />}
                    {r.status === 'WARN' && <AlertCircle size={16} color="#d97706" />}
                    {r.status === 'MISMATCH' && <AlertTriangle size={16} color="#dc2626" />}
                  </td>
                  <td style={tdLeft()}>{cmp?.name || r.companyCode}</td>
                  <td style={tdLeft()}>
                    <div style={{ fontWeight: 500 }}>{r.customerName}</div>
                    {r.customerCode && <div style={{ fontSize: 11, color: '#6b7280' }}>{r.customerCode}</div>}
                  </td>
                  <td style={tdRight()}>
                    <div style={NUM_ALIGN}>{fmt(r.invoiceBalance)}</div>
                    {r.invoiceCount > 0 && <div style={{ fontSize: 11, color: '#6b7280' }}>{r.invoiceCount} 笔</div>}
                  </td>
                  <td style={tdRight()}>
                    <div style={NUM_ALIGN}>{fmt(r.ledgerClosing)}</div>
                    {r.ledgerSource && <div style={{ fontSize: 10, color: '#6b7280' }}>{r.ledgerSource}</div>}
                  </td>
                  <td style={tdRight()}>
                    <div style={NUM_ALIGN}>{fmt(r.chanjetEndbalance)}</div>
                  </td>
                  <td style={{ ...tdRight(), color: Math.abs(r.deltaInvLedger) > 0.01 ? '#dc2626' : '#9ca3af' }}>
                    {fmt(r.deltaInvLedger)}
                  </td>
                  <td style={{ ...tdRight(), color: Math.abs(r.deltaLedgerChanjet) > 0.01 ? '#dc2626' : '#9ca3af', fontWeight: 600 }}>
                    {fmt(r.deltaLedgerChanjet)}
                  </td>
                  <td style={tdLeft()}>
                    {r.diffReason.length === 0
                      ? <span style={{ color: '#9ca3af' }}>—</span>
                      : (() => {
                          // g199c P2-B 修(2026-06-19): 默认显示首条决策信息,多条用 +N 浓缩 + title hover 展开。
                          // 之前 3 条堆叠 11px 行高崩 + 字号比表格还小,扫读决策被遮蔽。
                          const first = r.diffReason[0];
                          const more = r.diffReason.length - 1;
                          const allText = r.diffReason.join('\n');
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span title={allText} style={{
                                fontSize: 12, padding: '3px 8px', borderRadius: 4,
                                background: '#fef3c7', color: '#92400e', lineHeight: 1.4,
                              }}>{first}</span>
                              {more > 0 && (
                                <span title={allText} style={{
                                  fontSize: 11, padding: '2px 6px', borderRadius: 10,
                                  background: 'transparent', color: '#92400e',
                                  border: '1px solid #fcd34d', cursor: 'help',
                                }}>+{more}</span>
                              )}
                            </div>
                          );
                        })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totals && rows.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f3f4f6', fontWeight: 700 }}>
                <td style={td()} colSpan={3}>合计({rows.length} 行)</td>
                <td style={tdRight()}>{fmt(totals.invoiceBalance)}</td>
                <td style={tdRight()}>{fmt(totals.ledgerClosing)}</td>
                <td style={tdRight()}>{fmt(totals.chanjetEndbalance)}</td>
                <td style={tdRight()}>{fmt(totals.invoiceBalance - totals.ledgerClosing)}</td>
                <td style={tdRight()}>{fmt(totals.ledgerClosing - totals.chanjetEndbalance)}</td>
                <td style={tdLeft()}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: '#fffbeb', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
        <strong>对账口径</strong>:
        ① 业务发票 = <code>fin_ar_invoices</code> 截至期末未取消/未冲销的发票余额(本币累加,客户级)。
        ② ERP 总账 = <code>fin_ar_ledger.closing_amount(_base)</code>(同公司同客户同期间)。
        ③ 好业财 = <code>chanjet_ar_snapshot.endbalance</code>(同客户多科目 SUM,本币 RMB)。
        差异 &gt; 0.01 为预警(WARN),总账 vs 好业财差额 &gt; 100 为重大差异(MISMATCH)。
      </div>
    </div>
  );
}

// g199c 参考页样式 token(2026-06-19):
// - th 加 border-bottom(P2-A 修)+ fontSize 13(与 td 同号,避免梯度断层)
// - 数字列用 fontVariantNumeric: 'tabular-nums'(P3-B v2):
//   * 应收总账页早就这么写,比 monospace 优雅:数字等宽对齐,文本保留正常字体
//   * monospace 会把整列变代码字体,中文也跟着丑
//   * 全 finance2 应统一用 tabular-nums(不再用 'monospace' 字符串)
const NUM_ALIGN: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

const th = (w: number, align: 'left' | 'right' | 'center' = 'center'): React.CSSProperties => ({
  padding: '10px 12px', textAlign: align, fontWeight: 500, color: '#6b7280',
  fontSize: 13,
  borderBottom: '1px solid var(--border)',
  width: w, whiteSpace: 'nowrap',
});
const subTh: React.CSSProperties = { fontSize: 10, color: '#9ca3af', fontWeight: 400 };
const td = (): React.CSSProperties => ({ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' });
const tdLeft = (): React.CSSProperties => ({ padding: '10px 12px', textAlign: 'left', verticalAlign: 'top' });
const tdRight = (): React.CSSProperties => ({ padding: '10px 12px', textAlign: 'right', verticalAlign: 'top' });

const chipStyle = (active: boolean, color: string): React.CSSProperties => ({
  padding: '6px 12px',
  background: active ? color : 'transparent',
  color: active ? 'white' : color,
  border: `1px solid ${color}`,
  borderRadius: 16,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
});

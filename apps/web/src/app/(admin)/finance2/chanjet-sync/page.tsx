'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { RefreshCw, Cloud, Download, BookOpen, CheckCircle2 } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';

// g200a 模板 token(2026-06-19)
import {
  primaryActionButton, secondaryActionButton, inputField,
  searchToolbar, tableContainer, tableHeaderCell, tableBodyCell,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  actionPill, inlineAlert, MONO_FONT,
} from '@/components/design-system/cockpit-styles';

/**
 * 好业财应收同步页 — 铁律:只读好业财,写 PG chanjet_ar_snapshot
 * 权限:MENU_FIN2_AR(V 看,E 触发同步)
 * 视角:公司维度(chanjet_book_company_map 维护映射);DataScope 自动限制非本公司不可见
 */

interface Company {
  bookid: string;
  bookName: string;
  companyCode: string;
  companyName: string;
  syncEnabled: boolean;
}

interface Row {
  id: string;
  bookid: string;
  companyCode: string | null;
  deptCode: string | null;
  period: string;
  assistantCustomerCode: string | null;
  subjectName: string | null;
  initBalance: string;
  currentPeriodJf: string;
  currentPeriodDf: string;
  endbalance: string;
  currency: string;
  syncedAt: string;
}

interface SnapshotResp {
  success: boolean;
  companyCode?: string;
  period?: string;
  count?: number;
  totalEndbalance?: number;
  currency?: string;
  rows?: Row[];
  error?: string;
}

interface SyncResp {
  success: boolean;
  companyCode?: string;
  bookid?: string;
  period?: string;
  fetched?: number;
  saved?: number;
  totalEndbalance?: number;
  error?: string;
}

const fmt = (v: string | number | null) =>
  v == null || v === '' ? '—'
    : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
// YYYY-MM-DD 给 <input type="date">
const defaultStartDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
const defaultEndDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
// 后端 API 当前用 YYYYMM(好业财 period 单月接口),从截止日推
const toApiPeriod = (yyyymmdd: string) => yyyymmdd.substring(0, 7).replace('-', '');

interface ImportPreview {
  companyCode: string;
  period: string;
  periodDate: string;
  farmCode: string;
  newRows: Array<{ counterpartyCode: string; counterpartyName: string; closing: string; charge: string; received: string }>;
  changedRows: Array<{ counterpartyCode: string; counterpartyName: string; oldClosing: string; newClosing: string; delta: string }>;
  unchangedCount: number;
}

interface ImportResult {
  success: boolean;
  companyCode?: string;
  period?: string;
  periodDate?: string;
  farmCode?: string;
  dryRun?: boolean;
  upserted?: number;
  skipped?: number;
  source?: string;
  error?: string;
}

export default function ChanjetSyncPage() {
  const { canView, canEdit } = usePermission('MENU_FIN2_AR');
  const { canView: canViewLedger, canEdit: canEditLedger } = usePermission('MENU_FIN2_AR_LEDGER');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyCode, setCompanyCode] = useState<string>('');
  // 起止日(精确到日,与好业财后台报表同口径)
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  // 后端 API 当前用 period(YYYYMM)拉单月,取截止日的会计期间
  const period = toApiPeriod(endDate);
  // 公司 code → 中文名映射(表格"公司"列显示中文)
  const companyNameByCode = new Map(companies.map(c => [c.companyCode, c.companyName]));

  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [totalEndbalance, setTotalEndbalance] = useState(0);
  const [currency, setCurrency] = useState('RMB');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState('');

  // g199-B 入账总账
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // 部门对账
  const [deptDiff, setDeptDiff] = useState<{
    chanjet: Array<{ id: string; code: string | null; name: string }>;
    erp: Array<{ orgCode: string; orgName: string; parentCode: string | null }>;
    both: Array<{ name: string; chanjetId: string; erpOrgCode: string }>;
    chanjetOnly: Array<{ id: string; code: string | null; name: string }>;
    erpOnly: Array<{ orgCode: string; orgName: string }>;
  } | null>(null);
  const [deptLoading, setDeptLoading] = useState(false);
  const [deptError, setDeptError] = useState('');

  useEffect(() => {
    request<{ success: boolean; companies?: Company[] }>('/chanjet/companies')
      .then(d => { if (d.success) setCompanies(d.companies || []); })
      .catch(() => { /* 静默 */ });
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ period });
      if (companyCode) qs.set('companyCode', companyCode);
      const data = await request<SnapshotResp>(`/chanjet/ar-snapshot?${qs}`);
      if (!data.success) {
        setError(data.error || '读取失败');
        setRows([]); setCount(0); setTotalEndbalance(0);
      } else {
        setRows(data.rows || []);
        setCount(data.count || 0);
        setTotalEndbalance(data.totalEndbalance || 0);
        setCurrency(data.currency || 'RMB');
        if (data.rows && data.rows.length > 0) setLastSync(data.rows[0].syncedAt);
      }
    } catch (e) {
      setError((e as Error).message || '网络错误');
    } finally {
      setLoading(false);
    }
  }, [companyCode, period]);

  const loadImportPreview = useCallback(async () => {
    if (!companyCode) { setImportError('请先选具体公司'); return; }
    if (!/^\d{6}$/.test(period)) { setImportError('期间格式 YYYYMM'); return; }
    setImportLoading(true); setImportError(''); setImportResult(null);
    try {
      const d = await request<{ success: boolean; error?: string } & ImportPreview>(
        `/chanjet/ar-ledger-import-preview?companyCode=${companyCode}&period=${period}`,
      );
      if (!d.success) { setImportError(d.error || '预览失败'); setImportPreview(null); }
      else setImportPreview(d);
      setTimeout(() => document.getElementById('ar-import-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImportLoading(false);
    }
  }, [companyCode, period]);

  const doImport = useCallback(async (dryRun: boolean) => {
    if (!canEditLedger) return;
    if (!importPreview) return;
    if (!confirm(`确认将 ${companyCode} 期间 ${period} 的好业财数据${dryRun ? '试运行' : '正式'}入账到 fin_ar_ledger?`)) return;
    setImportLoading(true); setImportError(''); setImportResult(null);
    try {
      const d = await request<ImportResult>('/chanjet/ar-ledger-import', {
        method: 'POST',
        body: JSON.stringify({ companyCode, period, dryRun }),
      });
      setImportResult(d);
      if (!d.success) setImportError(d.error || '入账失败');
      else if (!dryRun) await loadImportPreview(); // 入账后刷新预览
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImportLoading(false);
    }
  }, [companyCode, period, canEditLedger, importPreview, loadImportPreview]);

  const sync = useCallback(async () => {
    if (!canEdit) return;
    if (!companyCode) { setError('请选具体公司再同步(集团视角不支持同步)'); return; }
    if (!/^\d{6}$/.test(period)) { setError('期间格式: YYYYMM(如 202605)'); return; }
    setSyncing(true); setError('');
    try {
      const data = await request<SyncResp>('/chanjet/sync-ar', {
        method: 'POST',
        body: JSON.stringify({ companyCode, period, currency: 'RMB' }),
      });
      if (!data.success) setError(data.error || '同步失败');
      else await load();
    } catch (e) {
      setError((e as Error).message || '同步失败');
    } finally {
      setSyncing(false);
    }
  }, [companyCode, period, canEdit, load]);

  if (!canView) {
    return (
      <div style={{ padding: 32 }}>
        <PageHeader title="好业财应收同步" />
        <div style={{ color: '#ef4444' }}>无权限访问(需 MENU_FIN2_AR:V)</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1600 }}>
      <PageHeader title="好业财应收同步" subtitle="只读好业财 → 写 PG · 按公司视角 · DataScope 自动过滤" />

      <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>公司</label>
          <select
            value={companyCode}
            onChange={e => setCompanyCode(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, minWidth: 220 }}
          >
            <option value="">集团 / 全部允许公司</option>
            {companies.map(c => (
              <option key={c.companyCode} value={c.companyCode}>
                {c.companyName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>起始日</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, width: 160 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>截止日</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, width: 160 }}
          />
        </div>
        <button onClick={load} disabled={loading} style={{ ...primaryActionButton, opacity: loading ? 0.6 : 1 }}>
          <Download size={14} /> {loading ? '加载中…' : '读取快照(PG)'}
        </button>
        {canEdit && companyCode && (
          <button onClick={sync} disabled={syncing} style={actionPill('success', syncing)}>
            <Cloud size={14} /> {syncing ? '同步中…' : '同步好业财 → PG'}
          </button>
        )}
        <button onClick={load} disabled={loading} title="刷新" style={secondaryActionButton}>
          <RefreshCw size={14} />
        </button>
        <button
          onClick={async () => {
            if (!companyCode) { setDeptError('请先选具体公司(不能用集团视角)'); return; }
            setDeptLoading(true); setDeptError(''); setDeptDiff(null);
            try {
              const data = await request<{ success: boolean } & NonNullable<typeof deptDiff> & { error?: string }>(
                `/chanjet/departments-diff?companyCode=${companyCode}`,
              );
              if (!data.success) setDeptError(data.error || '对账失败');
              else setDeptDiff({
                chanjet: data.chanjet, erp: data.erp,
                both: data.both, chanjetOnly: data.chanjetOnly, erpOnly: data.erpOnly,
              });
              // 自动滚动到对账区
              setTimeout(() => document.getElementById('dept-diff-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
            } catch (e) {
              setDeptError((e as Error).message);
            } finally {
              setDeptLoading(false);
            }
          }}
          disabled={deptLoading || !companyCode}
          style={actionPill('info', deptLoading || !companyCode)}
        >
          {deptLoading ? '部门对账中…' : '部门对账'}
        </button>
        {canViewLedger && (
          <button
            onClick={loadImportPreview}
            disabled={importLoading || !companyCode}
            title={!companyCode ? '请先选具体公司' : '预览入账总账差异'}
            style={actionPill('info', importLoading || !companyCode)}
          >
            <BookOpen size={14} /> {importLoading ? '预览中…' : '预览入账总账'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ ...inlineAlert('danger'), marginBottom: 16 }}>{error}</div>
      )}

      {/* g200a KPI 3 卡 — token kpiCardCompact */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10,
        marginBottom: 16,
      }}>
        <div style={kpiCardCompact('brand')}>
          <div style={kpiCardCompactLabel}>往来单位数</div>
          <div style={kpiCardCompactValue('brand')}>{count}</div>
        </div>
        <div style={kpiCardCompact('success')}>
          <div style={kpiCardCompactLabel}>期末余额合计({currency})</div>
          <div style={kpiCardCompactValue('success')}>{fmt(totalEndbalance)}</div>
        </div>
        {lastSync && (
          <div style={kpiCardCompact('default')}>
            <div style={kpiCardCompactLabel}>最后同步</div>
            <div style={{ ...kpiCardCompactValue('default'), fontSize: 14, fontFamily: 'inherit' }}>{new Date(lastSync).toLocaleString('zh-CN')}</div>
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left', fontWeight: 500, color: '#6b7280' }}>公司</th>
              <th style={{ padding: 12, textAlign: 'left', fontWeight: 500, color: '#6b7280' }}>结算往来单位</th>
              <th style={{ padding: 12, textAlign: 'left', fontWeight: 500, color: '#6b7280' }}>编码</th>
              <th style={{ padding: 12, textAlign: 'right', fontWeight: 500, color: '#6b7280' }}>期初余额</th>
              <th style={{ padding: 12, textAlign: 'right', fontWeight: 500, color: '#6b7280' }}>本期应收</th>
              <th style={{ padding: 12, textAlign: 'right', fontWeight: 500, color: '#6b7280' }}>本期已收</th>
              <th style={{ padding: 12, textAlign: 'right', fontWeight: 500, color: '#6b7280' }}>期末余额</th>
              <th style={{ padding: 12, textAlign: 'left', fontWeight: 500, color: '#6b7280' }}>币种</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  无数据。{canEdit ? '选公司后点"同步好业财 → PG"拉取。' : '请有 E 权限的用户先同步。'}
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: 12, color: '#374151' }}>
                  {r.companyCode ? (companyNameByCode.get(r.companyCode) || r.companyCode) : '—'}
                </td>
                <td style={{ padding: 12 }}>{r.subjectName || '—'}</td>
                <td style={{ padding: 12, color: '#6b7280' }}>{r.assistantCustomerCode || '—'}</td>
                <td style={{ padding: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.initBalance)}</td>
                <td style={{ padding: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.currentPeriodJf)}</td>
                <td style={{ padding: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.currentPeriodDf)}</td>
                <td style={{ padding: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(r.endbalance)}</td>
                <td style={{ padding: 12, color: '#6b7280' }}>{r.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: '#fffbeb', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
        <strong>铁律</strong>：只读好业财（HTTP GET），写本地 PG 快照表（chanjet_ar_snapshot）。
        按公司一对一对应（chanjet_book_company_map）。非本公司财务受 DataScope 限制不可见。
        何时可写好业财由用户明示。
      </div>

      {/* g199-B 审核入账总账 */}
      {canViewLedger && (
        <div id="ar-import-section" style={{ marginTop: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              <BookOpen size={16} style={{ verticalAlign: -2, marginRight: 6, color: '#0ea5e9' }} />
              审核入账总账（chanjet_ar_snapshot → fin_ar_ledger）
            </h3>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              铁律: 财务总监审核入账 · 同客户多科目自动聚合 · source=CHANJET_VERIFIED_YYYYMMDD
            </div>
          </div>

          {importError && (
            <div style={{ padding: 8, background: '#fef2f2', color: '#dc2626', borderRadius: 4, marginBottom: 8, fontSize: 13 }}>
              {importError}
            </div>
          )}

          {!importPreview && !importError && (
            <div style={{ color: '#9ca3af', fontSize: 13 }}>
              先选公司+期间,点上方"预览入账总账"按钮查看差异;确认无误后由财务总监(MENU_FIN2_AR_LEDGER:E)入账。
            </div>
          )}

          {importPreview && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12, fontSize: 13 }}>
                <div style={{ padding: 12, background: '#ecfdf5', borderRadius: 6 }}>
                  <div style={{ color: '#065f46', fontWeight: 600 }}>新增 {importPreview.newRows.length}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>fin_ar_ledger 中尚无</div>
                </div>
                <div style={{ padding: 12, background: '#fef3c7', borderRadius: 6 }}>
                  <div style={{ color: '#92400e', fontWeight: 600 }}>金额变动 {importPreview.changedRows.length}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>期末与现存账不同</div>
                </div>
                <div style={{ padding: 12, background: '#f3f4f6', borderRadius: 6 }}>
                  <div style={{ color: '#374151', fontWeight: 600 }}>无差异 {importPreview.unchangedCount}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>不会覆盖</div>
                </div>
                <div style={{ padding: 12, background: '#eff6ff', borderRadius: 6 }}>
                  <div style={{ color: '#1e3a8a', fontWeight: 600 }}>farm_code: {importPreview.farmCode}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>期间日 {importPreview.periodDate}</div>
                </div>
              </div>

              {importPreview.newRows.length > 0 && (
                <details open style={{ marginBottom: 8 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 500, padding: 6, background: '#ecfdf5', borderRadius: 4 }}>
                    新增 {importPreview.newRows.length} 行明细
                  </summary>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
                    <thead style={{ background: '#f9fafb' }}>
                      <tr>
                        <th style={{ padding: 6, textAlign: 'left' }}>编码</th>
                        <th style={{ padding: 6, textAlign: 'left' }}>客户</th>
                        <th style={{ padding: 6, textAlign: 'right' }}>期末应收</th>
                        <th style={{ padding: 6, textAlign: 'right' }}>本期应收</th>
                        <th style={{ padding: 6, textAlign: 'right' }}>本期已收</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.newRows.slice(0, 50).map(r => (
                        <tr key={r.counterpartyName} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: 6, color: '#6b7280' }}>{r.counterpartyCode || '—'}</td>
                          <td style={{ padding: 6 }}>{r.counterpartyName}</td>
                          <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(r.closing)}</td>
                          <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.charge)}</td>
                          <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.received)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}

              {importPreview.changedRows.length > 0 && (
                <details open style={{ marginBottom: 8 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 500, padding: 6, background: '#fef3c7', borderRadius: 4 }}>
                    金额变动 {importPreview.changedRows.length} 行(覆盖现存账)
                  </summary>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
                    <thead style={{ background: '#f9fafb' }}>
                      <tr>
                        <th style={{ padding: 6, textAlign: 'left' }}>客户</th>
                        <th style={{ padding: 6, textAlign: 'right' }}>原期末</th>
                        <th style={{ padding: 6, textAlign: 'right' }}>新期末</th>
                        <th style={{ padding: 6, textAlign: 'right' }}>差额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.changedRows.slice(0, 50).map(r => (
                        <tr key={r.counterpartyName} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: 6 }}>{r.counterpartyName}</td>
                          <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#6b7280' }}>{fmt(r.oldClosing)}</td>
                          <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(r.newClosing)}</td>
                          <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: Number(r.delta) > 0 ? '#dc2626' : '#059669' }}>
                            {Number(r.delta) > 0 ? '+' : ''}{fmt(r.delta)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => doImport(true)}
                  disabled={importLoading || !canEditLedger || (importPreview.newRows.length === 0 && importPreview.changedRows.length === 0)}
                  style={{
                    padding: '8px 16px', background: '#6b7280', color: 'white',
                    border: 'none', borderRadius: 6, cursor: importLoading ? 'wait' : 'pointer',
                    opacity: !canEditLedger ? 0.5 : 1,
                  }}
                  title={canEditLedger ? '不写库,只算最终入账数' : '需 MENU_FIN2_AR_LEDGER:E'}
                >
                  试运行(不写库)
                </button>
                <button
                  onClick={() => doImport(false)}
                  disabled={importLoading || !canEditLedger || (importPreview.newRows.length === 0 && importPreview.changedRows.length === 0)}
                  style={{
                    padding: '8px 16px', background: '#0ea5e9', color: 'white',
                    border: 'none', borderRadius: 6, cursor: importLoading ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    opacity: !canEditLedger ? 0.5 : 1,
                  }}
                  title={canEditLedger ? '写 fin_ar_ledger(可逆,按 uq upsert)' : '需 MENU_FIN2_AR_LEDGER:E'}
                >
                  <CheckCircle2 size={16} /> 正式入账 fin_ar_ledger
                </button>
                {!canEditLedger && (
                  <span style={{ alignSelf: 'center', fontSize: 12, color: '#dc2626' }}>需财务总监(MENU_FIN2_AR_LEDGER:E)操作</span>
                )}
              </div>

              {importResult && (
                <div style={{
                  marginTop: 12, padding: 10, borderRadius: 6, fontSize: 13,
                  background: importResult.success ? '#ecfdf5' : '#fef2f2',
                  color: importResult.success ? '#065f46' : '#dc2626',
                }}>
                  {importResult.success
                    ? `✓ ${importResult.dryRun ? '试运行' : '入账'}完成: upserted=${importResult.upserted} skipped=${importResult.skipped} source=${importResult.source}`
                    : `✗ ${importResult.error}`}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 部门对账(顶部按钮触发,自动滚到这里) */}
      <div id="dept-diff-section" style={{ marginTop: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>部门对账（好业财 ↔ ERP）</h3>
          <button
            onClick={async () => {
              if (!companyCode) { setDeptError('请先选具体公司(不能用集团视角)'); return; }
              setDeptLoading(true); setDeptError(''); setDeptDiff(null);
              try {
                const data = await request<{ success: boolean } & NonNullable<typeof deptDiff> & { error?: string }>(
                  `/chanjet/departments-diff?companyCode=${companyCode}`,
                );
                if (!data.success) setDeptError(data.error || '对账失败');
                else setDeptDiff({
                  chanjet: data.chanjet, erp: data.erp,
                  both: data.both, chanjetOnly: data.chanjetOnly, erpOnly: data.erpOnly,
                });
              } catch (e) {
                setDeptError((e as Error).message);
              } finally {
                setDeptLoading(false);
              }
            }}
            disabled={deptLoading}
            style={{
              padding: '8px 16px',
              background: companyCode ? '#6366f1' : '#9ca3af',
              color: 'white',
              border: 'none', borderRadius: 6,
              cursor: deptLoading ? 'wait' : 'pointer',
              fontWeight: 500,
            }}
          >
            {deptLoading ? '对账中…' : '查看部门差异'}
          </button>
        </div>
        {deptError && (
          <div style={{ padding: 8, background: '#fef2f2', color: '#dc2626', borderRadius: 4, marginBottom: 8, fontSize: 13 }}>
            {deptError}
          </div>
        )}
        {!companyCode && !deptDiff && (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>请先选具体公司,点"查看部门差异"。</div>
        )}
        {deptDiff && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 13 }}>
            <div style={{ padding: 12, background: '#ecfdf5', borderRadius: 6 }}>
              <div style={{ fontWeight: 600, color: '#065f46', marginBottom: 8 }}>✓ 两边都有 ({deptDiff.both.length})</div>
              {deptDiff.both.length === 0 ? <div style={{ color: '#6b7280' }}>—</div> :
                deptDiff.both.slice(0, 30).map(d => (
                  <div key={d.chanjetId} style={{ padding: '4px 0', borderBottom: '1px dashed #d1fae5' }}>
                    <div>{d.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>好业财#{d.chanjetId} ↔ ERP {d.erpOrgCode}</div>
                  </div>
                ))}
            </div>
            <div style={{ padding: 12, background: '#fef3c7', borderRadius: 6 }}>
              <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 8 }}>⚠ 只在好业财 ({deptDiff.chanjetOnly.length})</div>
              {deptDiff.chanjetOnly.length === 0 ? <div style={{ color: '#6b7280' }}>—</div> :
                deptDiff.chanjetOnly.slice(0, 30).map(d => (
                  <div key={d.id} style={{ padding: '4px 0', borderBottom: '1px dashed #fde68a' }}>
                    <div>{d.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>好业财#{d.id} code={d.code || '—'}</div>
                  </div>
                ))}
            </div>
            <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6 }}>
              <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: 8 }}>⚠ 只在 ERP ({deptDiff.erpOnly.length})</div>
              {deptDiff.erpOnly.length === 0 ? <div style={{ color: '#6b7280' }}>—</div> :
                deptDiff.erpOnly.slice(0, 30).map(d => (
                  <div key={d.orgCode} style={{ padding: '4px 0', borderBottom: '1px dashed #fecaca' }}>
                    <div>{d.orgName}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>ERP {d.orgCode}</div>
                  </div>
                ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
          匹配规则:按部门名称严格匹配。差异列出后,你可以决定:建映射表 / 在好业财补 / 在 ERP 补 / 维持差异。
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { RefreshCw, Cloud, Download } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';

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
// YYYY-MM 给 <input type="month">,YYYYMM 给后端 API
const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const toApiPeriod = (m: string) => m.replace('-', '');

export default function ChanjetSyncPage() {
  const { canView, canEdit } = usePermission('MENU_FIN2_AR');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyCode, setCompanyCode] = useState<string>('');
  // 起止月份(与好业财后台报表同口径);后端按 endMonth 单月拉(好业财 endbalance 已是累计值)
  const [startMonth, setStartMonth] = useState(defaultMonth);
  const [endMonth, setEndMonth] = useState(defaultMonth);
  const period = toApiPeriod(endMonth);
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
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>起始月</label>
          <input
            type="month"
            value={startMonth}
            onChange={e => setStartMonth(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, width: 150 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>截止月</label>
          <input
            type="month"
            value={endMonth}
            onChange={e => setEndMonth(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, width: 150 }}
          />
        </div>
        <button onClick={load} disabled={loading} style={{
          padding: '8px 16px', background: '#3b82f6', color: 'white',
          border: 'none', borderRadius: 6, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Download size={16} /> {loading ? '加载中…' : '读取快照(PG)'}
        </button>
        {canEdit && companyCode && (
          <button onClick={sync} disabled={syncing} style={{
            padding: '8px 16px', background: '#10b981', color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Cloud size={16} /> {syncing ? '同步中…' : '同步好业财 → PG'}
          </button>
        )}
        <button onClick={load} disabled={loading} title="刷新" style={{
          padding: '8px 12px', background: 'transparent', color: '#6b7280',
          border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer',
        }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', color: '#dc2626', borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>往来单位数</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{count}</div>
        </div>
        <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, minWidth: 240 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>期末余额合计({currency})</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#059669' }}>{fmt(totalEndbalance)}</div>
        </div>
        {lastSync && (
          <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, minWidth: 200 }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>最后同步</div>
            <div style={{ fontSize: 14, color: '#374151' }}>{new Date(lastSync).toLocaleString('zh-CN')}</div>
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
                <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.initBalance)}</td>
                <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.currentPeriodJf)}</td>
                <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.currentPeriodDf)}</td>
                <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>{fmt(r.endbalance)}</td>
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

      {/* 部门对账(选公司后) */}
      <div style={{ marginTop: 32, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>部门对账（好业财 ↔ ERP）</h3>
          <button
            onClick={async () => {
              if (!companyCode) { setDeptError('请先选公司'); return; }
              setDeptLoading(true); setDeptError('');
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
            disabled={deptLoading || !companyCode}
            style={{
              padding: '6px 12px', background: '#6366f1', color: 'white',
              border: 'none', borderRadius: 6, cursor: 'pointer',
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

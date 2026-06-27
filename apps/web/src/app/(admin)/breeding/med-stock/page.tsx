'use client';

import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import PageHeader from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Search } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import { primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';
function tok() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch((process.env.NEXT_PUBLIC_API_BASE || '') + path, {
    headers: {
      Authorization: `Bearer ${tok()}`
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}
async function apiPost<T = any>(path: string, data: unknown): Promise<T> {
  const res = await fetch((process.env.NEXT_PUBLIC_API_BASE || '') + path, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      Authorization: `Bearer ${tok()}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
interface MedStock {
  medication_code: string;
  medication_name: string;
  dosage: string;
  qty: number;
  unit: string;
}
interface MedLedger {
  id: number;
  log_date: string;
  change_type: string;
  medication_code: string;
  medication_name: string;
  qty_change: number;
  house_code: string | null;
  note: string | null;
  operator: string;
}
const HOUSES = ['2号舍', '3号舍', '4号舍', '5号舍', '6号舍', '全场'];
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};
type Tab = 'stock' | 'inbound' | 'outbound' | 'ledger';
interface EntryRow {
  qty: number;
  house_code: string;
  note: string;
}
export default function MedStockPage() {
  const {
    can
  } = usePermission();
  const {
    t
  } = useLanguage();
  // G24-A：PBAC 收口 — 药品库存归 MENU_FARM_VET 域
  const { canEdit } = usePermission('MENU_FARM_VET');
  const [tab, setTab] = useState<Tab>('stock');
  const [search, setSearch] = useState('');
  const [stock, setStock] = useState<MedStock[]>([]);
  const [ledger, setLedger] = useState<MedLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<Record<string, EntryRow>>({});
  const [ledgerDate, setLedgerDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [ledgerEnd, setLedgerEnd] = useState(today());
  const loadStock = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStock(await apiFetch<MedStock[]>('/api/farm/medicine/stock'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setLedger(await apiFetch<MedLedger[]>(`/api/farm/medicine/ledger?start=${ledgerDate}&end=${ledgerEnd}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ledgerDate, ledgerEnd]);
  useEffect(() => {
    if (tab === 'stock') loadStock();else if (tab === 'ledger') loadLedger();else {
      loadStock();
      setLoading(false);
    }
  }, [tab, loadStock, loadLedger]);
  const getEntry = (code: string): EntryRow => entries[code] ?? {
    qty: 0,
    house_code: HOUSES[0],
    note: ''
  };
  const setEntry = (code: string, patch: Partial<EntryRow>) => {
    setEntries(p => ({
      ...p,
      [code]: {
        ...getEntry(code),
        ...patch
      }
    }));
    setSaved(false);
  };
  const hasChanges = Object.values(entries).some(e => e.qty > 0);
  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setError('');
    try {
      const items = Object.entries(entries).filter(([, e]) => e.qty > 0).map(([code, e]) => ({
        medication_code: code,
        qty: e.qty,
        house_code: tab === 'outbound' ? e.house_code : undefined,
        note: e.note || undefined
      }));
      const endpoint = tab === 'inbound' ? '/api/farm/medicine/inbound' : '/api/farm/medicine/outbound';
      await apiPost(endpoint, {
        date: today(),
        items
      });
      setSaved(true);
      setEntries({});
      setTimeout(() => setSaved(false), 3000);
      loadStock();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const filteredStock = stock.filter(m => !search || m.medication_name.includes(search) || m.medication_code.includes(search));
  const CHANGE_LABELS: Record<string, string> = {
    MED_INBOUND: '入库',
    MED_OUTBOUND: '出库'
  };
  const TABS: {
    key: Tab;
    label: string;
  }[] = [{
    key: 'stock',
    label: '库存总览'
  }, {
    key: 'inbound',
    label: '今日入库'
  }, {
    key: 'outbound',
    label: '今日出库'
  }, {
    key: 'ledger',
    label: '流水台账'
  }];
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.药品库存', '药品库存管理（农场）')} subtitle={t('ui.管理农场兽药库存入库出库流水', '管理农场兽药库存、入库出库及历史流水（API: /api/farm/medicine）')} breadcrumb={[t('ui.养殖生产', '养殖生产'), t('ui.药品库存', '药品库存')]} />

      {/* Tab 栏 */}
      <div style={{
      display: 'flex',
      gap: 4,
      marginBottom: 20,
      borderBottom: '2px solid var(--border)'
    }}>
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)} style={{ ...(tab === tb.key ? primaryActionButton : secondaryActionButton), borderRadius: "8px 8px 0 0" }}>
            {tb.label}
          </button>
        ))}
        <div className={u.flex1} />
        {(tab === 'inbound' || tab === 'outbound') && canEdit && (
          <button onClick={handleSave} disabled={saving || !hasChanges} style={{ ...(saved ? secondaryActionButton : primaryActionButton), alignSelf: 'flex-start', marginBottom: 2, opacity: hasChanges ? 1 : 0.5 }}>
            {saving ? '提交中…' : saved ? '已保存' : '提交'}
          </button>
        )}
        {tab === 'stock' && (
          <button onClick={loadStock} style={{ ...secondaryActionButton, alignSelf: 'flex-start', marginBottom: 2 }}>
            <RefreshCw size={13} />刷新
          </button>
        )}
      </div>

      {error && <div style={{
      marginBottom: 14,
      padding: '10px 14px',
      borderRadius: 8,
      background: 'var(--status-danger-bg-faint)',
      color: 'var(--status-danger)',
      fontSize: 13
    }}>{error}</div>}
      {saved && <div style={{
      marginBottom: 14,
      padding: '10px 14px',
      borderRadius: 8,
      background: 'var(--status-success-bg-medium)',
      color: 'var(--status-success)',
      fontSize: 13
    }}>✓ 已保存</div>}

      {/* ── 库存 Tab ── */}
      {tab === 'stock' && <>
          <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        marginBottom: 16,
        width: 300
      }}>
            <Search size={14} color="var(--text-secondary)" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索药品名称…" style={{
          flex: 1,
          border: 'none',
          background: 'none',
          color: 'var(--text-primary)',
          fontSize: 13,
          outline: 'none'
        }} />
          </div>
          <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        overflow: 'auto'
      }}>
            <table className={s.table}>
              <thead>
                <tr>
                  {['药品名称', '规格', '库存量', '单位', '状态'].map(h => <th key={h} style={{
                textAlign: h === '库存量' ? 'right' : 'left'
              }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={5} className={u.emptyCenter}>加载中…</td></tr> : filteredStock.length === 0 ? <tr><td colSpan={5} className={u.emptyCenter}>暂无数据</td></tr> : filteredStock.map(m => <tr key={m.medication_code}>
                      <td>{m.medication_name}</td>
                      <td className={u.muted}>{m.dosage}</td>
                      <td style={{
                textAlign: 'right',
                color: m.qty > 0 ? 'var(--status-special)' : 'var(--text-secondary)'
              }}>{m.qty}</td>
                      <td className={u.muted}>{m.unit}</td>
                      <td>
                        <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: m.qty > 0 ? 'var(--status-special-bg)' : 'var(--status-neutral-bg-light)',
                  color: m.qty > 0 ? 'var(--status-special)' : 'var(--text-secondary)',
                  border: `1px solid ${m.qty > 0 ? 'var(--status-special-border)' : 'var(--border)'}`
                }}>
                          {m.qty > 0 ? '有库存' : '无库存'}
                        </span>
                      </td>
                    </tr>)}
              </tbody>
            </table>
          </div>
        </>}

      {/* ── 入库 / 出库 Tab ── */}
      {(tab === 'inbound' || tab === 'outbound') && <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      overflow: 'auto'
    }}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>药品名称</th>
                <th>规格</th>
                <th className={u.tar}>库存</th>
                <th className={u.tac}>数量</th>
                {tab === 'outbound' && <th>栋舍</th>}
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {stock.map(m => {
            const e = getEntry(m.medication_code);
            return <tr key={m.medication_code} style={{
              background: e.qty > 0 ? 'rgba(139,92,246,0.04)' : undefined
            }}>
                    <td>{m.medication_name}</td>
                    <td className={u.muted}>{m.dosage}</td>
                    <td style={{
                textAlign: 'right',
                color: 'var(--text-secondary)'
              }}>{m.qty} {m.unit}</td>
                    <td className={u.tac}>
                      {canEdit ? <input type="number" min="0" value={e.qty || ''} onChange={ev => setEntry(m.medication_code, {
                  qty: Math.max(0, Number(ev.target.value) || 0)
                })} placeholder="0" style={{
                  width: 80,
                  textAlign: 'center',
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-page)',
                  color: 'var(--text-primary)',
                  fontSize: 13
                }} /> : e.qty}
                    </td>
                    {tab === 'outbound' && <td>
                        {canEdit ? <select value={e.house_code} onChange={ev => setEntry(m.medication_code, {
                  house_code: ev.target.value
                })} style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-page)',
                  color: 'var(--text-primary)',
                  fontSize: 13
                }}>
                            {HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                          </select> : e.house_code}
                      </td>}
                    <td>
                      {canEdit ? <input type="text" value={e.note} onChange={ev => setEntry(m.medication_code, {
                  note: ev.target.value
                })} placeholder={tab === 'inbound' ? '供应商/批号…' : '用途…'} style={{
                  width: 180,
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-page)',
                  color: 'var(--text-primary)',
                  fontSize: 13
                }} /> : e.note}
                    </td>
                  </tr>;
          })}
            </tbody>
          </table>
        </div>}

      {/* ── 台账 Tab ── */}
      {tab === 'ledger' && <>
          <div style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        marginBottom: 16,
        flexWrap: 'wrap'
      }}>
            <label style={{
          fontSize: 13,
          color: 'var(--text-secondary)'
        }}>开始日期</label>
            <input type="date" value={ledgerDate} onChange={e => setLedgerDate(e.target.value)} style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 13,
          color: 'var(--text-primary)',
          background: 'var(--bg-card)'
        }} />
            <label style={{
          fontSize: 13,
          color: 'var(--text-secondary)'
        }}>结束日期</label>
            <input type="date" value={ledgerEnd} onChange={e => setLedgerEnd(e.target.value)} style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 13,
          color: 'var(--text-primary)',
          background: 'var(--bg-card)'
        }} />
            <button onClick={loadLedger} style={secondaryActionButton}>
              <RefreshCw size={13} />查询
            </button>
          </div>
          <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        overflow: 'auto'
      }}>
            <table className={s.table}>
              <thead>
                <tr>
                  {['日期', '药品名称', '类型', '数量变动', '栋舍', '备注', '操作人'].map(h => <th key={h} style={{
                textAlign: h === '数量变动' ? 'right' : 'left'
              }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={7} className={u.emptyCenter}>加载中…</td></tr> : ledger.length === 0 ? <tr><td colSpan={7} className={u.emptyCenter}>暂无数据</td></tr> : ledger.map(e => <tr key={e.id}>
                      <td className={u.muted}>{e.log_date}</td>
                      <td>{e.medication_name}</td>
                      <td>
                        <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: e.change_type === 'MED_INBOUND' ? 'var(--status-success-bg-medium)' : 'var(--status-danger-bg-light)',
                  color: e.change_type === 'MED_INBOUND' ? 'var(--status-success)' : 'var(--status-danger)'
                }}>
                          {CHANGE_LABELS[e.change_type] ?? e.change_type}
                        </span>
                      </td>
                      <td style={{
                textAlign: 'right',
                color: e.qty_change > 0 ? 'var(--status-success)' : 'var(--status-danger)'
              }}>
                        {e.qty_change > 0 ? '+' : ''}{e.qty_change}
                      </td>
                      <td className={u.muted}>{e.house_code ?? '—'}</td>
                      <td className={u.muted12}>{e.note ?? '—'}</td>
                      <td className={u.muted}>{e.operator}</td>
                    </tr>)}
              </tbody>
            </table>
          </div>
        </>}
    </div>;
}
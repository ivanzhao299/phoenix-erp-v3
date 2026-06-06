'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import u from "@/styles/uix-utils.module.css";
import PageHeader from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { useProductGrades } from '@/hooks/useProductGrades';
import { RefreshCw } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import LegacyFreezeBanner from '@/components/LegacyFreezeBanner';
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
async function apiPost<T = unknown>(path: string, data: unknown): Promise<T> {
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
interface EggStock {
  grade: string;
  name: string;
  qty: number;
  trays: number;
}
interface EggLedger {
  id: number;
  log_date: string;
  change_type: string;
  grade: string;
  qty_change: number;
  house_code: string | null;
  customer_no: string | null;
  note: string | null;
  operator: string;
}
interface FarmCustomer {
  customer_code: string;
  customer_name: string;
}
// 历史：硬编码 0-5/DIRTY/BROKEN 已废，等级改从 product_grades 主数据动态拉
// （见组件内 useProductGrades）— 与 inv_batches.grade_code_std 同源。
const today = () => new Date().toISOString().slice(0, 10);
type Tab = 'stock' | 'inbound' | 'outbound' | 'writeoff' | 'ledger';

/**
 * change_type 标签/颜色 — 键值必须与后端 farm-egg.service.ts 写入的实际字符串一致：
 *   入库 → EGG_INBOUND_HOUSE
 *   出库 → EGG_OUTBOUND_SALE
 *   报损 → EGG_WRITE_OFF
 */
const CHANGE_LABELS: Record<string, string> = {
  EGG_INBOUND_HOUSE: '入库',
  EGG_OUTBOUND_SALE: '出库',
  EGG_WRITE_OFF: '报损'
};
const CHANGE_COLOR: Record<string, string> = {
  EGG_INBOUND_HOUSE: 'var(--status-success)',
  EGG_OUTBOUND_SALE: 'var(--status-warning)',
  EGG_WRITE_OFF: 'var(--text-disabled)'
};
export default function EggLedgerPage() {
  const {
    can
  } = usePermission();
  const {
    t
  } = useLanguage();
  const canEdit = can(['ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_WMS_MGR']);
  // 全档展示（入库/出库/报损都需要包含脏/破/损等不可销售档）
  const { grades: productGrades } = useProductGrades();
  const EGG_GRADES = useMemo(
    () => productGrades.map(g => ({ code: g.grade_code, name: g.grade_name })),
    [productGrades]
  );
  const [tab, setTab] = useState<Tab>('stock');
  const [stock, setStock] = useState<EggStock[]>([]);
  const [ledger, setLedger] = useState<EggLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // ── 动态栋舍列表（与移动端共用同一接口：/api/farm/feed/houses）
  const [houses, setHouses] = useState<string[]>([]);
  // ── 动态客户列表（与移动端共用同一接口：/api/farm/sales/customers）
  const [customers, setCustomers] = useState<FarmCustomer[]>([]);

  // inbound: grade → { qty, house_code }
  const [inboundEntries, setInboundEntries] = useState<Record<string, {
    qty: number;
    house_code: string;
  }>>({});
  // outbound: grade → { qty, customer_no }
  const [outboundEntries, setOutboundEntries] = useState<Record<string, {
    qty: number;
    customer_no: string;
  }>>({});
  // writeoff: grade → { qty, reason }
  const [writeoffEntries, setWriteoffEntries] = useState<Record<string, {
    qty: number;
    reason: string;
  }>>({});
  const [ledgerStart, setLedgerStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [ledgerEnd, setLedgerEnd] = useState(today());

  // ── 首次加载：拉取栋舍列表 + 客户列表（两端共用相同接口）
  useEffect(() => {
    apiFetch<string[]>('/api/farm/feed/houses').then(h => setHouses(h ?? [])).catch(() => {});
    apiFetch<FarmCustomer[]>('/api/farm/sales/customers').then(c => setCustomers(c ?? [])).catch(() => {});
  }, []);
  const loadStock = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStock(await apiFetch<EggStock[]>('/api/farm/egg/stock'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);
  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setLedger(await apiFetch<EggLedger[]>(`/api/farm/egg/ledger?start=${ledgerStart}&end=${ledgerEnd}`));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [ledgerStart, ledgerEnd]);
  useEffect(() => {
    if (tab === 'stock') loadStock();else if (tab === 'ledger') loadLedger();else {
      loadStock();
      setLoading(false);
    }
  }, [tab, loadStock, loadLedger]);
  const hasInboundChanges = Object.values(inboundEntries).some(e => e.qty > 0);
  const hasOutboundChanges = Object.values(outboundEntries).some(e => e.qty > 0);
  const hasWriteoffChanges = Object.values(writeoffEntries).some(e => e.qty > 0);
  const handleInboundSave = async () => {
    if (!hasInboundChanges) return;
    setSaving(true);
    setError('');
    try {
      const items = Object.entries(inboundEntries).filter(([, e]) => e.qty > 0).map(([grade, e]) => ({
        grade,
        qty: e.qty,
        house_code: e.house_code
      }));
      await apiPost('/api/farm/egg/inbound', {
        date: today(),
        items
      });
      setSaved(true);
      setInboundEntries({});
      setTimeout(() => setSaved(false), 3000);
      loadStock();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSaving(false);
    }
  };
  const handleOutboundSave = async () => {
    if (!hasOutboundChanges) return;
    setSaving(true);
    setError('');
    try {
      const items = Object.entries(outboundEntries).filter(([, e]) => e.qty > 0).map(([grade, e]) => ({
        grade,
        qty: e.qty,
        customer_no: e.customer_no
      }));
      await apiPost('/api/farm/egg/outbound', {
        date: today(),
        items
      });
      setSaved(true);
      setOutboundEntries({});
      setTimeout(() => setSaved(false), 3000);
      loadStock();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSaving(false);
    }
  };
  const handleWriteoffSave = async () => {
    if (!hasWriteoffChanges) return;
    setSaving(true);
    setError('');
    try {
      const items = Object.entries(writeoffEntries).filter(([, e]) => e.qty > 0).map(([grade, e]) => ({
        grade,
        qty: e.qty,
        reason: e.reason || '报损'
      }));
      await apiPost('/api/farm/egg/write-off', {
        date: today(),
        items
      });
      setSaved(true);
      setWriteoffEntries({});
      setTimeout(() => setSaved(false), 3000);
      loadStock();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSaving(false);
    }
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
    key: 'writeoff',
    label: '报损'
  }, {
    key: 'ledger',
    label: '流水台账'
  }];
  const inputStyle: React.CSSProperties = {
    width: 100,
    textAlign: 'right' as const,
    padding: '4px 6px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-page)',
    color: 'var(--text-primary)',
    fontSize: 13
  };
  const selectStyle: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-page)',
    color: 'var(--text-primary)',
    fontSize: 13
  };
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.蛋品台账', '蛋品台账（农场）')} subtitle="管理农场蛋品库存，按等级录入入库/出库/报损，查看历史流水（API: /api/farm/egg）" breadcrumb={[t('ui.养殖生产', '养殖生产'), t('ui.蛋品台账', '蛋品台账')]} />

      {/* R1 — Farm Egg 库存能力已删除（本入口不再生成库存） */}
      <LegacyFreezeBanner newPath="/pkg/packaging" newModuleName="包装作业中心" message="该入口不再生成库存，库存来源由系统模式控制（临时生产入库 / 包装入库）。集蛋请走「包装作业中心」；销售扣减走「销售管理」。本页仅保留集蛋记录与历史流水查询。" />

      {/* Tab 栏 */}
      <div style={{
      display: 'flex',
      gap: 4,
      marginBottom: 20,
      borderBottom: '2px solid var(--border)',
      flexWrap: 'wrap'
    }}>
        {TABS.map(tb => <button key={tb.key} onClick={() => setTab(tb.key)} className={tab === tb.key ? s.btnPrimary : s.btnSecondary} style={{
        borderRadius: '8px 8px 0 0',
        padding: '8px 18px',
        fontWeight: 600,
        fontSize: 13
      }}>
            {tb.label}
          </button>)}
        <div className={u.flex1} />
        {tab === 'inbound' && canEdit && <button className={saved ? s.btnSecondary : s.btnPrimary} onClick={handleInboundSave} disabled={saving || !hasInboundChanges} style={{
        alignSelf: 'flex-start',
        marginBottom: 2,
        opacity: hasInboundChanges ? 1 : 0.5
      }}>
            {saving ? '提交中…' : saved ? '✓ 已保存' : '提交入库'}
          </button>}
        {tab === 'outbound' && canEdit && <button className={saved ? s.btnSecondary : s.btnPrimary} onClick={handleOutboundSave} disabled={saving || !hasOutboundChanges} style={{
        alignSelf: 'flex-start',
        marginBottom: 2,
        opacity: hasOutboundChanges ? 1 : 0.5
      }}>
            {saving ? '提交中…' : saved ? '✓ 已保存' : '提交出库'}
          </button>}
        {tab === 'writeoff' && canEdit && <button className={saved ? s.btnSecondary : s.btnPrimary} onClick={handleWriteoffSave} disabled={saving || !hasWriteoffChanges} style={{
        alignSelf: 'flex-start',
        marginBottom: 2,
        opacity: hasWriteoffChanges ? 1 : 0.5,
        background: hasWriteoffChanges ? 'var(--status-danger)' : undefined
      }}>
            {saving ? '提交中…' : saved ? '✓ 已保存' : '提交报损'}
          </button>}
        {tab === 'stock' && <button className={s.btnSecondary} onClick={loadStock} style={{
        alignSelf: 'flex-start',
        marginBottom: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 4
      }}>
            <RefreshCw size={14} />刷新
          </button>}
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
      {tab === 'stock' && <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      overflow: 'auto'
    }}>
          <table className={s.table}>
            <thead>
              <tr>
                {['等级', '名称', '库存（枚）', '托盘数'].map(h => <th key={h} style={{
              textAlign: h.includes('库存') || h.includes('托盘') ? 'right' : 'left'
            }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={4} className={u.emptyCenter}>加载中…</td></tr> : stock.length === 0 ? <tr><td colSpan={4} className={u.emptyCenter}>暂无数据</td></tr> : stock.map(g => <tr key={g.grade}>
                    <td>
                      <span style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: 13,
                padding: '2px 8px',
                borderRadius: 6,
                background: 'var(--status-warning-bg-light)',
                color: 'var(--status-warning)',
                border: '1px solid var(--status-warning-border)'
              }}>{g.grade}</span>
                    </td>
                    <td>{g.name}</td>
                    <td style={{
              textAlign: 'right',
              fontWeight: 700,
              color: g.qty > 0 ? 'var(--status-warning)' : 'var(--text-secondary)'
            }}>{g.qty.toLocaleString()}</td>
                    <td style={{
              textAlign: 'right',
              color: 'var(--text-secondary)'
            }}>{g.trays}</td>
                  </tr>)}
            </tbody>
          </table>
        </div>}

      {/* ── 入库 Tab（来源栋舍：动态拉取，与移动端共用 /api/farm/feed/houses）── */}
      {tab === 'inbound' && <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      overflow: 'auto'
    }}>
          <table className={s.table}>
            <thead>
              <tr>
                {['等级', '名称', '库存（枚）', '入库数量', '来源栋舍'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {EGG_GRADES.map(g => {
            const e = inboundEntries[g.code] ?? {
              qty: 0,
              house_code: houses[0] ?? ''
            };
            const stockQty = stock.find(x => x.grade === g.code)?.qty ?? 0;
            return <tr key={g.code} style={{
              background: e.qty > 0 ? 'var(--status-success-bg-page)' : undefined
            }}>
                    <td>
                      <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'var(--status-warning-bg-light)',
                  color: 'var(--status-warning)'
                }}>{g.code}</span>
                    </td>
                    <td>{g.name}</td>
                    <td className={u.muted}>{stockQty.toLocaleString()}</td>
                    <td>
                      {canEdit ? <input type="number" min="0" value={e.qty || ''} onChange={ev => setInboundEntries(p => ({
                  ...p,
                  [g.code]: {
                    ...e,
                    qty: Math.max(0, Number(ev.target.value) || 0)
                  }
                }))} placeholder="0" style={inputStyle} /> : e.qty}
                    </td>
                    <td>
                      {canEdit ? <select value={e.house_code} onChange={ev => setInboundEntries(p => ({
                  ...p,
                  [g.code]: {
                    ...e,
                    house_code: ev.target.value
                  }
                }))} style={selectStyle}>
                          {houses.map(h => <option key={h} value={h}>{h}</option>)}
                        </select> : e.house_code}
                    </td>
                  </tr>;
          })}
            </tbody>
          </table>
        </div>}

      {/* ── 出库 Tab（客户：动态拉取，与移动端共用 /api/farm/sales/customers）── */}
      {tab === 'outbound' && <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      overflow: 'auto'
    }}>
          <table className={s.table}>
            <thead>
              <tr>
                {['等级', '名称', '库存（枚）', '出库数量', '客户'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {EGG_GRADES.map(g => {
            const e = outboundEntries[g.code] ?? {
              qty: 0,
              customer_no: ''
            };
            const stockQty = stock.find(x => x.grade === g.code)?.qty ?? 0;
            return <tr key={g.code} style={{
              background: e.qty > 0 ? 'var(--status-warning-bg-page)' : undefined
            }}>
                    <td>
                      <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'var(--status-warning-bg-light)',
                  color: 'var(--status-warning)'
                }}>{g.code}</span>
                    </td>
                    <td>{g.name}</td>
                    <td style={{
                color: stockQty < (e.qty || 0) ? 'var(--status-danger)' : 'var(--text-secondary)',
                fontWeight: stockQty < (e.qty || 0) ? 700 : 400
              }}>{stockQty.toLocaleString()}</td>
                    <td>
                      {canEdit ? <input type="number" min="0" value={e.qty || ''} onChange={ev => setOutboundEntries(p => ({
                  ...p,
                  [g.code]: {
                    ...e,
                    qty: Math.max(0, Number(ev.target.value) || 0)
                  }
                }))} placeholder="0" style={inputStyle} /> : e.qty}
                    </td>
                    <td>
                      {canEdit ? (/* 与移动端一致：下拉选择客户，存 customer_code 到 customer_no 字段 */
                <select value={e.customer_no} onChange={ev => setOutboundEntries(p => ({
                  ...p,
                  [g.code]: {
                    ...e,
                    customer_no: ev.target.value
                  }
                }))} style={{
                  ...selectStyle,
                  minWidth: 160
                }}>
                          <option value="">— 选择客户 —</option>
                          {customers.map(c => <option key={c.customer_code} value={c.customer_code}>
                              {c.customer_name}（{c.customer_code}）
                            </option>)}
                        </select>) : e.customer_no}
                    </td>
                  </tr>;
          })}
            </tbody>
          </table>
        </div>}

      {/* ── 报损 Tab（与移动端共用 /api/farm/egg/write-off，change_type = EGG_WRITE_OFF）── */}
      {tab === 'writeoff' && <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      overflow: 'auto'
    }}>
          <div style={{
        padding: '10px 14px',
        background: 'var(--status-danger-bg-faint)',
        borderBottom: '1px solid var(--status-danger-bg-medium)',
        fontSize: 12,
        color: 'var(--status-danger)'
      }}>
            报损操作将从库存中扣除对应数量，写入 change_type = EGG_WRITE_OFF 流水，不可撤销
          </div>
          <table className={s.table}>
            <thead>
              <tr>
                {['等级', '名称', '当前库存（枚）', '报损数量', '报损原因'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {EGG_GRADES.map(g => {
            const e = writeoffEntries[g.code] ?? {
              qty: 0,
              reason: ''
            };
            const stockQty = stock.find(x => x.grade === g.code)?.qty ?? 0;
            return <tr key={g.code} style={{
              background: e.qty > 0 ? 'var(--status-danger-bg-page)' : undefined
            }}>
                    <td>
                      <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'var(--status-danger-bg-light)',
                  color: 'var(--status-danger)'
                }}>{g.code}</span>
                    </td>
                    <td>{g.name}</td>
                    <td className={u.muted}>{stockQty.toLocaleString()}</td>
                    <td>
                      {canEdit ? <input type="number" min="0" value={e.qty || ''} onChange={ev => setWriteoffEntries(p => ({
                  ...p,
                  [g.code]: {
                    ...e,
                    qty: Math.max(0, Number(ev.target.value) || 0)
                  }
                }))} placeholder="0" style={{
                  ...inputStyle,
                  border: '1px solid var(--status-danger-bg-strong)'
                }} /> : e.qty}
                    </td>
                    <td>
                      {canEdit ? <input type="text" value={e.reason} onChange={ev => setWriteoffEntries(p => ({
                  ...p,
                  [g.code]: {
                    ...e,
                    reason: ev.target.value
                  }
                }))} placeholder="如：破损/过期…" style={{
                  width: 180,
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-page)',
                  color: 'var(--text-primary)',
                  fontSize: 13
                }} /> : e.reason || '—'}
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
            <input type="date" value={ledgerStart} onChange={e => setLedgerStart(e.target.value)} style={{
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
            <button className={s.btnSecondary} onClick={loadLedger} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
              <RefreshCw size={14} />查询
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
                  {['日期', '等级', '类型', '数量变动(枚)', '栋舍/客户', '备注', '操作人'].map(h => <th key={h} style={{
                textAlign: h.includes('数量') ? 'right' : 'left'
              }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={7} className={u.emptyCenter}>加载中…</td></tr> : ledger.length === 0 ? <tr><td colSpan={7} className={u.emptyCenter}>暂无数据</td></tr> : ledger.map(e => <tr key={e.id}>
                      <td className={u.muted}>{e.log_date}</td>
                      <td>
                        <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'var(--status-warning-bg-light)',
                  color: 'var(--status-warning)'
                }}>{e.grade}</span>
                      </td>
                      <td>
                        <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: `${CHANGE_COLOR[e.change_type] ?? 'var(--text-disabled)'}20`,
                  color: CHANGE_COLOR[e.change_type] ?? 'var(--text-disabled)'
                }}>
                          {CHANGE_LABELS[e.change_type] ?? e.change_type}
                        </span>
                      </td>
                      <td style={{
                textAlign: 'right',
                fontWeight: 700,
                color: e.qty_change > 0 ? 'var(--status-success)' : 'var(--status-warning)'
              }}>
                        {e.qty_change > 0 ? '+' : ''}{e.qty_change.toLocaleString()}
                      </td>
                      <td className={u.muted12}>{e.house_code ?? e.customer_no ?? '—'}</td>
                      <td className={u.muted12}>{e.note ?? '—'}</td>
                      <td className={u.muted}>{e.operator}</td>
                    </tr>)}
              </tbody>
            </table>
          </div>
        </>}
    </div>;
}
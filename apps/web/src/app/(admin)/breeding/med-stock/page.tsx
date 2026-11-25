'use client';

import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import PageHeader from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import { useMedicineInbound } from '@/hooks/useMedicineInbound';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatBusinessEnum, formatMasterData } from '@/lib/business-display';
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
interface MedicineWarehouse {warehouse_code:string;site_code:string;company_code:string}
interface MedStock {
  material_code?:string;
  medication_code: string;
  medication_name: string;
  dosage: string;
  qty: number;
  unit: string;
  other_units?: {qty:number;unit:string}[];
}
interface MedLedger {
  id: number;
  log_date: string;
  change_type: string;
  medication_code: string;
  medication_name: string;
  qty_change: number;
  unit?:string;
  house_code: string | null;
  note: string | null;
  operator: string;
}
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};
type Tab = 'stock' | 'inbound' | 'ledger';
interface EntryRow {
  manufacturerBatch?:string;
  expireDate?:string;
  qty: number;
  house_code: string;
  note: string;
}
export default function MedStockPage() {
  const {
    can
  } = usePermission();
  const { t, lang } = useLanguage();
  // G24-A：PBAC 收口 — 药品库存归 MENU_FARM_VET 域
  const { canEdit, user } = usePermission('MENU_FARM_VET');
  const inbound = useMedicineInbound(String(user.userId ?? user.id ?? user.username ?? ''), '/api/farm/medicine/inbound/receipted');
  const [tab, setTab] = useState<Tab>('stock');
  const [search, setSearch] = useState('');
  const [stock, setStock] = useState<MedStock[]>([]);
  const [ledger, setLedger] = useState<MedLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [receiptLines, setReceiptLines] = useState<{ batchNo: string; ledgerId: number }[]>([]);
  const [error, setError] = useState('');
  const [warehouses,setWarehouses] = useState<MedicineWarehouse[]>([]);
  const [warehouseCode,setWarehouseCode] = useState('');
  const warehouse = warehouses.find(w=>w.warehouse_code===warehouseCode);
  useEffect(()=>{
    if (tab !== 'inbound') return;
    let active=true;
    apiFetch<MedicineWarehouse[]>('/api/farm/medicine/inbound-warehouses').then(rows=>{
      if (!active) return;
      setWarehouses(rows);
      setWarehouseCode(previous=>rows.some(w=>w.warehouse_code===previous)?previous:rows.length===1?rows[0].warehouse_code:'');
    }).catch((e:Error)=>{if(active) setError(e.message);});
    return ()=>{active=false;};
  },[tab]);
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
    house_code: '',
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
    if (!canEdit || saving || !inbound.pending && (!hasChanges || !warehouse)) return;
    setSaving(true);
    setError('');
    try {
      const items = inbound.pending || !warehouse ? [] : Object.entries(entries).filter(([, e]) => e.qty > 0).map(([code, e]) => ({
        ...warehouse, material_code: code,
        qty: e.qty, manufacturer_batch_no:e.manufacturerBatch || undefined, expire_date:e.expireDate || undefined,
        house_code: undefined,
        note: e.note || undefined
      }));
      const receipt = await inbound.submit(today(), items);
      if (!receipt) return;
      setReceiptLines(receipt.lines);
      setSaved(true);
      setEntries({});
      setTimeout(() => setSaved(false), 3000);
      await loadStock();
      setTab('stock');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const filteredStock = stock.filter(m => !search || m.medication_name.includes(search) || m.medication_code.includes(search));
  const TABS: {
    key: Tab;
    label: string;
  }[] = [{
    key: 'stock',
    label: t('ui.库存总览', '库存总览')
  }, {
    key: 'inbound',
    label: t('ui.今日入库', '今日入库')
  }, {
    key: 'ledger',
    label: t('ui.流水台账', '流水台账')
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
        {tab === 'inbound' && canEdit && (
          <button onClick={handleSave} disabled={saving || !hasChanges || !warehouse} style={{ ...(saved ? secondaryActionButton : primaryActionButton), alignSelf: 'flex-start', marginBottom: 2, opacity: hasChanges ? 1 : 0.5 }}>
            {saving ? t('ui.提交中', '提交中…') : saved ? t('ui.已保存', '已保存') : t('ui.提交', '提交')}
          </button>
        )}
        {tab === 'stock' && (
          <button onClick={loadStock} style={{ ...secondaryActionButton, alignSelf: 'flex-start', marginBottom: 2 }}>
            <RefreshCw size={13} />{t('common.refresh', '刷新')}
          </button>
        )}
      </div>

      {receiptLines.length > 0 && <p role="status">{t('ui.药品入库回执', '药品入库回执')}
        {receiptLines.map(line => <span key={line.ledgerId}> · {line.batchNo} #{line.ledgerId}</span>)}
      </p>}
      {inbound.pending && canEdit && <div role="status">
        {t('ui.药品入库结果待核', '药品入库结果待核')} · {inbound.pending.date}
        <button type="button" disabled={saving} onClick={handleSave}>{t('ui.找回药品入库回执', '找回原入库回执')}</button>
      </div>}
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
    }}>✓ {t('ui.已保存', '已保存')}</div>}

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
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('ui.搜索药品名称…', '搜索药品名称…')} style={{
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
              }}>{t(`ui.${h}`, h)}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={5} className={u.emptyCenter}>{t('ui.加载中…', '加载中…')}</td></tr> : filteredStock.length === 0 ? <tr><td colSpan={5} className={u.emptyCenter}>{t('ui.暂无数据', '暂无数据')}</td></tr> : filteredStock.map(m => <tr key={(m.material_code ? 'MATERIAL:' : 'LEGACY:') +m.medication_code}>
                      <td>{m.medication_name}{!m.material_code && <small style={{display:'block'}}>{t('breeding.vet.legacyLot', '历史药品库存，领用前须核实实物、物料和单位')}</small>}</td>
                      <td className={u.muted}>{m.dosage}</td>
                      <td style={{
                textAlign: 'right',
                color: (m.qty > 0 || m.other_units?.some(b=>b.qty>0)) ? 'var(--status-special)' : 'var(--text-secondary)'
              }}>{m.qty}</td>
                      <td className={u.muted}>{m.unit}{m.other_units?.map(b => <span key={b.unit}> · {b.qty} {b.unit}</span>)}</td>
                      <td>
                        <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: (m.qty > 0 || m.other_units?.some(b=>b.qty>0)) ? 'var(--status-special-bg)' : 'var(--status-neutral-bg-light)',
                  color: (m.qty > 0 || m.other_units?.some(b=>b.qty>0)) ? 'var(--status-special)' : 'var(--text-secondary)',
                  border: `1px solid ${(m.qty > 0 || m.other_units?.some(b=>b.qty>0)) ? 'var(--status-special-border)' : 'var(--border)'}`
                }}>
                          {(m.qty > 0 || m.other_units?.some(b=>b.qty>0)) ? t('ui.有库存', '有库存') : t('ui.无库存', '无库存')}
                        </span>
                      </td>
                    </tr>)}
              </tbody>
            </table>
          </div>
        </>}

      {tab === 'inbound' && <label>入库药品仓
        <select aria-label="入库药品仓" className={s.inp} value={warehouseCode} onChange={e=>setWarehouseCode(e.target.value)}>
          <option value="">请选择所属场站的药品仓</option>
          {warehouses.map(w=><option key={w.warehouse_code} value={w.warehouse_code}>{w.site_code} · {w.warehouse_code}</option>)}
        </select>
      </label>}
      {/* ── 入库 / 出库 Tab ── */}
      {tab === 'inbound' && <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      overflow: 'auto'
    }}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>{t('ui.药品名称', '药品名称')}</th>
                <th>{t('ui.规格', '规格')}</th>
                <th className={u.tar}>{t('ui.库存', '库存')}</th>
                <th className={u.tac}>{t('ui.数量', '数量')}</th>
                <th>厂家批号</th><th>有效期</th><th>{t('ui.备注', '备注')}</th>
              </tr>
            </thead>
            <tbody>
              {stock.filter(m=>m.material_code).map(m => {
            const e = getEntry(m.medication_code);
            return <tr key={m.medication_code} style={{
              background: e.qty > 0 ? 'rgba(139,92,246,0.04)' : undefined
            }}>
                    <td>{m.medication_name}{!m.material_code && <small style={{display:'block'}}>{t('breeding.vet.legacyLot', '历史药品库存，领用前须核实实物、物料和单位')}</small>}</td>
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
                    <td><input aria-label="厂家批号" disabled={!canEdit} value={e.manufacturerBatch || ''} onChange={ev=>setEntry(m.medication_code,{manufacturerBatch:ev.target.value})}/></td>
                    <td><input aria-label="有效期" type="date" disabled={!canEdit} value={e.expireDate || ''} onChange={ev=>setEntry(m.medication_code,{expireDate:ev.target.value})}/></td>
                    <td>
                      {canEdit ? <input type="text" value={e.note} onChange={ev => setEntry(m.medication_code, {
                  note: ev.target.value
                })} placeholder={t('ui.备注','备注')} style={{
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
        }}>{t('ui.开始日期', '开始日期')}</label>
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
        }}>{t('ui.结束日期', '结束日期')}</label>
            <input type="date" value={ledgerEnd} onChange={e => setLedgerEnd(e.target.value)} style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 13,
          color: 'var(--text-primary)',
          background: 'var(--bg-card)'
        }} />
            <button onClick={loadLedger} style={secondaryActionButton}>
              <RefreshCw size={13} />{t('ui.查询', '查询')}
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
              }}>{t(`ui.${h}`, h)}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={7} className={u.emptyCenter}>{t('ui.加载中…', '加载中…')}</td></tr> : ledger.length === 0 ? <tr><td colSpan={7} className={u.emptyCenter}>{t('ui.暂无数据', '暂无数据')}</td></tr> : ledger.map(e => <tr key={e.id}>
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
                          {formatBusinessEnum('medicationLedger', e.change_type, lang)}
                        </span>
                      </td>
                      <td style={{
                textAlign: 'right',
                color: e.qty_change > 0 ? 'var(--status-success)' : 'var(--status-danger)'
              }}>
                        {e.qty_change > 0 ? '+' : ''}{e.qty_change} {e.unit}
                      </td>
                      <td className={u.muted}>{formatMasterData(e as unknown as Record<string, unknown>, 'house_name', e.house_code, lang)}</td>
                      <td className={u.muted12}>{e.note ?? '—'}</td>
                      <td className={u.muted}>{e.operator}</td>
                    </tr>)}
              </tbody>
            </table>
          </div>
        </>}
    </div>;
}

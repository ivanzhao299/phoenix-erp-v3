'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import u from "@/styles/uix-utils.module.css";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, Search,
  TrendingUp, History, Package,
  Sun, Moon,
} from 'lucide-react';
import { mobileApi, invalidateCache, MedicineWarehouse, MedStockRow, MedLedgerEntry } from '@/lib/mobile-api';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { usePermission } from '@/hooks/usePermission';
import { useMedicineInbound } from '@/hooks/useMedicineInbound';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { useLanguage } from '@/contexts/LanguageContext';



type Tab = 'stock' | 'inbound' | 'ledger';

interface EntryRow {
  qty:        number;
  note:       string;
}

export default function MedicinePage() {
  const { canEdit, user } = usePermission('MENU_FARM_VET');
  const actor = String(user.userId ?? user.id ?? user.username ?? '');
  const { allowed, loading, readonly } = useMobilePermission('medicine');
  return !loading && allowed ? <MedicineWorkbench key={actor} actor={actor} readonly={!canEdit || readonly} /> : null;
}

function MedicineWorkbench({ actor, readonly }: { actor: string; readonly: boolean }) {
  const router = useRouter();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
  const { isDark, toggle, t } = useMobileTheme();
  const { t: tr } = useLanguage();
  const inbound = useMedicineInbound(actor, '/api/farm/medicine/inbound/receipted');
  const CHANGE_LABELS_TR: Record<string, string> = {
    MED_INBOUND:  tr('mob.brd.inbound', '入库'),
    MED_OUTBOUND: tr('mob.brd.outbound', '出库'),
  };

  const [tab, setTab]     = useState<Tab>('stock');
  const [search, setSearch] = useState('');

  const [stock, setStock]     = useState<MedStockRow[]>([]);
  const [ledger, setLedger]   = useState<MedLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [receiptLines, setReceiptLines] = useState<{ batchNo: string; ledgerId: number }[]>([]);
  const [error, setError]     = useState('');

  const [entries, setEntries] = useState<Record<string, EntryRow>>({});
  const submitted = useRef<Record<string, EntryRow> | undefined>(undefined);
  const entryLocked = saving || readonly || !inbound.ready || Boolean(inbound.pending);

  const [warehouses, setWarehouses] = useState<MedicineWarehouse[]>([]);
  const [warehouseCode, setWarehouseCode] = useState('');
  const warehouse = warehouses.find(row => row.warehouse_code === warehouseCode);
  useEffect(() => {
    if (readonly || tab !== 'inbound') return;
    let active = true;
    mobileApi.getMedicineWarehouses().then(rows => {
      if (!active) return;
      setWarehouses(rows);
      setWarehouseCode(previous => rows.some(row => row.warehouse_code === previous)
        ? previous : rows.length === 1 ? rows[0].warehouse_code : '');
    }).catch((err: Error) => {
      if (active) {
        setWarehouses([]);
        setWarehouseCode('');
        setError(err.message);
      }
    });
    return () => { active = false; };
  }, [readonly, tab]);

  const [houseMap, setHouseMap] = useState<Record<string, string>>({});
  useEffect(() => {
    mobileApi.getFeedHousesDetail()
      .then(rows => setHouseMap(Object.fromEntries(rows.map(row => [row.house_code, row.house_name || row.house_code]))))
      .catch(() => setHouseMap({}));
  }, []);

  const loadStock = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStock(await mobileApi.getMedStock());
    } catch (e: any) {
      setError(e.message || tr('mob.brd.load_fail', '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setLedger(await mobileApi.getMedLedger(today, today));
    } catch (e: any) {
      setError(e.message || tr('mob.brd.load_fail', '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    if (tab === 'ledger') loadLedger();
    else loadStock();
  }, [tab, loadStock, loadLedger]);


  const getEntry = (code: string): EntryRow =>
    entries[code] ?? { qty: 0, note: '' };

  const setEntry = (code: string, patch: Partial<EntryRow>) => {
    if (entryLocked) return;
    setEntries(p => ({ ...p, [code]: { ...getEntry(code), ...patch } }));
    setSaved(false);
  };

  const filteredStock = stock.filter(m =>
    !search || m.medication_name.includes(search) || m.medication_code.includes(search)
  );

  const hasChanges = Object.values(entries).some(e => e.qty > 0);

  async function handleInbound(recovering: boolean) {
    if (readonly || saving || !inbound.ready) return;
    if (recovering ? !inbound.pending : entryLocked || !hasChanges || !warehouse || tab !== 'inbound') return;
    if (!recovering) submitted.current = entries;
    const submittedEntries = submitted.current;
    setSaving(true);
    setError('');
    try {
      const items = recovering || !warehouse ? [] : Object.entries(entries)
        .filter(([, e]) => e.qty > 0)
        .map(([code, e]) => ({
          material_code: code,
          company_code: warehouse.company_code,
          site_code: warehouse.site_code,
          warehouse_code: warehouse.warehouse_code,
          qty:             e.qty,
          note:            e.note || undefined,
        }));

      const receipt = recovering ? await inbound.recover() : await inbound.submit(today, items);
      if (!receipt) return;
      setReceiptLines(receipt.lines);
      invalidateCache('medStock');
      setSaved(true);
      setEntries(current => current === submittedEntries ? {} : current);
      submitted.current = undefined;
      setTimeout(() => setSaved(false), 3000);
      setTab('stock');
    } catch (e: any) {
      setError(e.message || tr('mob.brd.save_fail', '保存失败'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
      {/* 头部 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
        background: t.appBarBg, backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${t.barBorder}`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text, flex: 1 }}>💊 {tr('mob.brd.medicine_ledger', '药品台账')}</span>
        <button onClick={() => tab === 'ledger' ? loadLedger() : loadStock()}
          style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 4 }}>
          <RefreshCw size={16} />
        </button>
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: t.textSub, display: 'flex', alignItems: 'center',
        }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {(tab === 'inbound' && !readonly) && (
          <button
            onClick={() => void handleInbound(false)}
            disabled={entryLocked || !hasChanges || !warehouse}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 14px', borderRadius: 10,
              background: saved ? 'var(--status-success-bg-strong)' : hasChanges ? 'var(--status-warning-bg-medium)' : t.btnBg,
              border: `1px solid ${saved ? 'var(--status-success)' : hasChanges ? 'var(--status-warning-bg-strong)' : t.btnBorder}`,
              color: saved ? 'var(--status-success)' : hasChanges ? 'var(--status-warning)' : t.textFaint,
              cursor: hasChanges ? 'pointer' : 'default', fontSize: 13, fontWeight: 700,
            }}
          >
            {saving ? tr('mob.brd.submitting_short', '提交…') : saved ? tr('mob.brd.saved', '已保存') : tr('mob.brd.save', '保存')}
          </button>
        )}
      </div>

      {/* Tab */}
      <div style={{ display: 'grid', gridTemplateColumns: readonly ? 'repeat(2,1fr)' : 'repeat(3,1fr)', background: t.appBarBg, borderBottom: `1px solid ${t.barBorder}` }}>
        {([
          { key: 'stock',    label: tr('mob.brd.stock', '库存'), icon: <Package size={14} /> },
          { key: 'inbound',  label: tr('mob.brd.inbound', '入库'), icon: <TrendingUp size={14} /> },
          { key: 'ledger', label: tr('mob.brd.today_ledger', '今日流水'), icon: <History size={14} /> },
        ] as const).filter(item => item.key !== 'inbound' || !readonly).map(tab_ => (
          <button key={tab_.key} onClick={() => setTab(tab_.key)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '12px 0',
              background: tab === tab_.key ? 'var(--status-special-bg)' : 'none',
              border: 'none', borderBottom: `2px solid ${tab === tab_.key ? 'var(--color-purple-500)' : 'transparent'}`,
              color: tab === tab_.key ? 'var(--color-purple-500)' : t.textMuted,
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}
          >
            {tab_.icon}{tab_.label}
          </button>
        ))}
      </div>

      <Link href="/breeding/medicine" style={{ padding: '10px 16px', color: t.text }}>
        {tr('menu.brd-medicine', '用药记录')}
      </Link>

      {/* 搜索框（库存 tab） */}
      {tab === 'stock' && (
        <div style={{ padding: '10px 16px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: t.inputBg, border: `1px solid ${t.inputBorder}` }}>
            <Search size={14} style={{ color: t.textFaint, flexShrink: 0 }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tr('mob.brd.search_medicine', '搜索药品名称…')}
              style={{ flex: 1, background: 'none', border: 'none', color: t.text, fontSize: 13, outline: 'none' }}
            />
          </div>
        </div>
      )}

      {/* 错误 */}
      {receiptLines.length > 0 && <p role="status">{tr('ui.药品入库回执', '药品入库回执')}
        {receiptLines.map(line => <span key={line.ledgerId}> · {line.batchNo} #{line.ledgerId}</span>)}
      </p>}
      {inbound.pending && !readonly && <div role="status">
        {tr('ui.药品入库结果待核', '药品入库结果待核')} · {inbound.pending.date}
        <button type="button" disabled={saving} onClick={() => void handleInbound(true)}>{tr('ui.找回药品入库回执', '找回原入库回执')}</button>
      </div>}
      {error && (
        <div role="alert" style={{ margin: '8px 16px 0', padding: 10, borderRadius: 10, background: 'var(--status-danger-bg-light)', border: '1px solid var(--status-danger-bg-strong)', color: 'var(--status-danger)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* 内容 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

        {/* ── 库存 Tab ── */}
        {tab === 'stock' && (
          <>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[1,2,3,4,5,6].map(i => <div key={i} style={{ height: 54, borderRadius: 12, background: t.cardBg, animation: 'pulse 1.5s infinite' }} />)}
              </div>
            ) : (
              filteredStock.map(m => (
                <div key={m.material_code ? 'material-' + m.material_code : 'legacy-' + m.medication_code} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '11px 14px', borderRadius: 12, marginBottom: 6,
                  background: m.qty > 0 ? 'rgba(139,92,246,0.05)' : t.cardBg,
                  border: `1px solid ${m.qty > 0 ? 'rgba(139,92,246,0.2)' : t.cardBorder}`,
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: m.qty > 0 ? t.text : t.textMuted }}>{m.medication_name}</div>
                    {!m.material_code && <small>{tr('breeding.vet.legacyLot', '历史药品库存，领用前须核实实物、物料和单位')}</small>}
                    <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>{m.dosage}</div>
                  </div>
                  <div className={u.tar}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: m.qty > 0 ? 'var(--color-purple-500)' : t.textFaint }}>
                      {m.qty}
                    </div>
                    <div style={{ fontSize: 10, color: t.textFaint }}>{m.unit}</div>
                    {m.other_units?.map(balance => <div key={balance.unit}>{balance.qty} {balance.unit}</div>)}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── 入库 Tab ── */}
        {(tab === 'inbound' && !readonly) && (
          <>
            {saved && (
              <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 12, background: 'var(--status-success-bg-medium)', border: '1px solid var(--status-success-bg-strong)', color: 'var(--status-success)', fontSize: 13 }}>
                ✓ {tr('mob.brd.saved', '已保存')}
              </div>
            )}

            <label style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
              {tr('ui.仓库', '仓库')}
              <select value={warehouseCode} disabled={entryLocked} onChange={event => {
                setWarehouseCode(event.target.value);
                setEntries({});
              }}>
                <option value="">{tr('common.select', '请选择')}</option>
                {warehouses.map(row => <option key={row.warehouse_code} value={row.warehouse_code}>{row.warehouse_code}</option>)}
              </select>
            </label>
            {stock.map(m => {
              const code = m.material_code;
              if (!code) return null;
              const e = getEntry(code);
              return (
                <div key={m.medication_code} style={{
                  borderRadius: 14, marginBottom: 8, overflow: 'hidden',
                  background: e.qty > 0 ? 'rgba(139,92,246,0.07)' : t.cardBg,
                  border: `1px solid ${e.qty > 0 ? 'var(--status-special-border)' : t.cardBorder}`,
                }}>
                  {/* 药品名 + 库存参考 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px 6px' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{m.medication_name}</div>
                      <div style={{ fontSize: 11, color: t.textFaint }}>{m.dosage}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: t.textFaint }}>{tr('mob.brd.stock', '库存')} {m.qty} {m.unit}</div>
                  </div>

                  {/* 数量与备注 */}
                  <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 10, color: t.textFaint }}>{tr('mob.brd.qty', '数量')}</div>
                      <input
                        type="number" inputMode="numeric" min="0" disabled={entryLocked}
                        value={e.qty || ''}
                        onChange={ev => setEntry(code, { qty: Math.max(0, Number(ev.target.value) || 0) })}
                        placeholder="0"
                        style={{
                          width: 72, height: 34, textAlign: 'center',
                          background: e.qty > 0 ? 'var(--status-special-bg-medium)' : t.inputBg,
                          border: `1px solid ${e.qty > 0 ? 'rgba(139,92,246,0.4)' : t.inputBorder}`,
                          borderRadius: 8, color: e.qty > 0 ? 'var(--color-purple-400)' : t.textSub,
                          fontSize: 14, fontWeight: 700, outline: 'none', WebkitAppearance: 'none',
                        }}
                      />
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 10, color: t.textFaint }}>{tr('mob.brd.note', '备注')}</div>
                      <input
                        type="text" disabled={entryLocked}
                        value={e.note}
                        onChange={ev => setEntry(code, { note: ev.target.value })}
                        placeholder={tr('mob.brd.supplier_batch', '供应商/批号…')}
                        style={{
                          height: 34, padding: '0 8px',
                          background: t.cardBg,
                          border: `1px solid ${t.cardBorder}`,
                          borderRadius: 8, color: t.textSub,
                          fontSize: 12, outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── 今日流水 ── */}
        {tab === 'ledger' && ledger.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: t.textFaint, marginBottom: 8 }}>{tr('mob.brd.today_ledger', '今日流水')}</div>
            {ledger.map(e => (
              <div key={e.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: 10, marginBottom: 6,
                background: t.sectionBg, border: `1px solid ${t.cardBorder}`,
              }}>
                <div>
                  <div style={{ fontSize: 12, color: t.textSub }}>{e.medication_name}</div>
                  <div style={{ fontSize: 10, color: t.textFaint }}>
                    {CHANGE_LABELS_TR[e.change_type] ?? e.change_type}
                    {e.house_code ? ` · ${houseMap[e.house_code] || e.house_code}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: e.qty_change > 0 ? 'var(--color-purple-500)' : 'var(--status-danger)' }}>
                  {e.qty_change > 0 ? '+' : ''}{e.qty_change}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

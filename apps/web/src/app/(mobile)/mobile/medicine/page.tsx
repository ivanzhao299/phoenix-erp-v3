'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, Search,
  TrendingUp, TrendingDown, Package,
} from 'lucide-react';
import { mobileApi, MedStockRow, MedLedgerEntry } from '@/lib/mobile-api';

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DEFAULT_HOUSES = ['2号舍', '3号舍', '4号舍', '5号舍', '6号舍', '全场'];

type Tab = 'stock' | 'inbound' | 'outbound';

const CHANGE_LABELS: Record<string, string> = {
  MED_INBOUND:  '入库',
  MED_OUTBOUND: '出库',
};

interface EntryRow {
  qty:        number;
  house_code: string;
  note:       string;
}

export default function MedicinePage() {
  const router = useRouter();
  const today  = fmtDate(new Date());

  const [tab, setTab]     = useState<Tab>('stock');
  const [search, setSearch] = useState('');

  const [stock, setStock]     = useState<MedStockRow[]>([]);
  const [ledger, setLedger]   = useState<MedLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  // 入库 / 出库 entries：{ medication_code → EntryRow }
  const [entries, setEntries] = useState<Record<string, EntryRow>>({});

  const loadStock = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStock(await mobileApi.getMedStock());
    } catch (e: any) {
      setError(e.message || '加载失败');
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
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    if (tab === 'stock') loadStock();
    else if (tab === 'outbound') loadLedger();
    else setLoading(false);
  }, [tab, loadStock, loadLedger]);

  const getEntry = (code: string): EntryRow =>
    entries[code] ?? { qty: 0, house_code: DEFAULT_HOUSES[0], note: '' };

  const setEntry = (code: string, patch: Partial<EntryRow>) => {
    setEntries(p => ({ ...p, [code]: { ...getEntry(code), ...patch } }));
    setSaved(false);
  };

  const filteredStock = stock.filter(m =>
    !search || m.medication_name.includes(search) || m.medication_code.includes(search)
  );

  const hasChanges = Object.values(entries).some(e => e.qty > 0);

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setError('');
    try {
      const items = Object.entries(entries)
        .filter(([, e]) => e.qty > 0)
        .map(([code, e]) => ({
          medication_code: code,
          qty:             e.qty,
          house_code:      tab === 'outbound' ? e.house_code : undefined,
          note:            e.note || undefined,
        }));

      if (tab === 'inbound') {
        await mobileApi.medInbound(today, items);
      } else {
        await mobileApi.medOutbound(today, items);
      }
      setSaved(true);
      setEntries({});
      setTimeout(() => setSaved(false), 3000);
      loadStock();
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100svh', background: 'linear-gradient(160deg,#070b14 0%,#0f1929 100%)', display: 'flex', flexDirection: 'column' }}>
      {/* 头部 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'white', flex: 1 }}>💊 药品台账</span>
        <button onClick={() => tab === 'stock' ? loadStock() : loadLedger()}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4 }}>
          <RefreshCw size={16} />
        </button>
        {(tab === 'inbound' || tab === 'outbound') && (
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 14px', borderRadius: 10,
              background: saved ? 'rgba(16,185,129,0.2)' : hasChanges ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${saved ? 'rgba(16,185,129,0.4)' : hasChanges ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.1)'}`,
              color: saved ? '#10b981' : hasChanges ? '#f59e0b' : 'rgba(255,255,255,0.3)',
              cursor: hasChanges ? 'pointer' : 'default', fontSize: 13, fontWeight: 700,
            }}
          >
            {saving ? '提交…' : saved ? '已保存' : '保存'}
          </button>
        )}
      </div>

      {/* Tab */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {([
          { key: 'stock',    label: '库存', icon: <Package size={14} /> },
          { key: 'inbound',  label: '入库', icon: <TrendingUp size={14} /> },
          { key: 'outbound', label: '出库', icon: <TrendingDown size={14} /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '12px 0',
              background: tab === t.key ? 'rgba(139,92,246,0.1)' : 'none',
              border: 'none', borderBottom: `2px solid ${tab === t.key ? '#8b5cf6' : 'transparent'}`,
              color: tab === t.key ? '#8b5cf6' : 'rgba(255,255,255,0.4)',
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* 搜索框（库存 tab） */}
      {tab === 'stock' && (
        <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.1)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Search size={14} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索药品名称…"
              style={{ flex: 1, background: 'none', border: 'none', color: 'white', fontSize: 13, outline: 'none' }}
            />
          </div>
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div style={{ margin: '8px 16px 0', padding: 10, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12 }}>
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
                {[1,2,3,4,5,6].map(i => <div key={i} style={{ height: 54, borderRadius: 12, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s infinite' }} />)}
              </div>
            ) : (
              filteredStock.map(m => (
                <div key={m.medication_code} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '11px 14px', borderRadius: 12, marginBottom: 6,
                  background: m.qty > 0 ? 'rgba(139,92,246,0.05)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${m.qty > 0 ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: m.qty > 0 ? 'white' : 'rgba(255,255,255,0.4)' }}>{m.medication_name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{m.dosage}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: m.qty > 0 ? '#8b5cf6' : 'rgba(255,255,255,0.2)' }}>
                      {m.qty}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{m.unit}</div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── 入库 / 出库 Tab ── */}
        {(tab === 'inbound' || tab === 'outbound') && (
          <>
            {saved && (
              <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: 13 }}>
                ✓ 已保存
              </div>
            )}

            {stock.map(m => {
              const e = getEntry(m.medication_code);
              return (
                <div key={m.medication_code} style={{
                  borderRadius: 14, marginBottom: 8, overflow: 'hidden',
                  background: e.qty > 0 ? 'rgba(139,92,246,0.07)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${e.qty > 0 ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  {/* 药品名 + 库存参考 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px 6px' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{m.medication_name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{m.dosage}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>库存 {m.qty} {m.unit}</div>
                  </div>

                  {/* 数量 + 栋舍/备注 */}
                  <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>数量</div>
                      <input
                        type="number" inputMode="numeric" min="0"
                        value={e.qty || ''}
                        onChange={ev => setEntry(m.medication_code, { qty: Math.max(0, Number(ev.target.value) || 0) })}
                        placeholder="0"
                        style={{
                          width: 72, height: 34, textAlign: 'center',
                          background: e.qty > 0 ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${e.qty > 0 ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 8, color: e.qty > 0 ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                          fontSize: 14, fontWeight: 700, outline: 'none', WebkitAppearance: 'none',
                        }}
                      />
                    </div>

                    {tab === 'outbound' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>栋舍</div>
                        <select
                          value={e.house_code}
                          onChange={ev => setEntry(m.medication_code, { house_code: ev.target.value })}
                          style={{
                            height: 34, padding: '0 8px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white', fontSize: 12, outline: 'none',
                          }}
                        >
                          {DEFAULT_HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    )}

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>备注</div>
                      <input
                        type="text"
                        value={e.note}
                        onChange={ev => setEntry(m.medication_code, { note: ev.target.value })}
                        placeholder={tab === 'inbound' ? '供应商/批号…' : '用途/治疗项目…'}
                        style={{
                          height: 34, padding: '0 8px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 8, color: 'rgba(255,255,255,0.6)',
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

        {/* ── 出库 Tab 下方：今日流水 ── */}
        {tab === 'outbound' && ledger.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>今日流水</div>
            {ledger.map(e => (
              <div key={e.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: 10, marginBottom: 6,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{e.medication_name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                    {CHANGE_LABELS[e.change_type] ?? e.change_type}
                    {e.house_code ? ` · ${e.house_code}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: e.qty_change > 0 ? '#8b5cf6' : '#f87171' }}>
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

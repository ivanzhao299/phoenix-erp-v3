'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, Save, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Package,
  Sun, Moon,
} from 'lucide-react';
import { mobileApi, EggStockRow, EggLedgerEntry, FarmCustomer } from '@/lib/mobile-api';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const EGG_GRADES = [
  { code: '0', name: '0号蛋' },
  { code: '1', name: '1号蛋' },
  { code: '2', name: '2号蛋' },
  { code: '3', name: '3号蛋' },
  { code: '4', name: '4号蛋' },
  { code: '5', name: '5号蛋' },
  { code: 'DIRTY',  name: '脏蛋'  },
  { code: 'BROKEN', name: '破损蛋' },
];

type Tab = 'stock' | 'inbound' | 'outbound';

// 行格式：grade → qty（枚）
type GradeQtyMap = Record<string, number>;

function QtyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useMobileTheme();
  return (
    <input
      type="number" inputMode="numeric" min="0"
      value={value || ''}
      onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
      placeholder="0"
      style={{
        width: 70, height: 34, textAlign: 'center',
        background: value > 0 ? 'var(--status-warning-bg-light)' : t.inputBg,
        border: `1px solid ${value > 0 ? 'var(--status-warning)' : t.inputBorder}`,
        borderRadius: 8, color: value > 0 ? 'var(--status-warning)' : t.textSub,
        fontSize: 14, fontWeight: 700, outline: 'none', WebkitAppearance: 'none',
      }}
    />
  );
}

export default function EggPage() {
  const router = useRouter();
  const today  = fmtDate(new Date());
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading, readonly } = useMobilePermission('egg');

  const [tab, setTab]     = useState<Tab>('stock');
  const [date, setDate]   = useState(today);
  const isToday = date === today;
  const dateLabel = isToday ? '今天' : date === fmtDate(addDays(toDate(today), -1)) ? '昨天' : date;

  const [stock, setStock]       = useState<EggStockRow[]>([]);
  const [ledger, setLedger]     = useState<EggLedgerEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  // 动态栋舍/客户列表（从后端拉取，按农场隔离）
  const [houses, setHouses]       = useState<string[]>([]);
  const [customers, setCustomers] = useState<FarmCustomer[]>([]);

  // 入库：{ house → { grade → qty } }
  const [inboundData, setInboundData]   = useState<Record<string, GradeQtyMap>>({});
  const [selectedHouse, setSelectedHouse] = useState('');

  // 出库：{ customer_code → { grade → qty } }
  const [outboundData, setOutboundData] = useState<Record<string, GradeQtyMap>>({});
  const [selectedCustomer, setSelectedCustomer] = useState('');

  const loadStock = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await mobileApi.getEggStock();
      setStock(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLedger = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await mobileApi.getEggLedger(d, d);
      setLedger(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'stock') loadStock();
    else loadLedger(date);
  }, [tab, date, loadStock, loadLedger]);

  // 拉取栋舍和客户列表（组织隔离：农场用户只见本场数据）
  useEffect(() => {
    mobileApi.getFeedHouses().then(data => {
      setHouses(data);
      if (data.length > 0) setSelectedHouse(h => h || data[0]);
    }).catch(() => {});
    mobileApi.getFarmCustomers().then(data => {
      setCustomers(data);
      if (data.length > 0) setSelectedCustomer(c => c || data[0].customer_code);
    }).catch(() => {});
  }, []);

  if (permLoading || !allowed) return null;

  const getInbound = (house: string, grade: string) =>
    inboundData[house]?.[grade] ?? 0;
  const setInbound = (house: string, grade: string, v: number) => {
    setInboundData(p => ({
      ...p,
      [house]: { ...(p[house] ?? {}), [grade]: v },
    }));
    setSaved(false);
  };

  const getOutbound = (customer: string, grade: string) =>
    outboundData[customer]?.[grade] ?? 0;
  const setOutbound = (customer: string, grade: string, v: number) => {
    setOutboundData(p => ({
      ...p,
      [customer]: { ...(p[customer] ?? {}), [grade]: v },
    }));
    setSaved(false);
  };

  const inboundTotal = houses.reduce((s, h) =>
    s + EGG_GRADES.reduce((s2, g) => s2 + getInbound(h, g.code), 0), 0);

  const outboundTotal = customers.reduce((s, c) =>
    s + EGG_GRADES.reduce((s2, g) => s2 + getOutbound(c.customer_code, g.code), 0), 0);

  const handleSaveInbound = async () => {
    setSaving(true);
    setError('');
    try {
      const items: Array<{ grade: string; qty: number; house_code: string }> = [];
      for (const house of houses) {
        for (const g of EGG_GRADES) {
          const qty = getInbound(house, g.code);
          if (qty > 0) items.push({ grade: g.code, qty, house_code: house });
        }
      }
      if (items.length === 0) { setSaving(false); return; }
      await mobileApi.eggInbound(date, items);
      setSaved(true);
      setInboundData({});
      setTimeout(() => setSaved(false), 3000);
      loadStock();
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOutbound = async () => {
    setSaving(true);
    setError('');
    try {
      const items: Array<{ grade: string; qty: number; customer_no: string }> = [];
      for (const cust of customers) {
        for (const g of EGG_GRADES) {
          const qty = getOutbound(cust.customer_code, g.code);
          if (qty > 0) items.push({ grade: g.code, qty, customer_no: cust.customer_code });
        }
      }
      if (items.length === 0) { setSaving(false); return; }
      await mobileApi.eggOutbound(date, items);
      setSaved(true);
      setOutboundData({});
      setTimeout(() => setSaved(false), 3000);
      loadStock();
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const canSave = tab === 'inbound' ? inboundTotal > 0 : outboundTotal > 0;
  const handleSave = tab === 'inbound' ? handleSaveInbound : handleSaveOutbound;

  const totalStock = stock.reduce((s, r) => s + r.qty, 0);
  const totalTrays = stock.reduce((s, r) => s + r.trays, 0);

  const CHANGE_LABELS: Record<string, string> = {
    EGG_INBOUND_HOUSE: '入库',
    EGG_OUTBOUND_SALE: '出库',
    EGG_WRITE_OFF:     '报损',
  };

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
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text, flex: 1 }}>🥚 鸡蛋出入库</span>
        <button onClick={() => tab === 'stock' ? loadStock() : loadLedger(date)}
          style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 4 }}>
          <RefreshCw size={16} />
        </button>
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: t.textSub, display: 'flex', alignItems: 'center',
        }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {(tab === 'inbound' || tab === 'outbound') && (
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 14px', borderRadius: 10,
              background: saved ? 'var(--status-success-bg-strong)' : canSave ? 'var(--status-warning-bg-medium)' : t.btnBg,
              border: `1px solid ${saved ? 'var(--status-success)' : canSave ? 'var(--status-warning-bg-strong)' : t.btnBorder}`,
              color: saved ? 'var(--status-success)' : canSave ? 'var(--status-warning)' : t.textFaint,
              cursor: canSave ? 'pointer' : 'default', fontSize: 13, fontWeight: 700,
            }}
          >
            <Save size={14} />
            {saving ? '提交…' : saved ? '已保存' : '保存'}
          </button>
        )}
      </div>

      {/* Tab 切换 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
        background: t.appBarBg,
        borderBottom: `1px solid ${t.barBorder}`,
      }}>
        {([
          { key: 'stock',    label: '库存', icon: <Package size={14} /> },
          { key: 'inbound',  label: '入库', icon: <TrendingUp size={14} /> },
          { key: 'outbound', label: '出库', icon: <TrendingDown size={14} /> },
        ] as const).map(tab_ => (
          <button key={tab_.key} onClick={() => setTab(tab_.key)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '12px 0',
              background: tab === tab_.key ? 'var(--status-warning-bg-light)' : 'none',
              border: 'none', borderBottom: `2px solid ${tab === tab_.key ? 'var(--status-warning)' : 'transparent'}`,
              color: tab === tab_.key ? 'var(--status-warning)' : t.textMuted,
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}
          >
            {tab_.icon}{tab_.label}
          </button>
        ))}
      </div>

      {/* 日期（仅入库/出库 tab 显示） */}
      {tab !== 'stock' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'rgba(245,158,11,0.03)',
          borderBottom: '1px solid var(--status-warning-bg-light)',
        }}>
          <button onClick={() => setDate(d => fmtDate(addDays(toDate(d), -1)))}
            style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 6 }}>
            <ChevronLeft size={18} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{dateLabel}</div>
            {dateLabel !== date && <div style={{ fontSize: 10, color: t.textMuted }}>{date}</div>}
          </div>
          <button onClick={() => { if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1))); }} disabled={isToday}
            style={{ background: 'none', border: 'none', color: isToday ? t.textFaint : t.textSub, cursor: isToday ? 'default' : 'pointer', padding: 6 }}>
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div style={{ margin: '8px 16px 0', padding: 10, borderRadius: 10, background: 'var(--status-danger-bg-light)', border: '1px solid var(--status-danger-bg-strong)', color: 'var(--status-danger)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* R1 — Farm Egg 库存能力已删除（本入口不再生成库存） */}
      <div style={{ margin: '8px 16px 0', padding: 10, borderRadius: 10, background: 'var(--status-warning-bg-light)', border: '1px solid var(--status-warning)', color: 'var(--status-warning)', fontSize: 12, lineHeight: 1.5 }}>
        ⚠️ 该入口不再生成库存，库存来源由系统模式控制（临时生产入库 / 包装入库）。请到「包装作业中心」完成集蛋→分级→包装；本页仅供查询。
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

        {/* ── 库存 Tab ─────────────────────────────────────────────── */}
        {tab === 'stock' && (
          <>
            {/* 汇总 */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 8, marginBottom: 12,
            }}>
              <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--status-warning-bg-faint)', border: '1px solid var(--status-warning-border)' }}>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>总库存（枚）</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-warning)' }}>{totalStock.toLocaleString()}</div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--status-warning-bg-faint)', border: '1px solid var(--status-warning-border)' }}>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>总提数</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-warning)' }}>{totalTrays} <span style={{ fontSize: 12, fontWeight: 400 }}>提</span></div>
              </div>
            </div>

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3,4].map(i => <div key={i} style={{ height: 52, borderRadius: 12, background: t.cardBg, animation: 'pulse 1.5s infinite' }} />)}
              </div>
            ) : (
              stock.map(row => (
                <div key={row.grade} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 12, marginBottom: 8,
                  background: row.qty > 0 ? 'var(--status-warning-bg-faint)' : t.cardBg,
                  border: `1px solid ${row.qty > 0 ? 'var(--status-warning-border)' : t.cardBorder}`,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: row.qty > 0 ? t.text : t.textMuted }}>{row.name}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: row.qty > 0 ? 'var(--status-warning)' : t.textFaint }}>
                      {row.qty.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400 }}>枚</span>
                    </div>
                    {row.trays > 0 && (
                      <div style={{ fontSize: 11, color: t.textFaint }}>{row.trays} 提</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── 入库 Tab ─────────────────────────────────────────────── */}
        {tab === 'inbound' && (
          <>
            {inboundTotal > 0 && (
              <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 12, background: 'var(--status-success-bg-medium)', border: '1px solid var(--status-success-bg-strong)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: t.textSub }}>本次入库合计</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--status-success)' }}>{inboundTotal.toLocaleString()} 枚</span>
              </div>
            )}

            {/* 栋舍切换 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
              {houses.map(h => {
                const houseTotal = EGG_GRADES.reduce((s, g) => s + getInbound(h, g.code), 0);
                return (
                  <button key={h} onClick={() => setSelectedHouse(h)}
                    style={{
                      flexShrink: 0, padding: '7px 14px', borderRadius: 10,
                      background: selectedHouse === h ? 'rgba(16,185,129,0.15)' : t.btnBg,
                      border: `1px solid ${selectedHouse === h ? 'var(--status-success)' : t.btnBorder}`,
                      color: selectedHouse === h ? 'var(--status-success)' : t.textSub,
                      cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    }}>
                    {h}{houseTotal > 0 ? ` (${houseTotal})` : ''}
                  </button>
                );
              })}
            </div>

            {/* 规格输入表格 */}
            <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '10px 16px', background: t.cardBg, fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
                <span>规格</span><span>数量（枚）</span>
              </div>
              {EGG_GRADES.map((g, idx) => (
                <div key={g.code} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 16px',
                  background: idx % 2 === 0 ? t.sectionBg : t.cardBg,
                  borderTop: `1px solid ${t.divider}`,
                }}>
                  <span style={{ fontSize: 14, color: getInbound(selectedHouse, g.code) > 0 ? t.text : t.textSub }}>{g.name}</span>
                  <QtyInput
                    value={getInbound(selectedHouse, g.code)}
                    onChange={v => setInbound(selectedHouse, g.code, v)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── 出库 Tab ─────────────────────────────────────────────── */}
        {tab === 'outbound' && (
          <>
            {outboundTotal > 0 && (
              <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 12, background: 'var(--status-danger-bg-faint)', border: '1px solid var(--status-danger-bg-medium)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: t.textSub }}>本次出库合计</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--status-danger)' }}>{outboundTotal.toLocaleString()} 枚</span>
              </div>
            )}

            {/* 客户切换 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
              {customers.map(c => {
                const custTotal = EGG_GRADES.reduce((s, g) => s + getOutbound(c.customer_code, g.code), 0);
                return (
                  <button key={c.customer_code} onClick={() => setSelectedCustomer(c.customer_code)}
                    style={{
                      flexShrink: 0, padding: '7px 14px', borderRadius: 10,
                      background: selectedCustomer === c.customer_code ? 'var(--status-danger-bg-medium)' : t.btnBg,
                      border: `1px solid ${selectedCustomer === c.customer_code ? 'var(--status-danger)' : t.btnBorder}`,
                      color: selectedCustomer === c.customer_code ? 'var(--status-danger)' : t.textSub,
                      cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    }}>
                    {c.customer_name}{custTotal > 0 ? ` (${custTotal})` : ''}
                  </button>
                );
              })}
            </div>

            {/* 规格 × 当前库存参考 */}
            <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', padding: '10px 16px', background: t.cardBg, fontSize: 12, color: t.textMuted, fontWeight: 600, gap: 8 }}>
                <span>规格</span><span style={{ textAlign: 'right' }}>库存</span><span style={{ textAlign: 'right' }}>出库数</span>
              </div>
              {EGG_GRADES.map((g, idx) => {
                const stockQty = stock.find(s => s.grade === g.code)?.qty ?? 0;
                const outQty   = getOutbound(selectedCustomer, g.code);
                const overStock = outQty > stockQty;
                return (
                  <div key={g.code} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto',
                    alignItems: 'center', padding: '10px 16px', gap: 8,
                    background: idx % 2 === 0 ? t.sectionBg : t.cardBg,
                    borderTop: `1px solid ${t.divider}`,
                  }}>
                    <span style={{ fontSize: 14, color: outQty > 0 ? t.text : t.textSub }}>{g.name}</span>
                    <span style={{ fontSize: 12, color: stockQty > 0 ? t.textMuted : t.textFaint, textAlign: 'right' }}>
                      {stockQty.toLocaleString()}
                    </span>
                    <div style={{ position: 'relative' }}>
                      <QtyInput
                        value={outQty}
                        onChange={v => setOutbound(selectedCustomer, g.code, v)}
                      />
                      {overStock && outQty > 0 && (
                        <div style={{ position: 'absolute', top: -16, right: 0, fontSize: 9, color: 'var(--status-danger)', whiteSpace: 'nowrap' }}>超库存!</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 今日流水简览 */}
            {ledger.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: t.textFaint, marginBottom: 8 }}>今日流水</div>
                {ledger.slice(0, 10).map(e => (
                  <div key={e.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 10, marginBottom: 6,
                    background: t.sectionBg, border: `1px solid ${t.cardBorder}`,
                  }}>
                    <div>
                      <span style={{ fontSize: 12, color: t.textSub }}>
                        {CHANGE_LABELS[e.change_type] ?? e.change_type}
                      </span>
                      <span style={{ fontSize: 11, color: t.textFaint, marginLeft: 6 }}>
                        {e.customer_no || e.house_code || ''}
                      </span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: e.qty_change > 0 ? 'var(--status-success)' : 'var(--status-danger)' }}>
                      {e.qty_change > 0 ? '+' : ''}{e.qty_change}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

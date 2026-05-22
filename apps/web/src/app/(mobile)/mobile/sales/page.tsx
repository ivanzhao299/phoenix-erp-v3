'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, ChevronLeft, ChevronRight,
  ShoppingCart, List, X,
} from 'lucide-react';
import { mobileApi, FarmCustomer, FarmSaleRecord, FarmSaleItem } from '@/lib/mobile-api';

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
function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
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

type Tab = 'new' | 'history';

// 每个规格的录入状态
interface GradeEntry {
  qty:        number;
  unit_price: number;
}

const DEFAULT_PRICES: Record<string, number> = {
  '0': 1200, '1': 1100, '2': 1000, '3': 900,
  '4': 800, '5': 700, 'DIRTY': 300, 'BROKEN': 150,
};

export default function SalesPage() {
  const router  = useRouter();
  const today   = fmtDate(new Date());
  const [tab, setTab]   = useState<Tab>('new');
  const [date, setDate] = useState(today);
  const isToday   = date === today;
  const dateLabel = isToday ? '今天' : date === fmtDate(addDays(toDate(today), -1)) ? '昨天' : date;

  const [customers, setCustomers]   = useState<FarmCustomer[]>([]);
  const [selCustomer, setSelCustomer] = useState<FarmCustomer | null>(null);
  const [entries, setEntries]       = useState<Record<string, GradeEntry>>({});

  const [history, setHistory]       = useState<FarmSaleRecord[]>([]);
  const [loading, setLoading]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [successNo, setSuccessNo]   = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // 加载客户列表
  useEffect(() => {
    mobileApi.getFarmCustomers()
      .then(list => {
        setCustomers(list);
        if (list.length > 0 && !selCustomer) setSelCustomer(list[0]);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistory = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await mobileApi.getFarmSales(d);
      setHistory(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory(date);
  }, [tab, date, loadHistory]);

  const getQty   = (g: string) => entries[g]?.qty        ?? 0;
  const getPrice = (g: string) => entries[g]?.unit_price ?? DEFAULT_PRICES[g] ?? 0;

  const setEntry = (grade: string, field: 'qty' | 'unit_price', v: number) => {
    setEntries(p => ({
      ...p,
      [grade]: { ...(p[grade] ?? { qty: getQty(grade), unit_price: getPrice(grade) }), [field]: v },
    }));
    setSuccessNo('');
  };

  const totalQty    = EGG_GRADES.reduce((s, g) => s + getQty(g.code), 0);
  const totalAmount = EGG_GRADES.reduce((s, g) => s + getQty(g.code) * getPrice(g.code), 0);

  const handleSubmit = async () => {
    if (!selCustomer) { setError('请选择客户'); return; }
    const items: FarmSaleItem[] = EGG_GRADES
      .filter(g => getQty(g.code) > 0)
      .map(g => ({
        grade:      g.code,
        grade_name: g.name,
        qty:        getQty(g.code),
        trays:      Math.floor(getQty(g.code) / 180),
        unit_price: getPrice(g.code),
      }));
    if (items.length === 0) { setError('请填写出货数量'); return; }

    setSubmitting(true);
    setError('');
    try {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '';
      const res = await mobileApi.createFarmSale({
        sale_date:     date,
        customer_code: selCustomer.customer_code,
        customer_name: selCustomer.customer_name,
        items,
        operator:      token ? 'mobile' : 'mobile',
      });
      setSuccessNo(res.order_no);
      setEntries({});
    } catch (e: any) {
      setError(e.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (orderNo: string) => {
    if (!confirm(`确认撤销 ${orderNo}？库存将恢复。`)) return;
    try {
      await mobileApi.cancelFarmSale(orderNo, 'mobile');
      loadHistory(date);
    } catch (e: any) {
      setError(e.message || '撤销失败');
    }
  };

  const historyTotal = history.reduce((s, r) => s + Number(r.total_amount), 0);

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
        <span style={{ fontSize: 15, fontWeight: 700, color: 'white', flex: 1 }}>🛒 销售出库</span>
        {tab === 'history' && (
          <button onClick={() => loadHistory(date)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4 }}>
            <RefreshCw size={16} />
          </button>
        )}
      </div>

      {/* Tab */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        background: 'rgba(0,0,0,0.2)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {([
          { key: 'new',     label: '开单', icon: <ShoppingCart size={14} /> },
          { key: 'history', label: '记录', icon: <List size={14} /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '12px 0', background: tab === t.key ? 'rgba(16,185,129,0.1)' : 'none',
              border: 'none', borderBottom: `2px solid ${tab === t.key ? '#10b981' : 'transparent'}`,
              color: tab === t.key ? '#10b981' : 'rgba(255,255,255,0.4)',
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* 日期（记录 tab） */}
      {tab === 'history' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'rgba(16,185,129,0.03)',
          borderBottom: '1px solid rgba(16,185,129,0.1)',
        }}>
          <button onClick={() => setDate(d => fmtDate(addDays(toDate(d), -1)))}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 6 }}>
            <ChevronLeft size={18} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{dateLabel}</div>
            {dateLabel !== date && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{date}</div>}
          </div>
          <button onClick={() => { if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1))); }} disabled={isToday}
            style={{ background: 'none', border: 'none', color: isToday ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)', cursor: isToday ? 'default' : 'pointer', padding: 6 }}>
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* 错误 / 成功 */}
      {error && (
        <div style={{ margin: '8px 16px 0', padding: 10, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12 }}>
          {error}
        </div>
      )}
      {successNo && (
        <div style={{ margin: '8px 16px 0', padding: 12, borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: 13, fontWeight: 600 }}>
          ✓ 出库单已创建：{successNo}
        </div>
      )}

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

        {/* ── 开单 Tab ──────────────────────────────────────────── */}
        {tab === 'new' && (
          <>
            {/* 客户选择 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>客户</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {customers.map(c => (
                  <button key={c.customer_code}
                    onClick={() => setSelCustomer(c)}
                    style={{
                      padding: '8px 14px', borderRadius: 10,
                      background: selCustomer?.customer_code === c.customer_code ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${selCustomer?.customer_code === c.customer_code ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      color: selCustomer?.customer_code === c.customer_code ? '#10b981' : 'rgba(255,255,255,0.6)',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}>
                    {c.customer_name}
                  </button>
                ))}
              </div>
            </div>

            {/* 规格表格 */}
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 14 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 90px',
                padding: '10px 14px', gap: 8,
                background: 'rgba(255,255,255,0.04)',
                fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600,
              }}>
                <span>规格</span><span style={{ textAlign: 'right' }}>数量（枚）</span><span style={{ textAlign: 'right' }}>单价（LAK）</span>
              </div>

              {EGG_GRADES.map((g, idx) => {
                const qty   = getQty(g.code);
                const price = getPrice(g.code);
                const sub   = qty * price;
                return (
                  <div key={g.code} style={{
                    display: 'grid', gridTemplateColumns: '1fr 80px 90px',
                    alignItems: 'center', padding: '10px 14px', gap: 8,
                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.01)',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div>
                      <div style={{ fontSize: 14, color: qty > 0 ? 'white' : 'rgba(255,255,255,0.6)' }}>{g.name}</div>
                      {sub > 0 && <div style={{ fontSize: 10, color: '#10b981' }}>小计 {fmtMoney(sub)}</div>}
                    </div>
                    <input
                      type="number" inputMode="numeric" min="0"
                      value={qty || ''}
                      onChange={e => setEntry(g.code, 'qty', Math.max(0, Number(e.target.value) || 0))}
                      placeholder="0"
                      style={{
                        height: 34, textAlign: 'right', padding: '0 8px',
                        background: qty > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${qty > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 8, color: qty > 0 ? '#10b981' : 'rgba(255,255,255,0.5)',
                        fontSize: 14, fontWeight: 700, outline: 'none', WebkitAppearance: 'none',
                      }}
                    />
                    <input
                      type="number" inputMode="decimal" min="0"
                      value={price || ''}
                      onChange={e => setEntry(g.code, 'unit_price', Math.max(0, Number(e.target.value) || 0))}
                      style={{
                        height: 34, textAlign: 'right', padding: '0 8px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, color: 'rgba(255,255,255,0.6)',
                        fontSize: 13, outline: 'none', WebkitAppearance: 'none',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── 记录 Tab ──────────────────────────────────────────── */}
        {tab === 'history' && (
          <>
            {history.length > 0 && (
              <div style={{
                padding: '10px 14px', borderRadius: 12, marginBottom: 12,
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>今日合计 · {history.length} 单</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>₭ {fmtMoney(historyTotal)}</span>
              </div>
            )}

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 80, borderRadius: 14, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s infinite' }} />)}
              </div>
            ) : history.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>暂无记录</div>
            ) : (
              history.map(rec => (
                <div key={rec.order_no} style={{
                  borderRadius: 14, marginBottom: 10,
                  background: rec.status === 'CANCELLED' ? 'rgba(255,255,255,0.02)' : 'rgba(16,185,129,0.05)',
                  border: `1px solid ${rec.status === 'CANCELLED' ? 'rgba(255,255,255,0.07)' : 'rgba(16,185,129,0.2)'}`,
                  opacity: rec.status === 'CANCELLED' ? 0.6 : 1,
                }}>
                  <div
                    onClick={() => setExpandedOrder(expandedOrder === rec.order_no ? null : rec.order_no)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', cursor: 'pointer' }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{rec.customer_name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{rec.order_no}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: rec.status === 'CANCELLED' ? 'rgba(255,255,255,0.3)' : '#10b981' }}>
                        ₭ {fmtMoney(Number(rec.total_amount))}
                      </div>
                      {rec.status === 'CANCELLED' && (
                        <div style={{ fontSize: 10, color: '#f87171' }}>已撤销</div>
                      )}
                    </div>
                  </div>

                  {expandedOrder === rec.order_no && (
                    <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {rec.items?.map((it, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between',
                          padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                          fontSize: 12,
                        }}>
                          <span style={{ color: 'rgba(255,255,255,0.6)' }}>{it.product_name_zh}</span>
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                            {Number(it.qty).toLocaleString()} × {fmtMoney(it.unit_price)} = ₭{fmtMoney(it.subtotal)}
                          </span>
                        </div>
                      ))}
                      {rec.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleCancel(rec.order_no)}
                          style={{
                            marginTop: 10, padding: '6px 14px', borderRadius: 8,
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            color: '#f87171', cursor: 'pointer', fontSize: 12,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          <X size={12} /> 撤销此单
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* 底部提交栏（仅开单 tab） */}
      {tab === 'new' && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          background: 'rgba(7,11,20,0.95)', backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              {totalQty > 0 ? `${totalQty.toLocaleString()} 枚` : '未填写数量'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: totalAmount > 0 ? '#10b981' : 'rgba(255,255,255,0.2)' }}>
              ₭ {fmtMoney(totalAmount)}
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || totalQty === 0 || !selCustomer}
            style={{
              flex: 1, maxWidth: 160, height: 48, borderRadius: 14,
              background: totalQty > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${totalQty > 0 ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: totalQty > 0 ? '#10b981' : 'rgba(255,255,255,0.3)',
              cursor: totalQty > 0 ? 'pointer' : 'default',
              fontSize: 15, fontWeight: 800,
            }}
          >
            {submitting ? '提交中…' : '确认出库'}
          </button>
        </div>
      )}
    </div>
  );
}

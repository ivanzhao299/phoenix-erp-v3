'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, ChevronLeft, ChevronRight,
  ShoppingCart, List, X,
  Sun, Moon,
} from 'lucide-react';
import { mobileApi, FarmCustomer, FarmSaleRecord, FarmSaleItem } from '@/lib/mobile-api';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { MobilePageSkeleton, SkeletonCard, MobileEmptyState } from '@/components/mobile/MobileSkeleton';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/lib/haptic';

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

// Sales V2 Phase 2: DEFAULT_PRICES 已删除，价格从 /api/v2/sales/pricing/current 动态获取
// 禁止任何价格硬编码 — 必须通过 Price Runtime API

export default function SalesPage() {
  const router  = useRouter();
  const today   = fmtDate(new Date());
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading, readonly } = useMobilePermission('sales');
  const toast = useToast();

  const [tab, setTab]   = useState<Tab>('new');
  const [date, setDate] = useState(today);
  const isToday   = date === today;
  const dateLabel = isToday ? '今天' : date === fmtDate(addDays(toDate(today), -1)) ? '昨天' : date;

  const [customers, setCustomers]   = useState<FarmCustomer[]>([]);
  const [selCustomer, setSelCustomer] = useState<FarmCustomer | null>(null);
  const [entries, setEntries]       = useState<Record<string, GradeEntry>>({});

  // Sales V2 Phase 2: 动态价格（从 Price Runtime API 加载，替代 DEFAULT_PRICES 硬编码）
  const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({});

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

  // Sales V2 Phase 2: 加载动态价格（Price Runtime API）
  useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : null;
    if (!token) return;
    fetch('/api/v2/sales/pricing/current', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then((list: Array<{ gradeCode: string | null; packagingSpec: string | null; unitPrice: number }>) => {
        const priceMap: Record<string, number> = {};
        for (const item of list) {
          if (item.gradeCode) {
            priceMap[item.gradeCode] = item.unitPrice;
          }
        }
        if (Object.keys(priceMap).length > 0) {
          setDynamicPrices(priceMap);
        }
      })
      .catch(() => {});
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

  if (permLoading) return <MobilePageSkeleton title="销售出库" tabs={['开单', '记录']} onBack={() => router.back()} />;
  if (!allowed) return null;

  const getQty   = (g: string) => entries[g]?.qty        ?? 0;
  // Sales V2 Phase 2: 优先使用用户录入价格，其次 dynamicPrices（API），不再硬编码
  const getPrice = (g: string) => entries[g]?.unit_price ?? dynamicPrices[g] ?? 0;

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
      haptic('success'); toast.success('销售单开单成功');
      setSuccessNo(res.order_no);
      setEntries({});
    } catch (e: any) {
      haptic('error'); toast.error(e.message || '开单失败');
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
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text, flex: 1 }}>🛒 销售出库</span>
        {tab === 'history' && (
          <button onClick={() => loadHistory(date)}
            style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 4 }}>
            <RefreshCw size={16} />
          </button>
        )}
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: t.textSub, display: 'flex', alignItems: 'center',
        }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Tab */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        background: t.appBarBg,
        borderBottom: `1px solid ${t.barBorder}`,
      }}>
        {([
          { key: 'new',     label: '开单', icon: <ShoppingCart size={14} /> },
          { key: 'history', label: '记录', icon: <List size={14} /> },
        ] as const).map(tab_ => (
          <button key={tab_.key} onClick={() => setTab(tab_.key)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '12px 0', background: tab === tab_.key ? 'rgba(16,185,129,0.1)' : 'none',
              border: 'none', borderBottom: `2px solid ${tab === tab_.key ? '#10b981' : 'transparent'}`,
              color: tab === tab_.key ? '#10b981' : t.textMuted,
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}
          >
            {tab_.icon}{tab_.label}
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
              <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 8 }}>客户</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {customers.map(c => (
                  <button key={c.customer_code}
                    onClick={() => setSelCustomer(c)}
                    style={{
                      padding: '8px 14px', borderRadius: 10,
                      background: selCustomer?.customer_code === c.customer_code ? 'rgba(16,185,129,0.15)' : t.btnBg,
                      border: `1px solid ${selCustomer?.customer_code === c.customer_code ? 'rgba(16,185,129,0.4)' : t.btnBorder}`,
                      color: selCustomer?.customer_code === c.customer_code ? '#10b981' : t.textSub,
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}>
                    {c.customer_name}
                  </button>
                ))}
              </div>
            </div>

            {/* 规格表格 */}
            <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${t.cardBorder}`, marginBottom: 14 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 90px',
                padding: '10px 14px', gap: 8,
                background: t.cardBg,
                fontSize: 11, color: t.textMuted, fontWeight: 600,
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
                    background: idx % 2 === 0 ? t.sectionBg : t.cardBg,
                    borderTop: `1px solid ${t.divider}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 14, color: qty > 0 ? t.text : t.textSub }}>{g.name}</div>
                      {sub > 0 && <div style={{ fontSize: 10, color: '#10b981' }}>小计 {fmtMoney(sub)}</div>}
                    </div>
                    <input
                      type="number" inputMode="numeric" min="0"
                      value={qty || ''}
                      onChange={e => setEntry(g.code, 'qty', Math.max(0, Number(e.target.value) || 0))}
                      placeholder="0"
                      style={{
                        height: 34, textAlign: 'right', padding: '0 8px',
                        background: qty > 0 ? 'rgba(16,185,129,0.1)' : t.inputBg,
                        border: `1px solid ${qty > 0 ? 'rgba(16,185,129,0.3)' : t.inputBorder}`,
                        borderRadius: 8, color: qty > 0 ? '#10b981' : t.textSub,
                        fontSize: 14, fontWeight: 700, outline: 'none', WebkitAppearance: 'none',
                      }}
                    />
                    <input
                      type="number" inputMode="decimal" min="0"
                      value={price || ''}
                      onChange={e => setEntry(g.code, 'unit_price', Math.max(0, Number(e.target.value) || 0))}
                      style={{
                        height: 34, textAlign: 'right', padding: '0 8px',
                        background: t.inputBg,
                        border: `1px solid ${t.inputBorder}`,
                        borderRadius: 8, color: t.textSub,
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
                <span style={{ fontSize: 12, color: t.textMuted }}>今日合计 · {history.length} 单</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>₭ {fmtMoney(historyTotal)}</span>
              </div>
            )}

            {loading ? (
              <div>{[1,2,3].map(i => <SkeletonCard key={i} lines={3} />)}</div>
            ) : history.length === 0 ? (
              <MobileEmptyState icon="🛒" title="暂无销售记录" desc="今日还没有销售出库记录" />
            ) : (
              history.map(rec => (
                <div key={rec.order_no} style={{
                  borderRadius: 14, marginBottom: 10,
                  background: rec.status === 'CANCELLED' ? t.cardBg : 'rgba(16,185,129,0.05)',
                  border: `1px solid ${rec.status === 'CANCELLED' ? t.cardBorder : 'rgba(16,185,129,0.2)'}`,
                  opacity: rec.status === 'CANCELLED' ? 0.6 : 1,
                }}>
                  <div
                    onClick={() => setExpandedOrder(expandedOrder === rec.order_no ? null : rec.order_no)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', cursor: 'pointer' }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{rec.customer_name}</div>
                      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>{rec.order_no}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: rec.status === 'CANCELLED' ? t.textFaint : '#10b981' }}>
                        ₭ {fmtMoney(Number(rec.total_amount))}
                      </div>
                      {rec.status === 'CANCELLED' && (
                        <div style={{ fontSize: 10, color: '#f87171' }}>已撤销</div>
                      )}
                    </div>
                  </div>

                  {expandedOrder === rec.order_no && (
                    <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${t.divider}` }}>
                      {rec.items?.map((it, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between',
                          padding: '6px 0', borderBottom: `1px solid ${t.divider}`,
                          fontSize: 12,
                        }}>
                          <span style={{ color: t.textSub }}>{it.product_name_zh}</span>
                          <span style={{ color: t.textMuted }}>
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
          background: t.bottomBarBg, backdropFilter: 'blur(20px)',
          borderTop: `1px solid ${t.cardBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, color: t.textFaint }}>
              {totalQty > 0 ? `${totalQty.toLocaleString()} 枚` : '未填写数量'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: totalAmount > 0 ? '#10b981' : t.textFaint }}>
              ₭ {fmtMoney(totalAmount)}
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || totalQty === 0 || !selCustomer}
            style={{
              flex: 1, maxWidth: 160, height: 48, borderRadius: 14,
              background: totalQty > 0 ? 'rgba(16,185,129,0.2)' : t.btnBg,
              border: `1px solid ${totalQty > 0 ? 'rgba(16,185,129,0.5)' : t.btnBorder}`,
              color: totalQty > 0 ? '#10b981' : t.textFaint,
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

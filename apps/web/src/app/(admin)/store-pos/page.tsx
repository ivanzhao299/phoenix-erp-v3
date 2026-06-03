'use client';
/**
 * Phoenix ERP V3 — 直营店收银作业台
 * Sales V2 Phase 9: 3 列布局：[商品目录] | [购物车] | [收款结账]
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingCart, Banknote, CreditCard, Wallet, X, Plus, Minus,
  Search, RefreshCw, CheckCircle, AlertTriangle, Clock, History,
  LogIn, LogOut, FileText, BarChart2, Loader2, ChevronDown,
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function tok() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
const BASE = process.env.NEXT_PUBLIC_API_BASE || '';

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data ?? d;
}

function fmt(n: number | string | null | undefined) {
  if (n === null || n === undefined) return '0.00';
  return Number(n).toFixed(2);
}

function fmtDate(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleString('zh-CN', { hour12: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Product {
  product_code:   string;
  product_name:   string;
  grade_code?:    string;
  packaging_spec?: string;
  unit_price:     number;
  retail_price?:  number;
  sku_code?:      string | null;   // Phase H5
  grade_code_std?: string | null;  // Phase H5
  spec_code?:     string | null;   // Phase H5
}

interface CartItem extends Product {
  qty:      number;
  amount:   number;
  sortOrder: number;
}

interface SaleRecord {
  id:             number;
  sale_no:        string;
  sale_type:      string;
  payment_status: string;
  status:         string;
  total_amount:   number;
  paid_amount:    number;
  customer_name?: string;
  created_at:     string;
  completed_at?:  string;
}

interface ShiftRecord {
  id:               number;
  closing_no:       string;
  status:           string;
  opening_cash:     number;
  closing_cash?:    number;
  system_cash?:     number;
  difference_amount?: number;
  total_sales?:     number;
  cash_sales?:      number;
  credit_sales?:    number;
  sale_count?:      number;
  opened_at:        string;
  closed_at?:       string;
  operator_name?:   string;
  remark?:          string;
}

interface DailySummary {
  date:             string;
  total_sales:      number;
  cash_sales:       number;
  credit_sales:     number;
  mixed_sales:      number;
  sale_count:       number;
  completed_count:  number;
  void_count:       number;
}

type PayType = 'CASH' | 'CREDIT' | 'MIXED';
type View    = 'pos' | 'history' | 'shift';

const SALE_TYPE_MAP: Record<string, { label: string; color: string }> = {
  CASH:   { label: '现金',   color: 'var(--status-success)' },
  CREDIT: { label: '赊销',   color: 'var(--status-warning)' },
  MIXED:  { label: '混合',   color: 'var(--status-special)' },
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  OPEN:      { label: '进行中', color: 'var(--color-accent)', bg: 'var(--status-info-bg)'  },
  COMPLETED: { label: '已完成', color: 'var(--status-success)', bg: 'var(--status-success-bg)'   },
  VOID:      { label: '已作废', color: 'var(--status-danger)', bg: 'var(--status-danger-bg)'   },
};

const PAY_STATUS_MAP: Record<string, { label: string; color: string }> = {
  UNPAID:  { label: '未收款', color: 'var(--status-danger)' },
  PARTIAL: { label: '部分收', color: 'var(--status-warning)' },
  PAID:    { label: '已收款', color: 'var(--status-success)' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Badge
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: 4, fontSize: 12, fontWeight: 600,
      color, background: bg || `${color}1a`,
    }}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Toast
// ─────────────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '12px 20px', borderRadius: 8, maxWidth: 380,
      background: type === 'success' ? 'var(--status-success)' : 'var(--status-danger)',
      color: 'var(--text-on-dark)', fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
      {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function StorePosPage() {
  const { hasPerm } = usePermission('MENU_STORE_POS');

  // ── 门店上下文 ──────────────────────────────────────────────────────────────
  const [storeCode,   setStoreCode]   = useState('');
  const [storeName,   setStoreName]   = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [companyName, setCompanyName] = useState('');

  // ── 视图 ──────────────────────────────────────────────────────────────────
  const [view, setView] = useState<View>('pos');

  // ── 商品目录 ──────────────────────────────────────────────────────────────
  const [products,     setProducts]     = useState<Product[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [loadingProds, setLoadingProds] = useState(false);

  // ── 购物车 ────────────────────────────────────────────────────────────────
  const [cart,           setCart]           = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [customerName,   setCustomerName]   = useState('');
  const [customerCode,   setCustomerCode]   = useState('');

  // ── 结账 ─────────────────────────────────────────────────────────────────
  const [payType,       setPayType]       = useState<PayType>('CASH');
  const [cashAccountId, setCashAccountId] = useState<number>(1);
  const [paidAmount,    setPaidAmount]    = useState('');
  const [payMethod,     setPayMethod]     = useState('CASH');
  const [processing,    setProcessing]    = useState(false);

  // ── 销售记录 ──────────────────────────────────────────────────────────────
  const [sales,       setSales]       = useState<SaleRecord[]>([]);
  const [salesTotal,  setSalesTotal]  = useState(0);
  const [salesPage,   setSalesPage]   = useState(1);
  const [loadingSales,setLoadingSales] = useState(false);

  // ── 班次 ──────────────────────────────────────────────────────────────────
  const [currentShift,   setCurrentShift]   = useState<ShiftRecord | null>(null);
  const [shiftHistory,   setShiftHistory]   = useState<ShiftRecord[]>([]);
  const [shiftTotal,     setShiftTotal]     = useState(0);
  const [shiftPage,      setShiftPage]      = useState(1);
  const [loadingShift,   setLoadingShift]   = useState(false);
  const [openingCash,    setOpeningCash]    = useState('');
  const [closingCash,    setClosingCash]    = useState('');
  const [shiftRemark,    setShiftRemark]    = useState('');
  const [showShiftModal, setShowShiftModal] = useState<'open' | 'close' | null>(null);

  // ── 当日汇总 ──────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<DailySummary | null>(null);

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type });

  // ── 初始化门店上下文 ─────────────────────────────────────────────────────
  useEffect(() => {
    const info = sessionStorage.getItem('phoenix_store_info');
    if (info) {
      try {
        const obj = JSON.parse(info);
        setStoreCode(obj.storeCode || '');
        setStoreName(obj.storeName || '');
        setCompanyCode(obj.companyCode || '');
        setCompanyName(obj.companyName || '');
      } catch { /* ignore */ }
    }
  }, []);

  // ── 加载商品 ──────────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    if (!storeCode || !companyCode) return;
    setLoadingProds(true);
    try {
      const data = await api<Product[]>('GET', `/api/v2/store-sales/products?storeCode=${encodeURIComponent(storeCode)}&companyCode=${encodeURIComponent(companyCode)}`);
      setProducts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoadingProds(false);
    }
  }, [storeCode, companyCode]);

  // ── 加载当前班次 ─────────────────────────────────────────────────────────
  const loadCurrentShift = useCallback(async () => {
    if (!storeCode) return;
    try {
      const data = await api<ShiftRecord | null>('GET', `/api/v2/store-sales/shift?storeCode=${encodeURIComponent(storeCode)}`);
      setCurrentShift(data);
    } catch { /* ignore */ }
  }, [storeCode]);

  // ── 加载当日汇总 ─────────────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    if (!storeCode) return;
    try {
      const data = await api<DailySummary>('GET', `/api/v2/store-sales/daily-summary?storeCode=${encodeURIComponent(storeCode)}`);
      setSummary(data);
    } catch { /* ignore */ }
  }, [storeCode]);

  useEffect(() => {
    if (storeCode && companyCode) {
      loadProducts();
      loadCurrentShift();
      loadSummary();
    }
  }, [storeCode, companyCode, loadProducts, loadCurrentShift, loadSummary]);

  // ── 加载销售记录 ─────────────────────────────────────────────────────────
  const loadSales = useCallback(async (page = 1) => {
    if (!storeCode) return;
    setLoadingSales(true);
    try {
      const data = await api<{ items: SaleRecord[]; total: number }>(
        'GET',
        `/api/v2/store-sales?storeCode=${encodeURIComponent(storeCode)}&page=${page}&limit=20`,
      );
      setSales(data.items ?? []);
      setSalesTotal(data.total ?? 0);
      setSalesPage(page);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoadingSales(false);
    }
  }, [storeCode]);

  // ── 加载班次历史 ─────────────────────────────────────────────────────────
  const loadShiftHistory = useCallback(async (page = 1) => {
    if (!storeCode) return;
    setLoadingShift(true);
    try {
      const data = await api<{ items: ShiftRecord[]; total: number }>(
        'GET',
        `/api/v2/store-sales/shift/history?storeCode=${encodeURIComponent(storeCode)}&page=${page}&limit=15`,
      );
      setShiftHistory(data.items ?? []);
      setShiftTotal(data.total ?? 0);
      setShiftPage(page);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoadingShift(false);
    }
  }, [storeCode]);

  useEffect(() => {
    if (view === 'history') loadSales(1);
    if (view === 'shift')   loadShiftHistory(1);
  }, [view, loadSales, loadShiftHistory]);

  // ── 购物车操作 ───────────────────────────────────────────────────────────
  const addToCart = (p: Product) => {
    setCart(prev => {
      // Phase H5: SKU 路径用 sku_code 去重，旧路径用 product_code+grade_code
      const idx = p.sku_code
        ? prev.findIndex(c => c.sku_code === p.sku_code)
        : prev.findIndex(c => !c.sku_code && c.product_code === p.product_code && c.grade_code === p.grade_code);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1, amount: (next[idx].qty + 1) * next[idx].unit_price };
        return next;
      }
      return [...prev, { ...p, qty: 1, amount: p.unit_price, sortOrder: prev.length }];
    });
  };

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => {
      const next = [...prev];
      const newQty = Math.max(0, next[idx].qty + delta);
      if (newQty === 0) return next.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], qty: newQty, amount: newQty * next[idx].unit_price };
      return next;
    });
  };

  const removeFromCart = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  const clearCart = () => {
    setCart([]);
    setDiscountAmount(0);
    setCustomerName('');
    setCustomerCode('');
    setPaidAmount('');
    setPayType('CASH');
  };

  const subtotal     = cart.reduce((s, c) => s + c.amount, 0);
  const totalAmount  = Math.max(0, subtotal - discountAmount);

  // ── 提交销售 ─────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!cart.length) { showToast('购物车为空', 'error'); return; }
    if (!storeCode)   { showToast('请先设置门店信息', 'error'); return; }

    const paid = payType === 'CREDIT' ? 0 : Number(paidAmount) || totalAmount;
    if (payType !== 'CREDIT' && paid <= 0) { showToast('请输入收款金额', 'error'); return; }
    if (payType === 'MIXED' && paid >= totalAmount) { showToast('混合收款实收额应小于订单总额', 'error'); return; }

    setProcessing(true);
    try {
      // 1. 建单
      const sale = await api<{ id: number; sale_no: string }>('POST', '/api/v2/store-sales', {
        storeCode, storeName, companyCode, companyName,
        saleType: payType,
        paymentMethod: payType !== 'CREDIT' ? payMethod : undefined,
        customerCode: customerCode || undefined,
        customerName: customerName || undefined,
        discountAmount,
        items: cart.map((c, i) => ({
          productCode:   c.product_code,
          productName:   c.product_name,
          gradeCode:     c.grade_code,
          packagingSpec: c.packaging_spec,
          qty:           c.qty,
          unitPrice:     c.unit_price,
          amount:        c.amount,
          sortOrder:     i,
          skuCode:       c.sku_code ?? undefined,  // Phase H5
        })),
      });

      // 2. 收款
      if (payType === 'CASH') {
        await api('POST', `/api/v2/store-sales/${sale.id}/pay-cash`, {
          cashAccountId,
          paidAmount: paid,
          paymentMethod: payMethod,
        });
      } else if (payType === 'CREDIT') {
        await api('POST', `/api/v2/store-sales/${sale.id}/pay-credit`);
      } else {
        await api('POST', `/api/v2/store-sales/${sale.id}/pay-mixed`, {
          cashAccountId,
          paidAmount: paid,
          paymentMethod: payMethod,
          customerCode: customerCode || undefined,
          customerName: customerName || undefined,
        });
      }

      showToast(`销售单 ${sale.sale_no} 开立成功`, 'success');
      clearCart();
      loadSummary();
      loadCurrentShift();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  // ── 开班 ─────────────────────────────────────────────────────────────────
  const handleOpenShift = async () => {
    if (!storeCode) { showToast('请先设置门店', 'error'); return; }
    try {
      await api('POST', '/api/v2/store-sales/shift/open', {
        storeCode, companyCode,
        openingCash: Number(openingCash) || 0,
      });
      showToast('开班成功', 'success');
      setShowShiftModal(null);
      setOpeningCash('');
      loadCurrentShift();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // ── 交班 ─────────────────────────────────────────────────────────────────
  const handleCloseShift = async () => {
    try {
      await api('POST', `/api/v2/store-sales/shift/close?storeCode=${encodeURIComponent(storeCode)}`, {
        closingCash: Number(closingCash) || 0,
        remark: shiftRemark || undefined,
      });
      showToast('交班成功', 'success');
      setShowShiftModal(null);
      setClosingCash('');
      setShiftRemark('');
      loadCurrentShift();
      loadSummary();
      if (view === 'shift') loadShiftHistory(1);
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // ── 过滤商品 ──────────────────────────────────────────────────────────────
  const filteredProducts = products.filter(p =>
    !productQuery ||
    p.product_name.includes(productQuery) ||
    p.product_code.includes(productQuery) ||
    (p.sku_code ?? '').includes(productQuery),  // Phase H5: 支持按 SKU 搜索
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 门店设置弹窗（首次使用时引导配置）
  // ─────────────────────────────────────────────────────────────────────────
  const [showStoreSetup, setShowStoreSetup] = useState(false);
  const [setupStoreCode,   setSetupStoreCode]   = useState('');
  const [setupStoreName,   setSetupStoreName]   = useState('');
  const [setupCompanyCode, setSetupCompanyCode] = useState('');
  const [setupCompanyName, setSetupCompanyName] = useState('');

  const handleSaveSetup = () => {
    if (!setupStoreCode || !setupCompanyCode) { showToast('门店编码和公司编码为必填', 'error'); return; }
    const info = { storeCode: setupStoreCode, storeName: setupStoreName, companyCode: setupCompanyCode, companyName: setupCompanyName };
    sessionStorage.setItem('phoenix_store_info', JSON.stringify(info));
    setStoreCode(setupStoreCode);
    setStoreName(setupStoreName);
    setCompanyCode(setupCompanyCode);
    setCompanyName(setupCompanyName);
    setShowStoreSetup(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-page)', color: 'var(--border)', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── 顶部工具栏 ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', height: 52, background: 'var(--text-primary)', borderBottom: '1px solid var(--border-dark-faint)', gap: 12, flexShrink: 0 }}>
        <Banknote size={20} color="var(--status-success)" />
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--bg-muted)' }}>直营店收银</span>
        {storeCode && (
          <span style={{ fontSize: 13, color: 'var(--text-disabled)', marginLeft: 4 }}>
            {storeName || storeCode} · {companyName || companyCode}
          </span>
        )}

        {/* 班次状态 */}
        {storeCode && (
          <div style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            {currentShift ? (
              <>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-success)', display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: 'var(--status-success)' }}>班次进行中 · 开班 {fmtDate(currentShift.opened_at)}</span>
                {hasPerm('C') && (
                  <button onClick={() => setShowShiftModal('close')} style={{ marginLeft: 4, padding: '2px 10px', borderRadius: 4, border: '1px solid var(--status-warning)', background: 'transparent', color: 'var(--status-warning)', fontSize: 12, cursor: 'pointer' }}>
                    <LogOut size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />交班
                  </button>
                )}
              </>
            ) : (
              <>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-danger)', display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: 'var(--status-danger)' }}>未开班</span>
                {hasPerm('C') && (
                  <button onClick={() => setShowShiftModal('open')} style={{ marginLeft: 4, padding: '2px 10px', borderRadius: 4, border: '1px solid var(--status-success)', background: 'transparent', color: 'var(--status-success)', fontSize: 12, cursor: 'pointer' }}>
                    <LogIn size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />开班
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* 视图切换 */}
        {(['pos', 'history', 'shift'] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '4px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            background: view === v ? 'var(--color-accent)' : 'transparent',
            color: view === v ? 'var(--bg-card)' : 'var(--text-disabled)',
          }}>
            {v === 'pos' ? '收银台' : v === 'history' ? '销售记录' : '班次管理'}
          </button>
        ))}

        <button onClick={() => setShowStoreSetup(true)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', fontSize: 12, cursor: 'pointer' }}>
          设置门店
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          视图：收银台（3 列）
      ══════════════════════════════════════════════════════════════════════ */}
      {view === 'pos' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* 列 1：商品目录 */}
          <div style={{ width: 320, borderRight: '1px solid var(--border-dark-faint)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-dark-faint)', display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  value={productQuery} onChange={e => setProductQuery(e.target.value)}
                  placeholder="搜索商品..."
                  style={{ width: '100%', padding: '6px 8px 6px 28px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'var(--border-dark-faint)', color: 'var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button onClick={loadProducts} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', cursor: 'pointer' }}>
                <RefreshCw size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
              {loadingProds ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--text-secondary)' }}>
                  <Loader2 size={20} className="animate-spin" /> <span style={{ marginLeft: 8 }}>加载中...</span>
                </div>
              ) : !storeCode ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 60, fontSize: 13 }}>请先配置门店</div>
              ) : filteredProducts.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 60, fontSize: 13 }}>暂无商品数据</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {filteredProducts.map(p => (
                    <button key={p.sku_code ?? `${p.product_code}-${p.grade_code}`}
                      onClick={() => addToCart(p)}
                      style={{
                        padding: '10px 10px', borderRadius: 8,
                        border: `1px solid ${p.sku_code ? 'var(--status-special-border)' : 'var(--border-dark-faint)'}`,
                        background: p.sku_code ? 'var(--status-special-bg)' : 'var(--surface-dark)',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.15s',
                        color: 'var(--border)',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, lineHeight: 1.3 }}>{p.product_name}</div>
                      {/* Phase H5: SKU 徽章 */}
                      {p.sku_code ? (
                        <div style={{ fontSize: 10, color: 'var(--status-special)', fontFamily: 'monospace', fontWeight: 700, marginBottom: 3 }}>{p.sku_code}</div>
                      ) : (
                        p.grade_code && <div style={{ fontSize: 11, color: 'var(--text-disabled)', marginBottom: 4 }}>{p.grade_code}</div>
                      )}
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--status-success)' }}>¥{fmt(p.unit_price)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 列 2：购物车 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-dark-faint)', minWidth: 0 }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-dark-faint)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShoppingCart size={16} /> 购物车
                {cart.length > 0 && <span style={{ background: 'var(--color-accent)', color: 'var(--text-on-dark)', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{cart.length}</span>}
              </span>
              {cart.length > 0 && (
                <button onClick={clearCart} style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid var(--status-danger-border)', background: 'transparent', color: 'var(--status-danger)', fontSize: 12, cursor: 'pointer' }}>
                  清空
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 80, fontSize: 13 }}>请从左侧添加商品</div>
              ) : (
                cart.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '8px 6px', borderBottom: '1px solid var(--surface-dark)', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{item.product_name}</div>
                      {item.sku_code
                        ? <div style={{ fontSize: 10, color: 'var(--status-special)', fontFamily: 'monospace', fontWeight: 700 }}>{item.sku_code}</div>
                        : item.grade_code && <div style={{ fontSize: 11, color: 'var(--text-disabled)' }}>{item.grade_code}</div>
                      }
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>¥{fmt(item.unit_price)} × {item.qty}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--status-success)', width: 72, textAlign: 'right' }}>¥{fmt(item.amount)}</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => updateQty(idx, -1)} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                      <button onClick={() => updateQty(idx, +1)} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
                      <button onClick={() => removeFromCart(idx)} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--status-danger-border)', background: 'transparent', color: 'var(--status-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 小计 */}
            {cart.length > 0 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-dark-faint)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-disabled)', marginBottom: 4 }}>
                  <span>小计</span><span>¥{fmt(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--text-disabled)', marginBottom: 2 }}>
                  <span>优惠</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>-¥</span>
                    <input
                      type="number" min="0" value={discountAmount || ''}
                      onChange={e => setDiscountAmount(Math.max(0, Number(e.target.value)))}
                      style={{ width: 64, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-dark)', background: 'var(--border-dark-faint)', color: 'var(--border)', fontSize: 13, textAlign: 'right', outline: 'none' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: 'var(--status-success)', marginTop: 4 }}>
                  <span>合计</span><span>¥{fmt(totalAmount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* 列 3：收款结账 */}
          <div style={{ width: 300, display: 'flex', flexDirection: 'column', flexShrink: 0, padding: '16px 16px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--bg-muted)' }}>结账方式</div>

            {/* 支付类型 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {([['CASH', '现金/转账'], ['CREDIT', '赊销'], ['MIXED', '混合']] as [PayType, string][]).map(([v, l]) => (
                <button key={v} onClick={() => setPayType(v)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid ${payType === v ? 'var(--color-accent)' : 'var(--border-dark)'}`,
                  background: payType === v ? 'var(--status-info-bg)' : 'transparent',
                  color: payType === v ? 'var(--color-accent)' : 'var(--text-disabled)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                  {l}
                </button>
              ))}
            </div>

            {/* 客户信息（赊销/混合时填写） */}
            {(payType === 'CREDIT' || payType === 'MIXED') && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--text-disabled)', display: 'block', marginBottom: 3 }}>客户姓名</label>
                <input
                  value={customerName} onChange={e => setCustomerName(e.target.value)}
                  placeholder="客户姓名（可选）"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'var(--border-dark-faint)', color: 'var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {/* 支付方式 */}
            {payType !== 'CREDIT' && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--text-disabled)', display: 'block', marginBottom: 3 }}>支付方式</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'var(--text-primary)', color: 'var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                  <option value="CASH">现金</option>
                  <option value="TRANSFER">转账</option>
                  <option value="OTHER">其他</option>
                </select>
              </div>
            )}

            {/* 实收金额 */}
            {payType !== 'CREDIT' && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--text-disabled)', display: 'block', marginBottom: 3 }}>
                  {payType === 'MIXED' ? '本次收款金额' : '实收金额'}
                </label>
                <input
                  type="number" min="0" value={paidAmount}
                  onChange={e => setPaidAmount(e.target.value)}
                  placeholder={`¥ ${fmt(totalAmount)}`}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-dark-strong)', background: 'var(--border-dark-faint)', color: 'var(--status-success)', fontSize: 18, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                />
                {payType === 'MIXED' && paidAmount && (
                  <div style={{ fontSize: 12, color: 'var(--status-warning)', marginTop: 3 }}>
                    赊账金额：¥{fmt(totalAmount - Number(paidAmount))}
                  </div>
                )}
              </div>
            )}

            {/* 找零 */}
            {payType === 'CASH' && paidAmount && Number(paidAmount) > totalAmount && (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--status-success-bg)', border: '1px solid var(--status-success-border)', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--status-success)' }}>找零：</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--status-success)' }}>¥{fmt(Number(paidAmount) - totalAmount)}</span>
              </div>
            )}

            <div style={{ flex: 1 }} />

            {/* 当日汇总 */}
            {summary && (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-dark)', border: '1px solid var(--border-dark-faint)', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>今日汇总</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                  {[
                    ['销售额', `¥${fmt(summary.total_sales)}`],
                    ['单数', `${summary.sale_count} 单`],
                    ['现金收', `¥${fmt(summary.cash_sales)}`],
                    ['赊销额', `¥${fmt(summary.credit_sales)}`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-disabled)' }}>{k}</span>
                      <span style={{ color: 'var(--border)', fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 结账按钮 */}
            <button
              onClick={handleCheckout}
              disabled={processing || !cart.length}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 8, border: 'none', cursor: processing || !cart.length ? 'not-allowed' : 'pointer',
                background: cart.length ? (processing ? 'var(--color-primary)' : 'var(--color-accent)') : 'var(--border-dark-faint)',
                color: cart.length ? 'var(--bg-card)' : 'var(--text-secondary)', fontSize: 16, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {processing ? <><Loader2 size={16} className="animate-spin" />处理中...</> : <>
                <CheckCircle size={16} />
                结账 {cart.length > 0 ? `· ¥${fmt(totalAmount)}` : ''}
              </>}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          视图：销售记录
      ══════════════════════════════════════════════════════════════════════ */}
      {view === 'history' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>销售记录</h2>
            <button onClick={() => loadSales(1)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={13} />刷新
            </button>
          </div>

          {loadingSales ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--text-secondary)' }}>
              <Loader2 size={24} /> <span style={{ marginLeft: 8 }}>加载中...</span>
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-dark-faint)' }}>
                    {['单号', '类型', '状态', '收款', '金额', '已收', '客户', '时间'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--surface-dark)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--color-accent)', fontFamily: 'monospace', fontSize: 12 }}>{s.sale_no}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <Badge label={SALE_TYPE_MAP[s.sale_type]?.label ?? s.sale_type} color={SALE_TYPE_MAP[s.sale_type]?.color ?? 'var(--text-disabled)'} />
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <Badge label={STATUS_MAP[s.status]?.label ?? s.status} color={STATUS_MAP[s.status]?.color ?? 'var(--text-disabled)'} bg={STATUS_MAP[s.status]?.bg} />
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ color: PAY_STATUS_MAP[s.payment_status]?.color ?? 'var(--text-disabled)', fontWeight: 600, fontSize: 12 }}>
                          {PAY_STATUS_MAP[s.payment_status]?.label ?? s.payment_status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--status-success)', fontWeight: 600 }}>¥{fmt(s.total_amount)}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--status-success)' }}>¥{fmt(s.paid_amount)}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--border)' }}>{s.customer_name || '散客'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDate(s.created_at)}</td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>暂无数据</td></tr>
                  )}
                </tbody>
              </table>

              {salesTotal > 20 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                  <button disabled={salesPage <= 1} onClick={() => loadSales(salesPage - 1)} style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', cursor: salesPage > 1 ? 'pointer' : 'not-allowed', fontSize: 13 }}>上一页</button>
                  <span style={{ lineHeight: '32px', fontSize: 13, color: 'var(--text-secondary)' }}>第 {salesPage} 页 · 共 {salesTotal} 条</span>
                  <button disabled={salesPage * 20 >= salesTotal} onClick={() => loadSales(salesPage + 1)} style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', cursor: salesPage * 20 < salesTotal ? 'pointer' : 'not-allowed', fontSize: 13 }}>下一页</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          视图：班次管理
      ══════════════════════════════════════════════════════════════════════ */}
      {view === 'shift' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>班次管理</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {hasPerm('C') && !currentShift && (
                <button onClick={() => setShowShiftModal('open')} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--status-success)', color: 'var(--text-on-dark)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <LogIn size={13} />开班
                </button>
              )}
              {hasPerm('C') && currentShift && (
                <button onClick={() => setShowShiftModal('close')} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--status-warning)', color: 'var(--text-on-dark)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <LogOut size={13} />交班
                </button>
              )}
              <button onClick={() => loadShiftHistory(1)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <RefreshCw size={13} />刷新
              </button>
            </div>
          </div>

          {/* 当前班次卡片 */}
          {currentShift && (
            <div style={{ padding: '14px 18px', borderRadius: 8, background: 'var(--status-success-bg-faint)', border: '1px solid var(--status-success-border)', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-success)', marginBottom: 8 }}>当前班次 · {currentShift.closing_no}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 16px' }}>
                {[
                  ['开班时间', fmtDate(currentShift.opened_at)],
                  ['开班现金', `¥${fmt(currentShift.opening_cash)}`],
                  ['操作员', currentShift.operator_name || '—'],
                  ['状态', '进行中'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 13, color: 'var(--border)', fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 班次历史 */}
          {loadingShift ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--text-secondary)' }}>
              <Loader2 size={24} /><span style={{ marginLeft: 8 }}>加载中...</span>
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-dark-faint)' }}>
                    {['班次编号', '状态', '开班', '交班', '开班现金', '交班现金', '差异', '总销售', '现金收', '单数'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shiftHistory.map(sh => (
                    <tr key={sh.id} style={{ borderBottom: '1px solid var(--surface-dark)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--color-accent)', fontFamily: 'monospace', fontSize: 12 }}>{sh.closing_no}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <Badge
                          label={sh.status === 'OPEN' ? '进行中' : '已完成'}
                          color={sh.status === 'OPEN' ? 'var(--status-success)' : 'var(--text-disabled)'}
                          bg={sh.status === 'OPEN' ? 'var(--status-success-bg)' : 'var(--status-neutral-bg)'}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-disabled)', fontSize: 12 }}>{fmtDate(sh.opened_at)}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-disabled)', fontSize: 12 }}>{sh.closed_at ? fmtDate(sh.closed_at) : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>¥{fmt(sh.opening_cash)}</td>
                      <td style={{ padding: '8px 10px' }}>{sh.closing_cash != null ? `¥${fmt(sh.closing_cash)}` : '—'}</td>
                      <td style={{ padding: '8px 10px', color: sh.difference_amount != null && Number(sh.difference_amount) < 0 ? 'var(--status-danger)' : 'var(--status-success)' }}>
                        {sh.difference_amount != null ? `¥${fmt(sh.difference_amount)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--status-success)', fontWeight: 600 }}>{sh.total_sales != null ? `¥${fmt(sh.total_sales)}` : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{sh.cash_sales != null ? `¥${fmt(sh.cash_sales)}` : '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--border)' }}>{sh.sale_count ?? '—'}</td>
                    </tr>
                  ))}
                  {shiftHistory.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>暂无班次记录</td></tr>
                  )}
                </tbody>
              </table>

              {shiftTotal > 15 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                  <button disabled={shiftPage <= 1} onClick={() => loadShiftHistory(shiftPage - 1)} style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', cursor: shiftPage > 1 ? 'pointer' : 'not-allowed', fontSize: 13 }}>上一页</button>
                  <span style={{ lineHeight: '32px', fontSize: 13, color: 'var(--text-secondary)' }}>第 {shiftPage} 页 · 共 {shiftTotal} 条</span>
                  <button disabled={shiftPage * 15 >= shiftTotal} onClick={() => loadShiftHistory(shiftPage + 1)} style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', cursor: shiftPage * 15 < shiftTotal ? 'pointer' : 'not-allowed', fontSize: 13 }}>下一页</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: 开班
      ══════════════════════════════════════════════════════════════════════ */}
      {showShiftModal === 'open' && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-mask)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--text-primary)', borderRadius: 12, padding: 28, width: 360, border: '1px solid var(--border-dark)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>开班</h3>
            <label style={{ fontSize: 13, color: 'var(--text-disabled)', display: 'block', marginBottom: 4 }}>开班现金（备用金）</label>
            <input
              type="number" min="0" value={openingCash} onChange={e => setOpeningCash(e.target.value)}
              placeholder="0.00"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'var(--border-dark-faint)', color: 'var(--border)', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 20 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowShiftModal(null)} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', cursor: 'pointer', fontSize: 13 }}>取消</button>
              <button onClick={handleOpenShift} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: 'var(--status-success)', color: 'var(--text-on-dark)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>确认开班</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: 交班/日结
      ══════════════════════════════════════════════════════════════════════ */}
      {showShiftModal === 'close' && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-mask)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--text-primary)', borderRadius: 12, padding: 28, width: 400, border: '1px solid var(--border-dark)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>交班 / 日结</h3>

            {summary && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-dark)', border: '1px solid var(--border-dark-faint)', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>本班统计（参考）</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    ['总销售额', `¥${fmt(summary.total_sales)}`],
                    ['现金收款', `¥${fmt(summary.cash_sales)}`],
                    ['销售单数', `${summary.completed_count} 单`],
                    ['赊销额', `¥${fmt(summary.credit_sales)}`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-disabled)' }}>{k}</span>
                      <span style={{ color: 'var(--border)' }}>{v}</span>
                    </div>
                  ))}
                </div>
                {currentShift && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-dark-faint)', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-disabled)' }}>系统现金（预计）</span>
                      <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>¥{fmt(Number(currentShift.opening_cash) + Number(summary.cash_sales))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <label style={{ fontSize: 13, color: 'var(--text-disabled)', display: 'block', marginBottom: 4 }}>实际清点现金</label>
            <input
              type="number" min="0" value={closingCash} onChange={e => setClosingCash(e.target.value)}
              placeholder="0.00"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'var(--border-dark-faint)', color: 'var(--border)', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
            />

            <label style={{ fontSize: 13, color: 'var(--text-disabled)', display: 'block', marginBottom: 4 }}>备注</label>
            <textarea
              value={shiftRemark} onChange={e => setShiftRemark(e.target.value)}
              placeholder="可选，如有差异请说明原因"
              rows={2}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'var(--border-dark-faint)', color: 'var(--border)', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 20 }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowShiftModal(null)} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', cursor: 'pointer', fontSize: 13 }}>取消</button>
              <button onClick={handleCloseShift} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: 'var(--status-warning)', color: 'var(--text-on-dark)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>确认交班</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: 门店设置
      ══════════════════════════════════════════════════════════════════════ */}
      {showStoreSetup && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-mask)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--text-primary)', borderRadius: 12, padding: 28, width: 400, border: '1px solid var(--border-dark)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>门店设置</h3>
            {[
              ['门店编码 *', setupStoreCode, setSetupStoreCode, '例如 STORE_001'],
              ['门店名称', setupStoreName, setSetupStoreName, '例如 北京直营店'],
              ['公司编码 *', setupCompanyCode, setSetupCompanyCode, '例如 COMPANY_001'],
              ['公司名称', setupCompanyName, setSetupCompanyName, '例如 凤凰生态农业'],
            ].map(([label, val, setter, ph]) => (
              <div key={label as string} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: 'var(--text-disabled)', display: 'block', marginBottom: 3 }}>{label as string}</label>
                <input
                  value={val as string}
                  onChange={e => (setter as (v: string) => void)(e.target.value)}
                  placeholder={ph as string}
                  style={{ width: '100%', padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'var(--border-dark-faint)', color: 'var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => setShowStoreSetup(false)} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border-dark)', background: 'transparent', color: 'var(--text-disabled)', cursor: 'pointer', fontSize: 13 }}>取消</button>
              <button onClick={handleSaveSetup} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: 'var(--text-on-dark)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

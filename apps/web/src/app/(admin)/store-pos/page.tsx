'use client';

/**
 * Phoenix ERP V3 — 直营店收银作业台
 * Sales V2 Phase 9: 3 列布局：[商品目录] | [购物车] | [收款结账]
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import u from "@/styles/uix-utils.module.css";
import s from '@/components/ui/admin-ui.module.css'; // G29-B: 表格全局样式
import { ShoppingCart, Banknote, CreditCard, Wallet, X, Plus, Minus, Search, RefreshCw, CheckCircle, AlertTriangle, Clock, History, LogIn, LogOut, FileText, BarChart2, Loader2, ChevronDown } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { DictSelect } from '@/components/shared-selectors/DictSelect'; // G2 字典
import { CustomerSelector, StoreMembershipSelector, CashAccountSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { useLanguage } from "@/contexts/LanguageContext";
import { loadStorePosContexts, storePosRequest } from '@/lib/store-pos-api';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  return storePosRequest<T>(method, path, body);
}
function fmt(n: number | string | null | undefined) {
  if (n === null || n === undefined) return '0.00';
  return Number(n).toFixed(2);
}
function fmtDate(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleString('zh-CN', {
    hour12: false
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Product {
  product_code: string;
  product_name: string;
  grade_code?: string;
  packaging_spec?: string;
  unit_price: number;
  retail_price?: number;
  floor_price?: number | string | null;   // POS-P1 改价:价带下限
  ceiling_price?: number | string | null; // POS-P1 改价:价带上限
  currency_code?: string; // POS-P0-6:价格本币种,贯穿收款账户过滤 + 销售单币种
  sku_code?: string | null; // Phase H5
  grade_code_std?: string | null; // Phase H5
  spec_code?: string | null; // Phase H5
}
interface CartItem extends Product {
  qty: number;
  amount: number;
  sortOrder: number;
}
interface SaleRecord {
  id: number;
  sale_no: string;
  sale_type: string;
  payment_status: string;
  status: string;
  total_amount: number;
  paid_amount: number;
  customer_name?: string;
  created_at: string;
  completed_at?: string;
}
interface SaleDetailItem {
  id: number;
  product_code: string;
  product_name: string;
  grade_code?: string | null;
  packaging_spec?: string | null;
  qty: number;
  unit_price: number;
  amount: number;
  batch_no?: string | null;
}
interface SaleDetail extends SaleRecord {
  store_name?: string;
  company_name?: string;
  payment_method?: string;
  subtotal?: number;
  discount_amount?: number;
  receivable_amount?: number;
  created_by_name?: string;
  void_reason?: string | null;
  items?: SaleDetailItem[];
}
interface ShiftRecord {
  id: number;
  closing_no: string;
  status: string;
  opening_cash: number;
  closing_cash?: number;
  system_cash?: number;
  difference_amount?: number;
  total_sales?: number;
  cash_sales?: number;
  credit_sales?: number;
  sale_count?: number;
  opened_at: string;
  closed_at?: string;
  operator_name?: string;
  remark?: string;
}
interface DailySummary {
  date: string;
  total_sales: number;
  cash_sales: number;
  credit_sales: number;
  mixed_sales: number;
  sale_count: number;
  completed_count: number;
  void_count: number;
}
type PayType = 'CASH' | 'CREDIT' | 'MIXED';
type View = 'pos' | 'history' | 'shift';
const SALE_TYPE_MAP: Record<string, {
  label: string;
  color: string;
}> = {
  CASH: {
    label: '现金',
    color: 'var(--status-success)'
  },
  CREDIT: {
    label: '赊销',
    color: 'var(--status-warning)'
  },
  MIXED: {
    label: '混合',
    color: 'var(--status-special)'
  }
};
const STATUS_MAP: Record<string, {
  label: string;
  color: string;
  bg: string;
}> = {
  OPEN: {
    label: '进行中',
    color: 'var(--color-accent)',
    bg: 'var(--status-info-bg)'
  },
  COMPLETED: {
    label: '已完成',
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg)'
  },
  VOID: {
    label: '已作废',
    color: 'var(--status-danger)',
    bg: 'var(--status-danger-bg)'
  },
  RETURNED: {
    label: '已退货',
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-bg)'
  }
};
const PAY_STATUS_MAP: Record<string, {
  label: string;
  color: string;
}> = {
  UNPAID: {
    label: '未收款',
    color: 'var(--status-danger)'
  },
  PARTIAL: {
    label: '部分收',
    color: 'var(--status-warning)'
  },
  PAID: {
    label: '已收款',
    color: 'var(--status-success)'
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Badge
// ─────────────────────────────────────────────────────────────────────────────

function Badge({
  label,
  color,
  bg
}: {
  label: string;
  color: string;
  bg?: string;
}) {
  return <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    color,
    background: bg || `${color}1a`
  }}>
      {label}
    </span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Toast
// ─────────────────────────────────────────────────────────────────────────────

function Toast({
  msg,
  type,
  onClose
}: {
  msg: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return <div style={{
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 9999,
    padding: '12px 20px',
    borderRadius: 8,
    maxWidth: 380,
    background: type === 'success' ? 'var(--status-success)' : 'var(--status-danger)',
    color: 'var(--text-on-dark)',
    fontSize: 14,
    boxShadow: '0 4px 16px var(--overlay-black-30)',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  }}>
      {type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
      {msg}
    </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function StorePosPage() {
  const { t } = useLanguage();
  const {
    hasPerm
  } = usePermission('MENU_STORE_POS');

  // ── 门店上下文 ──────────────────────────────────────────────────────────────
  const [storeCode, setStoreCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [companyName, setCompanyName] = useState('');

  // ── 视图 ──────────────────────────────────────────────────────────────────
  const [view, setView] = useState<View>('pos');

  // ── 商品目录 ──────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [loadingProds, setLoadingProds] = useState(false);

  // ── 购物车 ────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerCode, setCustomerCode] = useState('');

  // ── 结账 ─────────────────────────────────────────────────────────────────
  const [payType, setPayType] = useState<PayType>('CASH');
  const [cashAccountId, setCashAccountId] = useState<number>(0);  // POS-P0-3:去硬编码默认 1,改由 CashAccountSelector 选(0=未选,结账时强制选)
  const [paidAmount, setPaidAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [processing, setProcessing] = useState(false);

  // ── 销售记录 ──────────────────────────────────────────────────────────────
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesPage, setSalesPage] = useState(1);
  const [loadingSales, setLoadingSales] = useState(false);
  // POS-P1:销售记录详情 / 作废
  const [detailSale, setDetailSale] = useState<SaleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [voidTarget, setVoidTarget] = useState<SaleRecord | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  // POS-P1c:退货/冲红
  const [returnTarget, setReturnTarget] = useState<SaleRecord | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returning, setReturning] = useState(false);

  // ── 班次 ──────────────────────────────────────────────────────────────────
  const [currentShift, setCurrentShift] = useState<ShiftRecord | null>(null);
  const [shiftHistory, setShiftHistory] = useState<ShiftRecord[]>([]);
  const [shiftTotal, setShiftTotal] = useState(0);
  const [shiftPage, setShiftPage] = useState(1);
  const [loadingShift, setLoadingShift] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [shiftRemark, setShiftRemark] = useState('');
  const [showShiftModal, setShowShiftModal] = useState<'open' | 'close' | null>(null);

  // ── 当日汇总 ──────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<DailySummary | null>(null);

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{
    msg: string;
    type: 'success' | 'error';
  } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({
    msg,
    type
  });

  // ── 初始化门店上下文 ─────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    void loadStorePosContexts().then(contexts => {
      if (!alive) return;
      let saved: any = null;
      try { saved = JSON.parse(sessionStorage.getItem('phoenix_store_info') || 'null'); } catch { /* ignore corrupt legacy context */ }
      const selected = contexts.find(c => c.storeCode === saved?.storeCode) ?? contexts[0];
      if (!selected) return;
      setStoreCode(selected.storeCode);
      setStoreName(selected.storeName);
      setCompanyCode(selected.companyCode);
      setCompanyName(selected.companyCode);
    }).catch(() => { /* API fail-closed; keep context empty */ });
    return () => { alive = false; };
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
    } catch {/* ignore */}
  }, [storeCode]);

  // ── 加载当日汇总 ─────────────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    if (!storeCode) return;
    try {
      const data = await api<DailySummary>('GET', `/api/v2/store-sales/daily-summary?storeCode=${encodeURIComponent(storeCode)}`);
      setSummary(data);
    } catch {/* ignore */}
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
      const data = await api<{
        items: SaleRecord[];
        total: number;
      }>('GET', `/api/v2/store-sales?storeCode=${encodeURIComponent(storeCode)}&page=${page}&limit=20`);
      setSales(data.items ?? []);
      setSalesTotal(data.total ?? 0);
      setSalesPage(page);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoadingSales(false);
    }
  }, [storeCode]);

  // ── 销售单详情 ───────────────────────────────────────────────────────────
  const openDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    setDetailSale(null);
    try {
      const data = await api<SaleDetail>('GET', `/api/v2/store-sales/${id}`);
      setDetailSale(data);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // ── 作废销售单 ───────────────────────────────────────────────────────────
  const submitVoid = useCallback(async () => {
    if (!voidTarget) return;
    const reason = voidReason.trim();
    if (!reason) {
      showToast(t('ui.请填写作废原因','请填写作废原因'), 'error');
      return;
    }
    setVoiding(true);
    try {
      await api('POST', `/api/v2/store-sales/${voidTarget.id}/void`, { reason });
      showToast(`${t('ui.已作废','已作废')} ${voidTarget.sale_no}`, 'success');
      setVoidTarget(null);
      setVoidReason('');
      loadSales(salesPage);
      loadSummary();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setVoiding(false);
    }
  }, [voidTarget, voidReason, salesPage, loadSales, loadSummary]);

  // ── 退货 / 冲红 ──────────────────────────────────────────────────────────
  const submitReturn = useCallback(async () => {
    if (!returnTarget) return;
    const reason = returnReason.trim();
    if (!reason) {
      showToast(t('ui.请填写退货原因','请填写退货原因'), 'error');
      return;
    }
    setReturning(true);
    try {
      await api('POST', `/api/v2/store-sales/${returnTarget.id}/return`, { reason });
      showToast(`${t('ui.已退货','已退货')} ${returnTarget.sale_no}`, 'success');
      setReturnTarget(null);
      setReturnReason('');
      loadSales(salesPage);
      loadSummary();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setReturning(false);
    }
  }, [returnTarget, returnReason, salesPage, loadSales, loadSummary]);

  // ── 加载班次历史 ─────────────────────────────────────────────────────────
  const loadShiftHistory = useCallback(async (page = 1) => {
    if (!storeCode) return;
    setLoadingShift(true);
    try {
      const data = await api<{
        items: ShiftRecord[];
        total: number;
      }>('GET', `/api/v2/store-sales/shift/history?storeCode=${encodeURIComponent(storeCode)}&page=${page}&limit=15`);
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
    if (view === 'shift') loadShiftHistory(1);
  }, [view, loadSales, loadShiftHistory]);

  // ── 购物车操作 ───────────────────────────────────────────────────────────
  const addToCart = (p: Product) => {
    setCart(prev => {
      // Phase H5: SKU 路径用 sku_code 去重，旧路径用 product_code+grade_code
      const idx = p.sku_code ? prev.findIndex(c => c.sku_code === p.sku_code) : prev.findIndex(c => !c.sku_code && c.product_code === p.product_code && c.grade_code === p.grade_code);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          qty: next[idx].qty + 1,
          amount: (next[idx].qty + 1) * next[idx].unit_price
        };
        return next;
      }
      return [...prev, {
        ...p,
        qty: 1,
        amount: p.unit_price,
        sortOrder: prev.length
      }];
    });
  };
  const updateQty = (idx: number, delta: number) => {
    setCart(prev => {
      const next = [...prev];
      const newQty = Math.max(0, next[idx].qty + delta);
      if (newQty === 0) return next.filter((_, i) => i !== idx);
      next[idx] = {
        ...next[idx],
        qty: newQty,
        amount: newQty * next[idx].unit_price
      };
      return next;
    });
  };
  // POS-P1 改价:手改单价(回车/失焦提交),重算小计;低于最低价仅前端飘红提示,后端最终拦
  const updatePrice = (idx: number, raw: string) => {
    const price = Math.max(0, Number(raw) || 0);
    setCart(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], unit_price: price, amount: next[idx].qty * price };
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
  const subtotal = cart.reduce((s, c) => s + c.amount, 0);
  const totalAmount = Math.max(0, subtotal - discountAmount);
  // POS-P0-6:购物车币种(同一公司价格本单一币种);用于过滤收款账户,后端按此校验现金/AR 同币种
  const cartCurrency = cart[0]?.currency_code || '';
  // 币种切换时清空已选收款账户,避免选到不匹配币种的账户(后端会硬拦)
  useEffect(() => {
    setCashAccountId(0);
  }, [cartCurrency]);

  // ── 提交销售 ─────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!cart.length) {
      showToast(t('ui.购物车为空','购物车为空'), 'error');
      return;
    }
    if (!storeCode) {
      showToast(t('ui.请先设置门店信息','请先设置门店信息'), 'error');
      return;
    }
    const paid = payType === 'CREDIT' ? 0 : Number(paidAmount) || totalAmount;
    if (payType !== 'CREDIT' && paid <= 0) {
      showToast(t('ui.请输入收款金额','请输入收款金额'), 'error');
      return;
    }
    // POS-P0-3：现金/混合收款必须选资金账户(防"收了钱不入账")
    if (payType !== 'CREDIT' && !cashAccountId) {
      showToast(t('ui.请选择收款资金账户','请选择收款资金账户'), 'error');
      return;
    }
    if (payType === 'MIXED' && paid >= totalAmount) {
      showToast(t('ui.混合收款实收额应小于订单总额','混合收款实收额应小于订单总额'), 'error');
      return;
    }
    setProcessing(true);
    try {
      // 1. 建单
      const sale = await api<{
        id: number;
        sale_no: string;
      }>('POST', '/api/v2/store-sales', {
        storeCode,
        storeName,
        companyCode,
        companyName,
        saleType: payType,
        paymentMethod: payType !== 'CREDIT' ? payMethod : undefined,
        currencyCode: cartCurrency || undefined, // POS-P0-6:传购物车币种;后端缺省按公司价格本解析
        customerCode: customerCode || undefined,
        customerName: customerName || undefined,
        discountAmount,
        items: cart.map((c, i) => ({
          productCode: c.product_code,
          productName: c.product_name,
          gradeCode: c.grade_code,
          packagingSpec: c.packaging_spec,
          qty: c.qty,
          unitPrice: c.unit_price,
          amount: c.amount,
          sortOrder: i,
          skuCode: c.sku_code ?? undefined // Phase H5
        }))
      });

      // 2. 收款。一次确认共用同一 key，服务端/数据库负责重试幂等。
      const idempotencyKey = crypto.randomUUID();
      if (payType === 'CASH') {
        await api('POST', `/api/v2/store-sales/${sale.id}/pay-cash`, {
          cashAccountId,
          paidAmount: paid,
          paymentMethod: payMethod,
          idempotencyKey
        });
      } else if (payType === 'CREDIT') {
        await api('POST', `/api/v2/store-sales/${sale.id}/pay-credit`, { idempotencyKey });
      } else {
        await api('POST', `/api/v2/store-sales/${sale.id}/pay-mixed`, {
          cashAccountId,
          paidAmount: paid,
          paymentMethod: payMethod,
          customerCode: customerCode || undefined,
          customerName: customerName || undefined,
          idempotencyKey
        });
      }
      showToast(`${t('ui.销售单','销售单')} ${sale.sale_no} ${t('ui.开立成功','开立成功')}`, 'success');
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
    if (!storeCode) {
      showToast(t('ui.请先设置门店','请先设置门店'), 'error');
      return;
    }
    try {
      await api('POST', '/api/v2/store-sales/shift/open', {
        storeCode,
        companyCode,
        openingCash: Number(openingCash) || 0
      });
      showToast(t('ui.开班成功','开班成功'), 'success');
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
        remark: shiftRemark || undefined
      });
      showToast(t('ui.交班成功','交班成功'), 'success');
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
  const filteredProducts = products.filter(p => !productQuery || p.product_name.includes(productQuery) || p.product_code.includes(productQuery) || (p.sku_code ?? '').includes(productQuery) // Phase H5: 支持按 SKU 搜索
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 门店设置弹窗（首次使用时引导配置）
  // ─────────────────────────────────────────────────────────────────────────
  const [showStoreSetup, setShowStoreSetup] = useState(false);
  const [setupStoreCode, setSetupStoreCode] = useState('');
  const [setupStoreName, setSetupStoreName] = useState('');
  const [setupCompanyCode, setSetupCompanyCode] = useState('');
  const [setupCompanyName, setSetupCompanyName] = useState('');
  const handleSaveSetup = () => {
    if (!setupStoreCode || !setupCompanyCode) {
      showToast(t('ui.门店编码和公司编码为必填','门店编码和公司编码为必填'), 'error');
      return;
    }
    const info = {
      storeCode: setupStoreCode,
      storeName: setupStoreName,
      companyCode: setupCompanyCode,
      companyName: setupCompanyName
    };
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

  return <div style={{
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'var(--bg-page)',
    color: 'var(--border)',
    fontFamily: 'system-ui, sans-serif'
  }}>

      {/* ── 顶部工具栏 ─────────────────────────────────────────────────────── */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      height: 52,
      background: 'var(--text-primary)',
      borderBottom: '1px solid var(--border-dark-faint)',
      gap: 12,
      flexShrink: 0
    }}>
        <Banknote size={20} color="var(--status-success)" />
        <span style={{
        fontWeight: 700,
        fontSize: 16,
        color: 'var(--bg-muted)'
      }}>{t('ui.直营店收银','直营店收银')}</span>
        {storeCode && <span style={{
        fontSize: 13,
        color: 'var(--text-disabled)',
        marginLeft: 4
      }}>
            {storeName || storeCode} · {companyName || companyCode}
          </span>}

        {/* 班次状态 */}
        {storeCode && <div style={{
        marginLeft: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}>
            {currentShift ? <>
                <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--status-success)',
            display: 'inline-block'
          }} />
                <span style={{
            fontSize: 12,
            color: 'var(--status-success)'
          }}>{t('ui.班次进行中 · 开班','班次进行中 · 开班')} {fmtDate(currentShift.opened_at)}</span>
                {hasPerm('C') && <button onClick={() => setShowShiftModal('close')} style={{
            marginLeft: 4,
            padding: '2px 10px',
            borderRadius: 4,
            border: '1px solid var(--status-warning)',
            background: 'transparent',
            color: 'var(--status-warning)',
            fontSize: 12,
            cursor: 'pointer'
          }}>
                    <LogOut size={11} style={{
              marginRight: 4,
              verticalAlign: 'middle'
            }} />{t('ui.交班','交班')}
                  </button>}
              </> : <>
                <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--status-danger)',
            display: 'inline-block'
          }} />
                <span style={{
            fontSize: 12,
            color: 'var(--status-danger)'
          }}>{t('ui.未开班','未开班')}</span>
                {hasPerm('C') && <button onClick={() => setShowShiftModal('open')} style={{
            marginLeft: 4,
            padding: '2px 10px',
            borderRadius: 4,
            border: '1px solid var(--status-success)',
            background: 'transparent',
            color: 'var(--status-success)',
            fontSize: 12,
            cursor: 'pointer'
          }}>
                    <LogIn size={11} style={{
              marginRight: 4,
              verticalAlign: 'middle'
            }} />{t('ui.开班','开班')}
                  </button>}
              </>}
          </div>}

        <div className={u.flex1} />

        {/* 视图切换 */}
        {(['pos', 'history', 'shift'] as View[]).map(v => <button key={v} onClick={() => setView(v)} style={{
        padding: '4px 14px',
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        background: view === v ? 'var(--color-accent)' : 'transparent',
        color: view === v ? 'var(--bg-card)' : 'var(--text-disabled)'
      }}>
            {v === 'pos' ? t('ui.收银台','收银台') : v === 'history' ? t('ui.销售记录','销售记录') : t('ui.班次管理','班次管理')}
          </button>)}

        <button onClick={() => setShowStoreSetup(true)} style={{
        padding: '4px 12px',
        borderRadius: 6,
        border: '1px solid var(--border-dark)',
        background: 'transparent',
        color: 'var(--text-disabled)',
        fontSize: 12,
        cursor: 'pointer'
      }}>
          {t('ui.设置门店','设置门店')}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          视图：收银台（3 列）
       ══════════════════════════════════════════════════════════════════════ */}
      {view === 'pos' && <div style={{
      flex: 1,
      display: 'flex',
      overflow: 'hidden'
    }}>

          {/* 列 1：商品目录 */}
          <div style={{
        width: 320,
        borderRight: '1px solid var(--border-dark-faint)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0
      }}>
            <div style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-dark-faint)',
          display: 'flex',
          gap: 8
        }}>
              <div style={{
            flex: 1,
            position: 'relative'
          }}>
                <Search size={14} style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)'
            }} />
                <input value={productQuery} onChange={e => setProductQuery(e.target.value)}
              onKeyDown={e => {
                // POS-P1:扫码/搜码加购 —— 回车时精确命中 sku_code/product_code 即加购(扫码枪天然按回车);
                //   无精确命中但搜索结果恰好 1 个也加购;否则提示未找到。
                if (e.key !== 'Enter') return;
                const q = productQuery.trim();
                if (!q) return;
                const exact = products.find(p => p.sku_code === q || p.product_code === q);
                const target = exact ?? (filteredProducts.length === 1 ? filteredProducts[0] : undefined);
                if (target) { addToCart(target); setProductQuery(''); }
                else showToast(`${t('ui.未找到商品','未找到商品')}「${q}」`, 'error');
              }}
              placeholder={t('ui.扫码或搜索商品（回车加购）','扫码或搜索商品（回车加购）')} style={{
              width: '100%',
              padding: '6px 8px 6px 28px',
              borderRadius: 6,
              border: '1px solid var(--border-dark)',
              background: 'var(--border-dark-faint)',
              color: 'var(--border)',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box'
            }} />
              </div>
              <button onClick={loadProducts} style={{
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid var(--border-dark)',
            background: 'transparent',
            color: 'var(--text-disabled)',
            cursor: 'pointer'
          }}>
                <RefreshCw size={14} />
              </button>
            </div>

            <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px'
        }}>
              {loadingProds ? <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: 200,
            color: 'var(--text-secondary)'
          }}>
                  <Loader2 size={20} className="animate-spin" /> <span style={{
              marginLeft: 8
            }}>{t('ui.加载中...','加载中...')}</span>
                </div> : !storeCode ? <div style={{
            textAlign: 'center',
            color: 'var(--text-secondary)',
            marginTop: 60,
            fontSize: 13
          }}>{t('ui.请先配置门店','请先配置门店')}</div> : filteredProducts.length === 0 ? <div style={{
            textAlign: 'center',
            color: 'var(--text-secondary)',
            marginTop: 60,
            fontSize: 13
          }}>{products.length === 0
            ? <>{t('ui.本店所属公司暂无','本店所属公司暂无')} <b>{t('ui.ACTIVE 价格本','ACTIVE 价格本')}</b>{t('ui.，收银台无可售商品。','，收银台无可售商品。')}<br />{t('ui.请先在「销售管理 / 价格管理」为公司','请先在「销售管理 / 价格管理」为公司')} <b>{companyCode || '—'}</b> {t('ui.配置并启用价格本。','配置并启用价格本。')}</>
            : <>{t('ui.无匹配','无匹配')}「{productQuery}」{t('ui.的商品','的商品')}</>}</div> : <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8
          }}>
                  {filteredProducts.map(p => <button key={p.sku_code ?? `${p.product_code}-${p.grade_code}`} onClick={() => addToCart(p)} style={{
              padding: '10px 10px',
              borderRadius: 8,
              border: `1px solid ${p.sku_code ? 'var(--status-special-border)' : 'var(--border-dark-faint)'}`,
              background: p.sku_code ? 'var(--status-special-bg)' : 'var(--surface-dark)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s',
              color: 'var(--border)'
            }}>
                      <div style={{
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 2,
                lineHeight: 1.3
              }}>{p.product_name}</div>
                      {/* Phase H5: SKU 徽章 */}
                      {p.sku_code ? <div style={{
                fontSize: 10,
                color: 'var(--status-special)',
                fontFamily: 'monospace',
                fontWeight: 700,
                marginBottom: 3
              }}>{p.sku_code}</div> : p.grade_code && <div style={{
                fontSize: 11,
                color: 'var(--text-disabled)',
                marginBottom: 4
              }}>{p.grade_code}</div>}
                      <div style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--status-success)'
              }}>¥{fmt(p.unit_price)}</div>
                    </button>)}
                </div>}
            </div>
          </div>

          {/* 列 2：购物车 */}
          <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--border-dark-faint)',
        minWidth: 0
      }}>
            <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-dark-faint)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
              <span style={{
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
                <ShoppingCart size={16} /> {t('ui.购物车','购物车')}
                {cart.length > 0 && <span style={{
              background: 'var(--color-accent)',
              color: 'var(--text-on-dark)',
              borderRadius: '50%',
              width: 18,
              height: 18,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11
            }}>{cart.length}</span>}
              </span>
              {cart.length > 0 && <button onClick={clearCart} style={{
            padding: '3px 10px',
            borderRadius: 5,
            border: '1px solid var(--status-danger-border)',
            background: 'transparent',
            color: 'var(--status-danger)',
            fontSize: 12,
            cursor: 'pointer'
          }}>
                  {t('ui.清空','清空')}
                </button>}
            </div>

            <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 12px'
        }}>
              {cart.length === 0 ? <div style={{
            textAlign: 'center',
            color: 'var(--text-secondary)',
            marginTop: 80,
            fontSize: 13
          }}>{t('ui.请从左侧添加商品','请从左侧添加商品')}</div> : cart.map((item, idx) => <div key={idx} style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 6px',
            borderBottom: '1px solid var(--surface-dark)',
            gap: 8
          }}>
                    <div style={{
              flex: 1,
              minWidth: 0
            }}>
                      <div style={{
                fontSize: 13,
                fontWeight: 500
              }}>{item.product_name}</div>
                      {item.sku_code ? <div style={{
                fontSize: 10,
                color: 'var(--status-special)',
                fontFamily: 'monospace',
                fontWeight: 700
              }}>{item.sku_code}</div> : item.grade_code && <div style={{
                fontSize: 11,
                color: 'var(--text-disabled)'
              }}>{item.grade_code}</div>}
                      {/* POS-P1 改价:单价可手改;低于最低价飘红提示(后端最终拦) */}
                      {(() => {
                        const floor = item.floor_price != null ? Number(item.floor_price) : null;
                        const belowFloor = floor != null && Number(item.unit_price) < floor;
                        return <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>¥</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={item.unit_price}
                            onChange={e => updatePrice(idx, e.target.value)}
                            title={floor != null ? `最低价 ${fmt(floor)}` : undefined}
                            style={{
                              width: 76, padding: '1px 4px', fontSize: 12,
                              borderRadius: 4,
                              border: `1px solid ${belowFloor ? 'var(--status-danger)' : 'var(--border-dark)'}`,
                              background: 'var(--surface-dark)',
                              color: belowFloor ? 'var(--status-danger)' : 'var(--text-on-dark)',
                            }} />
                          <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>× {item.qty}</span>
                          {belowFloor && <span style={{ fontSize: 10, color: 'var(--status-danger)' }}>{t('ui.低于最低价','低于最低价')} {fmt(floor)}</span>}
                        </div>;
                      })()}
                    </div>
                    <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--status-success)',
              width: 72,
              textAlign: 'right'
            }}>¥{fmt(item.amount)}</div>
                    <div style={{
              display: 'flex',
              gap: 4
            }}>
                      <button onClick={() => updateQty(idx, -1)} style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                border: '1px solid var(--border-dark)',
                background: 'transparent',
                color: 'var(--border)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}><Minus size={12} /></button>
                      <button onClick={() => updateQty(idx, +1)} style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                border: '1px solid var(--border-dark)',
                background: 'transparent',
                color: 'var(--border)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}><Plus size={12} /></button>
                      <button onClick={() => removeFromCart(idx)} style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                border: '1px solid var(--status-danger-border)',
                background: 'transparent',
                color: 'var(--status-danger)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}><X size={12} /></button>
                    </div>
                  </div>)}
            </div>

            {/* 小计 */}
            {cart.length > 0 && <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border-dark-faint)'
        }}>
                <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
            color: 'var(--text-disabled)',
            marginBottom: 4
          }}>
                  <span>{t('ui.小计','小计')}</span><span>¥{fmt(subtotal)}</span>
                </div>
                <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
            color: 'var(--text-disabled)',
            marginBottom: 2
          }}>
                  <span>{t('ui.优惠','优惠')}</span>
                  <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
                    <span>-¥</span>
                    <input type="number" min="0" value={discountAmount || ''} onChange={e => setDiscountAmount(Math.max(0, Number(e.target.value)))} style={{
                width: 64,
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid var(--border-dark)',
                background: 'var(--border-dark-faint)',
                color: 'var(--border)',
                fontSize: 13,
                textAlign: 'right',
                outline: 'none'
              }} />
                  </div>
                </div>
                <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--status-success)',
            marginTop: 4
          }}>
                  <span>{t('ui.合计','合计')}</span><span>¥{fmt(totalAmount)}</span>
                </div>
              </div>}
          </div>

          {/* 列 3：收款结账 */}
          <div style={{
        width: 300,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        padding: '16px 16px 12px'
      }}>
            <div style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 14,
          color: 'var(--bg-muted)'
        }}>{t('ui.结账方式','结账方式')}</div>

            {/* 支付类型 */}
            <div style={{
          display: 'flex',
          gap: 6,
          marginBottom: 14
        }}>
              {([['CASH', t('ui.现金/转账','现金/转账')], ['CREDIT', t('ui.赊销','赊销')], ['MIXED', t('ui.混合','混合')]] as [PayType, string][]).map(([v, l]) => <button key={v} onClick={() => setPayType(v)} style={{
            flex: 1,
            padding: '7px 0',
            borderRadius: 6,
            border: `1px solid ${payType === v ? 'var(--color-accent)' : 'var(--border-dark)'}`,
            background: payType === v ? 'var(--status-info-bg)' : 'transparent',
            color: payType === v ? 'var(--color-accent)' : 'var(--text-disabled)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}>
                  {l}
                </button>)}
            </div>

            {/* 客户信息（赊销/混合时填写） */}
            {(payType === 'CREDIT' || payType === 'MIXED') && <div style={{
          marginBottom: 10
        }}>
                <label style={{
            fontSize: 12,
            color: 'var(--text-disabled)',
            display: 'block',
            marginBottom: 3
          }}>{t('ui.客户 *','客户 *')}</label>
                {/* G4-C：客户主数据(仅 ACTIVE)，自动带出名称，禁止手填 */}
                <CustomerSelector value={customerCode} onChange={setCustomerCode} onPick={o => setCustomerName(o?.raw?.name ?? o?.label ?? '')} />
              </div>}

            {/* 支付方式 */}
            {payType !== 'CREDIT' && <div style={{
          marginBottom: 10
        }}>
                <label style={{
            fontSize: 12,
            color: 'var(--text-disabled)',
            display: 'block',
            marginBottom: 3
          }}>{t('ui.支付方式','支付方式')}</label>
                {/* G4-C：支付方式来自 sys_dict(SAL_PAY_METHOD) */}
                <DictSelect dictType="SAL_PAY_METHOD" value={payMethod} onChange={setPayMethod} allowEmpty={false} />
              </div>}

            {/* POS-P0-3：收款资金账户（去硬编码 id=1，按门店所属公司过滤，修"收了钱不入账"） */}
            {payType !== 'CREDIT' && <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--text-disabled)', display: 'block', marginBottom: 3 }}>{t('ui.收款账户 *','收款账户 *')}</label>
                <CashAccountSelector
                  valueField="id"
                  companyCode={companyCode || undefined}
                  currencyCode={cartCurrency || undefined}
                  value={cashAccountId ? String(cashAccountId) : ''}
                  onChange={(v) => setCashAccountId(Number(v) || 0)}
                  placeholder={cartCurrency ? `选择 ${cartCurrency} 收款账户` : t('ui.选择收款资金账户','选择收款资金账户')}
                />
              </div>}

            {/* 实收金额 */}
            {payType !== 'CREDIT' && <div style={{
          marginBottom: 10
        }}>
                <label style={{
            fontSize: 12,
            color: 'var(--text-disabled)',
            display: 'block',
            marginBottom: 3
          }}>
                  {payType === 'MIXED' ? t('ui.本次收款金额','本次收款金额') : t('ui.实收金额','实收金额')}
                </label>
                <input type="number" min="0" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} placeholder={`¥ ${fmt(totalAmount)}`} style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--border-dark-strong)',
            background: 'var(--border-dark-faint)',
            color: 'var(--status-success)',
            fontSize: 18,
            fontWeight: 700,
            outline: 'none',
            boxSizing: 'border-box'
          }} />
                {payType === 'MIXED' && paidAmount && <div style={{
            fontSize: 12,
            color: 'var(--status-warning)',
            marginTop: 3
          }}>
                    {t('ui.赊账金额：','赊账金额：')}¥{fmt(totalAmount - Number(paidAmount))}
                  </div>}
              </div>}

            {/* 找零 */}
            {payType === 'CASH' && paidAmount && Number(paidAmount) > totalAmount && <div style={{
          padding: '8px 12px',
          borderRadius: 6,
          background: 'var(--status-success-bg)',
          border: '1px solid var(--status-success-border)',
          marginBottom: 10
        }}>
                <span style={{
            fontSize: 12,
            color: 'var(--status-success)'
          }}>{t('ui.找零：','找零：')}</span>
                <span style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--status-success)'
          }}>¥{fmt(Number(paidAmount) - totalAmount)}</span>
              </div>}

            <div className={u.flex1} />

            {/* 当日汇总 */}
            {summary && <div style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: 'var(--surface-dark)',
          border: '1px solid var(--border-dark-faint)',
          marginBottom: 12
        }}>
                <div style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            marginBottom: 6,
            fontWeight: 600
          }}>{t('ui.今日汇总','今日汇总')}</div>
                <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px 16px'
          }}>
                  {[[t('ui.销售额','销售额'), `¥${fmt(summary.total_sales)}`], [t('ui.单数','单数'), `${summary.sale_count} 单`], [t('ui.现金收','现金收'), `¥${fmt(summary.cash_sales)}`], [t('ui.赊销额','赊销额'), `¥${fmt(summary.credit_sales)}`]].map(([k, v]) => <div key={k} style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12
            }}>
                      <span style={{
                color: 'var(--text-disabled)'
              }}>{k}</span>
                      <span style={{
                color: 'var(--border)',
                fontWeight: 500
              }}>{v}</span>
                    </div>)}
                </div>
              </div>}

            {/* 结账按钮 */}
            <button onClick={handleCheckout} disabled={processing || !cart.length} style={{
          width: '100%',
          padding: '14px 0',
          borderRadius: 8,
          border: 'none',
          cursor: processing || !cart.length ? 'not-allowed' : 'pointer',
          background: cart.length ? processing ? 'var(--color-primary)' : 'var(--color-accent)' : 'var(--border-dark-faint)',
          color: cart.length ? 'var(--bg-card)' : 'var(--text-secondary)',
          fontSize: 16,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8
        }}>
              {processing ? <><Loader2 size={16} className="animate-spin" />{t('ui.处理中...','处理中...')}</> : <>
                <CheckCircle size={16} />
                {t('ui.结账','结账')} {cart.length > 0 ? `· ¥${fmt(totalAmount)}` : ''}
              </>}
            </button>
          </div>
        </div>}

      {/* ══════════════════════════════════════════════════════════════════════
          视图：销售记录
       ══════════════════════════════════════════════════════════════════════ */}
      {view === 'history' && <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '20px 24px'
    }}>
          <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
      }}>
            <h2 style={{
          fontSize: 16,
          fontWeight: 600,
          margin: 0
        }}>{t('ui.销售记录','销售记录')}</h2>
            <button onClick={() => loadSales(1)} style={{
          padding: '5px 12px',
          borderRadius: 6,
          border: '1px solid var(--border-dark)',
          background: 'transparent',
          color: 'var(--text-disabled)',
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5
        }}>
              <RefreshCw size={13} />{t('ui.刷新','刷新')}
            </button>
          </div>

          {loadingSales ? <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: 200,
        color: 'var(--text-secondary)'
      }}>
              <Loader2 size={24} /> <span style={{
          marginLeft: 8
        }}>{t('ui.加载中...','加载中...')}</span>
            </div> : <>
              <table className={s.table}>
                <thead>
                  <tr style={{
              borderBottom: '1px solid var(--border-dark-faint)'
            }}>
                    {[t('ui.单号','单号'), t('ui.类型','类型'), t('ui.状态','状态'), t('ui.收款','收款'), t('ui.金额','金额'), t('ui.已收','已收'), t('ui.客户','客户'), t('ui.时间','时间'), t('ui.操作','操作')].map(h => <th key={h} style={{
                padding: '8px 10px',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontWeight: 600
              }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => <tr key={s.id} style={{
              borderBottom: '1px solid var(--surface-dark)'
            }}>
                      <td style={{
                padding: '8px 10px',
                color: 'var(--color-accent)',
                fontFamily: 'monospace',
                fontSize: 12
              }}>{s.sale_no}</td>
                      <td style={{
                padding: '8px 10px'
              }}>
                        <Badge label={SALE_TYPE_MAP[s.sale_type]?.label ?? s.sale_type} color={SALE_TYPE_MAP[s.sale_type]?.color ?? 'var(--text-disabled)'} />
                      </td>
                      <td style={{
                padding: '8px 10px'
              }}>
                        <Badge label={STATUS_MAP[s.status]?.label ?? s.status} color={STATUS_MAP[s.status]?.color ?? 'var(--text-disabled)'} bg={STATUS_MAP[s.status]?.bg} />
                      </td>
                      <td style={{
                padding: '8px 10px'
              }}>
                        <span style={{
                  color: PAY_STATUS_MAP[s.payment_status]?.color ?? 'var(--text-disabled)',
                  fontWeight: 600,
                  fontSize: 12
                }}>
                          {PAY_STATUS_MAP[s.payment_status]?.label ?? s.payment_status}
                        </span>
                      </td>
                      <td style={{
                padding: '8px 10px',
                color: 'var(--status-success)',
                fontWeight: 600
              }}>¥{fmt(s.total_amount)}</td>
                      <td style={{
                padding: '8px 10px',
                color: 'var(--status-success)'
              }}>¥{fmt(s.paid_amount)}</td>
                      <td style={{
                padding: '8px 10px',
                color: 'var(--border)'
              }}>{s.customer_name || t('ui.散客','散客')}</td>
                      <td style={{
                padding: '8px 10px',
                color: 'var(--text-secondary)',
                fontSize: 12
              }}>{fmtDate(s.created_at)}</td>
                      <td style={{
                padding: '8px 10px'
              }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openDetail(s.id)} style={{
                    padding: '3px 10px',
                    borderRadius: 5,
                    border: '1px solid var(--border-dark)',
                    background: 'transparent',
                    color: 'var(--color-accent)',
                    cursor: 'pointer',
                    fontSize: 12
                  }}>{t('ui.详情','详情')}</button>
                          {hasPerm('D') && s.status === 'OPEN' && <button onClick={() => { setVoidTarget(s); setVoidReason(''); }} style={{
                    padding: '3px 10px',
                    borderRadius: 5,
                    border: '1px solid var(--status-danger)',
                    background: 'transparent',
                    color: 'var(--status-danger)',
                    cursor: 'pointer',
                    fontSize: 12
                  }}>{t('ui.作废','作废')}</button>}
                          {hasPerm('D') && s.status === 'COMPLETED' && <button onClick={() => { setReturnTarget(s); setReturnReason(''); }} style={{
                    padding: '3px 10px',
                    borderRadius: 5,
                    border: '1px solid var(--status-warning)',
                    background: 'transparent',
                    color: 'var(--status-warning)',
                    cursor: 'pointer',
                    fontSize: 12
                  }}>{t('ui.退货','退货')}</button>}
                        </div>
                      </td>
                    </tr>)}
                  {sales.length === 0 && <tr><td colSpan={9} style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}>{t('ui.暂无数据','暂无数据')}</td></tr>}
                </tbody>
              </table>

              {salesTotal > 20 && <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginTop: 16
        }}>
                  <button disabled={salesPage <= 1} onClick={() => loadSales(salesPage - 1)} style={{
            padding: '5px 12px',
            borderRadius: 5,
            border: '1px solid var(--border-dark)',
            background: 'transparent',
            color: 'var(--text-disabled)',
            cursor: salesPage > 1 ? 'pointer' : 'not-allowed',
            fontSize: 13
          }}>{t('ui.上一页','上一页')}</button>
                  <span style={{
            lineHeight: '32px',
            fontSize: 13,
            color: 'var(--text-secondary)'
          }}>{t('ui.第','第')} {salesPage} {t('ui.页 · 共','页 · 共')} {salesTotal} {t('ui.条','条')}</span>
                  <button disabled={salesPage * 20 >= salesTotal} onClick={() => loadSales(salesPage + 1)} style={{
            padding: '5px 12px',
            borderRadius: 5,
            border: '1px solid var(--border-dark)',
            background: 'transparent',
            color: 'var(--text-disabled)',
            cursor: salesPage * 20 < salesTotal ? 'pointer' : 'not-allowed',
            fontSize: 13
          }}>{t('ui.下一页','下一页')}</button>
                </div>}
            </>}
        </div>}

      {/* ══════════════════════════════════════════════════════════════════════
          视图：班次管理
       ══════════════════════════════════════════════════════════════════════ */}
      {view === 'shift' && <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '20px 24px'
    }}>
          <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
      }}>
            <h2 style={{
          fontSize: 16,
          fontWeight: 600,
          margin: 0
        }}>{t('ui.班次管理','班次管理')}</h2>
            <div style={{
          display: 'flex',
          gap: 8
        }}>
              {hasPerm('C') && !currentShift && <button onClick={() => setShowShiftModal('open')} style={{
            padding: '5px 14px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--status-success)',
            color: 'var(--text-on-dark)',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}>
                  <LogIn size={13} />{t('ui.开班','开班')}
                </button>}
              {hasPerm('C') && currentShift && <button onClick={() => setShowShiftModal('close')} style={{
            padding: '5px 14px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--status-warning)',
            color: 'var(--text-on-dark)',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}>
                  <LogOut size={13} />{t('ui.交班','交班')}
                </button>}
              <button onClick={() => loadShiftHistory(1)} style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid var(--border-dark)',
            background: 'transparent',
            color: 'var(--text-disabled)',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}>
                <RefreshCw size={13} />{t('ui.刷新','刷新')}
              </button>
            </div>
          </div>

          {/* 当前班次卡片 */}
          {currentShift && <div style={{
        padding: '14px 18px',
        borderRadius: 8,
        background: 'var(--status-success-bg-faint)',
        border: '1px solid var(--status-success-border)',
        marginBottom: 20
      }}>
              <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--status-success)',
          marginBottom: 8
        }}>{t('ui.当前班次 ·','当前班次 ·')} {currentShift.closing_no}</div>
              <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px 16px'
        }}>
                {[[t('ui.开班时间','开班时间'), fmtDate(currentShift.opened_at)], [t('ui.开班现金','开班现金'), `¥${fmt(currentShift.opening_cash)}`], [t('ui.操作员','操作员'), currentShift.operator_name || '—'], [t('ui.状态','状态'), t('ui.进行中','进行中')]].map(([k, v]) => <div key={k}>
                    <div style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 2
            }}>{k}</div>
                    <div style={{
              fontSize: 13,
              color: 'var(--border)',
              fontWeight: 500
            }}>{v}</div>
                  </div>)}
              </div>
            </div>}

          {/* 班次历史 */}
          {loadingShift ? <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: 200,
        color: 'var(--text-secondary)'
      }}>
              <Loader2 size={24} /><span style={{
          marginLeft: 8
        }}>{t('ui.加载中...','加载中...')}</span>
            </div> : <>
              <table className={s.table}>
                <thead>
                  <tr style={{
              borderBottom: '1px solid var(--border-dark-faint)'
            }}>
                    {[t('ui.班次编号','班次编号'), t('ui.状态','状态'), t('ui.开班','开班'), t('ui.交班','交班'), t('ui.开班现金','开班现金'), t('ui.交班现金','交班现金'), t('ui.差异','差异'), t('ui.总销售','总销售'), t('ui.现金收','现金收'), t('ui.单数','单数')].map(h => <th key={h} style={{
                padding: '8px 10px',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                whiteSpace: 'nowrap'
              }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shiftHistory.map(sh => <tr key={sh.id} style={{
              borderBottom: '1px solid var(--surface-dark)'
            }}>
                      <td style={{
                padding: '8px 10px',
                color: 'var(--color-accent)',
                fontFamily: 'monospace',
                fontSize: 12
              }}>{sh.closing_no}</td>
                      <td style={{
                padding: '8px 10px'
              }}>
                        <Badge label={sh.status === 'OPEN' ? t('ui.进行中','进行中') : t('ui.已完成','已完成')} color={sh.status === 'OPEN' ? 'var(--status-success)' : 'var(--text-disabled)'} bg={sh.status === 'OPEN' ? 'var(--status-success-bg)' : 'var(--status-neutral-bg)'} />
                      </td>
                      <td style={{
                padding: '8px 10px',
                color: 'var(--text-disabled)',
                fontSize: 12
              }}>{fmtDate(sh.opened_at)}</td>
                      <td style={{
                padding: '8px 10px',
                color: 'var(--text-disabled)',
                fontSize: 12
              }}>{sh.closed_at ? fmtDate(sh.closed_at) : '—'}</td>
                      <td style={{
                padding: '8px 10px'
              }}>¥{fmt(sh.opening_cash)}</td>
                      <td style={{
                padding: '8px 10px'
              }}>{sh.closing_cash != null ? `¥${fmt(sh.closing_cash)}` : '—'}</td>
                      <td style={{
                padding: '8px 10px',
                color: sh.difference_amount != null && Number(sh.difference_amount) < 0 ? 'var(--status-danger)' : 'var(--status-success)'
              }}>
                        {sh.difference_amount != null ? `¥${fmt(sh.difference_amount)}` : '—'}
                      </td>
                      <td style={{
                padding: '8px 10px',
                color: 'var(--status-success)',
                fontWeight: 600
              }}>{sh.total_sales != null ? `¥${fmt(sh.total_sales)}` : '—'}</td>
                      <td style={{
                padding: '8px 10px'
              }}>{sh.cash_sales != null ? `¥${fmt(sh.cash_sales)}` : '—'}</td>
                      <td style={{
                padding: '8px 10px',
                color: 'var(--border)'
              }}>{sh.sale_count ?? '—'}</td>
                    </tr>)}
                  {shiftHistory.length === 0 && <tr><td colSpan={10} style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}>{t('ui.暂无班次记录','暂无班次记录')}</td></tr>}
                </tbody>
              </table>

              {shiftTotal > 15 && <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginTop: 16
        }}>
                  <button disabled={shiftPage <= 1} onClick={() => loadShiftHistory(shiftPage - 1)} style={{
            padding: '5px 12px',
            borderRadius: 5,
            border: '1px solid var(--border-dark)',
            background: 'transparent',
            color: 'var(--text-disabled)',
            cursor: shiftPage > 1 ? 'pointer' : 'not-allowed',
            fontSize: 13
          }}>{t('ui.上一页','上一页')}</button>
                  <span style={{
            lineHeight: '32px',
            fontSize: 13,
            color: 'var(--text-secondary)'
          }}>{t('ui.第','第')} {shiftPage} {t('ui.页 · 共','页 · 共')} {shiftTotal} {t('ui.条','条')}</span>
                  <button disabled={shiftPage * 15 >= shiftTotal} onClick={() => loadShiftHistory(shiftPage + 1)} style={{
            padding: '5px 12px',
            borderRadius: 5,
            border: '1px solid var(--border-dark)',
            background: 'transparent',
            color: 'var(--text-disabled)',
            cursor: shiftPage * 15 < shiftTotal ? 'pointer' : 'not-allowed',
            fontSize: 13
          }}>{t('ui.下一页','下一页')}</button>
                </div>}
            </>}
        </div>}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: 开班
       ══════════════════════════════════════════════════════════════════════ */}
      {showShiftModal === 'open' && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--overlay-mask)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
          <div style={{
        background: 'var(--text-primary)',
        borderRadius: 12,
        padding: 28,
        width: 360,
        border: '1px solid var(--border-dark)'
      }}>
            <h3 style={{
          margin: '0 0 20px',
          fontSize: 16,
          fontWeight: 600
        }}>{t('ui.开班','开班')}</h3>
            <label style={{
          fontSize: 13,
          color: 'var(--text-disabled)',
          display: 'block',
          marginBottom: 4
        }}>{t('ui.开班现金（备用金）','开班现金（备用金）')}</label>
            <input type="number" min="0" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="0.00" style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid var(--border-dark)',
          background: 'var(--border-dark-faint)',
          color: 'var(--border)',
          fontSize: 15,
          outline: 'none',
          boxSizing: 'border-box',
          marginBottom: 20
        }} />
            <div style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end'
        }}>
              <button onClick={() => setShowShiftModal(null)} style={{
            padding: '8px 18px',
            borderRadius: 6,
            border: '1px solid var(--border-dark)',
            background: 'transparent',
            color: 'var(--text-disabled)',
            cursor: 'pointer',
            fontSize: 13
          }}>{t('ui.取消','取消')}</button>
              <button onClick={handleOpenShift} style={{
            padding: '8px 18px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--status-success)',
            color: 'var(--text-on-dark)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600
          }}>{t('ui.确认开班','确认开班')}</button>
            </div>
          </div>
        </div>}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: 交班/日结
       ══════════════════════════════════════════════════════════════════════ */}
      {showShiftModal === 'close' && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--overlay-mask)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
          <div style={{
        background: 'var(--text-primary)',
        borderRadius: 12,
        padding: 28,
        width: 400,
        border: '1px solid var(--border-dark)'
      }}>
            <h3 style={{
          margin: '0 0 20px',
          fontSize: 16,
          fontWeight: 600
        }}>{t('ui.交班 / 日结','交班 / 日结')}</h3>

            {summary && <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'var(--surface-dark)',
          border: '1px solid var(--border-dark-faint)',
          marginBottom: 16
        }}>
                <div style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 6
          }}>{t('ui.本班统计（参考）','本班统计（参考）')}</div>
                <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6
          }}>
                  {[[t('ui.总销售额','总销售额'), `¥${fmt(summary.total_sales)}`], [t('ui.现金收款','现金收款'), `¥${fmt(summary.cash_sales)}`], [t('ui.销售单数','销售单数'), `${summary.sale_count} 单`], [t('ui.赊销额','赊销额'), `¥${fmt(summary.credit_sales)}`]].map(([k, v]) => <div key={k} style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13
            }}>
                      <span style={{
                color: 'var(--text-disabled)'
              }}>{k}</span>
                      <span style={{
                color: 'var(--border)'
              }}>{v}</span>
                    </div>)}
                </div>
                {currentShift && <div style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--border-dark-faint)',
            fontSize: 13
          }}>
                    <div style={{
              display: 'flex',
              justifyContent: 'space-between'
            }}>
                      <span style={{
                color: 'var(--text-disabled)'
              }}>{t('ui.系统现金（预计）','系统现金（预计）')}</span>
                      <span style={{
                color: 'var(--status-success)',
                fontWeight: 600
              }}>¥{fmt(Number(currentShift.opening_cash) + Number(summary.cash_sales))}</span>
                    </div>
                  </div>}
              </div>}

            <label style={{
          fontSize: 13,
          color: 'var(--text-disabled)',
          display: 'block',
          marginBottom: 4
        }}>{t('ui.实际清点现金','实际清点现金')}</label>
            <input type="number" min="0" value={closingCash} onChange={e => setClosingCash(e.target.value)} placeholder="0.00" style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid var(--border-dark)',
          background: 'var(--border-dark-faint)',
          color: 'var(--border)',
          fontSize: 15,
          outline: 'none',
          boxSizing: 'border-box',
          marginBottom: 12
        }} />

            <label style={{
          fontSize: 13,
          color: 'var(--text-disabled)',
          display: 'block',
          marginBottom: 4
        }}>{t('ui.备注','备注')}</label>
            <textarea value={shiftRemark} onChange={e => setShiftRemark(e.target.value)} placeholder={t('ui.可选，如有差异请说明原因','可选，如有差异请说明原因')} rows={2} style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid var(--border-dark)',
          background: 'var(--border-dark-faint)',
          color: 'var(--border)',
          fontSize: 13,
          outline: 'none',
          resize: 'vertical',
          boxSizing: 'border-box',
          marginBottom: 20
        }} />

            <div style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end'
        }}>
              <button onClick={() => setShowShiftModal(null)} style={{
            padding: '8px 18px',
            borderRadius: 6,
            border: '1px solid var(--border-dark)',
            background: 'transparent',
            color: 'var(--text-disabled)',
            cursor: 'pointer',
            fontSize: 13
          }}>{t('ui.取消','取消')}</button>
              <button onClick={handleCloseShift} style={{
            padding: '8px 18px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--status-warning)',
            color: 'var(--text-on-dark)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600
          }}>{t('ui.确认交班','确认交班')}</button>
            </div>
          </div>
        </div>}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: 门店设置
       ══════════════════════════════════════════════════════════════════════ */}
      {showStoreSetup && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--overlay-mask)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
          <div style={{
        background: 'var(--text-primary)',
        borderRadius: 12,
        padding: 28,
        width: 400,
        border: '1px solid var(--border-dark)'
      }}>
            <h3 style={{
          margin: '0 0 20px',
          fontSize: 16,
          fontWeight: 600
        }}>{t('ui.门店设置','门店设置')}</h3>
            {/* POS-P0-2:门店从主数据选择(去手填),自动带出所属公司,受 DataScope 过滤 */}
            <div className={u.mb12}>
              <label style={{ fontSize: 13, color: 'var(--text-disabled)', display: 'block', marginBottom: 3 }}>{t('ui.选择门店 *','选择门店 *')}</label>
              <StoreMembershipSelector
                value={setupStoreCode}
                onChange={(v) => setSetupStoreCode(v)}
                onPick={(opt) => {
                  const r = (opt?.raw ?? {}) as { storeCode?: string; storeName?: string; companyCode?: string };
                  setSetupStoreCode(r.storeCode ?? '');
                  setSetupStoreName(r.storeName ?? '');
                  setSetupCompanyCode(r.companyCode ?? '');
                  setSetupCompanyName(r.companyCode ?? '');
                }}
                placeholder={t('ui.搜索并选择门店（自动带出所属公司）','搜索并选择门店（自动带出所属公司）')}
              />
              {setupCompanyCode && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {t('ui.门店：','门店：')}{setupStoreName || setupStoreCode}{t('ui.　·　所属公司：','　·　所属公司：')}{setupCompanyCode}
                </div>
              )}
            </div>
            <div style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          marginTop: 8
        }}>
              <button onClick={() => setShowStoreSetup(false)} style={{
            padding: '8px 18px',
            borderRadius: 6,
            border: '1px solid var(--border-dark)',
            background: 'transparent',
            color: 'var(--text-disabled)',
            cursor: 'pointer',
            fontSize: 13
          }}>{t('ui.取消','取消')}</button>
              <button onClick={handleSaveSetup} style={{
            padding: '8px 18px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--color-accent)',
            color: 'var(--text-on-dark)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600
          }}>{t('ui.保存','保存')}</button>
            </div>
          </div>
        </div>}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: 销售单详情
       ══════════════════════════════════════════════════════════════════════ */}
      {(detailSale || loadingDetail) && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--overlay-mask)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }} onClick={() => { setDetailSale(null); setLoadingDetail(false); }}>
          <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--text-primary)',
        borderRadius: 12,
        padding: 28,
        width: 560,
        maxHeight: '82vh',
        overflowY: 'auto',
        border: '1px solid var(--border-dark)'
      }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('ui.销售单详情','销售单详情')}</h3>
              <button onClick={() => { setDetailSale(null); setLoadingDetail(false); }} style={{
            border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-disabled)'
          }}><X size={18} /></button>
            </div>
            {loadingDetail ? <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 160, color: 'var(--text-secondary)' }}>
              <Loader2 size={22} /> <span style={{ marginLeft: 8 }}>{t('ui.加载中...','加载中...')}</span>
            </div> : detailSale && <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13, marginBottom: 16 }}>
                {([
                  [t('ui.单号','单号'), detailSale.sale_no],
                  [t('ui.类型','类型'), SALE_TYPE_MAP[detailSale.sale_type]?.label ?? detailSale.sale_type],
                  [t('ui.状态','状态'), STATUS_MAP[detailSale.status]?.label ?? detailSale.status],
                  [t('ui.收款','收款'), PAY_STATUS_MAP[detailSale.payment_status]?.label ?? detailSale.payment_status],
                  [t('ui.客户','客户'), detailSale.customer_name || t('ui.散客','散客')],
                  [t('ui.门店','门店'), detailSale.store_name || storeName || storeCode],
                  [t('ui.金额','金额'), `¥${fmt(detailSale.total_amount)}`],
                  [t('ui.已收','已收'), `¥${fmt(detailSale.paid_amount)}`],
                  [t('ui.应收','应收'), `¥${fmt(detailSale.receivable_amount)}`],
                  [t('ui.折扣','折扣'), `¥${fmt(detailSale.discount_amount)}`],
                  [t('ui.收银员','收银员'), detailSale.created_by_name || '—'],
                  [t('ui.时间','时间'), fmtDate(detailSale.created_at)],
                ] as [string, string][]).map(([k, v]) => <div key={k}>
                  <span style={{ color: 'var(--text-secondary)' }}>{k}：</span>
                  <span style={{ color: 'var(--text-on-dark)' }}>{v}</span>
                </div>)}
              </div>
              {detailSale.status === 'VOID' && detailSale.void_reason && <div style={{
            padding: '8px 12px', marginBottom: 14, borderRadius: 6,
            background: 'var(--status-danger-bg)', color: 'var(--status-danger)', fontSize: 13
          }}>{t('ui.作废原因：','作废原因：')}{detailSale.void_reason}</div>}
              <table className={s.table}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-dark-faint)' }}>
                    {[t('ui.商品','商品'), t('ui.规格/等级','规格/等级'), t('ui.数量','数量'), t('ui.单价','单价'), t('ui.小计','小计')].map(h => <th key={h} style={{
                  padding: '6px 8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 12
                }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(detailSale.items ?? []).filter(it => it && it.id != null).map(it => <tr key={it.id} style={{ borderBottom: '1px solid var(--surface-dark)' }}>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>{it.product_name || it.product_code}</td>
                    <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>{[it.grade_code, it.packaging_spec].filter(Boolean).join(' / ') || '—'}</td>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>{fmt(it.qty)}</td>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>¥{fmt(it.unit_price)}</td>
                    <td style={{ padding: '6px 8px', fontSize: 13, color: 'var(--status-success)' }}>¥{fmt(it.amount)}</td>
                  </tr>)}
                  {(!detailSale.items || detailSale.items.filter(it => it && it.id != null).length === 0) && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>{t('ui.无明细','无明细')}</td></tr>}
                </tbody>
              </table>
            </>}
          </div>
        </div>}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: 作废确认
       ══════════════════════════════════════════════════════════════════════ */}
      {voidTarget && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--overlay-mask)',
      zIndex: 1001,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
          <div style={{
        background: 'var(--text-primary)',
        borderRadius: 12,
        padding: 28,
        width: 420,
        border: '1px solid var(--border-dark)'
      }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>{t('ui.作废销售单','作废销售单')}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('ui.即将作废','即将作废')} <span style={{ color: 'var(--color-accent)', fontFamily: 'monospace' }}>{voidTarget.sale_no}</span>{t('ui.，此操作不可撤销。','，此操作不可撤销。')}
            </p>
            <label style={{ fontSize: 13, color: 'var(--text-disabled)', display: 'block', marginBottom: 4 }}>{t('ui.作废原因 *','作废原因 *')}</label>
            <textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} rows={3} placeholder={t('ui.请填写作废原因','请填写作废原因')} style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid var(--border-dark)',
          background: 'var(--surface-dark)',
          color: 'var(--text-on-dark)',
          fontSize: 13,
          resize: 'vertical'
        }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setVoidTarget(null); setVoidReason(''); }} disabled={voiding} style={{
            padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border-dark)',
            background: 'transparent', color: 'var(--text-disabled)', cursor: 'pointer', fontSize: 13
          }}>{t('ui.取消','取消')}</button>
              <button onClick={submitVoid} disabled={voiding} style={{
            padding: '8px 18px', borderRadius: 6, border: 'none',
            background: 'var(--status-danger)', color: 'var(--text-on-dark)',
            cursor: voiding ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
            opacity: voiding ? 0.6 : 1
          }}>{voiding ? t('ui.处理中...','处理中...') : t('ui.确认作废','确认作废')}</button>
            </div>
          </div>
        </div>}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: 退货 / 冲红确认
       ══════════════════════════════════════════════════════════════════════ */}
      {returnTarget && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--overlay-mask)',
      zIndex: 1001,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
          <div style={{
        background: 'var(--text-primary)',
        borderRadius: 12,
        padding: 28,
        width: 440,
        border: '1px solid var(--border-dark)'
      }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>{t('ui.退货 / 冲红','退货 / 冲红')}</h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('ui.即将整单退货','即将整单退货')} <span style={{ color: 'var(--color-accent)', fontFamily: 'monospace' }}>{returnTarget.sale_no}</span>（¥{fmt(returnTarget.total_amount)}）。
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-disabled)' }}>
              {t('ui.将反向：库存入隔离退货批（待复检）、已收现金退款（','将反向：库存入隔离退货批（待复检）、已收现金退款（')}¥{fmt(returnTarget.paid_amount)}{t('ui.）、应收红冲。此操作不可撤销。','）、应收红冲。此操作不可撤销。')}
            </p>
            <label style={{ fontSize: 13, color: 'var(--text-disabled)', display: 'block', marginBottom: 4 }}>{t('ui.退货原因 *','退货原因 *')}</label>
            <textarea value={returnReason} onChange={e => setReturnReason(e.target.value)} rows={3} placeholder={t('ui.请填写退货原因','请填写退货原因')} style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid var(--border-dark)',
          background: 'var(--surface-dark)',
          color: 'var(--text-on-dark)',
          fontSize: 13,
          resize: 'vertical'
        }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setReturnTarget(null); setReturnReason(''); }} disabled={returning} style={{
            padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border-dark)',
            background: 'transparent', color: 'var(--text-disabled)', cursor: 'pointer', fontSize: 13
          }}>{t('ui.取消','取消')}</button>
              <button onClick={submitReturn} disabled={returning} style={{
            padding: '8px 18px', borderRadius: 6, border: 'none',
            background: 'var(--status-warning)', color: 'var(--text-on-dark)',
            cursor: returning ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
            opacity: returning ? 0.6 : 1
          }}>{returning ? t('ui.处理中...','处理中...') : t('ui.确认退货','确认退货')}</button>
            </div>
          </div>
        </div>}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>;
}

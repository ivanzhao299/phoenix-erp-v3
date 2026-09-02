"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Package, Truck, AlertTriangle, Clock, Users, BarChart2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { KpiCardV2, Panel } from "@/components/design-system"; // G153：统一全局卡片/容器(边界感)
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from '@/contexts/LanguageContext';
import { formatBusinessEnum, formatMasterData } from '@/lib/business-display';
import request from "@/lib/api-client";
import { currencySymbol } from "@/lib/currency";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型定义 ─────────────────────────────────────────────────────────────────
interface Summary {
  poCount: number;
  poAmount: number;
  apOpenAmount: number;
  apPaidAmount: number;
  paymentAmount: number;
  shareholderFundAmount: number;
  shareholderFundCount: number;
  shipmentTotalCount: number;
  shipmentInTransitCount: number;
  pendingPrCount: number;
  pendingPoApprovalCount: number;
}
interface AgingRow {
  bucket: string;
  bucketLabel: string;
  order: number;
  count: number;
  balance: number;
  amount: number;
  currencyCode: string;
}
interface ProjectCostRow {
  projectCode: string;
  projectName: string;
  companyCode: string;
  companyName: string;
  currencyCode: string;
  poCount: number;
  poAmount: number;
  paidAmount: number;
  balance: number;
  budgetAmount: number | null;
  budgetCurrency: string | null;
}
interface PaymentTrendRow {
  period: string;
  currencyCode: string;
  paymentCount: number;
  amountOriginal: number;
  amountBase: number;
}
interface ShareholderRow {
  shareholderName: string;
  fundNature: string;
  currencyCode: string;
  recordCount: number;
  totalBase: number;
  totalOriginal: number;
}
interface ShipmentStatusRow {
  status: string;
  statusLabel: string;
  count: number;
  crossBorderCount: number;
}
interface SupplierRow {
  supplierCode: string;
  supplierName: string;
  supplierSnapshotName?: string;
  supplierNameEn?: string;
  supplierNameLo?: string;
  currencyCode: string;
  poCount: number;
  poAmount: number;
  receivedQty: number;
  paidAmount: number;
  openApAmount: number;
}

// ── 格式化工具 ───────────────────────────────────────────────────────────────
function fmt(n: number, dec = 0) {
  if (!n && n !== 0) return "—";
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
}
function fmtCcy(n: number, ccy = "") {
  return `${ccy ? ccy + " " : ""}${fmt(n, 2)}`;
}

// ── KPI 卡片 ─────────────────────────────────────────────────────────────────
// ── 状态颜色 ─────────────────────────────────────────────────────────────────
const AGING_COLOR: Record<string, string> = {
  current: "var(--color-success)",
  overdue_1_30: "var(--color-warning)",
  overdue_31_60: "var(--status-warning)",
  overdue_61_90: "var(--color-danger)",
  overdue_90_plus: "var(--status-danger-dark)"
};
export default function ProcurementDashboardPage() {
  const toast = useToast();
  const { t, lang } = useLanguage();
  const [filter, setFilter] = useState({
    companyCode: "",
    dateFrom: "",
    dateTo: "",
    groupBy: "month"
  });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [aging, setAging] = useState<AgingRow[]>([]);
  const [projectCost, setProjectCost] = useState<ProjectCostRow[]>([]);
  const [payTrend, setPayTrend] = useState<PaymentTrendRow[]>([]);
  const [shareholder, setShareholder] = useState<ShareholderRow[]>([]);
  const [shipment, setShipment] = useState<ShipmentStatusRow[]>([]);
  const [supplier, setSupplier] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(false);
  const buildQs = useCallback(() => {
    const p = new URLSearchParams();
    if (filter.companyCode) p.set("companyCode", filter.companyCode);
    if (filter.dateFrom) p.set("dateFrom", filter.dateFrom);
    if (filter.dateTo) p.set("dateTo", filter.dateTo);
    if (filter.groupBy) p.set("groupBy", filter.groupBy);
    return p.toString();
  }, [filter]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQs();
      const base = `/v2/procurement/dashboard`;
      // 走统一 request()：自动带认证 + 401 静默刷新重试（取代原生 fetch 手动读 token）
      // 非关键 widget 单独容错：某块缺权限(如股东资金需 MENU_PRC2_FUND)或失败时置空，不拖垮整页
      const safe = <T,>(p: Promise<T>, fb: T): Promise<T> => p.catch(() => fb);
      const [s1, s2, s3, s4, s5, s6, s7] = await Promise.all([request<any>(`${base}/summary?${qs}`),
      // 关键：失败则整页提示
      // G127：非关键 widget 统一 {silent:true}——缺权限(如股东资金需 MENU_PRC2_FUND)时 safe() 已置空容错，
      //   不应再弹全局红 toast（采购专员看板原会因 shareholder-summary 403 弹「MENU_PERMISSION_DENIED」）
      safe(request<any[]>(`${base}/ap-aging?${qs}`, { silent: true }), []), safe(request<any[]>(`${base}/project-cost?${qs}`, { silent: true }), []), safe(request<any[]>(`${base}/payment-trend?${qs}`, { silent: true }), []), safe(request<any[]>(`${base}/shareholder-summary?${qs}`, { silent: true }), []), safe(request<any[]>(`${base}/shipment-status?${qs}`, { silent: true }), []), safe(request<any[]>(`${base}/supplier-performance?${qs}`, { silent: true }), [])]);
      setSummary(s1);
      setAging(Array.isArray(s2) ? s2 : []);
      setProjectCost(Array.isArray(s3) ? s3 : []);
      setPayTrend(Array.isArray(s4) ? s4 : []);
      setShareholder(Array.isArray(s5) ? s5 : []);
      setShipment(Array.isArray(s6) ? s6 : []);
      setSupplier(Array.isArray(s7) ? s7 : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('prc2.toast_load_failed', '数据加载失败'));
    } finally {
      setLoading(false);
    }
  }, [buildQs, toast]);
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div style={{
    display: "flex",
    flexDirection: "column",
    gap: 20
  }}>
      <PageHeader title={t('prc2.dashboard_title', '采购看板')} />

      {/* Filter Bar */}
      <div className={s.filterBar}>
        <input className={s.filterInput} placeholder={t('prc2.company_code', '公司代码')} value={filter.companyCode} onChange={e => setFilter(f => ({
        ...f,
        companyCode: e.target.value
      }))} style={{
        width: 140
      }} />
        <input type="date" className={s.filterInput} value={filter.dateFrom} onChange={e => setFilter(f => ({
        ...f,
        dateFrom: e.target.value
      }))} style={{
        width: 150
      }} />
        <span style={{
        color: "var(--color-text-3)",
        fontSize: 13
      }}>{t('prc2.date_to', '至')}</span>
        <input type="date" className={s.filterInput} value={filter.dateTo} onChange={e => setFilter(f => ({
        ...f,
        dateTo: e.target.value
      }))} style={{
        width: 150
      }} />
        <select className={s.filterSelect} value={filter.groupBy} onChange={e => setFilter(f => ({
        ...f,
        groupBy: e.target.value
      }))}>
          <option value="month">{t('prc2.group_by_month', '按月')}</option>
          <option value="day">{t('prc2.group_by_day', '按日')}</option>
        </select>
        <button className={s.btnPrimary} onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? s.spinning : undefined} />
          {t('prc2.refresh', '刷新')}
        </button>
      </div>

      {/* ── KPI Cards ── */}
      {summary && <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
      gap: 14
    }}>
          <KpiCardV2 title={t('prc2.kpi_po_count', '采购订单数')} value={fmt(summary.poCount)} subValue={`${t('prc2.contract_amount', '合同金额')} ${fmt(summary.poAmount, 2)}`} icon={Package} accentColor="blue" />
          <KpiCardV2 title={t('prc2.kpi_ap_balance_original', '应付余额（原币合计）')} value={fmt(summary.apOpenAmount, 2)} subValue={t('prc2.ap_pending', '待付账款')} icon={AlertTriangle} accentColor="red" />
          <KpiCardV2 title={t('prc2.kpi_paid_amount_base', '已付金额（本位币）')} value={fmt(summary.paymentAmount, 2)} subValue={t('prc2.payment_total', '付款合计')} icon={DollarSign} accentColor="green" />
          <KpiCardV2 title={t('prc2.kpi_shareholder_fund', '股东资金')} value={fmt(summary.shareholderFundAmount, 2)} subValue={`${t('prc2.total_label', '共')} ${summary.shareholderFundCount} ${t('prc2.records_unit', '笔')}`} icon={Users} accentColor="violet" />
          <KpiCardV2 title={t('prc2.kpi_in_transit', '在途运单')} value={fmt(summary.shipmentInTransitCount)} subValue={`${t('prc2.shipment_total', '运单总数')} ${summary.shipmentTotalCount}`} icon={Truck} accentColor="amber" />
          <KpiCardV2 title={t('prc2.kpi_pending_approval', '待审批')} value={fmt(summary.pendingPoApprovalCount)} subValue={`${t('prc2.pending_pr', '待审采购申请')} ${summary.pendingPrCount}`} icon={Clock} accentColor="cyan" />
        </div>}

      {/* ── Row: AP Aging + Shipment Status ── */}
      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16
    }}>
        {/* AP 账龄 */}
        <Panel title={t('prc2.ap_aging_dist', '应付账龄分布')} icon={<TrendingDown size={15} color="var(--color-danger)" />}>
          {aging.length === 0 ? <div style={{
          textAlign: "center",
          color: "var(--color-text-3)",
          padding: 24
        }}>{t('prc2.empty_no_data', '暂无数据')}</div> : <table className={s.table}>
              <thead><tr>
                <th>{t('prc2.aging_bucket', '账龄区间')}</th><th className={u.tar}>{t('prc2.count', '笔数')}</th>
                <th className={u.tar}>{t('prc2.balance', '余额')}</th><th>{t('prc2.currency', '货币')}</th>
              </tr></thead>
              <tbody>
                {aging.map((r, i) => <tr key={i}>
                    <td>
                      <span style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: AGING_COLOR[r.bucket] ?? "var(--hex-999)",
                  marginRight: 6
                }} />
                      {r.bucketLabel}
                    </td>
                    <td className={u.tar}>{fmt(r.count)}</td>
                    <td style={{
                textAlign: "right",
                color: r.bucket !== "current" ? "var(--color-danger)" : undefined
              }}>{fmt(r.balance, 2)}</td>
                    <td>{r.currencyCode}</td>
                  </tr>)}
              </tbody>
            </table>}
        </Panel>

        {/* 运单状态 */}
        <Panel title={t('prc2.shipment_status_dist', '运单状态分布')} icon={<Truck size={15} color="var(--status-warning)" />}>
          {shipment.length === 0 ? <div style={{
          textAlign: "center",
          color: "var(--color-text-3)",
          padding: 24
        }}>{t('prc2.empty_no_data', '暂无数据')}</div> : <table className={s.table}>
              <thead><tr>
                <th>{t('prc2.status', '状态')}</th><th className={u.tar}>{t('prc2.quantity', '数量')}</th><th className={u.tar}>{t('prc2.cross_border', '跨境')}</th>
              </tr></thead>
              <tbody>
                {shipment.map((r, i) => <tr key={i}>
                    <td>{formatBusinessEnum('procurementShipmentStatus', r.status, lang)}</td>
                    <td className={u.tar}>{fmt(r.count)}</td>
                    <td className={u.tar}>{r.crossBorderCount > 0 ? fmt(r.crossBorderCount) : "—"}</td>
                  </tr>)}
              </tbody>
            </table>}
        </Panel>
      </div>

      {/* ── 付款趋势 ── */}
      <Panel title={t('prc2.payment_trend', '付款趋势')} icon={<TrendingUp size={15} color="var(--color-primary)" />}>
        {payTrend.length === 0 ? <div style={{
        textAlign: "center",
        color: "var(--color-text-3)",
        padding: 24
      }}>{t('prc2.empty_no_data', '暂无数据')}</div> : <div className={u.scrollX}>
            <table className={s.table}>
              <thead><tr>
                <th>{t('prc2.period', '期间')}</th><th>{t('prc2.currency', '货币')}</th>
                <th className={u.tar}>{t('prc2.count', '笔数')}</th>
                <th className={u.tar}>{t('prc2.amount_original', '原币金额')}</th>
                <th className={u.tar}>{t('prc2.amount_base', '折合本位币')}</th>
              </tr></thead>
              <tbody>
                {payTrend.map((r, i) => <tr key={i}>
                    <td>{r.period}</td>
                    <td>{r.currencyCode}</td>
                    <td className={u.tar}>{fmt(r.paymentCount)}</td>
                    <td className={u.tar}>{fmt(r.amountOriginal, 2)}</td>
                    <td className={u.tar}>{fmt(r.amountBase, 2)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>}
      </Panel>

      {/* ── 项目成本 ── */}
      <Panel title={t('prc2.project_cost', '项目成本归集')} icon={<BarChart2 size={15} color="var(--color-primary)" />}>
        {projectCost.length === 0 ? <div style={{
        textAlign: "center",
        color: "var(--color-text-3)",
        padding: 24
      }}>{t('prc2.empty_no_data', '暂无数据')}</div> : <div className={u.scrollX}>
            <table className={s.table}>
              <thead><tr>
                <th>{t('prc2.project', '项目')}</th><th>{t('prc2.company', '公司')}</th><th>{t('prc2.currency', '货币')}</th>
                <th className={u.tar}>{t('prc2.kpi_po_count', '采购订单数')}</th>
                <th className={u.tar}>{t('prc2.contract_amount', '合同金额')}</th>
                <th className={u.tar}>{t('prc2.budget', '预算')}</th>
                <th className={u.tar}>{t('prc2.budget_used', '预算占用')}</th>
                <th className={u.tar}>{t('prc2.paid', '已付')}</th>
                <th className={u.tar}>{t('prc2.balance', '余额')}</th>
              </tr></thead>
              <tbody>
                {projectCost.map((r, i) => {
              const hasBudget = r.budgetAmount != null && r.budgetAmount > 0;
              const usedPct = hasBudget ? r.poAmount / r.budgetAmount! * 100 : null;
              return <tr key={i}>
                    <td>
                      <div className={u.fw500}>{r.projectName}</div>
                      <div style={{
                  fontSize: 11,
                  color: "var(--color-text-3)"
                }}>{r.projectCode}</div>
                    </td>
                    <td>{r.companyCode || "—"}</td>
                    <td>{r.currencyCode}</td>
                    <td className={u.tar}>{fmt(r.poCount)}</td>
                    <td className={u.tar}>{fmt(r.poAmount, 2)}</td>
                    <td className={u.tar}>{hasBudget ? `${currencySymbol(r.budgetCurrency)}${fmt(r.budgetAmount!, 2)}` : "—"}</td>
                    <td style={{
                textAlign: "right",
                color: usedPct == null ? undefined : usedPct >= 100 ? "var(--status-danger)" : usedPct >= 80 ? "var(--status-warning)" : undefined,
                fontWeight: usedPct != null && usedPct >= 80 ? 600 : undefined
              }}>{usedPct == null ? "—" : `${fmt(usedPct, 1)}%`}</td>
                    <td style={{
                textAlign: "right",
                color: "var(--color-success)"
              }}>{fmt(r.paidAmount, 2)}</td>
                    <td style={{
                textAlign: "right",
                color: r.balance > 0 ? "var(--color-warning)" : undefined
              }}>{fmt(r.balance, 2)}</td>
                  </tr>;
            })}
              </tbody>
            </table>
          </div>}
      </Panel>

      {/* ── Row: 股东资金 + 供应商绩效 ── */}
      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16
    }}>
        {/* 股东资金汇总 */}
        <Panel title={t('prc2.shareholder_fund_summary', '股东资金汇总')} icon={<Users size={15} color="var(--color-purple-500)" />}>
          {shareholder.length === 0 ? <div style={{
          textAlign: "center",
          color: "var(--color-text-3)",
          padding: 24
        }}>{t('prc2.empty_no_data', '暂无数据')}</div> : <table className={s.table}>
              <thead><tr>
                <th>{t('prc2.shareholder', '股东')}</th><th>{t('prc2.type', '类型')}</th><th>{t('prc2.currency', '货币')}</th>
                <th className={u.tar}>{t('prc2.amount_base', '折合本位币')}</th>
              </tr></thead>
              <tbody>
                {shareholder.map((r, i) => <tr key={i}>
                    <td>{r.shareholderName}</td>
                    <td>{r.fundNature || "—"}</td>
                    <td>{r.currencyCode}</td>
                    <td className={u.tar}>{fmt(r.totalBase, 2)}</td>
                  </tr>)}
              </tbody>
            </table>}
        </Panel>

        {/* 供应商绩效 */}
        <Panel title={t('prc2.supplier_perf_top20', '供应商绩效 TOP 20')} icon={<BarChart2 size={15} color="var(--color-primary)" />}>
          {supplier.length === 0 ? <div style={{
          textAlign: "center",
          color: "var(--color-text-3)",
          padding: 24
        }}>{t('prc2.empty_no_data', '暂无数据')}</div> : <div className={u.scrollX}>
              <table className={s.table}>
                <thead><tr>
                  <th>{t('prc2.supplier', '供应商')}</th><th className={u.tar}>{t('prc2.kpi_po_count', '采购订单数')}</th>
                  <th className={u.tar}>{t('prc2.contract_amount_short', '合同额')}</th>
                  <th className={u.tar}>{t('prc2.pending_ap', '待付AP')}</th>
                </tr></thead>
                <tbody>
                  {supplier.map((r, i) => <tr key={i}>
                      <td>
                        <div className={u.fw500}>{formatMasterData(r, 'supplierName', r.supplierCode, lang)}</div>
                        <div style={{
                    fontSize: 11,
                    color: "var(--color-text-3)"
                  }}>{r.currencyCode}</div>
                      </td>
                      <td className={u.tar}>{fmt(r.poCount)}</td>
                      <td className={u.tar}>{fmt(r.poAmount, 2)}</td>
                      <td style={{
                  textAlign: "right",
                  color: r.openApAmount > 0 ? "var(--color-warning)" : undefined
                }}>{fmt(r.openApAmount, 2)}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>}
        </Panel>
      </div>
    </div>;
}

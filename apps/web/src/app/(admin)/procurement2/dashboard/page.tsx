"use client";
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, TrendingUp, TrendingDown, DollarSign,
  Package, Truck, AlertTriangle, Clock, Users, BarChart2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import request from "@/lib/api-client";
import s from "@/components/ui/admin-ui.module.css";


// ── 类型定义 ─────────────────────────────────────────────────────────────────
interface Summary {
  poCount: number; poAmount: number;
  apOpenAmount: number; apPaidAmount: number;
  paymentAmount: number;
  shareholderFundAmount: number; shareholderFundCount: number;
  shipmentTotalCount: number; shipmentInTransitCount: number;
  pendingPrCount: number; pendingPoApprovalCount: number;
}
interface AgingRow {
  bucket: string; bucketLabel: string; order: number;
  count: number; balance: number; amount: number; currencyCode: string;
}
interface ProjectCostRow {
  projectCode: string; projectName: string; companyCode: string; companyName: string;
  currencyCode: string; poCount: number; poAmount: number; paidAmount: number; balance: number;
}
interface PaymentTrendRow {
  period: string; currencyCode: string; paymentCount: number;
  amountOriginal: number; amountBase: number;
}
interface ShareholderRow {
  shareholderName: string; fundNature: string; currencyCode: string;
  recordCount: number; totalBase: number; totalOriginal: number;
}
interface ShipmentStatusRow {
  status: string; statusLabel: string; count: number; crossBorderCount: number;
}
interface SupplierRow {
  supplierCode: string; supplierName: string; currencyCode: string;
  poCount: number; poAmount: number; receivedQty: number; paidAmount: number; openApAmount: number;
}

// ── 格式化工具 ───────────────────────────────────────────────────────────────
function fmt(n: number, dec = 0) {
  if (!n && n !== 0) return "—";
  return n.toLocaleString("zh-CN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtCcy(n: number, ccy = "") {
  return `${ccy ? ccy + " " : ""}${fmt(n, 2)}`;
}

// ── KPI 卡片 ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, Icon, color = "var(--color-primary)",
}: { label: string; value: string; sub?: string; Icon: React.ElementType; color?: string }) {
  return (
    <div className={s.card} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 22px", minWidth: 180, minHeight: 112, boxSizing: "border-box" }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={22} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--color-text-3)", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-1)", lineHeight: 1.2, wordBreak: "break-all" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── 状态颜色 ─────────────────────────────────────────────────────────────────
const AGING_COLOR: Record<string, string> = {
  current:        "var(--color-success)",
  overdue_1_30:   "var(--color-warning)",
  overdue_31_60:  "#f97316",
  overdue_61_90:  "var(--color-danger)",
  overdue_90_plus:"#991b1b",
};

export default function ProcurementDashboardPage() {
  const toast = useToast();

  const [filter, setFilter] = useState({ companyCode: "", dateFrom: "", dateTo: "", groupBy: "month" });
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [aging,      setAging]      = useState<AgingRow[]>([]);
  const [projectCost,setProjectCost]= useState<ProjectCostRow[]>([]);
  const [payTrend,   setPayTrend]   = useState<PaymentTrendRow[]>([]);
  const [shareholder,setShareholder]= useState<ShareholderRow[]>([]);
  const [shipment,   setShipment]   = useState<ShipmentStatusRow[]>([]);
  const [supplier,   setSupplier]   = useState<SupplierRow[]>([]);
  const [loading,    setLoading]    = useState(false);

  const buildQs = useCallback(() => {
    const p = new URLSearchParams();
    if (filter.companyCode) p.set("companyCode", filter.companyCode);
    if (filter.dateFrom)    p.set("dateFrom",    filter.dateFrom);
    if (filter.dateTo)      p.set("dateTo",      filter.dateTo);
    if (filter.groupBy)     p.set("groupBy",     filter.groupBy);
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

      const [s1, s2, s3, s4, s5, s6, s7] = await Promise.all([
        request<any>(`${base}/summary?${qs}`),                          // 关键：失败则整页提示
        safe(request<any[]>(`${base}/ap-aging?${qs}`), []),
        safe(request<any[]>(`${base}/project-cost?${qs}`), []),
        safe(request<any[]>(`${base}/payment-trend?${qs}`), []),
        safe(request<any[]>(`${base}/shareholder-summary?${qs}`), []),
        safe(request<any[]>(`${base}/shipment-status?${qs}`), []),
        safe(request<any[]>(`${base}/supplier-performance?${qs}`), []),
      ]);

      setSummary(s1);
      setAging(Array.isArray(s2) ? s2 : []);
      setProjectCost(Array.isArray(s3) ? s3 : []);
      setPayTrend(Array.isArray(s4) ? s4 : []);
      setShareholder(Array.isArray(s5) ? s5 : []);
      setShipment(Array.isArray(s6) ? s6 : []);
      setSupplier(Array.isArray(s7) ? s7 : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [buildQs, toast]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader title="采购看板" />

      {/* Filter Bar */}
      <div className={s.filterBar}>
        <input className={s.filterInput} placeholder="公司代码" value={filter.companyCode}
          onChange={e => setFilter(f => ({ ...f, companyCode: e.target.value }))} style={{ width: 140 }} />
        <input type="date" className={s.filterInput} value={filter.dateFrom}
          onChange={e => setFilter(f => ({ ...f, dateFrom: e.target.value }))} style={{ width: 150 }} />
        <span style={{ color: "var(--color-text-3)", fontSize: 13 }}>至</span>
        <input type="date" className={s.filterInput} value={filter.dateTo}
          onChange={e => setFilter(f => ({ ...f, dateTo: e.target.value }))} style={{ width: 150 }} />
        <select className={s.filterSelect} value={filter.groupBy}
          onChange={e => setFilter(f => ({ ...f, groupBy: e.target.value }))}>
          <option value="month">按月</option>
          <option value="day">按日</option>
        </select>
        <button className={s.btnPrimary} onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? s.spinning : undefined} />
          刷新
        </button>
      </div>

      {/* ── KPI Cards ── */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
          <KpiCard label="采购订单数" value={fmt(summary.poCount)} sub={`合同金额 ${fmt(summary.poAmount, 2)}`} Icon={Package} color="var(--color-primary)" />
          <KpiCard label="应付余额 (CNY)" value={fmt(summary.apOpenAmount, 2)} sub="待付账款" Icon={AlertTriangle} color="var(--color-danger)" />
          <KpiCard label="已付金额 (CNY)" value={fmt(summary.paymentAmount, 2)} sub="付款合计" Icon={DollarSign} color="var(--color-success)" />
          <KpiCard label="股东资金" value={fmt(summary.shareholderFundAmount, 2)} sub={`共 ${summary.shareholderFundCount} 笔`} Icon={Users} color="#8b5cf6" />
          <KpiCard label="在途运单" value={fmt(summary.shipmentInTransitCount)} sub={`运单总数 ${summary.shipmentTotalCount}`} Icon={Truck} color="#f97316" />
          <KpiCard label="待审批" value={fmt(summary.pendingPoApprovalCount)} sub={`待审采购申请 ${summary.pendingPrCount}`} Icon={Clock} color="var(--color-warning)" />
        </div>
      )}

      {/* ── Row: AP Aging + Shipment Status ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* AP 账龄 */}
        <div className={s.card} style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingDown size={16} color="var(--color-danger)" /> AP 账龄分布
          </div>
          {aging.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-3)", padding: 24 }}>暂无数据</div>
          ) : (
            <table className={s.table}>
              <thead><tr>
                <th>账龄区间</th><th style={{ textAlign: "right" }}>笔数</th>
                <th style={{ textAlign: "right" }}>余额</th><th>货币</th>
              </tr></thead>
              <tbody>
                {aging.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: AGING_COLOR[r.bucket] ?? "#999", marginRight: 6 }} />
                      {r.bucketLabel}
                    </td>
                    <td style={{ textAlign: "right" }}>{fmt(r.count)}</td>
                    <td style={{ textAlign: "right", color: r.bucket !== "current" ? "var(--color-danger)" : undefined }}>{fmt(r.balance, 2)}</td>
                    <td>{r.currencyCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 运单状态 */}
        <div className={s.card} style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Truck size={16} color="#f97316" /> 运单状态分布
          </div>
          {shipment.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-3)", padding: 24 }}>暂无数据</div>
          ) : (
            <table className={s.table}>
              <thead><tr>
                <th>状态</th><th style={{ textAlign: "right" }}>数量</th><th style={{ textAlign: "right" }}>跨境</th>
              </tr></thead>
              <tbody>
                {shipment.map((r, i) => (
                  <tr key={i}>
                    <td>{r.statusLabel}</td>
                    <td style={{ textAlign: "right" }}>{fmt(r.count)}</td>
                    <td style={{ textAlign: "right" }}>{r.crossBorderCount > 0 ? fmt(r.crossBorderCount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── 付款趋势 ── */}
      <div className={s.card} style={{ padding: "18px 20px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={16} color="var(--color-primary)" /> 付款趋势
        </div>
        {payTrend.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--color-text-3)", padding: 24 }}>暂无数据</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={s.table}>
              <thead><tr>
                <th>期间</th><th>货币</th>
                <th style={{ textAlign: "right" }}>笔数</th>
                <th style={{ textAlign: "right" }}>原币金额</th>
                <th style={{ textAlign: "right" }}>折合本位币</th>
              </tr></thead>
              <tbody>
                {payTrend.map((r, i) => (
                  <tr key={i}>
                    <td>{r.period}</td>
                    <td>{r.currencyCode}</td>
                    <td style={{ textAlign: "right" }}>{fmt(r.paymentCount)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(r.amountOriginal, 2)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(r.amountBase, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 项目成本 ── */}
      <div className={s.card} style={{ padding: "18px 20px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart2 size={16} color="var(--color-primary)" /> 项目成本归集
        </div>
        {projectCost.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--color-text-3)", padding: 24 }}>暂无数据</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={s.table}>
              <thead><tr>
                <th>项目</th><th>公司</th><th>货币</th>
                <th style={{ textAlign: "right" }}>采购订单数</th>
                <th style={{ textAlign: "right" }}>合同金额</th>
                <th style={{ textAlign: "right" }}>已付</th>
                <th style={{ textAlign: "right" }}>余额</th>
              </tr></thead>
              <tbody>
                {projectCost.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.projectName}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-3)" }}>{r.projectCode}</div>
                    </td>
                    <td>{r.companyCode || "—"}</td>
                    <td>{r.currencyCode}</td>
                    <td style={{ textAlign: "right" }}>{fmt(r.poCount)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(r.poAmount, 2)}</td>
                    <td style={{ textAlign: "right", color: "var(--color-success)" }}>{fmt(r.paidAmount, 2)}</td>
                    <td style={{ textAlign: "right", color: r.balance > 0 ? "var(--color-warning)" : undefined }}>{fmt(r.balance, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Row: 股东资金 + 供应商绩效 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 股东资金汇总 */}
        <div className={s.card} style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={16} color="#8b5cf6" /> 股东资金汇总
          </div>
          {shareholder.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-3)", padding: 24 }}>暂无数据</div>
          ) : (
            <table className={s.table}>
              <thead><tr>
                <th>股东</th><th>类型</th><th>货币</th>
                <th style={{ textAlign: "right" }}>折合本位币</th>
              </tr></thead>
              <tbody>
                {shareholder.map((r, i) => (
                  <tr key={i}>
                    <td>{r.shareholderName}</td>
                    <td>{r.fundNature || "—"}</td>
                    <td>{r.currencyCode}</td>
                    <td style={{ textAlign: "right" }}>{fmt(r.totalBase, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 供应商绩效 */}
        <div className={s.card} style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart2 size={16} color="var(--color-primary)" /> 供应商绩效 TOP 20
          </div>
          {supplier.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-3)", padding: 24 }}>暂无数据</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className={s.table}>
                <thead><tr>
                  <th>供应商</th><th style={{ textAlign: "right" }}>采购订单数</th>
                  <th style={{ textAlign: "right" }}>合同额</th>
                  <th style={{ textAlign: "right" }}>待付AP</th>
                </tr></thead>
                <tbody>
                  {supplier.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{r.supplierName || r.supplierCode}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-3)" }}>{r.currencyCode}</div>
                      </td>
                      <td style={{ textAlign: "right" }}>{fmt(r.poCount)}</td>
                      <td style={{ textAlign: "right" }}>{fmt(r.poAmount, 2)}</td>
                      <td style={{ textAlign: "right", color: r.openApAmount > 0 ? "var(--color-warning)" : undefined }}>{fmt(r.openApAmount, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

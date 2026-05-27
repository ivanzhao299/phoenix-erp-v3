"use client";
import { useState, useEffect, useCallback } from "react";
import {
  BarChart2, TrendingUp, Package, Truck, RefreshCw,
  Archive, Shield, AlertTriangle, Users, Tag,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";

// ── API helper ────────────────────────────────────────────────────────────────
function tok() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}
const BASE = process.env.NEXT_PUBLIC_API_BASE || "";
async function apiFetch<T = unknown>(path: string): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).message || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return (d.data ?? d) as T;
}

function fmt(n: number | null | undefined, dec = 0): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("zh-CN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── 共用样式 ──────────────────────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 12,
  color: "#374151", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", background: "#f9fafb",
};
const TD: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "#374151" };

function KpiCard({ label, value, sub, color = "#374151" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
      padding: "16px 20px", minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#111827",
        borderLeft: "3px solid #2563eb", paddingLeft: 10 }}>{title}</h4>
      {children}
    </div>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>{cols.map(c => <th key={c} style={TH}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} style={{ ...TD, textAlign: "center", color: "#9ca3af", padding: 24 }}>暂无数据</td></tr>
          )}
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
              {row.map((cell, j) => <td key={j} style={TD}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 1: 总览
// ══════════════════════════════════════════════════════════════════════════════
function OverviewTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await apiFetch("/api/v2/sales/analytics/overview")); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error)   return <Err msg={error} onRetry={load} />;
  if (!data)   return null;

  return (
    <div>
      <Section title="核心 KPI">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <KpiCard label="销售订单总数"   value={fmt(data.totalSalesOrders)}    color="#2563eb" />
          <KpiCard label="销售总金额"     value={fmt(data.totalSalesAmount)}     color="#2563eb" />
          <KpiCard label="已交付订单"     value={fmt(data.totalDelivered)}       color="#16a34a" />
          <KpiCard label="应收款总额"     value={fmt(data.totalReceivable)}      color="#d97706" />
          <KpiCard label="逾期应收"       value={fmt(data.overdueReceivable)}    color="#dc2626" />
          <KpiCard label="退货总笔数"     value={fmt(data.totalReturns)}         color="#9333ea" />
          <KpiCard label="库存可用量（枚）" value={fmt(data.inventoryBalance)}    color="#0891b2" />
          <KpiCard label="临期库存（批）"  value={fmt(data.inventoryExpiring)}   color="#d97706" />
          <KpiCard label="平均配送时长"   value={`${fmt(data.averageDeliveryHours, 1)}h`} color="#374151" />
          <KpiCard label="准时配送率"     value={`${fmt(data.onTimeDeliveryRate, 1)}%`} color="#16a34a" />
          <KpiCard label="退货率"         value={`${fmt(data.returnRate, 2)}%`}  color="#9333ea" />
          <KpiCard label="今日损耗（枚）"  value={fmt(data.totalLoss)}           color="#be123c" />
        </div>
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Section title="按公司销量 TOP 10">
          <Table
            cols={["公司代码", "订单数", "销售金额"]}
            rows={(data.byCompany ?? []).map((r: any) => [
              r.company_code, fmt(r.order_count), fmt(r.sales_amount),
            ])}
          />
        </Section>
        <Section title="按渠道销量 TOP 10">
          <Table
            cols={["渠道代码", "订单数", "销售金额"]}
            rows={(data.byChannel ?? []).map((r: any) => [
              r.channel_code, fmt(r.order_count), fmt(r.sales_amount),
            ])}
          />
        </Section>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 2: 销量分析
// ══════════════════════════════════════════════════════════════════════════════
function SalesTab() {
  const [trend, setTrend]       = useState<any[]>([]);
  const [topCust, setTopCust]   = useState<any[]>([]);
  const [topProd, setTopProd]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [groupBy, setGroupBy]   = useState<"day"|"week"|"month">("day");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [t, c, p] = await Promise.all([
        apiFetch<any[]>(`/api/v2/sales/analytics/sales-trend?dateFrom=${dateFrom}&dateTo=${dateTo}&groupBy=${groupBy}`),
        apiFetch<any[]>("/api/v2/sales/analytics/top-customers"),
        apiFetch<any[]>("/api/v2/sales/analytics/top-products"),
      ]);
      setTrend(t); setTopCust(c); setTopProd(p);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, groupBy]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error)   return <Err msg={error} onRetry={load} />;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputSt} />
        <span style={{ fontSize: 13, color: "#6b7280" }}>至</span>
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={inputSt} />
        <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)} style={inputSt}>
          <option value="day">按天</option>
          <option value="week">按周</option>
          <option value="month">按月</option>
        </select>
        <button onClick={load} style={btnSt("#2563eb")}>查询</button>
      </div>

      <Section title="销售趋势">
        <Table
          cols={["期间", "订单数", "销售金额", "已交付"]}
          rows={trend.map((r: any) => [
            String(r.period ?? "").slice(0, 10),
            fmt(r.order_count),
            fmt(r.sales_amount),
            fmt(r.delivered_count),
          ])}
        />
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Section title="TOP 20 客户">
          <Table
            cols={["客户代码", "客户名称", "订单数", "销售额", "逾期应收"]}
            rows={topCust.map((r: any) => [
              r.customerCode, r.customerName,
              fmt(r.totalOrders), fmt(r.totalSales),
              <span key="od" style={{ color: r.overdueReceivable > 0 ? "#dc2626" : "#374151" }}>
                {fmt(r.overdueReceivable)}
              </span>,
            ])}
          />
        </Section>
        <Section title="TOP 20 产品">
          <Table
            cols={["产品代码", "产品名称", "销售量", "销售额", "退货量"]}
            rows={topProd.map((r: any) => [
              r.productCode, r.productName ?? "—",
              fmt(r.totalQty), fmt(r.totalAmount),
              <span key="rt" style={{ color: r.returnQty > 0 ? "#9333ea" : "#374151" }}>
                {fmt(r.returnQty)}
              </span>,
            ])}
          />
        </Section>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 3: 渠道分析
// ══════════════════════════════════════════════════════════════════════════════
function ChannelTab() {
  const [data, setData] = useState<any[]>([]);
  const load = useCallback(async () => {
    try { setData(await apiFetch("/api/v2/sales/analytics/channel-analysis")); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Section title="渠道销售分布">
        <Table
          cols={["渠道代码", "客户数", "订单数", "销售金额", "已交付", "退货数", "退货率%", "逾期应收"]}
          rows={data.map(r => [
            r.channelCode ?? "直营",
            fmt(r.customerCount),
            fmt(r.orderCount),
            fmt(r.salesAmount),
            fmt(r.deliveredCount),
            fmt(r.returnCount),
            <span key="rate" style={{ color: r.returnRate > 5 ? "#dc2626" : "#374151" }}>
              {fmt(r.returnRate, 2)}%
            </span>,
            <span key="od" style={{ color: r.overdueReceivable > 0 ? "#dc2626" : "#374151" }}>
              {fmt(r.overdueReceivable)}
            </span>,
          ])}
        />
      </Section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 4: 价格异常
// ══════════════════════════════════════════════════════════════════════════════
function PriceTab() {
  const [data, setData]         = useState<any[]>([]);
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await apiFetch<any[]>(`/api/v2/sales/analytics/price-anomalies?threshold=${threshold}`)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [threshold]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <label style={{ fontSize: 13 }}>
          偏离阈值（%）：
          <select value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ ...inputSt, marginLeft: 6 }}>
            {[1, 2, 5, 10, 15, 20].map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </label>
        <button onClick={load} style={btnSt("#d97706")}>查询</button>
      </div>
      {error && <div style={{ color: "#dc2626", marginBottom: 8 }}>{error}</div>}
      {loading ? <Spinner /> : (
        <Section title={`价格异常订单（偏离 ≥ ${threshold}% 或低于底价）`}>
          <Table
            cols={["订单号","客户","产品","实际价","标准价","底价","偏离%","日期"]}
            rows={data.map(r => [
              r.sales_order_no,
              r.customer_name ?? r.customer_code,
              r.product_code,
              fmt(r.actual_unit_price),
              fmt(r.resolved_unit_price),
              <span key="fp" style={{ color: r.below_floor_price ? "#dc2626" : "#374151" }}>
                {r.floor_price ? fmt(r.floor_price) : "—"}
                {r.below_floor_price && " ⚠"}
              </span>,
              <span key="dr" style={{ color: Math.abs(r.diff_rate) >= threshold ? "#dc2626" : "#374151", fontWeight: 700 }}>
                {r.diff_rate > 0 ? "+" : ""}{fmt(r.diff_rate, 2)}%
              </span>,
              String(r.created_at ?? "").slice(0, 10),
            ])}
          />
        </Section>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 5: 配送分析
// ══════════════════════════════════════════════════════════════════════════════
function DeliveryTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await apiFetch("/api/v2/sales/analytics/delivery-performance")); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error)   return <Err msg={error} onRetry={load} />;
  if (!data)   return null;

  return (
    <div>
      <Section title="配送 KPI">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <KpiCard label="总配送单"      value={fmt(data.totalDeliveries)} />
          <KpiCard label="已完成"        value={fmt(data.completedCount)}  color="#16a34a" />
          <KpiCard label="平均配送时长"  value={`${fmt(data.averageDeliveryHours, 1)}h`} color="#2563eb" />
          <KpiCard label="准时率"        value={`${fmt(data.onTimeRate, 1)}%`} color="#16a34a" />
          <KpiCard label="超时单数"      value={fmt(data.delayedCount)} color="#dc2626" />
          <KpiCard label="平均超时时长"  value={`${fmt(data.avgDelayedHours, 1)}h`} color="#dc2626" />
        </div>
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Section title="司机绩效排名">
          <Table
            cols={["司机名称","司机代码","完成趟次","平均时长(h)"]}
            rows={(data.driverRanking ?? []).map((r: any) => [
              r.driver_name ?? "—", r.driver_code ?? "—",
              fmt(r.completed_trips), fmt(r.avg_hours, 1),
            ])}
          />
        </Section>
        <Section title="车辆使用排名">
          <Table
            cols={["车牌号","完成趟次","平均时长(h)"]}
            rows={(data.vehicleRanking ?? []).map((r: any) => [
              r.vehicle_no, fmt(r.completed_trips), fmt(r.avg_hours, 1),
            ])}
          />
        </Section>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 6: 退货分析
// ══════════════════════════════════════════════════════════════════════════════
function ReturnTab() {
  const [data, setData] = useState<any>(null);
  const load = useCallback(async () => {
    try { setData(await apiFetch("/api/v2/sales/analytics/return-analysis")); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <Spinner />;

  const typeLabel: Record<string, string> = {
    CUSTOMER_RETURN: "客户退货", DELIVERY_REJECT: "配送拒收",
    QUALITY_RETURN: "质量退货", DAMAGE_RETURN: "破损退货",
  };

  return (
    <div>
      <Section title="退货 KPI">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <KpiCard label="已完成退货数"    value={fmt(data.totalReturns)}       color="#9333ea" />
          <KpiCard label="退货总金额"      value={fmt(data.totalReturnAmount)}  color="#9333ea" />
          <KpiCard label="退货率"          value={`${fmt(data.returnRate, 2)}%`} color="#dc2626" />
          <KpiCard label="客户退货"        value={fmt(data.byType?.customerReturn)}  />
          <KpiCard label="配送拒收"        value={fmt(data.byType?.deliveryReject)}  />
          <KpiCard label="质量退货"        value={fmt(data.byType?.qualityReturn)}   />
          <KpiCard label="破损退货"        value={fmt(data.byType?.damageReturn)}    />
        </div>
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <Section title="TOP 退货客户">
          <Table
            cols={["客户","退货次","金额"]}
            rows={(data.topReturnCustomers ?? []).map((r: any) => [
              r.customer_name ?? r.customer_code,
              fmt(r.return_count), fmt(r.return_amount),
            ])}
          />
        </Section>
        <Section title="TOP 退货产品">
          <Table
            cols={["产品","退货量","金额"]}
            rows={(data.topReturnProducts ?? []).map((r: any) => [
              r.product_code, fmt(r.return_qty), fmt(r.return_amount),
            ])}
          />
        </Section>
        <Section title="退货原因分布">
          <Table
            cols={["原因代码","次数"]}
            rows={(data.topReturnReasons ?? []).map((r: any) => [
              r.reason_code, fmt(r.count),
            ])}
          />
        </Section>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 7: 库存分析
// ══════════════════════════════════════════════════════════════════════════════
function InventoryTab() {
  const [turnover, setTurnover] = useState<any>(null);
  const [loss, setLoss]         = useState<any>(null);
  const load = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([
        apiFetch("/api/v2/sales/analytics/inventory-turnover"),
        apiFetch("/api/v2/sales/analytics/loss-analysis"),
      ]);
      setTurnover(t); setLoss(l);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!turnover && !loss) return <Spinner />;

  return (
    <div>
      {turnover && (
        <>
          <Section title="库存周转 KPI">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <KpiCard label="活跃批次数"       value={fmt(turnover.activeBatches)} color="#2563eb" />
              <KpiCard label="总可用库存（枚）"  value={fmt(turnover.totalAvailable)} color="#2563eb" />
              <KpiCard label="临期批次（≤7天）" value={fmt(turnover.expiringBatches)} color="#d97706" sub={`${fmt(turnover.expiringQty)} 枚`} />
              <KpiCard label="已过期批次"        value={fmt(turnover.expiredBatches)} color="#dc2626" sub={`${fmt(turnover.expiredQty)} 枚`} />
              <KpiCard label="退货待检批次"      value={fmt(turnover.returnedBatches)} color="#9333ea" />
              <KpiCard label="平均保质期（天）"  value={fmt(turnover.avgShelfDays, 1)} />
              <KpiCard label="近30天出库量"      value={fmt(turnover.totalOutbound30d)} color="#0891b2" />
              <KpiCard label="库存周转率"        value={`${fmt(turnover.turnoverRate, 1)}%`} color="#16a34a" sub="近30天" />
            </div>
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Section title="按质量等级分布">
              <Table
                cols={["等级","批次数","可用量（枚）"]}
                rows={(turnover.byGrade ?? []).map((r: any) => [
                  r.quality_grade, fmt(r.batch_count), fmt(r.qty_available),
                ])}
              />
            </Section>
            <Section title="按公司分布">
              <Table
                cols={["公司代码","活跃批次","可用量（枚）"]}
                rows={(turnover.byCompany ?? []).map((r: any) => [
                  r.company_code, fmt(r.active_batches), fmt(r.qty_available),
                ])}
              />
            </Section>
          </div>
        </>
      )}

      {loss && (
        <Section title="损耗分析（近30天）">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <KpiCard label="过期核销（枚）" value={fmt(loss.expiredQty)}  color="#dc2626" />
            <KpiCard label="破损核销（枚）" value={fmt(loss.damagedQty)}  color="#d97706" />
            <KpiCard label="手动核销（枚）" value={fmt(loss.writeOffQty)} color="#6b7280" />
            <KpiCard label="损耗总量（枚）" value={fmt(loss.totalLoss)}   color="#be123c" />
            <KpiCard label="综合损耗率"    value={`${fmt(loss.lossRate, 2)}%`} color="#be123c" />
          </div>
          <Table
            cols={["日期","过期损耗（枚）","破损损耗（枚）"]}
            rows={(loss.byDate ?? []).map((r: any) => [
              String(r.period ?? "").slice(0, 10),
              <span key="e" style={{ color: r.expire_loss > 0 ? "#dc2626" : "#374151" }}>{fmt(r.expire_loss)}</span>,
              <span key="d" style={{ color: r.damage_loss > 0 ? "#d97706" : "#374151" }}>{fmt(r.damage_loss)}</span>,
            ])}
          />
        </Section>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 8: 信用风险
// ══════════════════════════════════════════════════════════════════════════════
function CreditRiskTab() {
  const [data, setData] = useState<any>(null);
  const load = useCallback(async () => {
    try { setData(await apiFetch("/api/v2/sales/analytics/credit-risk")); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <Spinner />;

  const { summary, topOverdueCustomers, frozenCustomers } = data;

  return (
    <div>
      <Section title="信用风险 KPI">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <KpiCard label="正常客户"     value={fmt(summary?.normalCount)}    color="#16a34a" />
          <KpiCard label="预警客户"     value={fmt(summary?.warningCount)}   color="#d97706" />
          <KpiCard label="超额度客户"   value={fmt(summary?.overLimitCount)} color="#f97316" />
          <KpiCard label="逾期客户"     value={fmt(summary?.overdueCount)}   color="#dc2626" />
          <KpiCard label="冻结客户"     value={fmt(summary?.frozenCount)}    color="#6b7280" />
          <KpiCard label="自动冻结"     value={fmt(summary?.autoFrozenCount)} color="#6b7280" />
          <KpiCard label="高风险敞口"   value={fmt(summary?.highRiskExposure)} color="#dc2626" />
        </div>
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Section title="TOP 20 逾期欠款客户">
          <Table
            cols={["客户代码","客户名称","逾期金额","逾期发票数","最早逾期日"]}
            rows={(topOverdueCustomers ?? []).map((r: any) => [
              r.customer_code,
              r.customer_name,
              <span key="od" style={{ color: "#dc2626", fontWeight: 700 }}>{fmt(r.overdue_amount)}</span>,
              fmt(r.overdue_invoices),
              String(r.earliest_due_date ?? "").slice(0, 10) || "—",
            ])}
          />
        </Section>

        <Section title="冻结 / 逾期 / 超额度客户">
          <Table
            cols={["客户代码","客户名称","信用状态","已用额度","信用额度","自动冻结"]}
            rows={(frozenCustomers ?? []).map((r: any) => [
              r.customer_code,
              r.customer_name,
              <span key="cs" style={{
                fontWeight: 700,
                color: r.credit_status === "FROZEN" ? "#6b7280"
                     : r.credit_status === "OVERDUE" ? "#dc2626"
                     : "#f97316",
              }}>{r.credit_status}</span>,
              fmt(r.credit_used),
              fmt(r.credit_limit),
              r.auto_frozen ? "✅ 是" : "否",
            ])}
          />
        </Section>
      </div>
    </div>
  );
}

// ── 辅助组件 ──────────────────────────────────────────────────────────────────
function Spinner() {
  return <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>加载中...</div>;
}
function Err({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div style={{ color: "#dc2626", padding: 16 }}>
      {msg}
      <button onClick={onRetry} style={{ marginLeft: 12, fontSize: 12, cursor: "pointer" }}>重试</button>
    </div>
  );
}
const inputSt: React.CSSProperties = {
  padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13,
};
function btnSt(bg: string): React.CSSProperties {
  return { padding: "6px 14px", background: bg, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
}

// ── Tab 定义 ──────────────────────────────────────────────────────────────────
type TabKey = "overview" | "sales" | "channel" | "price" | "delivery" | "return" | "inventory" | "credit";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview",   label: "总览",     icon: <BarChart2   size={13} /> },
  { key: "sales",      label: "销量分析", icon: <TrendingUp  size={13} /> },
  { key: "channel",    label: "渠道分析", icon: <Users       size={13} /> },
  { key: "price",      label: "价格异常", icon: <Tag         size={13} /> },
  { key: "delivery",   label: "配送分析", icon: <Truck       size={13} /> },
  { key: "return",     label: "退货分析", icon: <RefreshCw   size={13} /> },
  { key: "inventory",  label: "库存分析", icon: <Archive     size={13} /> },
  { key: "credit",     label: "信用风险", icon: <Shield      size={13} /> },
];

/**
 * Sales V2 Phase 8 — 经营分析 Runtime
 *
 * 全面替换 Phase 5/6 的分散报表，升级为统一经营分析平台。
 */
export default function SalesV2ReportsPage() {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="animate-fade-in" style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="经营分析 Runtime"
        subtitle="Phase 8 — 销量 · 渠道 · 价格异常 · 配送 · 退货 · 库存 · 信用风险 · DataScope"
        breadcrumb={["销售系统", "经营分析"]}
      />

      {/* Tab Bar */}
      <div style={{
        display: "flex", gap: 2, marginBottom: 20,
        borderBottom: "1px solid var(--border)", flexWrap: "wrap",
      }}>
        {TABS.map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "8px 14px", border: "none", background: "none",
            cursor: "pointer", fontSize: 13, fontWeight: 600,
            color: tab === key ? "var(--color-primary)" : "var(--text-secondary)",
            borderBottom: tab === key ? "2px solid var(--color-primary)" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div>
        {tab === "overview"   && <OverviewTab />}
        {tab === "sales"      && <SalesTab />}
        {tab === "channel"    && <ChannelTab />}
        {tab === "price"      && <PriceTab />}
        {tab === "delivery"   && <DeliveryTab />}
        {tab === "return"     && <ReturnTab />}
        {tab === "inventory"  && <InventoryTab />}
        {tab === "credit"     && <CreditRiskTab />}
      </div>
    </div>
  );
}

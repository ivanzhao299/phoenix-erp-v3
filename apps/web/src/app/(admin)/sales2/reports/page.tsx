"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { BarChart2, TrendingUp, Package, Truck, RefreshCw, Archive, Shield, AlertTriangle, Users, Tag } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { KpiCard as GlobalKpiCard } from "@/components/ui/KpiCard";
import type { AccentColor } from "@/lib/design-tokens";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatMasterData } from '@/lib/business-display';
import { LoadingSkeleton } from "@/components/design-system";

// 旧硬编码色 → 全局语义强调色，复用全局 KpiCard 样式
const COLOR_TO_ACCENT: Record<string, AccentColor> = {
  "var(--color-accent)": "blue",
  "var(--status-success)": "green",
  "var(--status-warning)": "amber",
  "var(--status-danger)": "red",
  "var(--color-purple-600)": "violet",
  "var(--status-info)": "cyan",
  "var(--gray-700)": "slate"
};

// ── API helper ────────────────────────────────────────────────────────────────
function tok() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}
const BASE = process.env.NEXT_PUBLIC_API_BASE || "";
async function apiFetch<T = unknown>(path: string): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: {
      Authorization: `Bearer ${tok()}`,
      "Content-Type": "application/json"
    }
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
  return Number(n).toLocaleString("zh-CN", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
}

// ── 共用样式 ──────────────────────────────────────────────────────────────────
// 薄包装：沿用本页旧 API（label/value/sub/color），内部统一走全局 KpiCard（养殖风）
function KpiCard({
  label,
  value,
  sub,
  color = "var(--gray-700)"
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return <GlobalKpiCard label={label} value={value} subValue={sub} accentColor={COLOR_TO_ACCENT[color] ?? "slate"} />;
}
function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return <div style={{
    marginBottom: 28
  }}>
      <h4 style={{
      margin: "0 0 12px",
      fontSize: 14,
      fontWeight: 700,
      color: "var(--gray-900)",
      borderLeft: "3px solid var(--color-accent)",
      paddingLeft: 10
    }}>{title}</h4>
      {children}
    </div>;
}
function Table({
  cols,
  rows
}: {
  cols: string[];
  rows: React.ReactNode[][];
}) {
  const { t } = useLanguage();
  return <div className={u.scrollX}>
      <table className={s.table}>
        <thead>
          <tr>{cols.map(c => <th key={c} className={u.nowrap}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length} style={{
            textAlign: "center",
            color: "var(--text-secondary)",
            padding: 24
          }}>{t('ui.暂无数据','暂无数据')}</td></tr>}
          {rows.map((row, i) => <tr key={i}>
              {row.map((cell, j) => <td key={j}>{cell}</td>)}
            </tr>)}
        </tbody>
      </table>
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 1: 总览
// ══════════════════════════════════════════════════════════════════════════════
function OverviewTab() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch("/api/v2/sales/analytics/overview"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (loading) return <Spinner />;
  if (error) return <Err msg={error} onRetry={load} />;
  if (!data) return null;
  return <div>
      <Section title={t('ui.核心 KPI','核心 KPI')}>
        <div className={u.flexWrap12}>
          <KpiCard label={t('ui.销售订单总数','销售订单总数')} value={fmt(data.totalSalesOrders)} color="var(--color-accent)" />
          <KpiCard label={t('ui.销售总金额','销售总金额')} value={fmt(data.totalSalesAmount)} color="var(--color-accent)" />
          <KpiCard label={t('ui.已交付订单','已交付订单')} value={fmt(data.totalDelivered)} color="var(--status-success)" />
          <KpiCard label={t('ui.应收款总额','应收款总额')} value={fmt(data.totalReceivable)} color="var(--status-warning)" />
          <KpiCard label={t('ui.逾期应收','逾期应收')} value={fmt(data.overdueReceivable)} color="var(--status-danger)" />
          <KpiCard label={t('ui.退货总笔数','退货总笔数')} value={fmt(data.totalReturns)} color="var(--color-purple-600)" />
          <KpiCard label={t('ui.库存可用量（枚）','库存可用量（枚）')} value={fmt(data.inventoryBalance)} color="var(--status-info)" />
          <KpiCard label={t('ui.临期库存（批）','临期库存（批）')} value={fmt(data.inventoryExpiring)} color="var(--status-warning)" />
          <KpiCard label={t('ui.平均配送时长','平均配送时长')} value={`${fmt(data.averageDeliveryHours, 1)}h`} color="var(--gray-700)" />
          <KpiCard label={t('ui.准时配送率','准时配送率')} value={`${fmt(data.onTimeDeliveryRate, 1)}%`} color="var(--status-success)" />
          <KpiCard label={t('ui.退货率','退货率')} value={`${fmt(data.returnRate, 2)}%`} color="var(--color-purple-600)" />
          <KpiCard label={t('ui.累计损耗（枚）','累计损耗（枚）')} value={fmt(data.totalLoss)} color="var(--status-danger)" />
        </div>
      </Section>

      <div className={u.grid2_20}>
        <Section title={t('ui.按公司销量 TOP 10','按公司销量 TOP 10')}>
          <Table cols={[t('ui.公司','公司'), t('ui.订单数','订单数'), t('ui.销售金额','销售金额')]} rows={(data.byCompany ?? []).map((r: any) => [formatMasterData(r, 'company_name', r.company_code, lang), fmt(r.order_count), fmt(r.sales_amount)])} />
        </Section>
        <Section title={t('ui.按渠道销量 TOP 10','按渠道销量 TOP 10')}>
          <Table cols={[t('ui.渠道','渠道'), t('ui.订单数','订单数'), t('ui.销售金额','销售金额')]} rows={(data.byChannel ?? []).map((r: any) => [formatMasterData(r, 'channel_name', r.channel_code, lang), fmt(r.order_count), fmt(r.sales_amount)])} />
        </Section>
      </div>
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 2: 销量分析
// ══════════════════════════════════════════════════════════════════════════════
function SalesTab() {
  const { t } = useLanguage();
  const [trend, setTrend] = useState<any[]>([]);
  const [topCust, setTopCust] = useState<any[]>([]);
  const [topProd, setTopProd] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tr, c, p] = await Promise.all([apiFetch<any[]>(`/api/v2/sales/analytics/sales-trend?dateFrom=${dateFrom}&dateTo=${dateTo}&groupBy=${groupBy}`), apiFetch<any[]>("/api/v2/sales/analytics/top-customers"), apiFetch<any[]>("/api/v2/sales/analytics/top-products")]);
      setTrend(tr);
      setTopCust(c);
      setTopProd(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupBy]);
  useEffect(() => {
    load();
  }, [load]);
  if (loading) return <Spinner />;
  if (error) return <Err msg={error} onRetry={load} />;
  return <div>
      <div style={{
      display: "flex",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap",
      alignItems: "center"
    }}>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputSt} />
        <span style={{
        fontSize: 13,
        color: "var(--gray-500)"
      }}>{t('ui.至','至')}</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputSt} />
        <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)} style={inputSt}>
          <option value="day">{t('ui.按天','按天')}</option>
          <option value="week">{t('ui.按周','按周')}</option>
          <option value="month">{t('ui.按月','按月')}</option>
        </select>
        <button onClick={load} style={btnSt("var(--color-accent)")}>{t('ui.查询','查询')}</button>
      </div>

      <Section title={t('ui.销售趋势','销售趋势')}>
        <Table cols={[t('ui.期间','期间'), t('ui.订单数','订单数'), t('ui.销售金额','销售金额'), t('ui.已交付','已交付')]} rows={trend.map((r: any) => [String(r.period ?? "").slice(0, 10), fmt(r.order_count), fmt(r.sales_amount), fmt(r.delivered_count)])} />
      </Section>

      <div className={u.grid2_20}>
        <Section title={t('ui.TOP 20 客户','TOP 20 客户')}>
          <Table cols={[t('ui.客户代码','客户代码'), t('ui.客户名称','客户名称'), t('ui.订单数','订单数'), t('ui.销售额','销售额'), t('ui.逾期应收','逾期应收')]} rows={topCust.map((r: any) => [r.customerCode, r.customerName, fmt(r.totalOrders), fmt(r.totalSales), <span key="od" style={{
          color: r.overdueReceivable > 0 ? "var(--status-danger)" : "var(--gray-700)"
        }}>
                {fmt(r.overdueReceivable)}
              </span>])} />
        </Section>
        <Section title={t('ui.TOP 20 产品','TOP 20 产品')}>
          <Table cols={[t('ui.产品代码','产品代码'), t('ui.产品名称','产品名称'), t('ui.销售量','销售量'), t('ui.销售额','销售额'), t('ui.退货量','退货量')]} rows={topProd.map((r: any) => [r.productCode, r.productName ?? "—", fmt(r.totalQty), fmt(r.totalAmount), <span key="rt" style={{
          color: r.returnQty > 0 ? "var(--color-purple-600)" : "var(--gray-700)"
        }}>
                {fmt(r.returnQty)}
              </span>])} />
        </Section>
      </div>
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 3: 渠道分析
// ══════════════════════════════════════════════════════════════════════════════
function ChannelTab() {
  const { t } = useLanguage();
  const [data, setData] = useState<any[]>([]);
  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/v2/sales/analytics/channel-analysis"));
    } catch {}
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return <div>
      <Section title={t('ui.渠道销售分布','渠道销售分布')}>
        <Table cols={[t('ui.渠道代码','渠道代码'), t('ui.客户数','客户数'), t('ui.订单数','订单数'), t('ui.销售金额','销售金额'), t('ui.已交付','已交付'), t('ui.退货数','退货数'), t('ui.退货率%','退货率%'), t('ui.逾期应收','逾期应收')]} rows={data.map(r => [r.channelCode ?? t('ui.直营','直营'), fmt(r.customerCount), fmt(r.orderCount), fmt(r.salesAmount), fmt(r.deliveredCount), fmt(r.returnCount), <span key="rate" style={{
        color: r.returnRate > 5 ? "var(--status-danger)" : "var(--gray-700)"
      }}>
              {fmt(r.returnRate, 2)}%
            </span>, <span key="od" style={{
        color: r.overdueReceivable > 0 ? "var(--status-danger)" : "var(--gray-700)"
      }}>
              {fmt(r.overdueReceivable)}
            </span>])} />
      </Section>
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 4: 价格异常
// ══════════════════════════════════════════════════════════════════════════════
function PriceTab() {
  const { t } = useLanguage();
  const [data, setData] = useState<any[]>([]);
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<any[]>(`/api/v2/sales/analytics/price-anomalies?threshold=${threshold}`));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [threshold]);
  useEffect(() => {
    load();
  }, [load]);
  return <div>
      <div style={{
      display: "flex",
      gap: 8,
      marginBottom: 16,
      alignItems: "center"
    }}>
        <label className={u.fs13}>
          {t('ui.偏离阈值（%）：','偏离阈值（%）：')}
          <select value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{
          ...inputSt,
          marginLeft: 6
        }}>
            {[1, 2, 5, 10, 15, 20].map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </label>
        <button onClick={load} style={btnSt("var(--status-warning)")}>{t('ui.查询','查询')}</button>
      </div>
      {error && <div style={{
      color: "var(--status-danger)",
      marginBottom: 8
    }}>{error}</div>}
      {loading ? <LoadingSkeleton variant="table" rows={10} cols={8} /> : <Section title={`价格异常订单（偏离 ≥ ${threshold}% 或低于底价）`}>
          <Table cols={[t('ui.订单号','订单号'), t('ui.客户','客户'), t('ui.产品','产品'), t('ui.实际价','实际价'), t('ui.标准价','标准价'), t('ui.底价','底价'), t('ui.偏离%','偏离%'), t('ui.日期','日期')]} rows={data.map(r => [r.sales_order_no, r.customer_name ?? r.customer_code, r.product_code, fmt(r.actual_unit_price), fmt(r.resolved_unit_price), <span key="fp" style={{
        color: r.below_floor_price ? "var(--status-danger)" : "var(--gray-700)"
      }}>
                {r.floor_price ? fmt(r.floor_price) : "—"}
                {r.below_floor_price && " ⚠"}
              </span>, <span key="dr" style={{
        color: Math.abs(r.diff_rate) >= threshold ? "var(--status-danger)" : "var(--gray-700)",
        fontWeight: 700
      }}>
                {r.diff_rate > 0 ? "+" : ""}{fmt(r.diff_rate, 2)}%
              </span>, String(r.created_at ?? "").slice(0, 10)])} />
        </Section>}
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 5: 配送分析
// ══════════════════════════════════════════════════════════════════════════════
function DeliveryTab() {
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch("/api/v2/sales/analytics/delivery-performance"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (loading) return <Spinner />;
  if (error) return <Err msg={error} onRetry={load} />;
  if (!data) return null;
  return <div>
      <Section title={t('ui.配送 KPI','配送 KPI')}>
        <div className={u.flexWrap12}>
          <KpiCard label={t('ui.总配送单','总配送单')} value={fmt(data.totalDeliveries)} />
          <KpiCard label={t('ui.已完成','已完成')} value={fmt(data.completedCount)} color="var(--status-success)" />
          <KpiCard label={t('ui.平均配送时长','平均配送时长')} value={`${fmt(data.averageDeliveryHours, 1)}h`} color="var(--color-accent)" />
          <KpiCard label={t('ui.准时率','准时率')} value={`${fmt(data.onTimeRate, 1)}%`} color="var(--status-success)" />
          <KpiCard label={t('ui.超时单数','超时单数')} value={fmt(data.delayedCount)} color="var(--status-danger)" />
          <KpiCard label={t('ui.平均超时时长','平均超时时长')} value={`${fmt(data.avgDelayedHours, 1)}h`} color="var(--status-danger)" />
        </div>
      </Section>

      <div className={u.grid2_20}>
        <Section title={t('ui.司机绩效排名','司机绩效排名')}>
          <Table cols={[t('ui.司机名称','司机名称'), t('ui.司机代码','司机代码'), t('ui.完成趟次','完成趟次'), t('ui.平均时长(h)','平均时长(h)')]} rows={(data.driverRanking ?? []).map((r: any) => [r.driver_name ?? "—", r.driver_code ?? "—", fmt(r.completed_trips), fmt(r.avg_hours, 1)])} />
        </Section>
        <Section title={t('ui.车辆使用排名','车辆使用排名')}>
          <Table cols={[t('ui.车牌号','车牌号'), t('ui.完成趟次','完成趟次'), t('ui.平均时长(h)','平均时长(h)')]} rows={(data.vehicleRanking ?? []).map((r: any) => [r.vehicle_no, fmt(r.completed_trips), fmt(r.avg_hours, 1)])} />
        </Section>
      </div>
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 6: 退货分析
// ══════════════════════════════════════════════════════════════════════════════
function ReturnTab() {
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/v2/sales/analytics/return-analysis"));
    } catch {}
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return <Spinner />;
  const typeLabel: Record<string, string> = {
    CUSTOMER_RETURN: "客户退货",
    DELIVERY_REJECT: "配送拒收",
    QUALITY_RETURN: "质量退货",
    DAMAGE_RETURN: "破损退货"
  };
  return <div>
      <Section title={t('ui.退货 KPI','退货 KPI')}>
        <div className={u.flexWrap12}>
          <KpiCard label={t('ui.已完成退货数','已完成退货数')} value={fmt(data.totalReturns)} color="var(--color-purple-600)" />
          <KpiCard label={t('ui.退货总金额','退货总金额')} value={fmt(data.totalReturnAmount)} color="var(--color-purple-600)" />
          <KpiCard label={t('ui.退货率','退货率')} value={`${fmt(data.returnRate, 2)}%`} color="var(--status-danger)" />
          <KpiCard label={t('ui.客户退货','客户退货')} value={fmt(data.byType?.customerReturn)} />
          <KpiCard label={t('ui.配送拒收','配送拒收')} value={fmt(data.byType?.deliveryReject)} />
          <KpiCard label={t('ui.质量退货','质量退货')} value={fmt(data.byType?.qualityReturn)} />
          <KpiCard label={t('ui.破损退货','破损退货')} value={fmt(data.byType?.damageReturn)} />
        </div>
      </Section>

      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 16
    }}>
        <Section title={t('ui.TOP 退货客户','TOP 退货客户')}>
          <Table cols={[t('ui.客户','客户'), t('ui.退货次','退货次'), t('ui.金额','金额')]} rows={(data.topReturnCustomers ?? []).map((r: any) => [r.customer_name ?? r.customer_code, fmt(r.return_count), fmt(r.return_amount)])} />
        </Section>
        <Section title={t('ui.TOP 退货产品','TOP 退货产品')}>
          <Table cols={[t('ui.产品','产品'), t('ui.退货量','退货量'), t('ui.金额','金额')]} rows={(data.topReturnProducts ?? []).map((r: any) => [r.product_code, fmt(r.return_qty), fmt(r.return_amount)])} />
        </Section>
        <Section title={t('ui.退货原因分布','退货原因分布')}>
          <Table cols={[t('ui.原因代码','原因代码'), t('ui.次数','次数')]} rows={(data.topReturnReasons ?? []).map((r: any) => [r.reason_code, fmt(r.count)])} />
        </Section>
      </div>
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 7: 库存分析
// ══════════════════════════════════════════════════════════════════════════════
function InventoryTab() {
  const { t } = useLanguage();
  const [turnover, setTurnover] = useState<any>(null);
  const [loss, setLoss] = useState<any>(null);
  const load = useCallback(async () => {
    try {
      const [tv, l] = await Promise.all([apiFetch("/api/v2/sales/analytics/inventory-turnover"), apiFetch("/api/v2/sales/analytics/loss-analysis")]);
      setTurnover(tv);
      setLoss(l);
    } catch {}
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!turnover && !loss) return <Spinner />;
  return <div>
      {turnover && <>
          <Section title={t('ui.库存周转 KPI','库存周转 KPI')}>
            <div className={u.flexWrap12}>
              <KpiCard label={t('ui.活跃批次数','活跃批次数')} value={fmt(turnover.activeBatches)} color="var(--color-accent)" />
              <KpiCard label={t('ui.总可用库存（枚）','总可用库存（枚）')} value={fmt(turnover.totalAvailable)} color="var(--color-accent)" />
              <KpiCard label={t('ui.临期批次（≤7天）','临期批次（≤7天）')} value={fmt(turnover.expiringBatches)} color="var(--status-warning)" sub={`${fmt(turnover.expiringQty)} 枚`} />
              <KpiCard label={t('ui.已过期批次','已过期批次')} value={fmt(turnover.expiredBatches)} color="var(--status-danger)" sub={`${fmt(turnover.expiredQty)} 枚`} />
              <KpiCard label={t('ui.退货待检批次','退货待检批次')} value={fmt(turnover.returnedBatches)} color="var(--color-purple-600)" />
              <KpiCard label={t('ui.平均保质期（天）','平均保质期（天）')} value={fmt(turnover.avgShelfDays, 1)} />
              <KpiCard label={t('ui.近30天出库量','近30天出库量')} value={fmt(turnover.totalOutbound30d)} color="var(--status-info)" />
              <KpiCard label={t('ui.库存周转率','库存周转率')} value={`${fmt(turnover.turnoverRate, 1)}%`} color="var(--status-success)" sub={t('ui.近30天','近30天')} />
            </div>
          </Section>

          <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16
      }}>
            <Section title={t('ui.按质量等级分布','按质量等级分布')}>
              <Table cols={[t('ui.等级','等级'), t('ui.批次数','批次数'), t('ui.可用量（枚）','可用量（枚）')]} rows={(turnover.byGrade ?? []).map((r: any) => [r.quality_grade, fmt(r.batch_count), fmt(r.qty_available)])} />
            </Section>
            <Section title={t('ui.按公司分布','按公司分布')}>
              <Table cols={[t('ui.公司代码','公司代码'), t('ui.活跃批次','活跃批次'), t('ui.可用量（枚）','可用量（枚）')]} rows={(turnover.byCompany ?? []).map((r: any) => [r.company_code, fmt(r.active_batches), fmt(r.qty_available)])} />
            </Section>
          </div>
        </>}

      {loss && <Section title={t('ui.损耗分析（近30天）','损耗分析（近30天）')}>
          <div style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 16
      }}>
            <KpiCard label={t('ui.过期核销（枚）','过期核销（枚）')} value={fmt(loss.expiredQty)} color="var(--status-danger)" />
            <KpiCard label={t('ui.破损核销（枚）','破损核销（枚）')} value={fmt(loss.damagedQty)} color="var(--status-warning)" />
            <KpiCard label={t('ui.手动核销（枚）','手动核销（枚）')} value={fmt(loss.writeOffQty)} color="var(--gray-500)" />
            <KpiCard label={t('ui.损耗总量（枚）','损耗总量（枚）')} value={fmt(loss.totalLoss)} color="var(--status-danger)" />
            <KpiCard label={t('ui.综合损耗率','综合损耗率')} value={`${fmt(loss.lossRate, 2)}%`} color="var(--status-danger)" />
          </div>
          <Table cols={[t('ui.日期','日期'), t('ui.过期损耗（枚）','过期损耗（枚）'), t('ui.破损损耗（枚）','破损损耗（枚）')]} rows={(loss.byDate ?? []).map((r: any) => [String(r.period ?? "").slice(0, 10), <span key="e" style={{
        color: r.expire_loss > 0 ? "var(--status-danger)" : "var(--gray-700)"
      }}>{fmt(r.expire_loss)}</span>, <span key="d" style={{
        color: r.damage_loss > 0 ? "var(--status-warning)" : "var(--gray-700)"
      }}>{fmt(r.damage_loss)}</span>])} />
        </Section>}
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 8: 信用风险
// ══════════════════════════════════════════════════════════════════════════════
function CreditRiskTab() {
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/v2/sales/analytics/credit-risk"));
    } catch {}
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return <Spinner />;
  const {
    summary,
    topOverdueCustomers,
    frozenCustomers
  } = data;
  return <div>
      <Section title={t('ui.信用风险 KPI','信用风险 KPI')}>
        <div className={u.flexWrap12}>
          <KpiCard label={t('ui.正常客户','正常客户')} value={fmt(summary?.normalCount)} color="var(--status-success)" />
          <KpiCard label={t('ui.预警客户','预警客户')} value={fmt(summary?.warningCount)} color="var(--status-warning)" />
          <KpiCard label={t('ui.超额度客户','超额度客户')} value={fmt(summary?.overLimitCount)} color="var(--status-warning)" />
          <KpiCard label={t('ui.逾期客户','逾期客户')} value={fmt(summary?.overdueCount)} color="var(--status-danger)" />
          <KpiCard label={t('ui.冻结客户','冻结客户')} value={fmt(summary?.frozenCount)} color="var(--gray-500)" />
          <KpiCard label={t('ui.自动冻结','自动冻结')} value={fmt(summary?.autoFrozenCount)} color="var(--gray-500)" />
          <KpiCard label={t('ui.高风险敞口','高风险敞口')} value={fmt(summary?.highRiskExposure)} color="var(--status-danger)" />
        </div>
      </Section>

      <div className={u.grid2_20}>
        <Section title={t('ui.TOP 20 逾期欠款客户','TOP 20 逾期欠款客户')}>
          <Table cols={[t('ui.客户代码','客户代码'), t('ui.客户名称','客户名称'), t('ui.逾期金额','逾期金额'), t('ui.逾期发票数','逾期发票数'), t('ui.最早逾期日','最早逾期日')]} rows={(topOverdueCustomers ?? []).map((r: any) => [r.customer_code, r.customer_name, <span key="od" style={{
          color: "var(--status-danger)",
          fontWeight: 700
        }}>{fmt(r.overdue_amount)}</span>, fmt(r.overdue_invoices), String(r.earliest_due_date ?? "").slice(0, 10) || "—"])} />
        </Section>

        <Section title={t('ui.冻结 / 逾期 / 超额度客户','冻结 / 逾期 / 超额度客户')}>
          <Table cols={[t('ui.客户代码','客户代码'), t('ui.客户名称','客户名称'), t('ui.信用状态','信用状态'), t('ui.已用额度','已用额度'), t('ui.信用额度','信用额度'), t('ui.自动冻结','自动冻结')]} rows={(frozenCustomers ?? []).map((r: any) => [r.customer_code, r.customer_name, <span key="cs" style={{
          fontWeight: 700,
          color: r.credit_status === "FROZEN" ? "var(--gray-500)" : r.credit_status === "OVERDUE" ? "var(--status-danger)" : "var(--status-warning)"
        }}>{r.credit_status}</span>, fmt(r.credit_used), fmt(r.credit_limit), r.auto_frozen ? t('ui.✅ 是','✅ 是') : t('ui.否','否')])} />
        </Section>
      </div>
    </div>;
}

// ── 辅助组件 ──────────────────────────────────────────────────────────────────
function Spinner() {
  const { t } = useLanguage();
  return <div style={{
    textAlign: "center",
    color: "var(--gray-400)",
    padding: 40
  }}>{t('ui.加载中...','加载中...')}</div>;
}
function Err({
  msg,
  onRetry
}: {
  msg: string;
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  return <div style={{
    color: "var(--status-danger)",
    padding: 16
  }}>
      {msg}
      <button onClick={onRetry} style={{
      marginLeft: 12,
      fontSize: 12,
      cursor: "pointer"
    }}>{t('ui.重试','重试')}</button>
    </div>;
}
const inputSt: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--gray-300)",
  borderRadius: 6,
  fontSize: 13
};
function btnSt(bg: string): React.CSSProperties {
  return {
    padding: "6px 14px",
    background: bg,
    color: "var(--bg-card)",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600
  };
}

// ── Tab 定义 ──────────────────────────────────────────────────────────────────
type TabKey = "overview" | "sales" | "channel" | "price" | "delivery" | "return" | "inventory" | "credit";
const TABS: {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}[] = [{
  key: "overview",
  label: "总览",
  icon: <BarChart2 size={13} />
}, {
  key: "sales",
  label: "销量分析",
  icon: <TrendingUp size={13} />
}, {
  key: "channel",
  label: "渠道分析",
  icon: <Users size={13} />
}, {
  key: "price",
  label: "价格异常",
  icon: <Tag size={13} />
}, {
  key: "delivery",
  label: "配送分析",
  icon: <Truck size={13} />
}, {
  key: "return",
  label: "退货分析",
  icon: <RefreshCw size={13} />
}, {
  key: "inventory",
  label: "库存分析",
  icon: <Archive size={13} />
}, {
  key: "credit",
  label: "信用风险",
  icon: <Shield size={13} />
}];

/**
 * Sales V2 Phase 8 — 经营分析 Runtime
 *
 * 全面替换 Phase 5/6 的分散报表，升级为统一经营分析平台。
 */
export default function SalesV2ReportsPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<TabKey>("overview");
  return <div className="animate-fade-in" style={{
    padding: "0 0 40px"
  }}>
      <PageHeader title={t('ui.经营分析','经营分析')} subtitle={t('ui.销量 · 渠道 · 价格异常 · 配送 · 退货 · 库存 · 信用风险 · 数据范围','销量 · 渠道 · 价格异常 · 配送 · 退货 · 库存 · 信用风险 · 数据范围')} breadcrumb={[t('ui.销售系统','销售系统'), t('ui.经营分析','经营分析')]} />

      {/* Tab Bar */}
      <div style={{
      display: "flex",
      gap: 2,
      marginBottom: 20,
      borderBottom: "1px solid var(--border)",
      flexWrap: "wrap"
    }}>
        {TABS.map(({
        key,
        label,
        icon
      }) => <button key={key} onClick={() => setTab(key)} style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "8px 14px",
        border: "none",
        background: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        color: tab === key ? "var(--color-primary)" : "var(--text-secondary)",
        borderBottom: tab === key ? "2px solid var(--color-primary)" : "2px solid transparent",
        marginBottom: -1
      }}>
            {icon}{label}
          </button>)}
      </div>

      {/* 内容区 */}
      <div>
        {tab === "overview" && <OverviewTab />}
        {tab === "sales" && <SalesTab />}
        {tab === "channel" && <ChannelTab />}
        {tab === "price" && <PriceTab />}
        {tab === "delivery" && <DeliveryTab />}
        {tab === "return" && <ReturnTab />}
        {tab === "inventory" && <InventoryTab />}
        {tab === "credit" && <CreditRiskTab />}
      </div>
    </div>;
}

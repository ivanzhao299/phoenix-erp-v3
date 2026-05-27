"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users, Tag, ShoppingCart, Truck, BarChart2,
  CheckCircle, Clock, AlertTriangle, ArrowRight,
  Activity, Database, Shield, FileText, CreditCard,
  Archive, RefreshCw, TrendingDown, Package,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";

interface HealthData {
  status:  string;
  module:  string;
  phase:   string;
  tables:  { new_runtime: string[]; legacy_frozen: string[] };
  roadmap: string[];
  timestamp: string;
}

interface OrderStats {
  todayOrders:     number;
  pendingApproval: number;
  receivedOrders:  number;
  arPending:       number;
  arGenerated:     number;
  lowPriceOrders:  number;
  overCreditOrders: number;
}

interface AnalyticsOverview {
  totalSalesOrders:     number;
  totalSalesAmount:     number;
  totalDelivered:       number;
  totalReceivable:      number;
  overdueReceivable:    number;
  totalReturns:         number;
  totalLoss:            number;
  inventoryBalance:     number;
  inventoryExpiring:    number;
  averageDeliveryHours: number;
  onTimeDeliveryRate:   number;
  returnRate:           number;
}

function getToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}

/**
 * Sales V2 总览页 — Phase 3 含 Dashboard Stats
 */
export default function SalesV2Page() {
  const [health, setHealth]     = useState<HealthData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState<OrderStats | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);

  useEffect(() => {
    const h = { Authorization: `Bearer ${getToken()}` };

    fetch("/api/v2/sales/health", { headers: h })
      .then((r) => r.json()).then((d) => setHealth(d)).catch(() => {}).finally(() => setLoading(false));

    fetch("/api/v2/sales/orders/stats", { headers: h })
      .then((r) => r.json()).then((d) => setStats(d)).catch(() => {});

    // Phase 8 — Analytics Overview
    fetch("/api/v2/sales/analytics/overview", { headers: h })
      .then((r) => r.ok ? r.json() : null).then((d) => d && setOverview(d)).catch(() => {});
  }, []);

  const cards = [
    {
      href: "/sales2/customers",
      Icon: Users,
      title: "客户主档",
      sub: "sal_customers",
      phase: "Phase 1",
      status: "done",
      desc: "统一客户主档（取代 ord_customers + b2b_customers）",
    },
    {
      href: "/sales2/pricing",
      Icon: Tag,
      title: "价格管理",
      sub: "sal_price_books / sal_price_items",
      phase: "Phase 2",
      status: "done",
      desc: "统一定价引擎（取代 ord_prices + prc_price_items）",
    },
    {
      href: "/sales2/orders",
      Icon: ShoppingCart,
      title: "销售订单",
      sub: "sal_sales_orders",
      phase: "Phase 3",
      status: "done",
      desc: "标准状态机 + AR 联动 + Workflow 审批",
    },
    {
      href: "/sales2/delivery",
      Icon: Truck,
      title: "配送管理",
      sub: "sal_delivery_orders",
      phase: "Phase 4",
      status: "done",
      desc: "配送单 + 装车/发车/到达/签收全状态机 + 司机/车辆档案 + AR 自动生成",
    },
    {
      href: "/sales2/reports",
      Icon: BarChart2,
      title: "经营分析",
      sub: "Analytics Runtime",
      phase: "Phase 8",
      status: "done",
      desc: "销量/渠道/价格异常/配送/退货/库存/信用 11维经营分析",
    },
  ];

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader
        title="销售系统总览"
        subtitle="Phase 8 完成 · 客户档案 + 渠道 + 价格引擎 + 订单 + 配送 + 信用 + 退货 + 库存 + 经营分析"
      />

      {/* Dashboard Stats — Phase 3 */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
          {[
            { label: "今日订单", value: stats.todayOrders,      icon: ShoppingCart, color: "#3b82f6" },
            { label: "待审批",   value: stats.pendingApproval,  icon: Clock,        color: "#f59e0b" },
            { label: "已签收",   value: stats.receivedOrders,   icon: CheckCircle,  color: "#22c55e" },
            { label: "待生成AR", value: stats.arPending,        icon: FileText,     color: "#ef4444" },
            { label: "已生成AR", value: stats.arGenerated,      icon: FileText,     color: "#22c55e" },
            { label: "低价审批", value: stats.lowPriceOrders,   icon: AlertTriangle,color: "#ef4444" },
            { label: "超信用",   value: stats.overCreditOrders, icon: CreditCard,   color: "#f59e0b" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} style={{
              padding: "14px 16px", borderRadius: 10, textAlign: "center",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <Icon size={18} style={{ color, marginBottom: 6 }} />
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Phase 8 — Analytics Overview Dashboard */}
      {overview && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: 1, marginBottom: 10 }}>
            经营概览（Analytics Runtime）
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 10 }}>
            {[
              { label: "今日配送", value: String(overview.totalDelivered ?? "—"),       icon: Truck,       color: "#22c55e" },
              { label: "应收款",   value: String(overview.totalReceivable?.toLocaleString("zh-CN") ?? "—"),  icon: FileText,    color: "#3b82f6" },
              { label: "逾期应收", value: String(overview.overdueReceivable?.toLocaleString("zh-CN") ?? "—"), icon: AlertTriangle, color: "#ef4444" },
              { label: "退货总数", value: String(overview.totalReturns ?? "—"),          icon: RefreshCw,   color: "#9333ea"  },
              { label: "库存可用（枚）", value: String(overview.inventoryBalance?.toLocaleString("zh-CN") ?? "—"), icon: Archive, color: "#0891b2" },
              { label: "临期库存（批）", value: String(overview.inventoryExpiring ?? "—"), icon: Package,   color: "#d97706"  },
              { label: "今日损耗（枚）", value: String(overview.totalLoss?.toLocaleString("zh-CN") ?? "—"), icon: TrendingDown, color: "#be123c" },
              { label: "准时配送率", value: `${overview.onTimeDeliveryRate ?? 0}%`,       icon: CheckCircle, color: "#22c55e" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} style={{
                padding: "12px 14px", borderRadius: 10, textAlign: "center",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <Icon size={16} style={{ color, marginBottom: 5 }} />
                <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health Card */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 20px", borderRadius: 10, marginBottom: 28,
        background: loading
          ? "rgba(255,255,255,0.04)"
          : health?.status === "ok"
            ? "linear-gradient(135deg,rgba(34,197,94,0.12),rgba(34,197,94,0.05))"
            : "rgba(239,68,68,0.1)",
        border: "1px solid " + (
          loading ? "rgba(255,255,255,0.1)"
          : health?.status === "ok" ? "rgba(34,197,94,0.3)"
          : "rgba(239,68,68,0.3)"
        ),
      }}>
        <Activity size={18} style={{ color: health?.status === "ok" ? "#22c55e" : "#ef4444" }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: health?.status === "ok" ? "#22c55e" : "#ef4444" }}>
            {loading ? "加载中…" : health?.status === "ok" ? "✅ 销售系统运行正常" : "❌ 系统异常"}
          </div>
          {health && (
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
              {health.module} · {health.phase} · {new Date(health.timestamp).toLocaleString("zh-CN")}
            </div>
          )}
        </div>
        {health && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 24, fontSize: 12 }}>
            <span style={{ color: "#22c55e" }}>
              <strong>{health.tables?.new_runtime?.length ?? 0}</strong> 新数据表
            </span>
            <span style={{ color: "#f59e0b" }}>
              <strong>{health.tables?.legacy_frozen?.length ?? 0}</strong> Legacy 冻结表
            </span>
          </div>
        )}
      </div>

      {/* Phase Roadmap */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.5, letterSpacing: 1, marginBottom: 12 }}>
          SALES V2 路线图
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            "Phase 0 ✅ Clean Baseline + Legacy Freeze",
            "Phase 1 ✅ 客户档案 + 渠道管理",
            "Phase 2 ✅ 统一价格引擎 + Workflow 审批",
            "Phase 3 ✅ 销售订单 Runtime（状态机 + AR 联动）",
            "Phase 4 ✅ 配送履约 Runtime（装车/发车/签收）",
            "Phase 5 ✅ 信用控制 Runtime（评估 + 自动冻结）",
            "Phase 6 ✅ 退货 Runtime（质检 + 回库 + Credit Note）",
            "Phase 7 ✅ 鸡蛋库存 Runtime（FIFO + Scheduler）",
            "Phase 8 ✅ 经营分析 Runtime（11 维分析 + 看板）",
            "Phase 9    Mobile Sales + Delivery App",
          ].map((step, i) => {
            const done = step.includes("✅");
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "7px 14px", borderRadius: 6, fontSize: 13,
                background: done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
                border: "1px solid " + (done ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"),
              }}>
                {done
                  ? <CheckCircle size={14} style={{ color: "#22c55e" }} />
                  : <Clock size={14} style={{ opacity: 0.3 }} />}
                <span style={{ opacity: done ? 1 : 0.5 }}>{step}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub-module Cards */}
      <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.5, letterSpacing: 1, marginBottom: 12 }}>
        子模块入口
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {cards.map((c) => (
          <Link key={c.href} href={c.href} style={{ textDecoration: "none" }}>
            <div style={{
              padding: "20px 22px", borderRadius: 12, cursor: "pointer",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              transition: "all 0.15s",
            }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.07)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.2)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.1)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <c.Icon size={20} style={{ color: c.status === "done" ? "#22c55e" : "#94a3b8" }} />
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                  background: c.status === "done" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                  color: c.status === "done" ? "#22c55e" : "#f59e0b",
                  letterSpacing: 0.3,
                }}>
                  {c.status === "done" ? "✅ " : ""}{c.phase}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{c.sub}</div>
              <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.5 }}>{c.desc}</div>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <ArrowRight size={14} style={{ opacity: 0.4 }} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Legacy Freeze Info */}
      <div style={{ marginTop: 36 }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.5, letterSpacing: 1, marginBottom: 12 }}>
          LEGACY FREEZE 清单
        </div>
        <div style={{
          padding: "16px 20px", borderRadius: 10,
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 13, fontWeight: 600, color: "#f59e0b" }}>
            <Shield size={14} />
            以下旧表已冻结（READ_ONLY），迁移完成前保留供只读参考
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              { table: "ord_customers",  target: "sal_customers",  phase: "Phase 1" },
              { table: "b2b_customers",  target: "sal_customers",  phase: "Phase 1" },
              { table: "ord_prices",     target: "sal_price_books / sal_price_items", phase: "Phase 2" },
              { table: "log_dispatch",   target: "sal_delivery_orders", phase: "Phase 4" },
              { table: "log_receipts",   target: "sal_receipts",   phase: "Phase 4" },
              { table: "fin_transactions（旧应收）", target: "fin_ar_invoices", phase: "Phase 3" },
            ].map((r) => (
              <div key={r.table} style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                padding: "6px 10px", borderRadius: 6, background: "rgba(0,0,0,0.2)",
              }}>
                <Database size={12} style={{ color: "#f59e0b", flexShrink: 0 }} />
                <span style={{ color: "#f59e0b", fontFamily: "monospace" }}>{r.table}</span>
                <ArrowRight size={10} style={{ opacity: 0.4, flexShrink: 0 }} />
                <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: 11 }}>{r.target}</span>
                <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 11 }}>{r.phase}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

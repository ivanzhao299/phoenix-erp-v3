"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users, Tag, ShoppingCart, Truck, BarChart2,
  CheckCircle, Clock, AlertTriangle, ArrowRight,
  Activity, Database, Zap, Shield,
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

function getToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}

/**
 * Sales V2 Phase 0 — 总览占位页
 *
 * 显示：Health API 返回数据 + 模块路线图 + 子模块入口卡片
 */
export default function SalesV2Page() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v2/sales/health", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => {})
      .finally(() => setLoading(false));
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
      status: "pending",
      desc: "标准状态机 + AR 联动 + Workflow 审批",
    },
    {
      href: "/sales2/delivery",
      Icon: Truck,
      title: "配送管理",
      sub: "sal_delivery_orders",
      phase: "Phase 4",
      status: "pending",
      desc: "配送单 + 装车时间 + 签收确认 + 路线规划",
    },
    {
      href: "/sales2/reports",
      Icon: BarChart2,
      title: "销售报表",
      sub: "只读聚合层",
      phase: "Phase 8",
      status: "pending",
      desc: "日报/欠款账龄/渠道销量/价格异常报表",
    },
  ];

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader
        title="Sales V2"
        subtitle="Phase 2 已完成 · 客户主档 + 渠道 + 统一价格引擎 Runtime"
      />

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
            {loading ? "加载中…" : health?.status === "ok" ? "✅ Sales V2 Health OK" : "❌ Health 异常"}
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
              <strong>{health.tables?.new_runtime?.length ?? 0}</strong> 新 Runtime 表
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
            "Phase 1 ✅ Customer + Channel Runtime",
            "Phase 2 ✅ Price Runtime",
            "Phase 3    Sales Order Runtime",
            "Phase 4    Delivery Runtime",
            "Phase 5    AR Integration + Credit Control",
            "Phase 6    Sales Return Runtime",
            "Phase 7    Egg Inventory Enhancement",
            "Phase 8    Sales Reports",
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
              { table: "fin_transactions (AR)", target: "fin_ar_invoices", phase: "Phase 3" },
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

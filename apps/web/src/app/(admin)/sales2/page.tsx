"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users, Tag, ShoppingCart, Truck, BarChart2,
  CheckCircle, Clock, AlertTriangle, ArrowRight,
  FileText, CreditCard, Archive, RefreshCw, TrendingDown, Package,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";

interface OrderStats {
  todayOrders:      number;
  pendingApproval:  number;
  receivedOrders:   number;
  arPending:        number;
  arGenerated:      number;
  lowPriceOrders:   number;
  overCreditOrders: number;
}

interface AnalyticsOverview {
  totalDelivered:       number;
  totalReceivable:      number;
  overdueReceivable:    number;
  totalReturns:         number;
  totalLoss:            number;
  inventoryBalance:     number;
  inventoryExpiring:    number;
  onTimeDeliveryRate:   number;
}

function getToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-center shadow-sm">
      <Icon size={18} style={{ color }} className="mx-auto mb-1.5" />
      <div className="text-xl font-extrabold" style={{ color }}>{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

const NAV_CARDS = [
  {
    href: "/sales2/customers",
    Icon: Users,
    title: "客户主档",
    desc: "统一客户主档 · 渠道分类 · 信用档案",
    color: "#6366f1",
  },
  {
    href: "/sales2/pricing",
    Icon: Tag,
    title: "价格管理",
    desc: "价格本 · 品级单价 · 客户专属价 · 审批工作流",
    color: "#10b981",
  },
  {
    href: "/sales2/orders",
    Icon: ShoppingCart,
    title: "销售订单",
    desc: "下单 · 审批 · 分配 · 拣货 · 发货 · 签收",
    color: "#3b82f6",
  },
  {
    href: "/sales2/delivery",
    Icon: Truck,
    title: "配送管理",
    desc: "配送单 · 装车 · 发车 · 到达 · 签收 · AR 生成",
    color: "#f59e0b",
  },
  {
    href: "/sales2/credit",
    Icon: CreditCard,
    title: "信用管理",
    desc: "信用额度 · 冻结 · 逾期预警 · 信用台账",
    color: "#ef4444",
  },
  {
    href: "/sales2/reports",
    Icon: BarChart2,
    title: "经营分析",
    desc: "销量 · 渠道 · 价格异常 · 配送 · 退货 · 库存",
    color: "#8b5cf6",
  },
];

export default function SalesV2Page() {
  const [stats, setStats]       = useState<OrderStats | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const h = { Authorization: `Bearer ${getToken()}` };

    fetch("/api/v2/sales/orders/stats", { headers: h })
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/v2/sales/analytics/overview", { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOverview(d))
      .catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader
        title="销售管理"
        subtitle="客户档案 · 价格管理 · 订单 · 配送 · 信用控制 · 经营分析"
      />

      {/* 订单状态看板 */}
      {(stats || loading) && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            订单状态
          </div>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 h-20 animate-pulse" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <StatCard label="今日订单"   value={stats.todayOrders}      icon={ShoppingCart}  color="#3b82f6" />
              <StatCard label="待审批"     value={stats.pendingApproval}  icon={Clock}         color="#f59e0b" />
              <StatCard label="已签收"     value={stats.receivedOrders}   icon={CheckCircle}   color="#22c55e" />
              <StatCard label="待生成 AR"  value={stats.arPending}        icon={FileText}      color="#ef4444" />
              <StatCard label="已生成 AR"  value={stats.arGenerated}      icon={FileText}      color="#22c55e" />
              <StatCard label="低价审批"   value={stats.lowPriceOrders}   icon={AlertTriangle} color="#ef4444" />
              <StatCard label="超信用"     value={stats.overCreditOrders} icon={CreditCard}    color="#f59e0b" />
            </div>
          ) : null}
        </div>
      )}

      {/* 经营概览 */}
      {overview && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            经营概览
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <StatCard label="今日配送"     value={overview.totalDelivered ?? "—"}                                icon={Truck}         color="#22c55e" />
            <StatCard label="应收款"       value={`¥${(overview.totalReceivable ?? 0).toLocaleString("zh-CN")}`} icon={FileText}      color="#3b82f6" />
            <StatCard label="逾期应收"     value={`¥${(overview.overdueReceivable ?? 0).toLocaleString("zh-CN")}`}icon={AlertTriangle} color="#ef4444" />
            <StatCard label="退货总数"     value={overview.totalReturns ?? "—"}                                  icon={RefreshCw}     color="#9333ea" />
            <StatCard label="库存可用（枚）" value={(overview.inventoryBalance ?? 0).toLocaleString("zh-CN")}   icon={Archive}       color="#0891b2" />
            <StatCard label="临期库存（批）" value={overview.inventoryExpiring ?? "—"}                          icon={Package}       color="#d97706" />
            <StatCard label="今日损耗（枚）" value={(overview.totalLoss ?? 0).toLocaleString("zh-CN")}          icon={TrendingDown}  color="#be123c" />
            <StatCard label="准时配送率"   value={`${overview.onTimeDeliveryRate ?? 0}%`}                        icon={CheckCircle}   color="#22c55e" />
          </div>
        </div>
      )}

      {/* 子模块入口 */}
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
        功能入口
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {NAV_CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="block group">
            <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm hover:shadow-md hover:border-slate-200 dark:hover:border-slate-600 transition-all cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${c.color}18` }}
                >
                  <c.Icon size={20} style={{ color: c.color }} />
                </div>
                <ArrowRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-400 transition-colors" />
              </div>
              <div className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{c.title}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{c.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

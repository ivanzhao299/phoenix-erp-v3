"use client";
/**
 * 销售管理驾驶舱 — Design System V2
 * ===================================
 * · 全部颜色来自 @theme inline token，无 dark:bg-slate-* 硬编码
 * · 状态色映射到 success/warning/danger/info/brand token
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users, Tag, ShoppingCart, Truck, BarChart2,
  CheckCircle, Clock, AlertTriangle, ArrowRight,
  FileText, CreditCard, Archive, RefreshCw,
  TrendingDown, Package,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { cn } from "@/lib/utils";

// ── 设计系统 token 映射（只使用 @theme inline 语义 token）────────────────────
type AccentKey = "blue" | "green" | "amber" | "red" | "violet" | "indigo" | "cyan" | "teal" | "slate";

const ACCENT: Record<AccentKey, { text: string; icon: string; border: string }> = {
  blue:   { text: "text-info",       icon: "bg-info/10",    border: "border-info/20"    },
  green:  { text: "text-success",    icon: "bg-success/10", border: "border-success/20" },
  amber:  { text: "text-warning",    icon: "bg-warning/10", border: "border-warning/20" },
  red:    { text: "text-danger",     icon: "bg-danger/10",  border: "border-danger/20"  },
  violet: { text: "text-brand",      icon: "bg-brand/10",   border: "border-brand/20"   },
  indigo: { text: "text-brand",      icon: "bg-brand/10",   border: "border-brand/20"   },
  cyan:   { text: "text-info",       icon: "bg-info/10",    border: "border-info/20"    },
  teal:   { text: "text-success",    icon: "bg-success/10", border: "border-success/20" },
  slate:  { text: "text-text-muted", icon: "bg-bg-muted",   border: "border-border"     },
};

// ── 类型 ──────────────────────────────────────────────────────────────────────

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
  totalDelivered:     number;
  totalReceivable:    number;
  overdueReceivable:  number;
  totalReturns:       number;
  totalLoss:          number;
  inventoryBalance:   number;
  inventoryExpiring:  number;
  onTimeDeliveryRate: number;
}

function getToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}

// ── 状态数字卡 ────────────────────────────────────────────────────────────────

function StatChip({
  label, value, icon: Icon, accent,
}: {
  label:  string;
  value:  string | number;
  icon:   React.ElementType;
  accent: AccentKey;
}) {
  const ac = ACCENT[accent];
  return (
    <div className={cn(
      "rounded-xl border bg-bg-card p-3.5 text-center",
      "transition-shadow duration-150 hover:shadow-card-hover",
      ac.border,
    )}>
      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-2", ac.icon)}>
        <Icon size={14} className={ac.text} />
      </div>
      <div className={cn("text-lg font-extrabold leading-tight", ac.text)}>{value}</div>
      <div className="text-xs text-text-dim mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

// ── 骨架屏 ────────────────────────────────────────────────────────────────────

function StatChipSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 h-[88px] animate-pulse">
      <div className="w-7 h-7 rounded-lg bg-bg-muted mx-auto mb-2" />
      <div className="h-5 w-10 bg-bg-muted rounded mx-auto mb-1" />
      <div className="h-3 w-14 bg-bg-muted rounded mx-auto" />
    </div>
  );
}

// ── 子模块导航卡定义 ──────────────────────────────────────────────────────────

interface NavCardDef {
  href:   string;
  Icon:   React.ElementType;
  title:  string;
  desc:   string;
  accent: AccentKey;
}

const NAV_CARDS: NavCardDef[] = [
  { href: "/sales2/customers", Icon: Users,        title: "客户主档",  accent: "indigo", desc: "统一客户主档 · 渠道分类 · 信用档案" },
  { href: "/sales2/pricing",   Icon: Tag,          title: "价格管理",  accent: "green",  desc: "价格本 · 品级单价 · 客户专属价 · 审批工作流" },
  { href: "/sales2/orders",    Icon: ShoppingCart, title: "销售订单",  accent: "blue",   desc: "下单 · 审批 · 分配 · 拣货 · 发货 · 签收" },
  { href: "/sales2/delivery",  Icon: Truck,        title: "配送管理",  accent: "amber",  desc: "配送单 · 装车 · 发车 · 到达 · 签收 · AR 生成" },
  { href: "/sales2/credit",    Icon: CreditCard,   title: "信用管理",  accent: "red",    desc: "信用额度 · 冻结 · 逾期预警 · 信用台账" },
  { href: "/sales2/reports",   Icon: BarChart2,    title: "经营分析",  accent: "violet", desc: "销量 · 渠道 · 价格异常 · 配送 · 退货 · 库存" },
];

// ── 区块标题 ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-3">
      {children}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function SalesV2Page() {
  const [stats,    setStats]   = useState<OrderStats | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading,  setLoading]  = useState(true);

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

      {/* ── 订单状态看板 ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionLabel>订单状态</SectionLabel>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => <StatChipSkeleton key={i} />)}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatChip label="今日订单"  value={stats.todayOrders}      icon={ShoppingCart}  accent="blue"   />
            <StatChip label="待审批"    value={stats.pendingApproval}  icon={Clock}         accent="amber"  />
            <StatChip label="已签收"    value={stats.receivedOrders}   icon={CheckCircle}   accent="green"  />
            <StatChip label="待生成 AR" value={stats.arPending}        icon={FileText}      accent="red"    />
            <StatChip label="已生成 AR" value={stats.arGenerated}      icon={FileText}      accent="green"  />
            <StatChip label="低价审批"  value={stats.lowPriceOrders}   icon={AlertTriangle} accent="red"    />
            <StatChip label="超信用"    value={stats.overCreditOrders} icon={CreditCard}    accent="amber"  />
          </div>
        ) : (
          <div className="text-sm text-text-dim py-4">暂无数据</div>
        )}
      </div>

      {/* ── 经营概览 ─────────────────────────────────────────────────────── */}
      {overview && (
        <div className="mb-6">
          <SectionLabel>经营概览</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <StatChip label="今日配送"       value={overview.totalDelivered ?? "—"}                                   icon={Truck}         accent="green"  />
            <StatChip label="应收款"         value={`¥${(overview.totalReceivable ?? 0).toLocaleString("zh-CN")}`}    icon={FileText}      accent="blue"   />
            <StatChip label="逾期应收"       value={`¥${(overview.overdueReceivable ?? 0).toLocaleString("zh-CN")}`}  icon={AlertTriangle} accent="red"    />
            <StatChip label="退货总数"       value={overview.totalReturns ?? "—"}                                     icon={RefreshCw}     accent="violet" />
            <StatChip label="库存可用（枚）" value={(overview.inventoryBalance ?? 0).toLocaleString("zh-CN")}          icon={Archive}       accent="cyan"   />
            <StatChip label="临期库存（批）" value={overview.inventoryExpiring ?? "—"}                                 icon={Package}       accent="amber"  />
            <StatChip label="今日损耗（枚）" value={(overview.totalLoss ?? 0).toLocaleString("zh-CN")}                 icon={TrendingDown}  accent="red"    />
            <StatChip label="准时配送率"     value={`${overview.onTimeDeliveryRate ?? 0}%`}                            icon={CheckCircle}   accent="green"  />
          </div>
        </div>
      )}

      {/* ── 子模块入口 ───────────────────────────────────────────────────── */}
      <SectionLabel>功能入口</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {NAV_CARDS.map((c) => {
          const ac = ACCENT[c.accent];
          return (
            <Link key={c.href} href={c.href} className="block group">
              <div className={cn(
                "rounded-2xl border bg-bg-card p-5",
                "shadow-card hover:shadow-card-hover hover:-translate-y-0.5",
                "transition-all duration-150",
                ac.border,
              )}>
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", ac.icon)}>
                    <c.Icon size={20} className={ac.text} />
                  </div>
                  <ArrowRight
                    size={15}
                    className="text-text-dim group-hover:text-text-muted transition-colors duration-150"
                  />
                </div>
                <div className="font-semibold text-sm text-text mb-1">{c.title}</div>
                <div className="text-xs text-text-muted leading-relaxed">{c.desc}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

"use client";
/**
 * 销售管理驾驶舱
 * ===================================
 * 卡片全部使用全局统一组件 KpiCard / NavCard（= 生产管理养殖页同一标准）。
 */
import { useState, useEffect } from "react";
import {
  Users, Tag, ShoppingCart, Truck, BarChart2,
  CheckCircle, Clock, AlertTriangle,
  FileText, CreditCard,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { NavCard } from "@/components/ui/NavCard";
import { StatStrip } from "@/components/ui/StatStrip";
import { KPI_GRID, type AccentColor } from "@/lib/design-tokens";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

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

// ── 子模块导航卡定义 ──────────────────────────────────────────────────────────

interface NavCardDef {
  href:   string;
  Icon:   React.ElementType;
  title:  string;
  desc:   string;
  accent: AccentColor;
  perm:   string;
}

const NAV_CARDS: NavCardDef[] = [
  { href: "/sales2/customers", Icon: Users,        title: "客户主档",  accent: "indigo", perm: "MENU_SALES2_CUSTOMER", desc: "统一客户主档 · 渠道分类 · 信用档案" },
  { href: "/sales2/pricing",   Icon: Tag,          title: "价格管理",  accent: "green",  perm: "MENU_SALES2_PRICE", desc: "价格本 · 品级单价 · 客户专属价 · 审批工作流" },
  { href: "/sales2/orders",    Icon: ShoppingCart, title: "销售订单",  accent: "blue",   perm: "MENU_SALES2_ORDER", desc: "下单 · 审批 · 分配 · 拣货 · 发货 · 签收" },
  { href: "/sales2/delivery",  Icon: Truck,        title: "配送管理",  accent: "amber",  perm: "MENU_SALES2_DELIVERY", desc: "配送单 · 装车 · 发车 · 到达 · 签收 · 应收生成" },
  { href: "/sales2/credit",    Icon: CreditCard,   title: "信用管理",  accent: "red",    perm: "MENU_SALES2_CREDIT", desc: "信用额度 · 冻结 · 逾期预警 · 信用台账" },
  { href: "/sales2/reports",   Icon: BarChart2,    title: "经营分析",  accent: "violet", perm: "MENU_SALES2_REPORT", desc: "销量 · 渠道 · 价格异常 · 配送 · 退货 · 库存" },
];

// ── 区块标题 ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14, letterSpacing: "0.01em" }}>
      {children}
    </div>
  );
}

const NAV_GRID:  React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 };

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function SalesV2Page() {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const [stats,    setStats]    = useState<OrderStats | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const h = { Authorization: `Bearer ${getToken()}` };

    fetch("/api/v2/sales/orders/stats", { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && !("code" in d && d.code >= 400) && setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/v2/sales/analytics/overview", { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOverview(d))
      .catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('ui.销售管理','销售管理')}
        subtitle={t('ui.客户档案 · 价格管理 · 订单 · 配送 · 信用控制 · 经营分析','客户档案 · 价格管理 · 订单 · 配送 · 信用控制 · 经营分析')}
      />

      {/* ── 订单状态看板 ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionLabel>{t('ui.订单状态','订单状态')}</SectionLabel>
        {loading ? (
          <div style={KPI_GRID}>
            {Array.from({ length: 7 }).map((_, i) => <KpiCard key={i} loading label="" value="" icon={ShoppingCart} />)}
          </div>
        ) : stats ? (
          <div style={KPI_GRID}>
            <KpiCard label={t('ui.今日订单','今日订单')}  value={stats.todayOrders      ?? 0} icon={ShoppingCart}  accentColor="blue"   />
            <KpiCard label={t('ui.待审批','待审批')}    value={stats.pendingApproval  ?? 0} icon={Clock}         accentColor="amber"  />
            <KpiCard label={t('ui.已签收','已签收')}    value={stats.receivedOrders   ?? 0} icon={CheckCircle}   accentColor="green"  />
            <KpiCard label={t('ui.待生成应收','待生成应收')} value={stats.arPending        ?? 0} icon={FileText}      accentColor="red"    />
            <KpiCard label={t('ui.已生成应收','已生成应收')} value={stats.arGenerated      ?? 0} icon={FileText}      accentColor="green"  />
            <KpiCard label={t('ui.低价审批','低价审批')}  value={stats.lowPriceOrders   ?? 0} icon={AlertTriangle} accentColor="red"    />
            <KpiCard label={t('ui.超信用','超信用')}    value={stats.overCreditOrders ?? 0} icon={CreditCard}    accentColor="amber"  />
          </div>
        ) : (
          <div className="text-sm text-text-dim py-4">{t('ui.暂无数据','暂无数据')}</div>
        )}
      </div>

      {/* ── 经营概览 ─────────────────────────────────────────────────────── */}
      {overview && (
        <div className="mb-6">
          <SectionLabel>{t('ui.经营概览','经营概览')}</SectionLabel>
          <StatStrip items={[
            { label: t('ui.今日配送','今日配送'),       value: overview.totalDelivered ?? "—" },
            { label: t('ui.应收款','应收款'),         value: `¥${(overview.totalReceivable ?? 0).toLocaleString("zh-CN")}` },
            { label: t('ui.逾期应收','逾期应收'),       value: `¥${(overview.overdueReceivable ?? 0).toLocaleString("zh-CN")}`, accentColor: "red" },
            { label: t('ui.退货总数','退货总数'),       value: overview.totalReturns ?? "—" },
            { label: t('ui.库存可用（枚）','库存可用（枚）'), value: (overview.inventoryBalance ?? 0).toLocaleString("zh-CN") },
            { label: t('ui.临期库存（批）','临期库存（批）'), value: overview.inventoryExpiring ?? "—" },
            { label: t('ui.今日损耗（枚）','今日损耗（枚）'), value: (overview.totalLoss ?? 0).toLocaleString("zh-CN"), accentColor: "red" },
            { label: t('ui.准时配送率','准时配送率'),     value: `${overview.onTimeDeliveryRate ?? 0}%`, accentColor: "green" },
          ]} />
        </div>
      )}

      {/* ── 子模块入口 ───────────────────────────────────────────────────── */}
      <SectionLabel>{t('ui.功能入口','功能入口')}</SectionLabel>
      <div style={NAV_GRID}>
        {NAV_CARDS.filter(c => hasPermission(c.perm, "V")).map((c) => (
          <NavCard key={c.href} icon={c.Icon} title={c.title} description={c.desc} href={c.href} accent={c.accent} />
        ))}
      </div>
    </div>
  );
}

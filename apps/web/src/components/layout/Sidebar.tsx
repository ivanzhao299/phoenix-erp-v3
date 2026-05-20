"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Egg, Package, Archive, Truck, Store, ShieldCheck,
  ClipboardList, Users, ShoppingCart, BarChart2, Settings,
  Home, Building2, Feather, Syringe, Pill, Clock, TrendingUp,
  AlertTriangle, Filter, Tag, Layers, PackagePlus, PackageMinus,
  ListChecks, Search, FileText, FilePlus, CreditCard, Calculator,
  Shield, Activity, BookOpen, Star, Receipt, MapPin, Route, Award,
  Megaphone, Database, ChevronDown, ChevronRight, type LucideIcon,
  Warehouse, MapPinned, Car, UserCheck, FileWarning, GitMerge,
  ClipboardCheck, PackageCheck, Truck as TruckLoad, BarChart, PieChart,
  Wheat, ScrollText, FlaskConical, ArrowLeftRight, DollarSign,
  History, Box, RefreshCw, TrendingDown, Banknote, Building, ShoppingBag,
  BarChart3, Minus, Network, Smartphone, ToggleRight, Zap
} from "lucide-react";
import styles from "./sidebar.module.css";
import { useBrand } from "@/contexts/BrandContext";
import { useLanguage } from "@/contexts/LanguageContext";

// ── SubMenuAccordion ─────────────────────────────────────────────
function Accordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(open ? "none" : "0px");
  const [visible, setVisible] = useState(open);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (open) {
      setVisible(true);
      setMaxH(`${el.scrollHeight}px`);
      const t = setTimeout(() => setMaxH("none"), 260);
      return () => clearTimeout(t);
    } else {
      setMaxH(`${el.scrollHeight}px`);
      requestAnimationFrame(() => requestAnimationFrame(() => setMaxH("0px")));
      const t = setTimeout(() => setVisible(false), 260);
      return () => clearTimeout(t);
    }
  }, [open]);
  return (
    <div ref={ref} style={{ maxHeight: maxH, overflow: "hidden", transition: "max-height 240ms cubic-bezier(0.4,0,0.2,1)", background: "rgba(0,0,0,0.18)" }}>
      {visible && children}
    </div>
  );
}

// ── Menu Tree (Lucide icons) ─────────────────────────────────────
type MenuItem = {
  id: string; path?: string; Icon: LucideIcon; label: string;
  perm: string | null; children?: MenuItem[];
};

const MENU: MenuItem[] = [
  { id: "dashboard", path: "/dashboard", Icon: LayoutDashboard, label: "仪表盘", perm: null },
  { id: "breeding", Icon: Egg, label: "养殖生产", perm: null, children: [
    { id: "brd-overview",  path: "/breeding",              Icon: Home,           label: "养殖场总览",   perm: "MENU_FARM_DATA" },
    { id: "brd-house",     path: "/breeding/henhouse",     Icon: Building2,      label: "鸡舍管理",     perm: "MENU_FARM_DATA" },
    { id: "brd-flock",     path: "/breeding/flock",        Icon: Feather,        label: "鸡群档案",     perm: "MENU_FARM_DATA" },
    { id: "brd-daily",     path: "/breeding/daily",        Icon: ClipboardList,  label: "日生产日报",   perm: "MENU_FARM_DATA" },
    { id: "brd-immune",    path: "/breeding/immune",       Icon: Syringe,        label: "免疫计划",     perm: "MENU_FARM_VET" },
    { id: "brd-medicine",  path: "/breeding/medicine",     Icon: Pill,           label: "用药记录",     perm: "MENU_FARM_VET" },
    { id: "brd-device",    path: "/breeding/device",       Icon: BarChart2,      label: "设备监控",     perm: "MENU_DEVICE_MONITOR" },
    { id: "brd-alerts",    path: "/breeding/device-alerts",Icon: AlertTriangle,  label: "环境预警",     perm: "MENU_DEVICE_MONITOR" },
    { id: "brd-device-ops",path: "/breeding/device-ops",  Icon: Network,        label: "设备运维",     perm: "MENU_DEVICE_MONITOR" },
  ]},
  { id: "packaging", Icon: Package, label: "分级包装", perm: null, children: [
    { id: "pkg-op",         path: "/packaging",              Icon: Egg,           label: "包装管理",   perm: "MENU_PKG_OP"  },
    { id: "pkg-inbound",    path: "/packaging/inbound",      Icon: PackagePlus,   label: "集蛋入库",   perm: "MENU_PKG_MGR" },
    { id: "pkg-batch",      path: "/packaging/batch",        Icon: Layers,        label: "批次管理",   perm: "MENU_PKG_MGR" },
    { id: "pkg-report",     path: "/packaging/daily-report", Icon: BarChart2,     label: "包装日报",   perm: "MENU_PKG_MGR" },
    { id: "pkg-except",     path: "/packaging/exceptions",   Icon: FileWarning,   label: "异常处理",   perm: "MENU_PKG_MGR" },
    { id: "pkg-printlogs", path: "/packaging/print-logs",   Icon: ScrollText,    label: "补打日志",   perm: "MENU_PKG_MGR" },
  ]},
  { id: "warehouse", Icon: Archive, label: "仓储库存", perm: null, children: [
    { id: "wh-dash",     path: "/warehouse",              Icon: LayoutDashboard, label: "仓库看板",   perm: "MENU_WMS_VIEW" },
    { id: "wh-in",       path: "/warehouse/inbound",      Icon: PackagePlus,     label: "入库管理",   perm: "MENU_WMS_INOUT" },
    { id: "wh-out",      path: "/warehouse/outbound",     Icon: PackageMinus,    label: "出库管理",   perm: "MENU_WMS_INOUT" },
    { id: "wh-transfer", path: "/warehouse/transfer",     Icon: RefreshCw,       label: "调拨管理",   perm: "MENU_WMS_INOUT" },
    { id: "wh-stock",    path: "/warehouse/stocktake",    Icon: ListChecks,      label: "盘点管理",   perm: "MENU_WMS_INOUT" },
    { id: "wh-ledger",   path: "/warehouse/ledger",       Icon: ScrollText,      label: "库存台账",   perm: "MENU_WMS_VIEW" },
    { id: "wh-query",    path: "/warehouse/query",        Icon: Search,          label: "库存查询",   perm: "MENU_WMS_VIEW" },
    { id: "wh-house",    path: "/warehouse/warehouses",   Icon: Warehouse,       label: "仓库主档",   perm: "MENU_WMS_MASTER" },
    { id: "wh-zones",    path: "/warehouse/zones",        Icon: MapPinned,       label: "库区管理",   perm: "MENU_WMS_MASTER" },
    { id: "wh-loc",      path: "/warehouse/locations",    Icon: MapPin,          label: "库位管理",   perm: "MENU_WMS_MASTER" },
    { id: "wh-expiry",   path: "/warehouse/expiry",       Icon: AlertTriangle,   label: "临期预警",   perm: "MENU_WMS_VIEW" },
    { id: "wh-daily",    path: "/warehouse/daily-close",  Icon: ClipboardCheck,  label: "日结对账",   perm: "MENU_WMS_INOUT" },
    { id: "wh-loss",     path: "/warehouse/loss-report",  Icon: TrendingDown,    label: "报损管理",   perm: "MENU_WMS_INOUT" },
  ]},
  { id: "transport", Icon: Truck, label: "配送运输", perm: "MENU_LOGISTICS", children: [
    { id: "tp-plan",    path: "/transport",             Icon: Route,       label: "配货计划", perm: "MENU_LOGISTICS" },
    { id: "tp-wave",    path: "/transport/wave",        Icon: Truck,       label: "配送波次", perm: "MENU_LOGISTICS" },
    { id: "tp-track",   path: "/transport/tracking",    Icon: MapPin,      label: "配送跟踪", perm: "MENU_LOGISTICS" },
    { id: "tp-receipt", path: "/transport/receipt",     Icon: Receipt,     label: "到店签收", perm: "MENU_LOGISTICS" },
    { id: "tp-except",  path: "/transport/exceptions",  Icon: FileWarning, label: "物流异常", perm: "MENU_LOGISTICS" },
    { id: "tp-vehicle", path: "/transport/vehicles",    Icon: Car,         label: "车辆档案", perm: "MENU_LOGISTICS_MASTER" },
    { id: "tp-driver",  path: "/transport/drivers",     Icon: UserCheck,   label: "司机档案", perm: "MENU_LOGISTICS_MASTER" },
  ]},
  { id: "store", Icon: Store, label: "直营门店", perm: null, children: [
    { id: "st-wb",      path: "/store",              Icon: LayoutDashboard, label: "门店工作台", perm: "MENU_STORE_MGR" },
    { id: "st-recv",    path: "/store/receiving",    Icon: PackagePlus,     label: "收货验收",   perm: "MENU_STORE_MGR" },
    { id: "st-inv",     path: "/store/inventory",    Icon: Archive,         label: "门店库存",   perm: "MENU_STORE_MGR" },
    { id: "st-replenish",path: "/store/replenish",   Icon: ShoppingBag,     label: "补货申请",   perm: "MENU_STORE_MGR" },
    { id: "st-loss",    path: "/store/losses",       Icon: Minus,           label: "损耗记录",   perm: "MENU_STORE_MGR" },
    { id: "st-daily",   path: "/store/daily",        Icon: Receipt,         label: "门店日结",   perm: "MENU_STORE_MGR" },
  ]},
  { id: "quality", Icon: ShieldCheck, label: "品质追溯", perm: null, children: [
    { id: "ql-ov",   path: "/quality",                Icon: LayoutDashboard,label: "质检总览",     perm: "MENU_QA_OP" },
    { id: "ql-farm", path: "/quality/farm",           Icon: Feather,        label: "场端质检",     perm: "MENU_QA_OP" },
    { id: "ql-prod", path: "/quality/product",        Icon: ShieldCheck,    label: "成品质检",     perm: "MENU_QA_OP" },
    { id: "ql-nc",   path: "/quality/nonconformance", Icon: AlertTriangle,  label: "不合格品处置", perm: "MENU_QA_MGR" },
    { id: "ql-fwd",  path: "/quality/forward",        Icon: Search,         label: "正向追溯",     perm: "MENU_QA_MGR" },
    { id: "ql-bwd",  path: "/quality/backward",       Icon: ArrowLeftRight, label: "反向追溯",     perm: "MENU_QA_MGR" },
    { id: "ql-std",  path: "/quality/standards",      Icon: FlaskConical,   label: "质量标准",     perm: "MENU_QA_MASTER" },
  ]},
  { id: "procurement", Icon: ClipboardList, label: "采购供应", perm: "MENU_PRC_MGR", children: [
    { id: "pr-ov",       path: "/procurement",              Icon: LayoutDashboard, label: "采购总览",   perm: "MENU_PRC_MGR" },
    { id: "pr-request",  path: "/procurement/requests",     Icon: FilePlus,        label: "采购申请",   perm: "MENU_PRC_MGR" },
    { id: "pr-order",    path: "/procurement/order",        Icon: FileText,        label: "采购订单",   perm: "MENU_PRC_MGR" },
    { id: "pr-arrival",  path: "/procurement/arrival",      Icon: PackagePlus,     label: "到货收货",   perm: "MENU_PRC_MGR" },
    { id: "pr-pay",      path: "/procurement/payments",     Icon: Banknote,        label: "采购付款",   perm: "MENU_PRC_MGR" },
    { id: "pr-supplier", path: "/procurement/suppliers",    Icon: Users,           label: "供应商档案", perm: "MENU_PRC_MASTER" },
    { id: "pr-reconcile",path: "/procurement/reconcile",    Icon: GitMerge,        label: "饲料核对",   perm: "MENU_PRC_MGR" },
  ]},
  { id: "order", Icon: ShoppingCart, label: "订货系统", perm: "MENU_ORDER_MGR", children: [
    { id: "ord-center",  path: "/order",               Icon: LayoutDashboard, label: "订单中心",   perm: "MENU_ORDER_MGR" },
    { id: "ord-cust",    path: "/order/customers",     Icon: Users,           label: "客户档案",   perm: "MENU_ORDER_MGR" },
    { id: "ord-price",   path: "/order/prices",        Icon: FileText,        label: "合同价格",   perm: "MENU_ORDER_MGR" },
    { id: "ord-approv",  path: "/order/approval",      Icon: ShieldCheck,     label: "订单审批",   perm: "MENU_ORDER_MGR" },
    { id: "ord-pick",    path: "/order/picking",       Icon: ClipboardCheck,  label: "拣货任务",   perm: "MENU_ORDER_WH" },
    { id: "ord-load",    path: "/order/loading",       Icon: PackageCheck,    label: "装车清单",   perm: "MENU_ORDER_WH" },
    { id: "ord-credit",  path: "/order/credit",        Icon: CreditCard,      label: "信用台账",   perm: "MENU_ORDER_FIN" },
  ]},
  { id: "members", Icon: Users, label: "会员营销", perm: "MENU_B2B_SALE", children: [
    { id: "mb-ov",     path: "/members",         Icon: LayoutDashboard, label: "会员总览", perm: "MENU_B2B_SALE" },
    { id: "mb-list",   path: "/members/list",    Icon: Users,           label: "会员档案", perm: "MENU_B2B_SALE" },
    { id: "mb-points", path: "/members/points",  Icon: Star,            label: "积分规则", perm: "MENU_B2B_SALE" },
    { id: "mb-coupon", path: "/members/coupons", Icon: Tag,             label: "优惠券",   perm: "MENU_B2B_SALE" },
    { id: "mb-act",    path: "/members/activity",Icon: Megaphone,       label: "营销活动", perm: "MENU_B2B_SALE" },
  ]},
  { id: "finance", Icon: BarChart2, label: "财务结算", perm: "MENU_FIN_AUDIT", children: [
    { id: "fn-ov",       path: "/finance",              Icon: LayoutDashboard, label: "财务总览",   perm: "MENU_FIN_AUDIT" },
    { id: "fn-recv",     path: "/finance/receivables",  Icon: TrendingUp,      label: "应收管理",   perm: "MENU_FIN_AUDIT" },
    { id: "fn-pay",      path: "/finance/payables",     Icon: Receipt,         label: "应付管理",   perm: "MENU_FIN_AUDIT" },
    { id: "fn-payments", path: "/finance/payments",     Icon: Banknote,        label: "付款单",     perm: "MENU_FIN_AUDIT" },
    { id: "fn-cost",     path: "/finance/cost",         Icon: Calculator,      label: "成本核算",   perm: "MENU_FIN_AUDIT" },
    { id: "fn-aging",    path: "/finance/aging",        Icon: Clock,           label: "账龄分析",   perm: "MENU_FIN_AUDIT" },
    { id: "fn-cashflow", path: "/finance/cashflow",     Icon: DollarSign,      label: "现金流水",   perm: "MENU_FIN_AUDIT" },
  ]},
  { id: "analytics", Icon: BarChart2, label: "数据分析", perm: "MENU_DASHBOARD", children: [
    { id: "an-bi",    path: "/analytics",               Icon: LayoutDashboard, label: "BI 驾驶舱",   perm: "MENU_DASHBOARD" },
    { id: "an-price", path: "/analytics/price-review",  Icon: TrendingUp,      label: "价格执行复盘", perm: "MENU_DASHBOARD" },
    { id: "an-prod",  path: "/analytics/production",    Icon: BarChart,        label: "生产报表",   perm: "MENU_DASHBOARD" },
    { id: "an-inv",   path: "/analytics/inventory",     Icon: PieChart,        label: "库存周转",   perm: "MENU_DASHBOARD" },
    { id: "an-feed",  path: "/analytics/feed",          Icon: Wheat,           label: "饲料核对",   perm: "MENU_DASHBOARD" },
  ]},
  { id: "b2b", Icon: BarChart3, label: "B2B 分销", perm: "MENU_B2B_SALE", children: [
    { id: "b2b-ov",     path: "/b2b",                     Icon: LayoutDashboard, label: "B2B 总览",   perm: "MENU_B2B_SALE" },
    { id: "b2b-cust",   path: "/b2b/customers",           Icon: Users,           label: "B2B 客户",   perm: "MENU_B2B_SALE" },
    { id: "b2b-orders", path: "/b2b/orders",              Icon: ShoppingCart,    label: "B2B 订单",   perm: "MENU_B2B_SALE" },
    { id: "b2b-grade",  path: "/b2b/distributor-grading", Icon: Award,           label: "经销商分级", perm: "MENU_B2B_SALE" },
  ]},
  { id: "pos", Icon: ShoppingBag, label: "POS 销售", perm: null, children: [
    { id: "pos-ov",    path: "/pos",         Icon: LayoutDashboard, label: "POS 总览",   perm: null },
    { id: "pos-sales", path: "/pos/sales",   Icon: CreditCard,      label: "销售单管理", perm: null },
  ]},
  { id: "workflow", Icon: GitMerge, label: "工作流", perm: null, children: [
    { id: "wf-start",  path: "/workflow/start",        Icon: FilePlus,        label: "发起申请", perm: null },
    { id: "wf-todo",   path: "/workflow/tasks/todo",   Icon: ClipboardCheck,  label: "我的待办", perm: null },
    { id: "wf-done",   path: "/workflow/tasks/done",   Icon: ListChecks,      label: "我的已办", perm: null },
    { id: "wf-inst",   path: "/workflow/instances",    Icon: ScrollText,      label: "流程实例", perm: null },
    { id: "wf-def",    path: "/workflow/definitions",  Icon: GitMerge,        label: "流程定义", perm: null },
    { id: "wf-form",   path: "/workflow/forms",        Icon: FileText,        label: "表单定义", perm: null },
    { id: "wf-source", path: "/workflow/data-sources", Icon: Database,        label: "数据源",   perm: null },
  ]},
  { id: "wholesale", Icon: FileText, label: "批发管理", perm: "MENU_B2B_SALE", children: [
    { id: "ws-ov",        path: "/wholesale",           Icon: LayoutDashboard, label: "批发总览",   perm: "MENU_B2B_SALE" },
    { id: "ws-contracts", path: "/wholesale/contracts", Icon: ScrollText,      label: "批发合同",   perm: "MENU_B2B_SALE" },
    { id: "ws-shipments", path: "/wholesale/shipments", Icon: TruckLoad,       label: "发货记录",   perm: "MENU_B2B_SALE" },
  ]},
  { id: "master", Icon: Database, label: "主数据", perm: "MENU_MASTER", children: [
    { id: "md-farms",    path: "/master/farms",     Icon: Home,      label: "农场主档",   perm: "MENU_MASTER" },
    { id: "md-products", path: "/master/products",  Icon: Box,       label: "产品品级",   perm: "MENU_MASTER" },
    { id: "md-stores",   path: "/master/stores",    Icon: Store,     label: "门店主档",   perm: "MENU_MASTER" },
  ]},
  { id: "settings", Icon: Settings, label: "系统设置", perm: null, children: [
    { id: "stg-users",       path: "/settings/users",          Icon: Users,         label: "用户管理",     perm: "MENU_SETTINGS_USER" },
    { id: "stg-roles",       path: "/settings/roles",          Icon: Shield,        label: "角色与权限",   perm: "MENU_SETTINGS_IT" },
    { id: "stg-orgs",        path: "/settings/organizations",  Icon: Network,       label: "组织架构",     perm: null },
    { id: "stg-dict",        path: "/settings/dict",           Icon: BookOpen,      label: "系统字典",     perm: "MENU_SETTINGS_DATA" },
    { id: "stg-products",    path: "/settings/products",       Icon: Egg,           label: "商品主数据",   perm: null },
    { id: "stg-master",      path: "/settings/master-data",    Icon: Database,      label: "主数据配置",   perm: null },
    { id: "stg-approvals",   path: "/settings/approval-flows", Icon: GitMerge,      label: "审批流配置",   perm: "MENU_SETTINGS_IT" },
    { id: "stg-perms",       path: "/settings/permissions",    Icon: Shield,        label: "权限配置",     perm: "MENU_SETTINGS_IT" },
    { id: "stg-pda",         path: "/settings/pda-terminals",  Icon: Smartphone,    label: "PDA终端",      perm: null },
    { id: "stg-pos",         path: "/settings/pos-config",     Icon: Store,         label: "POS配置",      perm: null },
    { id: "stg-stock-cfg",   path: "/settings/store-stock",    Icon: ToggleRight,   label: "分账库存配置", perm: null },
    { id: "stg-security",    path: "/settings/security",       Icon: ShieldCheck,   label: "安全策略",     perm: null },
    { id: "stg-health",      path: "/settings/health",         Icon: Activity,      label: "系统健康",     perm: "MENU_SETTINGS_IT" },
    { id: "stg-audit",       path: "/settings/audit-log",      Icon: History,       label: "审计日志",     perm: "MENU_SETTINGS_IT" },
    { id: "stg-init",        path: "/settings/system-init",    Icon: Zap,           label: "系统初始化",   perm: null },
    { id: "stg-brand",       path: "/settings/brand",          Icon: Star,          label: "品牌配置",     perm: "MENU_SETTINGS_IT" },
    { id: "stg-profile",     path: "/settings/profile",        Icon: UserCheck,     label: "个人中心",     perm: null },
  ]},

];

/**
 * 权限检查 — 委托给 AuthContext.hasPermission
 * hasPermission 已内置:
 *   1. perm 为 null/undefined → true
 *   2. ROLE_ADMIN → true
 *   3. ROLE_MENU_MATRIX 匹配
 *   4. 无 matrix 条目 → true（兼容模式）
 */

// ── Sidebar Component ────────────────────────────────────────────
interface SidebarProps {
  pinned: boolean; hovered: boolean;
  onHoverEnter: () => void; onHoverLeave: () => void;
}

export function Sidebar({ pinned, hovered, onHoverEnter, onHoverLeave }: SidebarProps) {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const { brand } = useBrand();          // ✅ 全局品牌数据
  const { t } = useLanguage();            // ✅ 翻译函数
  const pathname = usePathname();
  const expanded_ = pinned || hovered;
  const isOverlay = hovered && !pinned;

  const visibleMenu = MENU.map(item => {
    if (item.perm && !hasPermission(item.perm)) return null;
    if (item.children) {
      const kids = item.children.filter(c => !c.perm || hasPermission(c.perm));
      if (!kids.length) return null;
      return { ...item, children: kids };
    }
    return item;
  }).filter(Boolean) as MenuItem[];

  const getActive = useCallback((path?: string) => {
    if (!path) return false;
    if (path === "/dashboard") return pathname === "/dashboard";
    return pathname === path || pathname.startsWith(path + "/");
  }, [pathname]);

  const getGroupActive = useCallback((item: MenuItem) => {
    if (!item.children) return false;
    return item.children.some(c => c.path && getActive(c.path));
  }, [getActive]);

  const [openId, setOpenId] = useState<string | null>(() => {
    for (const item of MENU) {
      if (item.children?.some(c => c.path && pathname.startsWith(c.path))) return item.id;
    }
    return null;
  });
  const toggle = (id: string) => setOpenId(prev => prev === id ? null : id);

  const avatarChar = user?.name?.[0]?.toUpperCase() || "A";

  return (
    <aside
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      className={`phoenix-sidebar ${styles.sidebar}`}
      style={{
        width: expanded_ ? "220px" : "56px",
        boxShadow: isOverlay ? "4px 0 24px rgba(0,0,0,0.5)" : "none",
      }}
    >
      {/* Logo — 动态品牌，数据来自 BrandContext → /api/system/brand */}
      <div className={styles.logoArea} style={{ justifyContent: expanded_ ? "flex-start" : "center" }}>
        {brand.logo_url
          ? <img src={brand.logo_url} alt="logo"
              style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, flexShrink: 0 }} />
          : <span className={styles.logoIcon}>🐦</span>
        }
        {expanded_ && (
          <div className={styles.logoText}>
            <div className={styles.brandName}>{brand.system_name || '金凤凰 ERP'}</div>
            <div className={styles.brandSub}>Phoenix V3</div>
          </div>
        )}
      </div>

      {/* User */}
      <div className={styles.userArea} style={{ justifyContent: expanded_ ? "flex-start" : "center" }}>
        <div className={styles.avatar} title={!expanded_ ? (user?.name ?? "") : undefined}>{avatarChar}</div>
        {expanded_ && (
          <div className={styles.userInfo}>
            <div className={styles.userName}>{user?.name}</div>
            <div className={styles.userRole}>{user?.role}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {visibleMenu.map(item => {
          const grpActive = getGroupActive(item);
          const itemActive = !item.children && getActive(item.path);
          const isThisActive = grpActive || itemActive;
          const isOpen = openId === item.id;

          // ── Rail mode: icon only, tooltip, same size=18 as expanded ──
          if (!expanded_) {
            return (
              <div
                key={item.id}
                className={`${styles.railItem} ${isThisActive ? styles.railActive : ""}`}
                title={t('menu.' + item.id, item.label)}
                onClick={() => {
                  if (item.children) router.push(item.children[0].path!);
                  else if (item.path) router.push(item.path);
                }}
              >
                {/* Same size=18 as expanded mode — no jump on transition */}
                <item.Icon size={18} />
              </div>
            );
          }

          // ── Full expanded mode ──
          return (
            <div key={item.id}>
              {item.children ? (
                <div
                  className={`${styles.groupHeader} ${isThisActive ? styles.groupActive : ""}`}
                  onClick={() => {
                    toggle(item.id);
                    router.push(item.children![0].path!);
                  }}
                >
                  {/* size=18 — same as rail mode, no visual jump */}
                  <item.Icon size={18} className={styles.menuIconSvg} />
                  <span className={styles.menuLabel}>{t('menu.' + item.id, item.label)}</span>
                  <span className={styles.chevron}>
                    {isOpen
                      ? <ChevronDown size={13} />
                      : <ChevronRight size={13} />}
                  </span>
                </div>
              ) : (
                <Link href={item.path!} className={`${styles.groupHeader} ${isThisActive ? styles.groupActive : ""}`}>
                  <item.Icon size={18} className={styles.menuIconSvg} />
                  <span className={styles.menuLabel}>{t('menu.' + item.id, item.label)}</span>
                </Link>
              )}

              {item.children && (
                <Accordion open={isOpen}>
                  {/* Terminal 作业台入口：仅在分级包装分组顶部显示 */}
                  {item.id === "packaging" && (
                    <a
                      href="/terminal/packaging/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "9px 12px 9px 28px",
                        margin: "6px 8px 2px",
                        borderRadius: 8,
                        background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08))",
                        border: "1px solid rgba(245,158,11,0.35)",
                        color: "#f59e0b",
                        textDecoration: "none",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      title={t('layout.enter_terminal', '进入包装作业台')}
                    >
                      <Zap size={12} />
                      <span>🖥️ {t('layout.enter_terminal', '进入包装作业台')}</span>
                    </a>
                  )}
                  {item.children.map(child => {
                    const active = getActive(child.path);
                    return (
                      <Link
                        key={child.id}
                        href={child.path!}
                        className={`${styles.subItem} ${active ? styles.subActive : ""}`}
                      >
                        {/* size=13 matches old frontend exactly */}
                        <child.Icon size={13} className={styles.subIconSvg} />
                        <span>{t('menu.' + child.id, child.label)}</span>
                      </Link>
                    );
                  })}
                </Accordion>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom */}
      {expanded_ && (
        <Link href="/settings/profile" className={styles.profileLink}>
          <Settings size={13} />
          <span>{t('layout.profile_link', '个人中心 / 修改密码')}</span>
        </Link>
      )}
    </aside>
  );
}

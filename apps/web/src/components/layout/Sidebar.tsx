"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Egg, Package, Archive, Truck, Store, ShieldCheck,
  ClipboardList, Users, ShoppingCart, BarChart2, Settings,
  Home, Building2, Feather, Syringe, Pill, TrendingUp,
  AlertTriangle, Tag, Layers, PackagePlus, PackageMinus,
  ListChecks, Search, FileText, FilePlus, CreditCard,
  Shield, Activity, BookOpen, Star, Receipt, MapPin,
  Megaphone, Database, ChevronDown, ChevronRight, type LucideIcon,
  Warehouse, MapPinned, Car, UserCheck, FileWarning,
  ClipboardCheck, PackageCheck, BarChart, PieChart,
  Wheat, ScrollText, FlaskConical, ArrowLeftRight, DollarSign,
  History, RefreshCw, TrendingDown, Banknote, Building, ShoppingBag,
  BarChart3, Minus, Network, Smartphone, ToggleRight, Zap,
  FolderKanban, Globe, Layers3, UploadCloud, Bell, Wallet,
  Rocket, Server, ShieldAlert, Settings2, Landmark, Scale,
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
    <div ref={ref} style={{ maxHeight: maxH, overflow: "hidden", transition: "max-height 240ms cubic-bezier(0.4,0,0.2,1)", background: "var(--overlay-black-15)" }}>
      {visible && children}
    </div>
  );
}

// ── Menu Tree (Lucide icons) ─────────────────────────────────────
export type MenuItem = {
  id: string; path?: string; Icon: LucideIcon; label: string;
  aliases?: string[];
  perm: string | null;
  requiredPerm?: string;
  // 受控超级码兜底。高风险目录需优先拆到原子菜单，避免父权限透出无权限子菜单。
  superPerm?: string;
  // 过渡期兼容码：优先使用原子菜单码；老角色仍可通过旧粗粒度码看见同一入口。
  altPerms?: string[];
  children?: MenuItem[];
};

// ── V3 最终菜单架构 — Navigation Final 2026-05-30 ─────────────────
// 12 个一级菜单，全部业务中文命名，无技术术语
export const MENU: MenuItem[] = [

  // 0. HOME-1 企业运营工作台（统一首页，登录直达）
  { id: "home", path: "/home", Icon: LayoutDashboard, label: "运营工作台", perm: "MENU_DASHBOARD" },
  // 0.1 每日工作台 — 一站式高频录入入口（生产/销售/办公人员均可见）
  { id: "daily-work", path: "/daily-work", Icon: ClipboardList, label: "每日工作台", perm: "MENU_DASHBOARD" },

  // 1. 经营仪表盘 = 集团总部经营驾驶舱，仅财务高层 / CFO / CEO 可见；普通业务员登录直达 /home
  { id: "dashboard", path: "/dashboard", Icon: LayoutDashboard, label: "经营仪表盘", perm: "MENU_FIN_AUDIT" },

  // 2. 生产管理 — 养殖生产 + 分级包装 + 品质追溯 统一入口
  { id: "production", Icon: Egg, label: "生产管理", perm: "MENU_FARM_DATA", children: [
    // 养殖生产
    { id: "brd-overview",   path: "/breeding",                Icon: Home,           label: "养殖总览",     perm: "MENU_FARM_DATA" },
    { id: "brd-house",      path: "/breeding/henhouse",       Icon: Building2,      label: "鸡舍管理",     perm: "MENU_FARM_MASTER" },  // G56-C 鸡舍主档=FARM_MASTER(对齐后端 brd_houses)
    { id: "brd-flock",      path: "/breeding/flock",          Icon: Feather,        label: "鸡群档案",     perm: "MENU_FARM_DATA" },
    { id: "brd-daily",      path: "/breeding/daily",          Icon: ClipboardList,  label: "日生产日报",   perm: "MENU_FARM_DAILY" },   // G56-C 日报写入=FARM_DAILY(对齐 POST /api/v3/farm/daily-logs)
    { id: "brd-immune",     path: "/breeding/immune",         Icon: Syringe,        label: "免疫计划",     perm: "MENU_FARM_VET"  },
    { id: "brd-medicine",   path: "/breeding/medicine",       Icon: Pill,           label: "用药记录",     perm: "MENU_FARM_VET"  },
    { id: "brd-device",     path: "/breeding/device",         Icon: BarChart2,      label: "设备监控",     perm: "MENU_DEVICE_MONITOR" },
    { id: "brd-alerts",     path: "/breeding/device-alerts",  Icon: AlertTriangle,  label: "环境预警",     perm: "MENU_DEVICE_MONITOR" },
    { id: "brd-device-ops", path: "/breeding/device-ops",    Icon: Network,        label: "设备运维",     perm: "MENU_DEVICE_MONITOR" },
    // G15：集蛋记录已废弃 — 蛋品统计合并到「日生产日报」（含 9 档 JSONB）
    // 日产蛋入库（库存来源模式 P1A：临时生产入库模式下直接形成销售库存）
    { id: "prod-inbound",   path: "/breeding/daily-inbound",  Icon: PackagePlus,    label: "日产蛋入库",   perm: "MENU_PROD_INBOUND" },
    // 分级包装（包装作业中心：包装完成 = 唯一库存入口）
    { id: "pkg-op",         path: "/packaging",               Icon: Egg,            label: "包装作业",     perm: "MENU_PKG_OP"  },
    { id: "pkg-batch",      path: "/packaging/batch",         Icon: Layers,         label: "包装批次",     perm: "MENU_PKG_MGR" },
    { id: "pkg-report",     path: "/packaging/daily-report",  Icon: BarChart2,      label: "包装日报",     perm: "MENU_PKG_MGR" },
    { id: "pkg-except",     path: "/packaging/exceptions",    Icon: FileWarning,    label: "异常处理",     perm: "MENU_PKG_MGR" },
    { id: "pkg-printlogs",  path: "/packaging/print-logs",    Icon: ScrollText,     label: "补打日志",     perm: "MENU_PKG_MGR" },
    // 品质追溯
    { id: "ql-ov",          path: "/quality",                 Icon: ShieldCheck,    label: "质检总览",     perm: "MENU_QA_OP"   },
    { id: "ql-farm",        path: "/quality/farm",            Icon: Feather,        label: "场端质检",     perm: "MENU_QA_OP"   },
    { id: "ql-prod",        path: "/quality/product",         Icon: ShieldCheck,    label: "成品质检",     perm: "MENU_QA_OP"   },
    { id: "ql-nc",          path: "/quality/nonconformance",  Icon: AlertTriangle,  label: "不合格品处置", perm: "MENU_QA_MGR"  },
    { id: "ql-fwd",         path: "/quality/forward",         Icon: Search,         label: "正向追溯",     perm: "MENU_QA_MGR"  },
    { id: "ql-bwd",         path: "/quality/backward",        Icon: ArrowLeftRight, label: "反向追溯",     perm: "MENU_QA_MGR"  },
    { id: "ql-std",         path: "/quality/standards",       Icon: FlaskConical,   label: "质量标准",     perm: "MENU_QA_MASTER" },
  ]},

  // 3. 库存管理 — 仓储库存 + 批次库存 + 临期库存 + 损耗管理
  { id: "inventory", Icon: Warehouse, label: "库存管理", perm: "MENU_WMS_VIEW", children: [
    { id: "wh-dash",     path: "/warehouse",              Icon: LayoutDashboard, label: "库存总览",   perm: "MENU_WMS_VIEW"  },
    { id: "inv-batch",   path: "/sales2/inventory",       Icon: Layers,          label: "成品批次",   perm: "MENU_INV_BATCH" },
    { id: "inv-srcmode", path: "/warehouse/source-mode",  Icon: Settings,        label: "库存来源模式", perm: "MENU_INV_SOURCE_MODE" },
    { id: "wh-in",       path: "/warehouse/inbound",      Icon: PackagePlus,     label: "手工入库",   perm: "MENU_WMS_INOUT" },
    { id: "wh-out",      path: "/warehouse/outbound",     Icon: PackageMinus,    label: "出库管理",   perm: "MENU_WMS_INOUT" },
    { id: "wh-transfer", path: "/warehouse/transfer",     Icon: RefreshCw,       label: "调拨管理",   perm: "MENU_WMS_INOUT" },
    { id: "wh-stock",    path: "/warehouse/stocktake",    Icon: ListChecks,      label: "盘点管理",   perm: "MENU_WMS_INOUT" },
    { id: "wh-ledger",   path: "/warehouse/ledger",       Icon: ScrollText,      label: "出入库流水", perm: "MENU_WMS_VIEW"  },
    { id: "wh-query",    path: "/warehouse/query",        Icon: Search,          label: "库存查询",   perm: "MENU_WMS_VIEW"  },
    { id: "wh-expiry",   path: "/warehouse/expiry",       Icon: AlertTriangle,   label: "临期库存",   perm: "MENU_WMS_VIEW"  },
    { id: "wh-daily",    path: "/warehouse/daily-close",  Icon: ClipboardCheck,  label: "日结对账",   perm: "MENU_WMS_INOUT" },
    { id: "wh-loss",     path: "/warehouse/loss-report",  Icon: TrendingDown,    label: "损耗管理",   perm: "MENU_WMS_INOUT" },
    { id: "wh-house",    path: "/warehouse/warehouses",   Icon: Warehouse,       label: "仓库主档",   perm: "MENU_WMS_MASTER" },
    { id: "wh-zones",    path: "/warehouse/zones",        Icon: MapPinned,       label: "库区管理",   perm: "MENU_WMS_MASTER" },
    { id: "wh-loc",      path: "/warehouse/locations",    Icon: MapPin,          label: "库位管理",   perm: "MENU_WMS_MASTER" },
  ]},

  // R5: 全链追溯（鸡舍→集蛋→包装→库存→销售→客户→财务）
  { id: "traceability", path: "/traceability", Icon: Network, label: "全链追溯", perm: "MENU_TRACEABILITY_VIEW" },

  // 4. 采购管理 — Procurement V2 正式入口
  { id: "procurement", Icon: Layers3, label: "采购管理", perm: "MENU_PRC2_MASTER", children: [
    { id: "prc2-dashboard", path: "/procurement2/dashboard",         Icon: LayoutDashboard, label: "采购看板",   perm: "MENU_PRC2_DASHBOARD" },
    { id: "prc2-supplier",  path: "/procurement2/suppliers",         Icon: Globe,           label: "供应商档案", perm: "MENU_PRC2_SUPPLIER"  },
    { id: "prc2-project",   path: "/procurement2/projects",          Icon: FolderKanban,    label: "采购项目",   perm: "MENU_PRC2_PROJECT"   },
    { id: "prc2-request",   path: "/procurement2/requests",          Icon: FilePlus,        label: "采购申请",   perm: "MENU_PRC2_REQUEST"   },
    { id: "prc2-order",     path: "/procurement2/orders",            Icon: ShoppingBag,     label: "采购订单",   perm: "MENU_PRC2_ORDER"    },
    { id: "prc2-shipment",  path: "/procurement2/shipments",         Icon: Truck,           label: "物流管理",   perm: "MENU_PRC2_SHIPMENT" },
    { id: "prc2-receipt",   path: "/procurement2/receipts",          Icon: PackageCheck,    label: "收货管理",   perm: "MENU_PRC2_RECEIPT"  },
    { id: "prc2-payment",   path: "/procurement2/payments",          Icon: Banknote,        label: "付款管理",   perm: "MENU_PRC2_PAYMENT"  },
    { id: "prc2-fund",      path: "/procurement2/shareholder-funds", Icon: DollarSign,      label: "股东资金",   perm: "MENU_PRC2_FUND"     },
    { id: "prc2-init",      path: "/procurement2/init",              Icon: UploadCloud,     label: "历史初始化", perm: "MENU_PRC2_INIT"     },
  ]},

  // 5. 销售管理 — 客户 + 价格 + 订单 + 配送 + 退货 + 信用 + 直营店
  { id: "sales", Icon: ShoppingCart, label: "销售管理", perm: "MENU_SALES2", children: [
    { id: "s2-overview",    path: "/sales2",             Icon: LayoutDashboard, label: "销售总览",   perm: "MENU_SALES2_DASHBOARD", altPerms: ["MENU_SALES2_ORDER", "MENU_SALES2_CUSTOMER", "MENU_SALES2_PRICE", "MENU_SALES2_DELIVERY", "MENU_SALES2_RETURN", "MENU_SALES2_CHANNEL", "MENU_SALES2_REPORT"] },
    { id: "s2-customers",   path: "/sales2/customers",   Icon: Users,           label: "客户管理",   perm: "MENU_SALES2_CUSTOMER"  },
    { id: "s2-channels",    path: "/sales2/channels",    Icon: Network,         label: "渠道管理",   perm: "MENU_SALES2_CHANNEL"   },
    { id: "s2-pricing",     path: "/sales2/pricing",     Icon: Tag,             label: "价格管理",   perm: "MENU_SALES2_PRICE"     },
    { id: "s2-orders",      path: "/sales2/orders",      Icon: ShoppingCart,    label: "销售订单",   perm: "MENU_SALES2_ORDER"     },
    { id: "s2-delivery",    path: "/sales2/delivery",    Icon: Truck,           label: "配送管理",   perm: "MENU_SALES2_DELIVERY"  },
    { id: "s2-returns",     path: "/sales2/returns",     Icon: RefreshCw,       label: "退货管理",   perm: "MENU_SALES2_RETURN"    },
    { id: "s2-credit",      path: "/sales2/credit",      Icon: CreditCard,      label: "信用管理",   perm: "MENU_SALES2_CREDIT"    },
    { id: "s2-pos",         path: "/store-pos",          Icon: Banknote,        label: "直营店收银", perm: "MENU_STORE_POS"        },
    { id: "s2-store-payment", path: "/store-payment",     Icon: Landmark,        label: "统一收款",   perm: "MENU_STORE_PAYMENT"    },
    { id: "s2-store-wb",    path: "/store",              Icon: Store,           label: "门店工作台", perm: "MENU_STORE_MGR"        },
    { id: "s2-store-recv",  path: "/store/receiving",    Icon: PackagePlus,     label: "收货验收",   perm: "MENU_STORE_MGR"        },
    { id: "s2-store-inv",   path: "/store/inventory",    Icon: Archive,         label: "门店库存",   perm: "MENU_STORE_MGR"        },
    { id: "s2-store-rep",   path: "/store/replenish",    Icon: ShoppingBag,     label: "补货申请",   perm: "MENU_STORE_MGR"        },
    { id: "s2-store-loss",  path: "/store/losses",       Icon: Minus,           label: "损耗记录",   perm: "MENU_STORE_MGR"        },
    { id: "s2-store-daily", path: "/store/daily",        Icon: Receipt,         label: "门店日结",   perm: "MENU_STORE_MGR"        },
    { id: "s2-inventory",   path: "/sales2/inventory",   Icon: Archive,         label: "鸡蛋库存",   perm: "MENU_SALES2_INVENTORY" },
    { id: "s2-reports",     path: "/sales2/reports",     Icon: BarChart2,       label: "销售分析",   perm: "MENU_SALES2_REPORT"    },
  ]},

  // 6. 财务管理 — 应收 + 应付 + 资金 + 费用 + 报表
  { id: "finance", Icon: Wallet, label: "财务管理", perm: "MENU_FIN2", children: [
    { id: "f2-dash",      path: "/finance2",                    Icon: LayoutDashboard, label: "财务总览",   perm: "MENU_FIN2_DASHBOARD"  },
    { id: "f2-ar",        path: "/finance2/ar",                 Icon: TrendingUp,      label: "应收账款",   perm: "MENU_FIN2_AR"         },
    { id: "f2-ar-ledger", path: "/finance2/ar-ledger",          Icon: BookOpen,        label: "应收总账",   perm: "MENU_FIN2_AR_LEDGER"  },
    { id: "f2-ar-recon",  path: "/finance2/ar-reconciliation",  Icon: Scale,           label: "应收三方对账", perm: "MENU_FIN2_AR_LEDGER"  },
    { id: "f2-chanjet-sync", path: "/finance2/chanjet-sync",    Icon: BookOpen,        label: "好业财同步",  perm: "MENU_FIN2_AR"         },
    { id: "f2-ap",        path: "/finance2/ap",                 Icon: TrendingDown,    label: "应付账款",   perm: "MENU_FIN2_AP"         },
    { id: "f2-cash",      path: "/finance2/cash-accounts",      Icon: Wallet,          label: "资金账户",   perm: "MENU_FIN2_CASH_VIEW" },
    { id: "f2-fund",      path: "/finance2/fund-transfers",     Icon: ArrowLeftRight,  label: "资金调拨",   perm: "MENU_FIN2_CASH_TRANSFER" },
    { id: "f2-sf",        path: "/finance2/shareholder-funds",  Icon: Users,           label: "股东资金",   perm: "MENU_FIN2_SHAREHOLDER" },
    { id: "f2-expense",   path: "/finance2/expenses",           Icon: Receipt,         label: "费用管理",   perm: "MENU_FIN2_EXPENSE"    },
    { id: "f2-reimburse", path: "/finance2/reimbursements",     Icon: ScrollText,      label: "报销管理",   perm: "MENU_FIN2_REIMBURSE"  },
    { id: "f2-reports",   path: "/finance2/reports",            Icon: PieChart,        label: "财务报表",   perm: "MENU_FIN2_REPORT"     },
  ]},

  // 6b. 股东权益中心（Shareholder Runtime Phase 1）
  { id: "shareholder", Icon: Users, label: "股东权益中心", perm: "MENU_SHAREHOLDER_VIEW", children: [
    { id: "shr-dashboard", path: "/shareholders/dashboard",     Icon: PieChart,       label: "股东驾驶舱", perm: "MENU_SHAREHOLDER_DASHBOARD"   },
    { id: "shr-capital",   path: "/shareholders/capital",       Icon: Wallet,         label: "资本流管理", perm: "MENU_SHAREHOLDER_CAPITAL"     },
    { id: "shr-projects",  path: "/shareholders/projects",      Icon: LayoutDashboard,label: "股东项目",   perm: "MENU_SHAREHOLDER_VIEW"        },
    { id: "shr-equity",    path: "/shareholders/equity",        Icon: PieChart,       label: "股权结构",   perm: "MENU_SHAREHOLDER_VIEW"        },
    { id: "shr-contrib",   path: "/shareholders/contributions", Icon: Wallet,         label: "出资台账",   perm: "MENU_SHAREHOLDER_CONTRIBUTION"},
    { id: "shr-scopes",    path: "/shareholders/scopes",        Icon: Users,          label: "查看范围",   perm: "MENU_SHAREHOLDER_SCOPE"       },
  ]},

  // 7. 审批中心 — 工作流统一入口（原"工作流"改名）
  { id: "approval", Icon: ListChecks, label: "审批中心", perm: "MENU_WORKFLOW", children: [
    { id: "ap-todos",   path: "/workflow/todos",         aliases: ["/workflow/tasks/todo"], Icon: ClipboardList,  label: "我的待办",   perm: "MENU_WORKFLOW_TODO"    },
    { id: "ap-history", path: "/workflow/history",        aliases: ["/workflow/tasks/done"], Icon: History,        label: "我的已办",   perm: "MENU_WORKFLOW_HISTORY" },
    { id: "ap-notify",  path: "/notifications",           Icon: Bell,           label: "通知中心",   perm: "MENU_WORKFLOW_NOTIFY"  },
    { id: "ap-flows",   path: "/settings/approval-flows", Icon: Network,        label: "流程配置",   perm: "MENU_WORKFLOW_CONFIG",  requiredPerm: "E" },
    { id: "ap-rules",   path: "/settings/approval-rules", Icon: Settings2,      label: "审批规则",   perm: "MENU_WORKFLOW_RULES",   requiredPerm: "C" },
    { id: "ap-forms",   path: "/workflow/forms/runtime",  Icon: FileText,       label: "表单管理",   perm: "MENU_WORKFLOW_FORM",    requiredPerm: "E" },
    { id: "ap-metrics", path: "/workflow/metrics",        Icon: BarChart3,      label: "审批看板",   perm: "MENU_WORKFLOW_METRICS", requiredPerm: "X" },
  ]},

  // 8. 经营分析 — BI 驾驶舱 + 多维报表（Sales V2 Phase 8 全维度）
  { id: "analytics", Icon: TrendingUp, label: "经营分析", perm: "MENU_DASHBOARD", children: [
    { id: "an-bi",       path: "/analytics",             Icon: LayoutDashboard, label: "经营总览",   perm: "MENU_DASHBOARD"       },
    { id: "an-sales",    path: "/sales2/reports",        Icon: TrendingUp,      label: "销售分析",   perm: "MENU_SALES2_REPORT"   },
    { id: "an-channel",  path: "/sales2/reports",        Icon: Network,         label: "渠道分析",   perm: "MENU_SALES2_CHANNEL"  },
    { id: "an-inv",      path: "/analytics/inventory",   Icon: PieChart,        label: "库存分析",   perm: "MENU_DASHBOARD"       },
    { id: "an-delivery", path: "/sales2/delivery",       Icon: Truck,           label: "配送分析",   perm: "MENU_SALES2_DELIVERY" },
    { id: "an-finance",  path: "/finance2/reports",      Icon: DollarSign,      label: "财务分析",   perm: "MENU_FIN2_REPORT"     },
    { id: "an-credit",   path: "/sales2/credit",         Icon: CreditCard,      label: "信用分析",   perm: "MENU_SALES2_CREDIT"   },
  ]},

  // 9. 主数据中心 — 全量主数据统一入口
  // G56-B RBAC 项级原子化：主数据每实体用专属码 MENU_MD_<TYPE>。
  //   前端菜单不再用 MENU_MASTER_DATA 展示全部叶子；按实体授权者只见对应叶子。
  //   具有全局管理职责的角色应显式持有对应 MENU_MD_* 原子权限或 * 通配。
  //   组织/公司/事业群/数据范围已拆为原子码；字典→MENU_SETTINGS_DATA；概览=MENU_MD_CENTER；待审批按相关主数据叶子权限可见。
  { id: "master-data", Icon: Database, label: "主数据中心", perm: "MENU_MASTER_DATA", children: [
    { id: "mdc-overview",   path: "/master-data",                  Icon: LayoutDashboard, label: "主数据概览",   perm: "MENU_MD_CENTER" },
    { id: "mdc-orgs",       path: "/master-data/organizations",    Icon: Network,         label: "组织架构",     perm: "MENU_MD_ORG" },
    { id: "mdc-bu",         path: "/master-data/business-units",   Icon: Network,         label: "事业群",       perm: "MENU_MD_BUSINESS_UNIT" },
    { id: "mdc-companies",  path: "/master-data/companies",        Icon: Building,        label: "公司档案",     perm: "MENU_MD_COMPANY" },
    { id: "mdc-projects",   path: "/master-data/projects",         Icon: FolderKanban,    label: "项目档案",     perm: "MENU_MD_PROJECT" },
    { id: "mdc-customers",  path: "/master-data/customers",        Icon: Users,           label: "客户档案",     perm: "MENU_MD_CUSTOMER" },
    { id: "mdc-suppliers",  path: "/master-data/suppliers",        Icon: Globe,           label: "供应商档案",   perm: "MENU_MD_SUPPLIER" },
    { id: "mdc-materials",  path: "/master-data/materials",        Icon: Package,         label: "物料档案",     perm: "MENU_MD_MATERIAL" },
    { id: "mdc-products",   path: "/master-data/products",         Icon: Egg,             label: "产品档案",     perm: "MENU_MD_PRODUCT" },
    { id: "mdc-grades",     path: "/master-data/product-grades",   Icon: Tag,             label: "等级档案",     perm: "MENU_MD_GRADE" },
    { id: "mdc-pkgspecs",   path: "/master-data/packaging-specs",  Icon: Package,         label: "包装规格",     perm: "MENU_MD_PACKAGING" },
    { id: "mdc-skus",       path: "/master-data/product-skus",     Icon: Layers,          label: "SKU档案",      perm: "MENU_MD_SKU" },
    { id: "mdc-warehouses", path: "/master-data/warehouses",       Icon: Warehouse,       label: "仓库档案",     perm: "MENU_MD_WAREHOUSE" },
    { id: "mdc-stores",     path: "/master-data/stores",           Icon: Store,           label: "门店档案",     perm: "MENU_MD_STORE" },
    { id: "mdc-drivers",    path: "/master-data/drivers",          Icon: UserCheck,       label: "司机档案",     perm: "MENU_MD_DRIVER" },
    { id: "mdc-vehicles",   path: "/master-data/vehicles",         Icon: Car,             label: "车辆档案",     perm: "MENU_MD_VEHICLE" },
    { id: "mdc-cash",       path: "/master-data/cash-accounts",    Icon: Wallet,          label: "资金账户档案", perm: "MENU_MD_CASH_ACCOUNT" },
    { id: "mdc-bank",       path: "/master-data/bank-accounts",    Icon: Landmark,        label: "银行账户中心", perm: "MENU_MD_BANK_ACCOUNT" },
    { id: "mdc-dict",       path: "/master-data/dictionaries",     Icon: BookOpen,        label: "数据字典中心", perm: "MENU_SETTINGS_DATA"   },
    { id: "mdc-pending",    path: "/master-data/pending",          Icon: Landmark,        label: "主数据待审批", perm: "MENU_MD_CUSTOMER",      altPerms: [
      "MENU_MD_SUPPLIER", "MENU_MD_PROJECT", "MENU_MD_MATERIAL", "MENU_MD_PRODUCT",
      "MENU_MD_GRADE", "MENU_MD_PACKAGING", "MENU_MD_SKU", "MENU_MD_WAREHOUSE",
      "MENU_MD_STORE", "MENU_MD_DRIVER", "MENU_MD_VEHICLE", "MENU_MD_CASH_ACCOUNT",
      "MENU_MD_BANK_ACCOUNT", "MENU_MD_ORG", "MENU_MD_COMPANY", "MENU_SETTINGS_DATA",
    ] },  // G3-B 审批
    { id: "mdc-quality",    path: "/master-data/quality",          Icon: ShieldCheck,     label: "数据质量中心", perm: "MENU_MD_QUALITY"      },  // G1 质量看板
    // G80 Phase 2：用户组织权限已并入「系统设置 · 用户管理」(/settings/users)，此入口下线
  ]},

  // 10. 系统设置 — 用户/角色/权限/安全
  { id: "settings", Icon: Settings, label: "系统设置", perm: "MENU_SETTINGS_USER", children: [
    { id: "stg-users",       path: "/settings/users",         Icon: Users,       label: "用户管理",   perm: "MENU_SETTINGS_USER" },
    { id: "stg-roles",       path: "/settings/roles",         Icon: Shield,      label: "角色与权限", perm: "MENU_SETTINGS_ROLE" },
    { id: "stg-psets",       path: "/settings/permission-sets", Icon: Layers,    label: "权限集",     perm: "MENU_SETTINGS_PERMISSION_SET" },
    { id: "stg-data-scopes", path: "/settings/data-scopes",   Icon: ShieldCheck, label: "数据范围规则", perm: "MENU_SETTINGS_DATA_SCOPE" },
    { id: "stg-params",      path: "/settings/master-data",   Icon: Settings2,   label: "系统参数",   perm: "MENU_SETTINGS_CONFIG" },
    { id: "stg-security",    path: "/settings/security",      Icon: ShieldCheck, label: "安全策略",   perm: "MENU_SETTINGS_SECURITY" },
    { id: "stg-audit",       path: "/settings/audit-log",     Icon: ScrollText,  label: "审计日志",   perm: "MENU_SETTINGS_AUDIT" },
    { id: "stg-brand",       path: "/settings/brand",         Icon: Star,        label: "品牌配置",   perm: "MENU_SETTINGS_BRAND" },
    { id: "stg-pda",         path: "/settings/pda-terminals", Icon: Smartphone,  label: "终端配置",   perm: "MENU_SETTINGS_TERMINAL" },
    { id: "stg-pos",         path: "/settings/pos-config",    Icon: Store,       label: "收银配置",   perm: "MENU_SETTINGS_POS" },
    { id: "stg-stock-cfg",   path: "/settings/store-stock",       Icon: ToggleRight, label: "库存分账",   perm: "MENU_SETTINGS_STOCK" },
    { id: "stg-notify",      path: "/settings/notifications",     Icon: Bell,        label: "通知设置",   perm: "MENU_SETTINGS_NOTIFY" },
    { id: "stg-online-users", path: "/settings/online-users",     Icon: Users,       label: "在线用户",   perm: "MENU_SETTINGS_ONLINE_USER" },
  ]},

  // 11. 验收试运行
  { id: "uat", Icon: ClipboardCheck, label: "验收试运行", perm: "MENU_UAT", children: [
    { id: "uat-home",      path: "/uat",       Icon: ClipboardCheck, label: "验收管理",   perm: "MENU_UAT" },
    { id: "uat-pilot-run", path: "/pilot-run", Icon: Rocket,         label: "试运行项目", perm: "MENU_UAT" },
  ]},

  // 12. 系统运维
  { id: "sysops", Icon: Server, label: "系统运维", perm: "MENU_SYS_MONITOR", children: [
    { id: "sysops-monitor", path: "/system/health",      Icon: Activity,    label: "系统健康",   perm: "MENU_SYS_MONITOR" },
    { id: "sysops-alerts",  path: "/system/alerts",      Icon: ShieldAlert, label: "告警中心",   perm: "MENU_SYS_MONITOR" },
    { id: "sysops-errors",  path: "/system/error-logs",  Icon: FileWarning, label: "错误日志",   perm: "MENU_SYS_MONITOR" },
    { id: "sysops-configs", path: "/system/configs",     Icon: Settings2,   label: "配置治理",   perm: "MENU_SETTINGS_CONFIG"  },
    { id: "sysops-backup",  path: "/system/backup",      Icon: Database,    label: "备份策略",   perm: "MENU_SETTINGS_CONFIG"  },
  ]},

];

/**
 * 权限检查 — 委托给 AuthContext.hasPermission（G6 后唯一权威）
 * 链路：JWT.permissions → AuthContext → hasPermission(menuCode)
 *   1. perm 为 null/undefined → true（无要求）
 *   2. permissions 含 '*' → true（admin 通配）
 *   3. permissions 含 'MENU_XXX:V' → true（命中）
 *   4. 否则 → false（不渲染该菜单项）
 */

export type PermissionChecker = (menuCode?: string | null, permCode?: string) => boolean;

export function canAccessMenuItem(item: MenuItem, hasPermission: PermissionChecker): boolean {
  if (!item.perm) return true;
  if (hasPermission(item.perm, item.requiredPerm)) return true;
  if (item.superPerm && hasPermission(item.superPerm)) return true;
  return item.altPerms?.some(code => hasPermission(code, item.requiredPerm)) ?? false;
}

export function getVisibleMenu(hasPermission: PermissionChecker): MenuItem[] {
  return MENU.map(item => {
    if (item.children) {
      const kids = item.children.filter(child => canAccessMenuItem(child, hasPermission));
      if (!kids.length) return null;
      return { ...item, children: kids };
    }
    if (!canAccessMenuItem(item, hasPermission)) return null;
    return item;
  }).filter(Boolean) as MenuItem[];
}

export function getFirstAccessiblePath(hasPermission: PermissionChecker, groupId?: string): string | undefined {
  const menu = getVisibleMenu(hasPermission);
  const roots = groupId ? menu.filter(item => item.id === groupId) : menu;
  for (const item of roots) {
    if (item.path) return item.path;
    const childPath = item.children?.find(child => child.path)?.path;
    if (childPath) return childPath;
  }
  return undefined;
}

export function findMenuItemByPath(pathname: string): MenuItem | undefined {
  let best: MenuItem | undefined;
  const considerPath = (item: MenuItem, path: string | undefined) => {
    if (!path) return;
    if (pathname === path || pathname.startsWith(path + "/")) {
      const bestLen = best?.path?.length ?? 0;
      if (path.length > bestLen) best = item;
    }
  };
  const consider = (item: MenuItem) => {
    considerPath(item, item.path);
    for (const alias of item.aliases ?? []) considerPath(item, alias);
  };
  for (const item of MENU) {
    consider(item);
    for (const child of item.children ?? []) consider(child);
  }
  return best;
}

export function canAccessPath(pathname: string, hasPermission: PermissionChecker): boolean {
  const item = findMenuItemByPath(pathname);
  if (!item) return true;
  return canAccessMenuItem(item, hasPermission);
}

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

  const canSeeMenuItem = useCallback((item: MenuItem) => canAccessMenuItem(item, hasPermission), [hasPermission]);

  // G12 父守卫 OR 逻辑：父项 perm 不再严格检查，子项过滤后非空即显示父项。
  // 之前问题：宋明光持 MENU_FIN2_CASH 但缺 MENU_FIN2 父权 → 整段财务节点被剔除。
  // PBAC 颗粒度原则：父节点只是分组容器，权限以叶子为准。
  // G8 性能：visibleMenu 仅在 user.permissions 变化时重算。
  const visibleMenu = useMemo(() => getVisibleMenu(hasPermission), [hasPermission]);

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
        boxShadow: isOverlay ? "4px 0 24px var(--overlay-black-50)" : "none",
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
            <div className={styles.brandSub}>Phoenix ERP</div>
          </div>
        )}
      </div>

      {/* User */}
      <div className={styles.userArea} style={{ justifyContent: expanded_ ? "flex-start" : "center" }}>
        <div className={styles.avatar} title={!expanded_ ? (user?.name ?? "") : undefined}>{avatarChar}</div>
        {expanded_ && (
          <div className={styles.userInfo}>
            <div className={styles.userName}>{user?.name}</div>
            <div className={styles.userRole}>{user?.roleNameZh || user?.role}</div>
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
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  aria-label={t('menu.' + item.id, item.label)}
                  className={`${styles.groupHeader} ${isThisActive ? styles.groupActive : ""}`}
                  onClick={() => {
                    toggle(item.id);
                    router.push(item.children![0].path!);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(item.id);
                      router.push(item.children![0].path!);
                    }
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
                  {/* Terminal 作业台入口：仅在生产管理分组顶部显示 */}
                  {item.id === "production" && canSeeMenuItem({
                    id: "terminal-packaging",
                    path: "/terminal/packaging/dashboard",
                    Icon: Zap,
                    label: "包装作业台",
                    perm: "MENU_PKG_OP",
                    altPerms: ["MENU_PKG_MGR"],
                  }) && (
                    <a
                      href="/terminal/packaging/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "9px 12px 9px 28px",
                        margin: "6px 8px 2px",
                        borderRadius: 8,
                        background: "linear-gradient(135deg, var(--status-warning-bg-deep), var(--status-warning-bg-faint))",
                        border: "1px solid var(--status-warning-bg-strong)",
                        color: "var(--status-warning)",
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
        <Link href="/profile" prefetch={false} className={styles.profileLink}>
          <Settings size={13} />
          <span>{t('layout.profile_link', '个人中心 / 修改密码')}</span>
        </Link>
      )}
    </aside>
  );
}

/**
 * 顶栏标题源：从侧边栏 MENU(中文 label)按路径反查最深匹配项。
 * 杜绝顶栏回退英文路由名（/master-data/organizations → 组织架构，而非 organizations）。
 * 单一来源：所有中心的顶栏标题与侧边栏一致，无需另维护 i18n key。
 */
export function pathTitle(pathname: string): string | undefined {
  let best: { path: string; label: string } | undefined;
  const consider = (path: string | undefined, label: string) => {
    if (!path) return;
    if (pathname === path || pathname.startsWith(path + "/")) {
      if (!best || path.length > best.path.length) best = { path, label };
    }
  };
  for (const item of MENU) {
    consider(item.path, item.label);
    for (const alias of item.aliases ?? []) consider(alias, item.label);
    for (const c of item.children ?? []) consider(c.path, c.label);
    for (const c of item.children ?? []) {
      for (const alias of c.aliases ?? []) consider(alias, c.label);
    }
  }
  return best?.label;
}

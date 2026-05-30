"use client";
/**
 * 主数据中心 — 统一导航门户
 * ==========================
 * 汇聚全系统基础档案入口，按权限过滤可见卡片。
 * 颜色来源：design-tokens.ts ACCENT_MAP，无硬编码 hex。
 */
import Link from "next/link";
import {
  Users, Globe, UserCheck, Car, Warehouse, Wallet,
  Network, Building, FolderKanban, BookOpen,
  LayoutDashboard, ArrowRight, Tag, Package, Layers,
} from "lucide-react";
import { ACCENT_MAP, type AccentColor } from "@/lib/design-tokens";

interface CardDef {
  icon:        React.ElementType;
  title:       string;
  desc:        string;
  href:        string;
  perm:        string;
  accentColor: AccentColor;
}

const CARDS: CardDef[] = [
  {
    icon: Users,        title: "客户档案",      accentColor: "blue",
    desc: "直营店 / 经销商 / 代理商 / 大客户 · 信用额度",
    href: "/master-data/customers",   perm: "MENU_SALES2_CUSTOMER",
  },
  {
    icon: Globe,        title: "供应商档案",    accentColor: "green",
    desc: "饲料 / 设备 / 兽药 / 包装 · 多国多币种",
    href: "/master-data/suppliers",   perm: "MENU_PRC2_MASTER",
  },
  {
    icon: UserCheck,    title: "司机档案",      accentColor: "amber",
    desc: "配送司机 · 驾照 · 联系方式 · 状态",
    href: "/master-data/drivers",     perm: "MENU_SALES2_DELIVERY",
  },
  {
    icon: Car,          title: "车辆档案",      accentColor: "amber",
    desc: "配送车辆 · 车牌 · 载重 · 运营状态",
    href: "/master-data/vehicles",    perm: "MENU_SALES2_DELIVERY",
  },
  {
    icon: Warehouse,    title: "仓库档案",      accentColor: "violet",
    desc: "仓库主档 · 库区 · 地址 · 负责人",
    href: "/master-data/warehouses",  perm: "MENU_WMS_MASTER",
  },
  {
    icon: Wallet,       title: "资金账户档案",  accentColor: "cyan",
    desc: "现金账户 · 银行账户 · 余额监控",
    href: "/master-data/cash-accounts", perm: "MENU_FIN2_CASH",
  },
  {
    icon: Building,     title: "公司档案",      accentColor: "slate",
    desc: "集团公司 · 子公司 · 分支机构",
    href: "/master-data/companies",   perm: "MENU_MASTER",
  },
  {
    icon: Network,      title: "组织架构",      accentColor: "indigo",
    desc: "部门 / 区域 / 层级汇报关系",
    href: "/master-data/organizations", perm: "MENU_SYS_ORG",
  },
  {
    icon: FolderKanban, title: "项目档案",      accentColor: "teal",
    desc: "采购项目 · 预算 · 归属公司",
    href: "/master-data/projects",    perm: "MENU_PRC2_MASTER",
  },
  {
    icon: BookOpen,     title: "系统字典",      accentColor: "violet",
    desc: "等级 / 规格 / 原因 / 类型 · 统一编码维护",
    href: "/master-data/dictionaries", perm: "MENU_SETTINGS_DATA",
  },
  {
    icon: Tag,          title: "产品等级档案",  accentColor: "amber",
    desc: "AA / A / B / C / DIRTY / CRACKED — 统一 grade_code 值集",
    href: "/master-data/product-grades",   perm: "MENU_MASTER_GRADE",
  },
  {
    icon: Package,      title: "包装规格档案",  accentColor: "green",
    desc: "TRAY30 / BOX360 / GIFT12 — 规格主数据含单位换算",
    href: "/master-data/packaging-specs",  perm: "MENU_MASTER_PACKAGING",
  },
  {
    icon: Layers,       title: "SKU 档案",      accentColor: "blue",
    desc: "产品 × 等级 × 规格 — 为价格/库存/销售统一维度",
    href: "/master-data/product-skus",     perm: "MENU_MASTER_SKU",
  },
];

export default function MasterDataHubPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 p-8 md:p-10">
      {/* 页头 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center">
            <LayoutDashboard size={20} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">主数据中心</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 ml-12">
          统一管理全系统业务基础档案 · 客户 · 供应商 · 司机 · 车辆 · 仓库 · 账户 · 组织
        </p>
      </div>

      {/* 卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {CARDS.map(({ icon: Icon, title, desc, href, accentColor }) => {
          const ac = ACCENT_MAP[accentColor];
          return (
            <Link key={href} href={href} className="block group">
              <div className={[
                "rounded-2xl border p-5 shadow-sm",
                "bg-white dark:bg-slate-800",
                "hover:shadow-md hover:-translate-y-0.5",
                "transition-all duration-150",
                ac.border,
              ].join(" ")}>
                {/* 图标 */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${ac.icon}`}>
                  <Icon size={20} className={ac.text} />
                </div>
                {/* 标题 */}
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1.5">{title}</div>
                {/* 描述 */}
                <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">{desc}</div>
                {/* 进入链接 */}
                <div className={`flex items-center gap-1 text-xs font-semibold ${ac.text}`}>
                  <span>进入管理</span>
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

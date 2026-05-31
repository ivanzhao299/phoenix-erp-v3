"use client";
/**
 * 主数据中心 — 统一导航门户 · Design System V2
 * ================================================
 * · 使用全局 NavCard 组件，保持与其他门户页一致的卡片规格
 */
import {
  Users, Globe, UserCheck, Car, Warehouse, Wallet,
  Network, Building, FolderKanban, BookOpen,
  LayoutDashboard, Tag, Package, Layers, ShieldCheck,
} from "lucide-react";
import { NavCard, type NavCardAccent } from "@/components/ui/NavCard";

interface CardDef {
  icon:   React.ElementType;
  title:  string;
  desc:   string;
  href:   string;
  accent: NavCardAccent;
}

const CARDS: CardDef[] = [
  { icon: Users,        title: "客户档案",      accent: "blue",
    desc: "直营店 / 经销商 / 代理商 / 大客户 · 信用额度",
    href: "/master-data/customers" },
  { icon: Globe,        title: "供应商档案",    accent: "green",
    desc: "饲料 / 设备 / 兽药 / 包装 · 多国多币种",
    href: "/master-data/suppliers" },
  { icon: UserCheck,    title: "司机档案",      accent: "amber",
    desc: "配送司机 · 驾照 · 联系方式 · 状态",
    href: "/master-data/drivers" },
  { icon: Car,          title: "车辆档案",      accent: "amber",
    desc: "配送车辆 · 车牌 · 载重 · 运营状态",
    href: "/master-data/vehicles" },
  { icon: Warehouse,    title: "仓库档案",      accent: "violet",
    desc: "仓库主档 · 库区 · 地址 · 负责人",
    href: "/master-data/warehouses" },
  { icon: Wallet,       title: "资金账户档案",  accent: "cyan",
    desc: "现金账户 · 银行账户 · 余额监控",
    href: "/master-data/cash-accounts" },
  { icon: Building,     title: "公司档案",      accent: "slate",
    desc: "集团公司 · 子公司 · 分支机构",
    href: "/master-data/companies" },
  { icon: Network,      title: "组织架构",      accent: "indigo",
    desc: "部门 / 区域 / 层级汇报关系",
    href: "/master-data/organizations" },
  { icon: FolderKanban, title: "项目档案",      accent: "teal",
    desc: "采购项目 · 预算 · 归属公司",
    href: "/master-data/projects" },
  { icon: BookOpen,     title: "系统字典",      accent: "violet",
    desc: "等级 / 规格 / 原因 / 类型 · 统一编码维护",
    href: "/master-data/dictionaries" },
  { icon: Tag,          title: "产品等级档案",  accent: "amber",
    desc: "AA / A / B / C / DIRTY / CRACKED — 统一 grade_code 值集",
    href: "/master-data/product-grades" },
  { icon: Package,      title: "包装规格档案",  accent: "green",
    desc: "TRAY30 / BOX360 / GIFT12 — 规格主数据含单位换算",
    href: "/master-data/packaging-specs" },
  { icon: Layers,       title: "SKU 档案",      accent: "blue",
    desc: "产品 × 等级 × 规格 — 为价格/库存/销售统一维度",
    href: "/master-data/product-skus" },
  { icon: ShieldCheck,  title: "用户组织权限",  accent: "indigo",
    desc: "用户与组织绑定 · 数据可见范围 · 跨组织权限管理",
    href: "/master-data/user-orgs" },
];

export default function MasterDataHubPage() {
  return (
    <div>
      {/* 页头 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
            <LayoutDashboard size={22} className="text-brand" />
          </div>
          <h1 className="text-xl font-bold text-text">主数据中心</h1>
        </div>
        <p className="text-sm text-text-muted ml-[52px]">
          统一管理全系统业务基础档案 · 客户 · 供应商 · 司机 · 车辆 · 仓库 · 账户 · 组织
        </p>
      </div>

      {/* 卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {CARDS.map(({ icon, title, desc, href, accent }) => (
          <NavCard
            key={href}
            icon={icon}
            title={title}
            description={desc}
            href={href}
            accent={accent}
          />
        ))}
      </div>
    </div>
  );
}

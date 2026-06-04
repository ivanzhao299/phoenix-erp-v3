"use client";
/**
 * 主数据中心 — 统一导航门户（G5.5-C 重构）
 * ════════════════════════════════════════════════════════
 * · 按 7 大中心分组：组织 / 商业主体 / 产品 / 仓储物流 / 财务主数据 / 治理
 * · 全部卡片直达 Runtime 委托页或治理中心
 */
import {
  Users, Globe, UserCheck, Car, Warehouse, Wallet,
  Network, Building, FolderKanban, BookOpen,
  LayoutDashboard, Tag, Package, Layers, ShieldCheck,
  Store, Egg, Banknote, CheckSquare, Activity,
} from "lucide-react";
import { NavCard, type NavCardAccent } from "@/components/ui/NavCard";

interface CardDef {
  icon:   React.ElementType;
  title:  string;
  desc:   string;
  href:   string;
  accent: NavCardAccent;
}

interface CenterGroup {
  key: string;
  title: string;
  subtitle: string;
  cards: CardDef[];
}

// G5.5-C：7 大中心分组
const GROUPS: CenterGroup[] = [
  {
    key: "org",
    title: "组织中心",
    subtitle: "集团 / 公司 / 部门 / 用户授权 — 数据安全边界",
    cards: [
      { icon: Network,     title: "组织架构",       accent: "indigo", desc: "集团 → 公司 → BU → 部门 · 层级权限",  href: "/master-data/organizations" },
      { icon: Building,    title: "公司档案",       accent: "slate",  desc: "集团/子公司/分支机构 · 公司主数据",     href: "/master-data/companies" },
      { icon: FolderKanban,title: "项目档案",       accent: "teal",   desc: "采购/股东出资项目 · 编码自动 PRJ-XXX",  href: "/master-data/projects" },
      { icon: ShieldCheck, title: "用户组织权限",    accent: "indigo", desc: "用户绑定 · DataScope 4 维度",          href: "/master-data/user-orgs" },
    ],
  },
  {
    key: "biz",
    title: "商业主体中心",
    subtitle: "客户 / 供应商 / 门店 — 业务往来主体",
    cards: [
      { icon: Users, title: "客户档案",  accent: "blue",  desc: "客户主数据 · CUS-XXXXX · 全 5 态生命周期",     href: "/master-data/customers" },
      { icon: Globe, title: "供应商档案", accent: "green", desc: "供应商主数据 · SUP-XXXXX · 跨境多币种",        href: "/master-data/suppliers" },
      { icon: Store, title: "门店档案",   accent: "amber", desc: "门店主数据 · STR-XXXXX · POS/销售引用源",      href: "/master-data/stores" },
    ],
  },
  {
    key: "product",
    title: "产品中心",
    subtitle: "产品 / 等级 / 规格 / SKU — 全链路物料统一",
    cards: [
      { icon: Egg,    title: "产品档案",   accent: "amber", desc: "产品 SPU · PRD-XXXXX · SKU 父对象",         href: "/master-data/products" },
      { icon: Tag,    title: "产品等级",   accent: "amber", desc: "等级主数据 · GRD-XXX · SKU 三键之一",        href: "/master-data/product-grades" },
      { icon: Package,title: "包装规格",   accent: "green", desc: "规格主数据 · SPEC-XXXX · SKU 三键之一",       href: "/master-data/packaging-specs" },
      { icon: Layers, title: "SKU 档案",  accent: "blue",  desc: "SKU 主档 · 全链路单据物料统一引用源",         href: "/master-data/product-skus" },
    ],
  },
  {
    key: "wms",
    title: "仓储 & 物流中心",
    subtitle: "仓库 / 司机 / 车辆 — WarehouseScope 数据源",
    cards: [
      { icon: Warehouse, title: "仓库档案", accent: "violet", desc: "WMS 仓库 · WH-XXXX · 含 WarehouseScope",  href: "/master-data/warehouses" },
      { icon: UserCheck, title: "司机档案", accent: "amber",  desc: "销售/配送司机 · 配送单引用源",            href: "/master-data/drivers" },
      { icon: Car,       title: "车辆档案", accent: "amber",  desc: "销售/配送车辆 · 配送单引用源",            href: "/master-data/vehicles" },
    ],
  },
  {
    key: "fin",
    title: "财务主数据中心",
    subtitle: "资金账户 / 银行账户 — 财务/对账主数据",
    cards: [
      { icon: Wallet,   title: "资金账户档案",   accent: "cyan", desc: "ERP 资金账户 · CASH-XXXXX · 实时余额",   href: "/master-data/cash-accounts" },
      { icon: Banknote, title: "银行账户中心",   accent: "cyan", desc: "境外/跨境结算 · BANK-XXXXX · SWIFT/IBAN", href: "/master-data/bank-accounts" },
    ],
  },
  {
    key: "gov",
    title: "治理中心",
    subtitle: "字典 / 审批 / 质量 — 主数据治理闭环",
    cards: [
      { icon: BookOpen,   title: "数据字典中心",     accent: "violet", desc: "sys_dict 统一管理 · 35 字典类型",      href: "/master-data/dictionaries" },
      { icon: CheckSquare,title: "主数据待审批",     accent: "amber",  desc: "Workflow 审批入口 · 主数据变更",         href: "/master-data/pending" },
      { icon: Activity,   title: "主数据治理驾驶舱", accent: "indigo", desc: "G5.5-D · 6 维度治理评分 + 字典覆盖率", href: "/master-data/governance" },
      { icon: ShieldCheck,title: "数据质量中心",     accent: "green",  desc: "G5 · 全局 7 维度健康评分 + 告警",        href: "/data-quality" },
    ],
  },
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
          全系统唯一可信主数据入口 · 6 大中心 · 19 个对象 · 统一编码 / 生命周期 / 审批 / 审计
        </p>
      </div>

      {/* 6 大中心分组渲染 */}
      <div className="space-y-10">
        {GROUPS.map((g) => (
          <section key={g.key}>
            <div className="mb-4">
              <h2 className="text-base font-bold text-text">{g.title}</h2>
              <p className="text-xs text-text-muted mt-0.5">{g.subtitle}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {g.cards.map(({ icon, title, desc, href, accent }) => (
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
          </section>
        ))}
      </div>
    </div>
  );
}

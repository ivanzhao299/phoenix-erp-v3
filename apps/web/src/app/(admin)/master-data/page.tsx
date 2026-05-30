"use client";
import Link from "next/link";
import {
  Users, Globe, UserCheck, Car, Warehouse, Wallet,
  Network, Building, FolderKanban, BookOpen, LayoutDashboard,
  ArrowRight, Tag, Package, Layers,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

/**
 * 主数据中心 — 统一导航门户
 * 汇聚全系统基础档案入口，按权限过滤可见卡片
 */

const CARDS = [
  {
    icon: Users,
    title: "客户档案",
    desc: "直营店 / 经销商 / 代理商 / 大客户 · 信用额度",
    href: "/master-data/customers",
    perm: "MENU_SALES2_CUSTOMER",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.08)",
  },
  {
    icon: Globe,
    title: "供应商档案",
    desc: "饲料 / 设备 / 兽药 / 包装 · 多国多币种",
    href: "/master-data/suppliers",
    perm: "MENU_PRC2_MASTER",
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
  },
  {
    icon: UserCheck,
    title: "司机档案",
    desc: "配送司机 · 驾照 · 联系方式 · 状态",
    href: "/master-data/drivers",
    perm: "MENU_SALES2_DELIVERY",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
  },
  {
    icon: Car,
    title: "车辆档案",
    desc: "配送车辆 · 车牌 · 载重 · 运营状态",
    href: "/master-data/vehicles",
    perm: "MENU_SALES2_DELIVERY",
    color: "#f97316",
    bg: "rgba(249,115,22,0.08)",
  },
  {
    icon: Warehouse,
    title: "仓库档案",
    desc: "仓库主档 · 库区 · 地址 · 负责人",
    href: "/master-data/warehouses",
    perm: "MENU_WMS_MASTER",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.08)",
  },
  {
    icon: Wallet,
    title: "资金账户档案",
    desc: "现金账户 · 银行账户 · 余额监控",
    href: "/master-data/cash-accounts",
    perm: "MENU_FIN2_CASH",
    color: "#06b6d4",
    bg: "rgba(6,182,212,0.08)",
  },
  {
    icon: Building,
    title: "公司档案",
    desc: "集团公司 · 子公司 · 分支机构",
    href: "/master-data/companies",
    perm: "MENU_MASTER",
    color: "#64748b",
    bg: "rgba(100,116,139,0.08)",
  },
  {
    icon: Network,
    title: "组织架构",
    desc: "部门 / 区域 / 层级汇报关系",
    href: "/master-data/organizations",
    perm: "MENU_SYS_ORG",
    color: "#ec4899",
    bg: "rgba(236,72,153,0.08)",
  },
  {
    icon: FolderKanban,
    title: "项目档案",
    desc: "采购项目 · 预算 · 归属公司",
    href: "/master-data/projects",
    perm: "MENU_PRC2_MASTER",
    color: "#14b8a6",
    bg: "rgba(20,184,166,0.08)",
  },
  {
    icon: BookOpen,
    title: "系统字典",
    desc: "等级 / 规格 / 原因 / 类型 · 统一编码维护",
    href: "/master-data/dictionaries",
    perm: "MENU_SETTINGS_DATA",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.08)",
  },
  // [Phase H2] 产品主数据三件套
  {
    icon: Tag,
    title: "产品等级档案",
    desc: "AA / A / B / C / DIRTY / CRACKED — 统一 grade_code 值集",
    href: "/master-data/product-grades",
    perm: "MENU_MASTER_GRADE",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
  },
  {
    icon: Package,
    title: "包装规格档案",
    desc: "TRAY30 / BOX360 / GIFT12 — 规格主数据含单位换算",
    href: "/master-data/packaging-specs",
    perm: "MENU_MASTER_PACKAGING",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
  },
  {
    icon: Layers,
    title: "SKU 档案",
    desc: "产品 × 等级 × 规格 — 为价格/库存/销售统一维度做准备",
    href: "/master-data/product-skus",
    perm: "MENU_MASTER_SKU",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.08)",
  },
];

export default function MasterDataHubPage() {
  const { hasAccess } = usePermission("MENU_MASTER");

  return (
    <div style={{ padding: "32px 40px", minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
      {/* 页头 */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <LayoutDashboard size={22} color="#6366f1" />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
            主数据中心
          </h1>
        </div>
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
          统一管理全系统业务基础档案 · 客户 · 供应商 · 司机 · 车辆 · 仓库 · 账户 · 组织
        </p>
      </div>

      {/* 卡片网格 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {CARDS.map(({ icon: Icon, title, desc, href, color, bg }) => (
          <Link
            key={href}
            href={href}
            style={{ textDecoration: "none" }}
          >
            <div
              style={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 12,
                padding: "20px 22px",
                cursor: "pointer",
                transition: "border-color 0.15s, transform 0.12s, box-shadow 0.15s",
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = color;
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${color}22`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#334155";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
              }}
            >
              {/* 色块背景 */}
              <div
                style={{
                  position: "absolute", top: 0, right: 0,
                  width: 80, height: 80,
                  background: bg,
                  borderRadius: "0 12px 0 80px",
                }}
              />
              {/* 图标 */}
              <div
                style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: bg,
                  border: `1px solid ${color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 14,
                }}
              >
                <Icon size={18} color={color} />
              </div>
              {/* 标题 */}
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>
                {title}
              </div>
              {/* 描述 */}
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, marginBottom: 12 }}>
                {desc}
              </div>
              {/* 进入链接 */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color, fontWeight: 600 }}>
                <span>进入管理</span>
                <ArrowRight size={12} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

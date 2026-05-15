"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  PanelLeftClose, PanelLeftOpen, Sun, Moon, LogOut, Languages
} from "lucide-react";
import styles from "./admin.module.css";

// ── Page title from pathname ─────────────────────────────────────
const TITLE_MAP: Record<string, string> = {
  "/dashboard": "仪表盘",
  "/breeding": "养殖场总览",
  "/breeding/henhouse": "鸡舍管理",
  "/breeding/flock": "鸡群档案",
  "/breeding/daily": "日生产日报",
  "/breeding/immune": "免疫计划",
  "/breeding/medicine": "用药记录",
  "/breeding/device": "设备监控",
  "/breeding/device-alerts": "环境预警",
  "/packaging": "集蛋作业台",
  "/packaging/grading": "分级作业",
  "/packaging/packing": "包装作业",
  "/packaging/batch": "批次管理",
  "/packaging/inbound": "集蛋入库",
  "/packaging/label-print": "标签打印",
  "/packaging/first-inspection": "首检录入",
  "/packaging/daily-report": "包装日报",
  "/packaging/exceptions": "异常处理",
  "/warehouse": "仓库看板",
  "/warehouse/inbound": "入库管理",
  "/warehouse/outbound": "出库管理",
  "/warehouse/stocktake": "盘点管理",
  "/warehouse/query": "库存查询",
  "/transport": "配货计划",
  "/transport/wave": "配送波次",
  "/transport/tracking": "配送跟踪",
  "/transport/receipt": "到店签收",
  "/store": "门店工作台",
  "/store/receiving": "收货验收",
  "/store/inventory": "门店库存",
  "/store/daily": "门店日结",
  "/quality": "质检总览",
  "/quality/farm": "场端质检",
  "/quality/product": "成品质检",
  "/quality/nonconformance": "不合格品处置",
  "/quality/forward": "正向追溯",
  "/procurement": "采购总览",
  "/procurement/order": "采购订单",
  "/procurement/arrival": "到货收货",
  "/order": "订单中心",
  "/order/customers": "客户档案",
  "/order/prices": "合同价格",
  "/order/approval": "订单审批",
  "/members": "会员总览",
  "/members/list": "会员档案",
  "/members/points": "积分规则",
  "/members/coupons": "优惠券管理",
  "/finance": "财务总览",
  "/finance/receivables": "应收管理",
  "/finance/payables": "应付管理",
  "/finance/cost": "成本核算",
  "/analytics": "BI 驾驶舱",
  "/analytics/price-review": "价格执行复盘",
  "/settings": "系统设置",
  "/settings/users": "用户管理",
  "/settings/roles": "角色与权限",
  "/settings/dict": "系统字典",
  "/settings/health": "系统健康监控",
  "/settings/organizations": "组织架构管理",
  "/settings/pda-terminals": "PDA 终端管理",
  "/settings/pos-config": "POS 终端管理",
  "/settings/store-stock": "分账库存配置",
  "/settings/security": "安全策略",
  "/settings/system-init": "系统初始化",
  "/settings/master-data": "主数据配置",
  "/settings/products": "商品主数据",
  "/settings/audit-log": "审计日志",
  "/settings/brand": "品牌配置",
  "/settings/profile": "个人中心",
  "/settings/permissions": "权限配置",
  "/settings/approval-flows": "审批流配置",
};

const RAIL_W = "56px";
const FULL_W = "220px";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Three-state sidebar
  const [pinned, setPinned] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("phx_sidebar_pinned") !== "false";
  });
  const [hovered, setHovered] = useState(false);

  const expanded = pinned || hovered;

  // Theme
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("phx_theme") as "dark" | "light") || "light";
  });

  // ✅ 语言 — 直接用 LanguageContext，不再维护私有 state
  const { lang, setAppLanguage } = useLanguage();

  // 首次加载时应用主题（并清理可能残留的旧值）
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("phx_theme", theme);
  }, [theme]);

  // 强制把 <html> 的 data-theme 初始化为 "light" （覆盖任何浏览器缓存）
  useEffect(() => {
    const stored = localStorage.getItem("phx_theme");
    // 如果没有存储值，或存储值是旧格式/无效值，重置为 light
    if (!stored || (stored !== "light" && stored !== "dark")) {
      localStorage.setItem("phx_theme", "light");
      document.documentElement.setAttribute("data-theme", "light");
      setTheme("light");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist pin
  const togglePin = useCallback(() => {
    setPinned(p => {
      const next = !p;
      localStorage.setItem("phx_sidebar_pinned", String(next));
      if (next) setHovered(false);
      return next;
    });
  }, []);

  // 必须等 loading=false 后再判断，防止硬刷新时 sessionStorage 还未恢复就跳登录
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-base)" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--color-primary)", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!user) return null;

  const pageTitle = TITLE_MAP[pathname] ?? "Phoenix ERP";
  const avatarChar = user.name?.[0]?.toUpperCase() ?? "A";

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className={styles.shell} style={{ "--sidebar-w": pinned ? FULL_W : RAIL_W } as React.CSSProperties}>
      {/* Spacer div — controls content area width when pinned */}
      <div style={{ width: pinned ? FULL_W : RAIL_W, flexShrink: 0, transition: "width 220ms ease" }} />

      {/* Sidebar (absolutely positioned) */}
      <Sidebar
        pinned={pinned}
        hovered={hovered}
        onHoverEnter={() => { if (!pinned) setHovered(true); }}
        onHoverLeave={() => { if (!pinned) setHovered(false); }}
      />

      {/* Main */}
      <main className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            {/* Pin button — lucide icon */}
            <button
              className={`${styles.pinBtn} ${pinned ? styles.pinActive : ""}`}
              onClick={togglePin}
              title={pinned ? "收起侧边栏（图标轨道模式）" : "固定展开侧边栏"}
            >
              {pinned
                ? <PanelLeftClose size={15} />
                : <PanelLeftOpen  size={15} />}
            </button>
            <h2 className={styles.pageTitle}>{pageTitle}</h2>
          </div>

          <div className={styles.headerRight}>
            {/* Language switcher */}
            <div className={styles.selectWrap}>
              <select
                value={lang}
                onChange={e => setAppLanguage(e.target.value as "zh" | "lo" | "en")}
                className={styles.headerSelect}
              >
                <option value="zh">🇨🇳 中文</option>
                <option value="lo">🇱🇦 ລາວ</option>
                <option value="en">🇬🇧 English</option>
              </select>
              <Languages size={13} className={styles.selectIcon} />
            </div>

            {/* Theme toggle */}
            <div className={styles.selectWrap}>
              <select
                value={theme}
                onChange={e => setTheme(e.target.value as "dark" | "light")}
                className={styles.headerSelect}
              >
                <option value="dark">🌙 深色</option>
                <option value="light">☀️ 浅色</option>
              </select>
              {theme === "dark"
                ? <Moon size={13} className={styles.selectIcon} />
                : <Sun  size={13} className={styles.selectIcon} />}
            </div>

            {/* User info */}
            <div className={styles.userChip}>
              <div className={styles.headerAvatar}>{avatarChar}</div>
              <div>
                <div className={styles.headerName}>{user.name}</div>
                <div className={styles.headerRole}>{user.role}</div>
              </div>
            </div>

            {/* Logout with lucide icon */}
            <button className={styles.logoutBtn} onClick={handleLogout}>
              <LogOut size={13} />
              <span>退出</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}

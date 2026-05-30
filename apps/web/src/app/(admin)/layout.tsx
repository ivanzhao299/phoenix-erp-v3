"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  PanelLeftClose, PanelLeftOpen, Sun, Moon, LogOut, Languages
} from "lucide-react";
import styles from "./admin.module.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// ── Page title: path → locale key → Chinese fallback ─────────────
// 使用 menu.<childId> 作为 key，与 Sidebar 共享同一翻译源
const TITLE_KEY_MAP: Record<string, string> = {
  "/dashboard":                    "menu.dashboard",
  "/breeding":                     "menu.brd-overview",
  "/breeding/henhouse":            "menu.brd-house",
  "/breeding/flock":               "menu.brd-flock",
  "/breeding/daily":               "menu.brd-daily",
  "/breeding/immune":              "menu.brd-immune",
  "/breeding/medicine":            "menu.brd-medicine",
  "/breeding/device":              "menu.brd-device",
  "/breeding/device-alerts":       "menu.brd-alerts",
  "/packaging":                    "menu.pkg-op",
  "/packaging/grading":            "menu.pkg-op",
  "/packaging/packing":            "menu.pkg-op",
  "/packaging/batch":              "menu.pkg-batch",
  "/packaging/inbound":            "menu.pkg-inbound",
  "/packaging/label-print":        "menu.pkg-op",
  "/packaging/first-inspection":   "menu.pkg-op",
  "/packaging/daily-report":       "menu.pkg-report",
  "/packaging/exceptions":         "menu.pkg-except",
  "/warehouse":                    "menu.wh-dash",
  "/warehouse/inbound":            "menu.wh-in",
  "/warehouse/outbound":           "menu.wh-out",
  "/warehouse/transfer":           "menu.wh-transfer",
  "/warehouse/stocktake":          "menu.wh-stock",
  "/warehouse/ledger":             "menu.wh-ledger",
  "/warehouse/query":              "menu.wh-query",
  "/warehouse/warehouses":         "menu.wh-house",
  "/warehouse/zones":              "menu.wh-zones",
  "/warehouse/locations":          "menu.wh-loc",
  "/warehouse/expiry":             "menu.wh-expiry",
  "/warehouse/daily-close":        "menu.wh-daily",
  "/warehouse/loss-report":        "menu.wh-loss",
  "/store":                        "menu.st-wb",
  "/store/receiving":              "menu.st-recv",
  "/store/inventory":              "menu.st-inv",
  "/store/replenish":              "menu.st-replenish",
  "/store/losses":                 "menu.st-loss",
  "/store/daily":                  "menu.st-daily",
  "/quality":                      "menu.ql-ov",
  "/quality/farm":                 "menu.ql-farm",
  "/quality/product":              "menu.ql-prod",
  "/quality/nonconformance":       "menu.ql-nc",
  "/quality/forward":              "menu.ql-fwd",
  "/quality/backward":             "menu.ql-bwd",
  "/quality/standards":            "menu.ql-std",
  "/procurement2/dashboard":       "menu.prc2-dashboard",
  "/procurement2/suppliers":       "menu.prc2-supplier",
  "/procurement2/projects":        "menu.prc2-project",
  "/procurement2/requests":        "menu.prc2-request",
  "/procurement2/orders":               "menu.prc2-order",
  "/procurement2/payments":             "menu.prc2-payment",
  "/procurement2/shareholder-funds":    "menu.prc2-fund",
  "/procurement2/shipments":           "menu.prc2-shipment",
  "/procurement2/receipts":            "menu.prc2-receipt",
  "/procurement2/init":               "menu.prc2-init",
  "/workflow/todos":               "menu.wf-approval-todos",
  "/workflow/history":             "menu.wf-approval-history",
  "/notifications":                "menu.wf-notifications",
  "/members":                      "menu.mb-ov",
  "/members/list":                 "menu.mb-list",
  "/members/points":               "menu.mb-points",
  "/members/coupons":              "menu.mb-coupon",
  "/members/activity":             "menu.mb-act",
  "/analytics":                    "menu.an-bi",
  "/analytics/price-review":       "menu.an-price",
  "/analytics/production":         "menu.an-prod",
  "/analytics/inventory":          "menu.an-inv",
  "/analytics/feed":               "menu.an-feed",
  "/wholesale":                    "menu.ws-ov",
  "/wholesale/contracts":          "menu.ws-contracts",
  "/wholesale/shipments":          "menu.ws-shipments",
  "/master/farms":                 "menu.md-farms",
  "/master/products":              "menu.md-products",
  "/master/stores":                "menu.md-stores",
  "/settings":                     "menu.settings",
  "/settings/users":               "menu.stg-users",
  "/settings/roles":               "menu.stg-roles",
  "/settings/organizations":       "menu.stg-orgs",
  "/settings/data-scopes":         "menu.stg-data-scopes",
  "/settings/dict":                "menu.stg-dict",
  "/settings/products":            "menu.stg-products",
  "/settings/master-data":         "menu.stg-master",
  "/settings/approval-flows":      "menu.stg-approvals",
  "/settings/approval-rules":      "menu.stg-approval-rules",
  "/settings/permissions":         "menu.stg-perms",
  "/settings/pda-terminals":       "menu.stg-pda",
  "/settings/pos-config":          "menu.stg-pos",
  "/settings/store-stock":         "menu.stg-stock-cfg",
  "/settings/security":            "menu.stg-security",
  "/settings/health":              "menu.stg-health",
  "/settings/audit-log":           "menu.stg-audit",
  "/settings/system-init":         "menu.stg-init",
  "/settings/brand":               "menu.stg-brand",
  "/settings/profile":             "menu.stg-profile",
  "/settings/notifications":       "menu.stg-notify",
  "/master-data/products":         "menu.mdc-products",
  "/master-data/stores":           "menu.mdc-stores",
  "/system/backup":                "menu.sysops-backup",
  "/system/error-logs":            "menu.sysops-errors",
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

  // ✅ 主题 — 统一用 ThemeContext，不在此维护私有 state
  const { themeMode, toggleTheme } = useTheme();
  const theme = themeMode === "dark" ? "dark" : "light";

  // ✅ 语言 — 直接用 LanguageContext，不再维护私有 state
  const { lang, setAppLanguage, t } = useLanguage();

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

  const titleKey = TITLE_KEY_MAP[pathname];
  const pageTitle = titleKey ? t(titleKey, pathname.split("/").pop() ?? "Phoenix ERP") : "Phoenix ERP";
  const avatarChar = user.name?.[0]?.toUpperCase() ?? "A";

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <TooltipProvider delayDuration={300}>
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
type="button"               className={`${styles.pinBtn} ${pinned ? styles.pinActive : ""}`}
              onClick={togglePin}
              title={pinned ? t('layout.collapse_sidebar', '收起侧边栏') : t('layout.pin_sidebar', '固定展开侧边栏')}
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
                onChange={e => toggleTheme(e.target.value as "dark" | "light")}
                className={styles.headerSelect}
              >
                <option value="dark">🌙 {t('layout.dark_mode', '深色')}</option>
                <option value="light">☀️ {t('layout.light_mode', '浅色')}</option>
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
                <div className={styles.headerRole}>{user.roleNameZh || user.role}</div>
              </div>
            </div>

            {/* Logout with lucide icon */}
            <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
              <LogOut size={13} />
              <span>{t('layout.logout', '退出')}</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className={styles.content}>
          {children}
        </div>
      </main>
      <Toaster position="top-right" richColors />
    </div>
    </TooltipProvider>
  );
}

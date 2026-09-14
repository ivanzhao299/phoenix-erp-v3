"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Sidebar, canAccessPath, findMenuItemByPath, getFirstAccessiblePath, pathTitle } from "@/components/layout/Sidebar";
import { ImpersonationBanner } from "@/components/layout/ImpersonationBanner";
import { ApprovalNotifier } from "@/components/layout/ApprovalNotifier"; // G167：审批信息中心（铃铛/红点/横幅/声音）
import { OnlineUsersIndicator } from "@/components/layout/OnlineUsersIndicator"; // G171：在线用户(管理员可见)
import {
  PanelLeftClose, PanelLeftOpen, Sun, Moon, LogOut, Languages
} from "lucide-react";
import styles from "./admin.module.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthFetchInterceptor } from "@/components/AuthFetchInterceptor";
import { PageTransition } from "@/components/layout/PageTransition";
import { BugIntakeProvider } from "@/components/bug-intake/BugIntakeProvider";

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
  "/breeding/device-ops":          "menu.brd-device-ops",
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
  "/warehouse/issues":             "menu.wh-issue",
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
  "/analytics":                    "menu.an-bi",
  "/analytics/price-review":       "menu.an-price",
  "/analytics/production":         "menu.an-prod",
  "/analytics/inventory":          "menu.an-inv",
  "/analytics/feed":               "menu.an-feed",
  "/master/farms":                 "menu.mdc-farms",
  "/master/products":              "menu.md-products",
  "/master/stores":                "menu.md-stores",
  "/settings":                     "menu.settings",
  "/settings/users":               "menu.stg-users",
  "/settings/roles":               "menu.stg-roles",
  "/settings/organizations":       "menu.stg-orgs",
  "/settings/data-scopes":         "menu.stg-data-scopes",
  "/settings/dict":                "menu.stg-dict",
  "/settings/master-data":         "menu.stg-master",
  "/settings/approval-flows":      "menu.stg-approvals",
  "/settings/approval-rules":      "menu.stg-approval-rules",
  "/settings/permissions":         "menu.stg-perms",
  "/settings/pda-terminals":       "menu.stg-pda",
  "/settings/pos-config":          "menu.stg-pos",
  "/settings/store-stock":         "menu.stg-stock-cfg",
  "/settings/security":            "menu.stg-security",
  "/settings/audit-log":           "menu.stg-audit",
  "/settings/system-init":         "menu.stg-init",
  "/settings/brand":               "menu.stg-brand",
  "/settings/notifications":       "menu.stg-notify",
  "/master-data/products":         "menu.mdc-products",
  "/master-data/stores":           "menu.mdc-stores",
  "/master-data/organizations":    "menu.mdc-orgs",
  "/system/health":                "menu.sysops-monitor",
  "/system/alerts":                "menu.sysops-alerts",
  "/system/backup":                "menu.sysops-backup",
  "/system/error-logs":            "menu.sysops-errors",
  "/bug-reports":                  "menu.sysops-bugs",
};

const RAIL_W = "56px";
const FULL_W = "220px";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, hasPermission } = useAuth();
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
    if (!loading && !user) router.replace(`/login?return=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [loading, user, router]);

  // 菜单级前端门禁：如果 URL 命中已登记菜单但当前用户无该叶子权限，
  // 直接跳到其可访问的第一个菜单，避免向用户展示"无权限子段/无权限菜单"。
  useEffect(() => {
    if (loading || !user) return;
    if (pathname === "/profile" || pathname.startsWith("/settings/profile")) return;
    const matched = findMenuItemByPath(pathname);
    if (!matched) return;
    if (canAccessPath(pathname, hasPermission)) return;
    const fallback = getFirstAccessiblePath(hasPermission) || "/login";
    if (fallback !== pathname) router.replace(fallback);
  }, [loading, user, pathname, hasPermission, router]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-base)" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--color-primary)", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!user) return null;

  const titleKey = TITLE_KEY_MAP[pathname];
  // 顶栏标题优先取侧边栏中文 label(单一来源,杜绝露英文路由名); 再退 i18n 映射(空串而非英文段); 最后泛标题
  const pageTitle = pathTitle(pathname) || (titleKey ? t(titleKey, "") : "") || "Phoenix ERP";
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
        {/* 影子模式横幅（impersonate 时显示，可一键退出）*/}
        <ImpersonationBanner />
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

            {/* Theme toggle — 一键切换，无下拉菜单 */}
            <button
              type="button"
              onClick={() => toggleTheme(theme === "dark" ? "light" : "dark")}
              className={styles.themeBtn}
              title={theme === "dark" ? t('layout.switch_to_light', '切换浅色模式') : t('layout.switch_to_dark', '切换深色模式')}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* G171：在线用户小指示（管理员可见，403 自动隐藏） */}
            <OnlineUsersIndicator />

            {/* G167/G171：消息中心 — 铃铛 + 红点未读数 + 下拉消息列表（新消息弹横幅 + 声音） */}
            <ApprovalNotifier />

            <BugIntakeProvider />

            {/* User info — 点击进入个人中心 /profile（主题切换迁移到个人中心，topbar 不再放）*/}
            <div
              className={styles.userChip}
              role="button"
              tabIndex={0}
              onClick={() => router.push('/profile')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push('/profile'); }}
              title={t('layout.go_to_profile', '进入个人中心')}
              style={{ cursor: 'pointer' }}
            >
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

        {/* Content — 路由切换轻量淡入过渡（消除硬切白块的生硬感） */}
        <div className={styles.content}>
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <Toaster position="top-right" richColors />
      <AuthFetchInterceptor />
    </div>
    </TooltipProvider>
  );
}

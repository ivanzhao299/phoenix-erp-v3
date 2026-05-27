"use client";
import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface LegacyFreezeBannerProps {
  /** 要迁移到的新模块路径（默认 /sales2） */
  newPath?: string;
  /** 新模块名称（默认"Sales V2"） */
  newModuleName?: string;
  /** 具体迁移阶段说明（可选） */
  migrationPhase?: string;
}

/**
 * LegacyFreezeBanner
 *
 * Sales V2 Phase 0 — Legacy Freeze 冻结提示
 *
 * 放置于以下已冻结的旧页面顶部：
 *   /order/customers   → sal_customers  (Sales V2 Phase 1)
 *   /b2b/customers     → sal_customers  (Sales V2 Phase 1)
 *   /order/prices      → sal_price_books/items (Sales V2 Phase 2)
 *   /b2b/orders        → sal_sales_orders (Sales V2 Phase 3)
 *   /transport/*       → sal_delivery_orders (Sales V2 Phase 4)
 *   /wholesale/*       → sal_sales_orders (Sales V2 Phase 3)
 *
 * 此 Banner 只做只读提示，不锁定页面功能（避免破坏现有工作流）。
 * Phase 1 正式迁移后，各旧页面入口将从 Sidebar 移除。
 */
export function LegacyFreezeBanner({
  newPath = "/sales2",
  newModuleName = "Sales V2",
  migrationPhase,
}: LegacyFreezeBannerProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        marginBottom: 16,
        borderRadius: 8,
        background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.06))",
        border: "1px solid rgba(245,158,11,0.4)",
        color: "#d97706",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        <strong>⚠️ 当前模块已冻结（LEGACY / READ_ONLY）</strong>
        {" — "}
        数据写入路径已停止扩展，将迁移至{" "}
        <strong>{newModuleName}</strong>。
        {migrationPhase && (
          <span style={{ opacity: 0.8 }}> 预计迁移阶段：{migrationPhase}。</span>
        )}
      </span>
      <Link
        href={newPath}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 10px",
          borderRadius: 6,
          background: "rgba(245,158,11,0.18)",
          border: "1px solid rgba(245,158,11,0.4)",
          color: "#b45309",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 12,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        前往 {newModuleName}
        <ArrowRight size={12} />
      </Link>
    </div>
  );
}

export default LegacyFreezeBanner;

"use client";
import { usePermission } from "@/hooks/usePermission";

/**
 * Sales V2 — 渠道管理
 * 销售渠道档案：直营 / 经销商 / 代理商 / 电商
 */
export default function SalesChannelsPage() {
  const { canView } = usePermission("MENU_SALES2_CHANNEL");

  if (!canView) {
    return (
      <div style={{ padding: 40, color: "#94a3b8", textAlign: "center" }}>
        无权限查看渠道管理
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px", minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
      {/* 页头 */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
          渠道管理
        </h1>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
          管理直营门店、经销商、代理商及电商渠道档案，支持渠道专属价格策略
        </p>
      </div>

      {/* 占位内容 */}
      <div
        style={{
          background: "#1e293b",
          border: "1px dashed #334155",
          borderRadius: 12,
          padding: "60px 40px",
          textAlign: "center",
          color: "#475569",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>🏪</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>
          渠道管理功能正在建设中
        </div>
        <div style={{ fontSize: 13 }}>
          渠道档案管理模块 — 直营 / 经销商 / 代理商 / 电商渠道分类管理
        </div>
      </div>
    </div>
  );
}

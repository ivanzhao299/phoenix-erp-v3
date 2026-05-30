"use client";
import { usePermission } from "@/hooks/usePermission";

/**
 * Sales V2 — 信用管理
 * 客户信用评估、冻结/解冻、逾期预警、信用台账
 */
export default function CustomerCreditPage() {
  const { canView } = usePermission("MENU_SALES2_CREDIT");

  if (!canView) {
    return (
      <div style={{ padding: 40, color: "#94a3b8", textAlign: "center" }}>
        无权限查看信用管理
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px", minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
      {/* 页头 */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
          信用管理
        </h1>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
          客户信用额度评估、账期冻结 / 解冻、逾期预警、信用台账查询
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
        <div style={{ fontSize: 40, marginBottom: 16 }}>💳</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>
          信用管理面板正在建设中
        </div>
        <div style={{ fontSize: 13 }}>
          信用管控模块 — 信用评估 + 自动冻结 + 逾期预警 + 账龄报表
        </div>
      </div>
    </div>
  );
}

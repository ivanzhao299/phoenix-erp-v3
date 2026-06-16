// 采购模块共享：操作列「文字按钮」样式（G159 样板阶段4）。
// 企业级运营场景要直观清晰，禁纯图标（看不出含义）。各采购页操作列统一用此。
import type React from "react";

export const actBtn: React.CSSProperties = {
  padding: "3px 10px", fontSize: 12, lineHeight: 1.6, borderRadius: 6, whiteSpace: "nowrap",
  border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)",
  cursor: "pointer",
};

export function actBtnTone(tone: "success" | "info" | "danger" | "primary"): React.CSSProperties {
  const c =
    tone === "success" ? "var(--status-success)" :
    tone === "danger"  ? "var(--status-danger)" :
    tone === "primary" ? "var(--color-primary)" :
    "var(--status-info, var(--color-primary))";
  return { ...actBtn, borderColor: c, color: c };
}

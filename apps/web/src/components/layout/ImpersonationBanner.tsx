"use client";

import { useEffect, useState } from "react";
import { getImpersonation, exitImpersonation } from "@/lib/impersonate";

/**
 * 影子模式横幅 —— 处于 impersonate 状态时全局置顶提示，可一键退出。
 */
export function ImpersonationBanner() {
  const [info, setInfo] = useState<{ by: string; as: string } | null>(null);
  useEffect(() => { setInfo(getImpersonation()); }, []);
  if (!info) return null;
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 1000,
      background: "#854F0B", color: "#fff",
      padding: "7px 18px", display: "flex", alignItems: "center", gap: 12,
      fontSize: 13, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
    }}>
      <span style={{ fontSize: 15 }}>⚠️</span>
      <span>影子模式：正在以 <b>{info.as}</b> 身份查看（由 {info.by} 发起）— 仅用于测试/排障，操作会以该用户身份执行</span>
      <button
        type="button"
        onClick={() => exitImpersonation()}
        style={{
          marginLeft: "auto", background: "#fff", color: "#854F0B", border: "none",
          borderRadius: 6, padding: "4px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >退出影子模式</button>
    </div>
  );
}

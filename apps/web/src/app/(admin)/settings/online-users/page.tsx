"use client";

// G171：在线用户（管理员）——基于 SSE 长连接的实时在线状态。每 20s 刷新。
import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import { RefreshCw, Users } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import request from "@/lib/api-client";

interface OnlineUser {
  userId: string;
  username: string | null;
  realNameZh: string | null;
  roleNameZh: string | null;
  storeCode: string | null;
  connections: number;
  lastSeen: number;
  since: number;
}

function fmtTime(ms?: number) {
  if (!ms) return "—";
  try { return new Date(ms).toLocaleString("zh-CN"); } catch { return "—"; }
}
function fmtDuration(sinceMs?: number) {
  if (!sinceMs) return "—";
  const s = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  if (s < 60) return `${s} 秒`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`;
  return `${Math.floor(s / 86400)} 天`;
}

export default function OnlineUsersPage() {
  const toast = useToast();
  const [items, setItems] = useState<OnlineUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await request<{ total: number; items: OnlineUser[] }>("/system/online-users");
      setItems(r?.items ?? []);
      setTotal(r?.total ?? 0);
    } catch {
      toast.error("加载失败（需管理员权限）");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="animate-fade-in">
      <PageHeader title="在线用户" subtitle={`当前在线 ${total} 人 · 基于实时连接，每 20 秒刷新`} breadcrumb={["系统设置", "在线用户"]}
        actions={
          <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={load} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
          </button>
        } />

      <div style={{ overflowX: "auto", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <table className={s.table} style={{ width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "22%" }} /><col style={{ width: "16%" }} /><col style={{ width: "22%" }} />
            <col style={{ width: "12%" }} /><col style={{ width: "10%" }} /><col style={{ width: "18%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>姓名</th><th>账号</th><th>角色</th><th>公司</th><th className={u.tac}>连接数</th><th>上次活跃</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr><td colSpan={6} className={u.emptyCenter}>加载中…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className={u.emptyCenter}><Users size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />当前无在线用户</td></tr>
            ) : items.map((it) => (
              <tr key={it.userId}>
                <td style={{ wordBreak: "break-word" }}>
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 7, background: "var(--status-success)", marginRight: 6 }} />
                  {it.realNameZh || it.username || it.userId}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>{it.username ?? "—"}</td>
                <td style={{ wordBreak: "break-word" }}>{it.roleNameZh ?? "—"}</td>
                <td style={{ wordBreak: "break-word" }}>{it.storeCode ?? "—"}</td>
                <td className={u.tac}>{it.connections}</td>
                <td title={`在线时长 ${fmtDuration(it.since)}`}>{fmtTime(it.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

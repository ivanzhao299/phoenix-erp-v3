"use client";

// 消息中心（G171，承接 G167 铃铛）——顶栏铃铛 + 红点未读数 + 点开下拉消息列表(标已读/全部已读/
// 点进入相关页) + 新消息顶部横幅 + Web Audio 声音。实时走 SSE(EventSource)，轮询兜底。
// 数据：/api/notifications（列表）、/unread-count（红点）、/:id/read、/read-all。
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, X, CheckCheck } from "lucide-react";
import request from "@/lib/api-client";

interface Notif {
  id: string;
  title: string;
  content?: string;
  status: string; // UNREAD / READ
  notificationType?: string;
  bizType?: string | null;
  bizNo?: string | null;
  linkType?: string | null;
  linkId?: string | null;
  createdAt?: string;
}

const POLL_MS = 60000;
const BIZ_LABEL: Record<string, string> = {
  PAYMENT: "付款", PO: "采购订单", PR: "采购申请", EXPENSE_REQUEST: "费用报销",
  SHAREHOLDER_CONTRIBUTION: "股东出资", SHAREHOLDER_SETTLEMENT: "股东结算", FUND: "股东资金",
  MD_FIELD_CHANGE: "主数据变更", MD_SUPPLIER_CREATE: "供应商建档",
  MD_CUSTOMER_CREATE: "客户建档", MD_PROJECT_CREATE: "项目建档",
};
function timeAgo(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}
// 点消息进入的目标页：审批类→待办；否则待办兜底
function notifLink(n: { linkType?: string | null; linkId?: string | null }): string {
  if (n.linkType && n.linkType.startsWith("/")) return n.linkType;
  return "/workflow/todos";
}

function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 880;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    o.start(now); o.stop(now + 0.34);
    o.onended = () => { try { ctx.close(); } catch { /* */ } };
  } catch { /* 自动播放被拦截 */ }
}

export function ApprovalNotifier() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState<{ title: string; sub: string; link: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null);
  const prevUnread = useRef<number | null>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); }, []);

  const refreshCount = useCallback(async () => {
    try {
      const r = await request<{ count: number }>("/notifications/unread-count", { silent: true });
      const c = r?.count ?? 0;
      setUnread(c);
      if (prevUnread.current !== null && c > prevUnread.current) {
        // 兜底提醒（SSE 漏收时）——拉最新一条做横幅
        try {
          const l = await request<{ items: Notif[] }>("/notifications?pageSize=1", { silent: true });
          const n = l?.items?.[0];
          if (n) { setBanner({ title: n.title, sub: `${BIZ_LABEL[n.bizType ?? ""] ?? ""}${n.bizNo ? " " + n.bizNo : ""}`.trim(), link: notifLink(n) }); beep(); }
        } catch { /* */ }
      }
      prevUnread.current = c;
    } catch { /* 无权限/网络：静默 */ }
  }, []);

  const loadList = useCallback(async () => {
    try {
      const r = await request<{ items: Notif[] }>("/notifications?pageSize=12", { silent: true });
      setItems(r?.items ?? []);
    } catch { setItems([]); }
  }, []);

  // 轮询兜底 + 切回标签页刷新
  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") refreshCount(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [refreshCount]);

  // SSE 实时
  useEffect(() => {
    const token = typeof window !== "undefined"
      ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
    if (!token || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data) as Record<string, unknown>;
          if (d?.type !== "notification") return;
          setBanner({
            title: String(d.title ?? "新消息"),
            sub: `${BIZ_LABEL[String(d.bizType ?? "")] ?? ""}${d.bizNo ? " " + d.bizNo : ""}`.trim(),
            link: notifLink({ linkType: d.linkType as string }),
          });
          beep();
          refreshCount();
          setOpen((o) => { if (o) loadList(); return o; });
        } catch { /* */ }
      };
      es.onerror = () => { /* 自动重连 */ };
    } catch { /* */ }
    return () => { es?.close(); };
  }, [refreshCount, loadList]);

  // 横幅 9s 自动消失
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 9000);
    return () => clearTimeout(id);
  }, [banner]);

  // 下拉外部点击关闭
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (bellRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (next) {
        const r = bellRef.current?.getBoundingClientRect();
        if (r) setRect({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
        loadList();
      }
      return next;
    });
  }, [loadList]);

  const openNotif = useCallback(async (n: Notif) => {
    setOpen(false);
    if (n.status === "UNREAD") {
      try { await request(`/notifications/${n.id}/read`, { method: "POST", silent: true }); } catch { /* */ }
      setUnread((u) => Math.max(0, u - 1));
    }
    router.push(notifLink(n));
  }, [router]);

  const markAll = useCallback(async () => {
    try { await request("/notifications/read-all", { method: "POST", silent: true }); } catch { /* */ }
    setUnread(0);
    loadList();
  }, [loadList]);

  return (
    <>
      <button ref={bellRef} type="button" onClick={toggle} title={unread > 0 ? `${unread} 条未读` : "消息中心"}
        style={{
          position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)",
          background: open ? "var(--bg-muted)" : "var(--bg-card)", color: "var(--text-secondary)", cursor: "pointer",
        }}>
        <Bell size={15} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px",
            borderRadius: 9, background: "var(--status-danger)", color: "#fff",
            fontSize: 10.5, fontWeight: 700, lineHeight: "17px", textAlign: "center",
            boxShadow: "0 0 0 2px var(--bg-card)",
          }}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {/* 消息中心下拉 */}
      {mounted && open && rect && createPortal(
        <div ref={panelRef} style={{
          position: "fixed", top: rect.top, right: rect.right, zIndex: 11000, width: "min(360px, 92vw)",
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "0 12px 36px rgba(0,0,0,0.22)", overflow: "hidden", animation: "phx-fade-in .14s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>消息中心{unread > 0 ? ` · ${unread} 未读` : ""}</span>
            <button type="button" onClick={markAll} disabled={unread === 0}
              style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "none",
                color: unread === 0 ? "var(--text-disabled)" : "var(--color-primary)", cursor: unread === 0 ? "default" : "pointer", fontSize: 12 }}>
              <CheckCheck size={13} /> 全部已读
            </button>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {items.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>暂无消息</div>
            ) : items.map((n) => (
              <div key={n.id} onClick={() => openNotif(n)}
                style={{ display: "flex", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                  background: n.status === "UNREAD" ? "color-mix(in srgb, var(--color-primary) 6%, transparent)" : "transparent" }}>
                <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 7, marginTop: 6,
                  background: n.status === "UNREAD" ? "var(--status-danger)" : "transparent" }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: n.status === "UNREAD" ? 600 : 500, color: "var(--text-primary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</div>
                  {n.content && <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{n.content}</div>}
                  <div style={{ fontSize: 11, color: "var(--text-disabled)", marginTop: 3 }}>
                    {BIZ_LABEL[n.bizType ?? ""] ?? ""}{n.bizNo ? ` ${n.bizNo}` : ""}{n.createdAt ? ` · ${timeAgo(n.createdAt)}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "9px 14px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <button type="button" onClick={() => { setOpen(false); router.push("/workflow/todos"); }}
              style={{ border: "none", background: "none", color: "var(--color-primary)", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>
              查看全部审批待办 →
            </button>
          </div>
        </div>, document.body)}

      {/* 新消息顶部横幅 */}
      {mounted && banner && createPortal(
        <div onClick={() => { const l = banner.link; setBanner(null); router.push(l); }} role="button"
          style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 11050,
            display: "flex", alignItems: "center", gap: 12, maxWidth: "min(560px, 92vw)",
            padding: "11px 14px 11px 16px", borderRadius: 12, cursor: "pointer",
            background: "var(--color-primary)", color: "var(--text-on-dark, #fff)", boxShadow: "0 10px 32px rgba(0,0,0,0.28)", animation: "phx-fade-in .18s ease" }}>
          <Bell size={18} style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{banner.title}</div>
            <div style={{ fontSize: 12.5, opacity: 0.92, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {banner.sub ? `${banner.sub} — ` : ""}点击处理
            </div>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); setBanner(null); }}
            style={{ marginLeft: "auto", border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", opacity: 0.85, flexShrink: 0 }} title="关闭">
            <X size={16} />
          </button>
        </div>, document.body)}
    </>
  );
}

export default ApprovalNotifier;

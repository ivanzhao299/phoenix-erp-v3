"use client";

// 审批状态信息中心（G167）——顶栏铃铛 + 红点未读数 + 新审批顶部横幅 + 声音提醒。
// 轮询 /api/workflow/my-tasks（45s + 切回标签页即刷）；待办数增加=有新审批 → 顶部居中横幅
// （portal 到 body，点击直达工作流待办）+ Web Audio 蜂鸣（免音频素材，受浏览器自动播放限制：
// 用户与页面交互过后才会响）。铃铛红点常驻显示当前待办数，点击进入待办。
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import request from "@/lib/api-client";

interface Task {
  instanceId: string;
  bizType: string;
  bizNo?: string | null;
  subject?: string | null;
}
interface Resp { items: Task[]; total: number }

const POLL_MS = 45000;
const BIZ_LABEL: Record<string, string> = {
  PAYMENT: "付款", PO: "采购订单", PR: "采购申请",
  EXPENSE_REQUEST: "费用报销", SHAREHOLDER_CONTRIBUTION: "股东出资",
  SHAREHOLDER_SETTLEMENT: "股东结算", FUND: "股东资金",
  MD_FIELD_CHANGE: "主数据变更", MD_SUPPLIER_CREATE: "供应商建档",
  MD_CUSTOMER_CREATE: "客户建档", MD_PROJECT_CREATE: "项目建档",
};
const bizLabel = (t?: string) => (t && BIZ_LABEL[t]) || t || "审批";

// Web Audio 蜂鸣（无需音频文件）
function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 880;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    o.start(now); o.stop(now + 0.34);
    o.onended = () => { try { ctx.close(); } catch { /* ignore */ } };
  } catch { /* 自动播放被拦截，静默 */ }
}

export function ApprovalNotifier() {
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [banner, setBanner] = useState<Task | null>(null);
  const [mounted, setMounted] = useState(false);
  const prevTotal = useRef<number | null>(null);
  useEffect(() => { setMounted(true); }, []);

  // 弹横幅 + 响铃（SSE 实时事件 / 轮询兜底 共用）
  const fireNotice = useCallback((item: Task | null) => { setBanner(item); beep(); }, []);

  const poll = useCallback(async () => {
    try {
      const r = await request<Resp>("/workflow/my-tasks?taskSource=APPROVAL_ENGINE&pageSize=5", { silent: true });
      const t = r?.total ?? 0;
      setTotal(t);
      // 兜底：SSE 漏收时，靠轮询发现"数量增加"也提醒（首次加载只记基线，不打扰）
      if (prevTotal.current !== null && t > prevTotal.current) {
        fireNotice(r?.items?.[0] ?? null);
      }
      prevTotal.current = t;
    } catch { /* 无权限/网络错误：静默 */ }
  }, [fireNotice]);

  // 轮询（SSE 兜底 + 红点数校准）
  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [poll]);

  // G167-SSE：实时事件流（秒级）。EventSource 自动重连；带不了 Bearer，用 ?token=。
  useEffect(() => {
    const token = typeof window !== "undefined"
      ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "")
      : "";
    if (!token || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data) as Record<string, unknown>;
          if (d?.type !== "notification") return; // connected/ping/unauthorized 忽略
          fireNotice({
            instanceId: String(d.linkId ?? ""),
            bizType: String(d.bizType ?? d.notificationType ?? ""),
            bizNo: (d.bizNo as string) ?? null,
            subject: (d.title as string) || (d.content as string) || null,
          });
          poll(); // 刷新红点数
        } catch { /* 忽略坏帧 */ }
      };
      es.onerror = () => { /* 浏览器自动重连，无需处理 */ };
    } catch { /* 不支持则纯靠轮询 */ }
    return () => { es?.close(); };
  }, [fireNotice, poll]);

  // 横幅 9 秒自动消失
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 9000);
    return () => clearTimeout(id);
  }, [banner]);

  const goTodos = useCallback(() => { setBanner(null); router.push("/workflow/todos"); }, [router]);

  return (
    <>
      {/* 铃铛 + 红点未读数 */}
      <button
        type="button"
        onClick={goTodos}
        title={total > 0 ? `${total} 条待审批` : "审批待办"}
        style={{
          position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)",
          background: "var(--bg-card)", color: "var(--text-secondary)", cursor: "pointer",
        }}
      >
        <Bell size={15} />
        {total > 0 && (
          <span style={{
            position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px",
            borderRadius: 9, background: "var(--status-danger)", color: "#fff",
            fontSize: 10.5, fontWeight: 700, lineHeight: "17px", textAlign: "center",
            boxShadow: "0 0 0 2px var(--bg-card)",
          }}>{total > 99 ? "99+" : total}</span>
        )}
      </button>

      {/* 新审批顶部横幅（portal 到 body，点击直达待办） */}
      {mounted && banner && createPortal(
        <div
          onClick={goTodos}
          role="button"
          style={{
            position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 11000,
            display: "flex", alignItems: "center", gap: 12, maxWidth: "min(560px, 92vw)",
            padding: "11px 14px 11px 16px", borderRadius: 12, cursor: "pointer",
            background: "var(--color-primary)", color: "var(--text-on-dark, #fff)",
            boxShadow: "0 10px 32px rgba(0,0,0,0.28)", animation: "phx-fade-in .18s ease",
          }}
        >
          <Bell size={18} style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>您有新的审批待办</div>
            <div style={{ fontSize: 12.5, opacity: 0.92, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {bizLabel(banner.bizType)}{banner.bizNo ? ` ${banner.bizNo}` : ""}{banner.subject ? ` · ${banner.subject}` : ""} — 点击处理
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setBanner(null); }}
            style={{ marginLeft: "auto", border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", opacity: 0.85, flexShrink: 0 }}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}

export default ApprovalNotifier;

"use client";
/**
 * Phoenix ERP V3 — 试运行问题反馈浮窗
 *
 * 人性化的问题反馈入口:右下角浮动按钮 → 弹窗填写(标题/类型/严重度/描述,自动带当前页面),
 * 提交到既有 /api/uat/feedbacks。提交后展示"智能体将自动分析"提示,并可查看「我的反馈」状态
 * (含智能体处理态 agent_status —— 后续反馈接入智能体自动修正的可视窗口)。
 */
import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X, Loader2, Bot, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

function token() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}
function hdr() {
  return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

const TYPES: { v: string; label: string }[] = [
  { v: "BUG",         label: "🐞 功能异常" },
  { v: "IMPROVEMENT", label: "💡 改进建议" },
  { v: "QUESTION",    label: "❓ 操作疑问" },
  { v: "DATA",        label: "📊 数据问题" },
];
const SEVERITIES: { v: string; label: string; cls: string }[] = [
  { v: "LOW",      label: "低 · 不影响使用",   cls: "text-text-muted border-border" },
  { v: "MEDIUM",   label: "中 · 有点别扭",     cls: "text-amber-500 border-amber-500/40" },
  { v: "HIGH",     label: "高 · 影响干活",     cls: "text-orange-500 border-orange-500/40" },
  { v: "CRITICAL", label: "紧急 · 干不下去了", cls: "text-red-500 border-red-500/50" },
];

// 智能体处理态 → 文案/颜色（后续反馈接入智能体自动修正的可视化）
const AGENT_MAP: Record<string, { label: string; cls: string }> = {
  NONE:      { label: "待智能体接收", cls: "text-text-dim bg-bg-muted" },
  QUEUED:    { label: "已排队",       cls: "text-sky-500 bg-sky-500/10" },
  ANALYZING: { label: "分析中",       cls: "text-sky-500 bg-sky-500/10" },
  PROPOSED:  { label: "已提修复方案", cls: "text-violet-500 bg-violet-500/10" },
  APPLIED:   { label: "已自动修复",   cls: "text-emerald-500 bg-emerald-500/10" },
  FAILED:    { label: "自动修复失败", cls: "text-red-500 bg-red-500/10" },
  SKIPPED:   { label: "智能体跳过",   cls: "text-text-dim bg-bg-muted" },
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: "待处理", IN_PROGRESS: "处理中", RESOLVED: "已解决", CLOSED: "已关闭", REJECTED: "已驳回",
};

interface FeedbackRow {
  id: number; feedback_no: string; title: string; feedback_type: string;
  severity: string; status: string; agent_status?: string; created_at: string;
}

export default function FeedbackWidget({ companyCode }: { companyCode?: string }) {
  const { t: tt } = useLanguage();
  const pathname = usePathname();
  const [open, setOpen]   = useState(false);
  const [tab, setTab]     = useState<"new" | "mine">("new");

  const [title, setTitle]             = useState("");
  const [type, setType]               = useState("BUG");
  const [severity, setSeverity]       = useState("MEDIUM");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [okNo, setOkNo]               = useState<string | null>(null);
  const [err, setErr]                 = useState<string | null>(null);

  const [mine, setMine]       = useState<FeedbackRow[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  const loadMine = useCallback(async () => {
    setLoadingMine(true);
    try {
      const res = await fetch(`/api/uat/feedbacks?mine=1&limit=20`, { headers: hdr() });
      const d = await res.json().catch(() => ({}));
      setMine(Array.isArray(d?.items) ? d.items : []);
    } catch { /* ignore */ } finally { setLoadingMine(false); }
  }, []);

  useEffect(() => { if (open && tab === "mine") loadMine(); }, [open, tab, loadMine]);

  const reset = () => { setTitle(""); setType("BUG"); setSeverity("MEDIUM"); setDescription(""); setErr(null); };

  const submit = async () => {
    const t = title.trim();
    if (!t) { setErr(tt('ui.请填写一句话标题','请填写一句话标题')); return; }
    setSubmitting(true); setErr(null);
    try {
      const res = await fetch(`/api/uat/feedbacks`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          title: t,
          feedbackType: type,
          severity,
          description: description.trim() || undefined,
          moduleCode: pathname || undefined,   // 自动带当前页面,供智能体定位
          companyCode: companyCode || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message ?? `HTTP ${res.status}`);
      setOkNo(d?.feedback_no ?? tt('ui.已提交','已提交'));
      reset();
    } catch (e: any) { setErr(e.message); } finally { setSubmitting(false); }
  };

  return (
    <>
      {/* 浮动按钮 */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setOkNo(null); setTab("new"); }}
          title={tt('ui.试运行问题反馈','试运行问题反馈')}
          className="fixed bottom-6 right-6 z-[900] flex items-center gap-2 px-4 py-3 rounded-full bg-brand text-white shadow-lg hover:opacity-90 transition"
        >
          <MessageSquarePlus size={18} />
          <span className="text-sm font-semibold">{tt('ui.问题反馈','问题反馈')}</span>
        </button>
      )}

      {/* 弹窗 */}
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-6 bg-black/30" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-[420px] max-h-[88vh] overflow-y-auto bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl"
          >
            {/* 头 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-card">
              <div className="flex items-center gap-2">
                <MessageSquarePlus size={18} className="text-brand" />
                <span className="font-bold text-text">{tt('ui.试运行问题反馈','试运行问题反馈')}</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-text-dim hover:text-text"><X size={18} /></button>
            </div>

            {/* Tab */}
            <div className="flex gap-1 px-5 pt-3">
              {(["new", "mine"] as const).map((k) => (
                <button key={k} onClick={() => { setTab(k); setOkNo(null); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? "bg-brand/10 text-brand" : "text-text-muted hover:bg-bg-muted"}`}>
                  {k === "new" ? tt('ui.我要反馈','我要反馈') : tt('ui.我的反馈','我的反馈')}
                </button>
              ))}
            </div>

            {tab === "new" ? (
              <div className="p-5 space-y-4">
                {okNo ? (
                  <div className="flex flex-col items-center text-center py-8 gap-3">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                    <div className="text-text font-semibold">{tt('ui.反馈已收到：','反馈已收到：')}{okNo}</div>
                    <div className="text-sm text-text-muted flex items-center gap-1.5">
                      <Bot size={15} className="text-sky-500" /> {tt('ui.智能体将自动分析此问题并尝试修复，进度可在「我的反馈」查看。','智能体将自动分析此问题并尝试修复，进度可在「我的反馈」查看。')}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setOkNo(null)} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold">{tt('ui.再提一条','再提一条')}</button>
                      <button onClick={() => { setTab("mine"); }} className="px-4 py-2 rounded-lg border border-border text-text-muted text-sm">{tt('ui.查看我的反馈','查看我的反馈')}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs text-text-dim mb-1">{tt('ui.一句话说问题 *','一句话说问题 *')}</label>
                      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
                        placeholder={tt('ui.例：收银台改价后保存报错','例：收银台改价后保存报错')}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-bg-muted text-text text-sm outline-none focus:border-brand" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-text-dim mb-1">{tt('ui.类型','类型')}</label>
                        <select value={type} onChange={(e) => setType(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-muted text-text text-sm outline-none focus:border-brand">
                          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-text-dim mb-1">{tt('ui.严重度','严重度')}</label>
                        <select value={severity} onChange={(e) => setSeverity(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-muted text-text text-sm outline-none focus:border-brand">
                          {SEVERITIES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-text-dim mb-1">{tt('ui.详细描述（可选，写清步骤/期望/实际更易被智能体修复）','详细描述（可选，写清步骤/期望/实际更易被智能体修复）')}</label>
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                        placeholder={tt('ui.1. 我做了什么\n2. 期望看到什么\n3. 实际发生了什么','1. 我做了什么\n2. 期望看到什么\n3. 实际发生了什么')}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-bg-muted text-text text-sm outline-none focus:border-brand resize-y" />
                    </div>
                    <div className="text-xs text-text-dim flex items-center gap-1.5">
                      <Bot size={13} className="text-sky-500" /> {tt('ui.当前页面','当前页面')} <code className="px-1 rounded bg-bg-muted">{pathname}</code> {tt('ui.会自动附带，便于定位。','会自动附带，便于定位。')}
                    </div>
                    {err && <div className="text-sm text-red-500">{err}</div>}
                    <button onClick={submit} disabled={submitting}
                      className="w-full py-2.5 rounded-lg bg-brand text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                      {submitting ? <><Loader2 size={16} className="animate-spin" /> {tt('ui.提交中…','提交中…')}</> : tt('ui.提交反馈','提交反馈')}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="p-4">
                {loadingMine ? (
                  <div className="flex items-center justify-center py-12 text-text-dim gap-2"><Loader2 size={18} className="animate-spin" /> {tt('ui.加载中…','加载中…')}</div>
                ) : mine.length === 0 ? (
                  <div className="text-center text-text-dim text-sm py-12">{tt('ui.还没有反馈。遇到问题随手提一条吧 🙌','还没有反馈。遇到问题随手提一条吧 🙌')}</div>
                ) : (
                  <div className="space-y-2">
                    {mine.map((f) => {
                      const ag = AGENT_MAP[f.agent_status || "NONE"] ?? AGENT_MAP.NONE;
                      return (
                        <div key={f.id} className="rounded-xl border border-border bg-bg-muted/40 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-text truncate">{f.title}</span>
                            <span className="text-[11px] text-text-dim font-mono shrink-0">{f.feedback_no}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-bg-muted text-text-muted">{STATUS_LABEL[f.status] ?? f.status}</span>
                            <span className={`text-[11px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${ag.cls}`}>
                              <Bot size={11} /> {ag.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

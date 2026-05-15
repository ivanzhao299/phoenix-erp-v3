"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, AlertTriangle, TrendingUp, ClipboardCheck, BarChart2,
  Search, ArrowRight
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

interface Inspection {
  id: number; inspect_date?: string; created_at?: string;
  result?: string; batch_no?: string; inspector?: string;
  item_type?: string; defect_type?: string;
}

const QUICK_LINKS = [
  { title:"质检标准库", path:"/quality/standards", icon:"📋", desc:"管理检验标准与判定规则", color:"var(--color-primary)" },
  { title:"场端质检",   path:"/quality/farm",      icon:"🐔", desc:"养殖场日常巡检记录",     color:"#10b981" },
  { title:"成品质检",   path:"/quality/product",   icon:"🥚", desc:"包装成品质量检验",       color:"#f59e0b" },
  { title:"不合格品处置",path:"/quality/nonconformance",icon:"🚫",desc:"不合格品追踪与处置", color:"#ef4444" },
  { title:"正向追溯",   path:"/quality/forward",   icon:"🔍", desc:"从养殖到终端全链路追踪", color:"#3b82f6" },
  { title:"逆向追溯",   path:"/quality/backward",  icon:"🔄", desc:"从终端反查生产批次",     color:"#8b5cf6" },
];

export default function QualityPage() {
  const router = useRouter();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crud/qa_inspections?limit=500")
      .then(r => r.json())
      .then(d => setInspections(d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today     = new Date().toISOString().slice(0, 10);
  const passed    = inspections.filter(i => (i.result || "").toUpperCase().includes("PASS")).length;
  const failed    = inspections.filter(i => (i.result || "").toUpperCase().includes("FAIL")).length;
  const passRate  = inspections.length > 0 ? ((passed / inspections.length) * 100).toFixed(1) : "—";
  const todayCount= inspections.filter(i => (i.inspect_date || i.created_at || "").slice(0,10) === today).length;

  // 月度合格率趋势（最近4个月）
  const qualityTrend = useMemo(() => {
    const monthMap: Record<string, { pass: number; total: number }> = {};
    inspections.forEach(i => {
      const m = (i.inspect_date || i.created_at || "").slice(0, 7);
      if (!m) return;
      if (!monthMap[m]) monthMap[m] = { pass: 0, total: 0 };
      monthMap[m].total++;
      if ((i.result || "").toUpperCase().includes("PASS")) monthMap[m].pass++;
    });
    return Object.entries(monthMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-4)
      .map(([m, v]) => ({
        month: m.slice(5) + "月",
        rate: v.total > 0 ? Number(((v.pass / v.total) * 100).toFixed(1)) : 0,
      }));
  }, [inspections]);

  // 最近5条检验记录
  const recentInspections = useMemo(() =>
    [...inspections]
      .sort((a, b) =>
        (b.inspect_date||b.created_at||"").localeCompare(a.inspect_date||a.created_at||"")
      ).slice(0, 5)
  , [inspections]);

  const kpis = [
    { label:"本月检验批次", value:loading?"…":inspections.length, unit:"批",  accent:"var(--color-primary)", icon:<ClipboardCheck size={20}/> },
    { label:"合格率",       value:loading?"…":passRate,            unit:"%",   accent:"#10b981",              icon:<ShieldCheck size={20}/> },
    { label:"不合格批次",   value:loading?"…":failed,              unit:"批",  accent:"#ef4444",              icon:<AlertTriangle size={20}/> },
    { label:"今日检验",     value:loading?"…":todayCount,          unit:"次",  accent:"#3b82f6",              icon:<TrendingUp size={20}/> },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="品质追溯"
        subtitle={`全链路质量管控 · 共 ${inspections.length} 条质检记录`}
        breadcrumb={["品质追溯", "质检总览"]}
      />

      {/* KPI 卡片 */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14, marginBottom:24 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background:"var(--bg-card)", border:"1px solid var(--border)",
            borderLeft:`4px solid ${k.accent}`, borderRadius:"var(--radius-lg)",
            padding:"18px 20px", boxShadow:"var(--shadow-sm)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
              <p style={{ fontSize:12, color:"var(--text-secondary)", fontWeight:600 }}>{k.label}</p>
              <div style={{ color:k.accent, background:`color-mix(in srgb,${k.accent} 12%,transparent)`,
                borderRadius:"var(--radius-md)", padding:8 }}>{k.icon}</div>
            </div>
            <div style={{ fontSize:28, fontWeight:800, color:k.accent, lineHeight:1 }}>
              {String(k.value)}
              <span style={{ fontSize:13, fontWeight:500, marginLeft:3, color:"var(--text-secondary)" }}>{k.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20, marginBottom:24 }}>
        {/* 功能快捷入口 */}
        <div>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, color:"var(--color-primary)" }}>功能快捷入口</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {QUICK_LINKS.map(q => (
              <button key={q.path} type="button" onClick={() => router.push(q.path)}
                style={{ background:"var(--bg-card)", borderRadius:"var(--radius-lg)",
                  border:`1px solid ${q.color}25`, borderTop:`3px solid ${q.color}`,
                  padding:16, cursor:"pointer", textAlign:"left",
                  transition:"transform 0.18s,box-shadow 0.18s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform="translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-md)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform="none"; (e.currentTarget as HTMLElement).style.boxShadow="none"; }}>
                <div style={{ fontSize:24, marginBottom:8 }}>{q.icon}</div>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:3, color:"var(--text-primary)" }}>{q.title}</div>
                <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{q.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 合格率月度趋势 */}
        <div style={{ background:"var(--bg-card)", borderRadius:"var(--radius-lg)",
          border:"1px solid var(--border)", padding:18 }}>
          <h4 style={{ fontSize:13, fontWeight:700, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
            <BarChart2 size={15} color="var(--color-primary)"/> 合格率月度趋势
          </h4>
          {loading ? (
            <div style={{ color:"var(--text-secondary)", fontSize:12, textAlign:"center", padding:20 }}>加载中…</div>
          ) : qualityTrend.length === 0 ? (
            <div style={{ color:"var(--text-secondary)", fontSize:12, textAlign:"center", padding:20 }}>暂无月度数据</div>
          ) : qualityTrend.map(m => (
            <div key={m.month} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:12 }}>
                <span style={{ fontWeight:600, color:"var(--text-primary)" }}>{m.month}</span>
                <span style={{ fontWeight:700, color: m.rate >= 90 ? "#10b981" : m.rate >= 80 ? "#f59e0b" : "#ef4444" }}>{m.rate}%</span>
              </div>
              <div className={s.progressWrap} style={{ height:8 }}>
                <div className={`${s.progressBar} ${m.rate >= 90 ? s.progressBarSuccess : m.rate >= 80 ? s.progressBarWarning : s.progressBarDanger}`}
                  style={{ width:`${m.rate}%` }}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 近期检验记录 */}
      <div style={{ background:"var(--bg-card)", borderRadius:"var(--radius-lg)", border:"1px solid var(--border)", overflow:"hidden" }}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <h4 style={{ fontSize:13, fontWeight:700 }}>近期检验记录</h4>
          <button type="button" className={s.btnSecondary}
            style={{ fontSize:12, padding:"4px 10px", display:"flex", alignItems:"center", gap:4 }}
            onClick={() => router.push("/quality/forward")}>
            查看更多 <ArrowRight size={12}/>
          </button>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)" }}>
              {["批次号","检验项","检验员","检验日期","结果"].map(h => (
                <th key={h} style={{ padding:"8px 16px", textAlign:"left", fontSize:12,
                  fontWeight:700, color:"var(--text-secondary)", borderBottom:"1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ padding:24, textAlign:"center", color:"var(--text-secondary)" }}>加载中…</td></tr>
            )}
            {!loading && recentInspections.length === 0 && (
              <tr><td colSpan={5} style={{ padding:24, textAlign:"center", color:"var(--text-secondary)" }}>暂无质检记录</td></tr>
            )}
            {!loading && recentInspections.map((ins, i) => {
              const isPassed = (ins.result || "").toUpperCase().includes("PASS");
              return (
                <tr key={ins.id} style={{ borderBottom:"1px solid var(--border)",
                  background: i%2===0 ? "var(--bg-card)" : "var(--bg-page)" }}>
                  <td style={{ padding:"10px 16px", fontFamily:"monospace", fontSize:12, color:"var(--color-primary)" }}>
                    {ins.batch_no || "—"}
                  </td>
                  <td style={{ padding:"10px 16px", color:"var(--text-secondary)" }}>{ins.item_type || "综合检验"}</td>
                  <td style={{ padding:"10px 16px" }}>{ins.inspector || "—"}</td>
                  <td style={{ padding:"10px 16px", color:"var(--text-secondary)", fontSize:12 }}>
                    {(ins.inspect_date || ins.created_at || "—").slice(0,10)}
                  </td>
                  <td style={{ padding:"10px 16px" }}>
                    <span className={`${s.badge} ${isPassed ? s.badgeSuccess : s.badgeDanger}`}>
                      {isPassed ? "合格" : "不合格"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

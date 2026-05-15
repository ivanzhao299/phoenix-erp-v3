"use client";
import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import { Activity, Database, Cpu, Wifi, Clock, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

type Status = "ok" | "warn" | "error" | "loading";

const STATUS_COLOR: Record<Status, string> = { ok:"#16a34a", warn:"#d97706", error:"#dc2626", loading:"#9ca3af" };
const STATUS_BG:    Record<Status, string> = { ok:"#dcfce7", warn:"#fef3c7", error:"#fee2e2", loading:"#f3f4f6" };
const STATUS_LABEL: Record<Status, string> = { ok:"正常",     warn:"警告",    error:"故障",   loading:"检测中" };

function HealthCard({ title, icon, value, unit, status, detail, color }: { title:string; icon:React.ReactNode; value?:string|number|null; unit?:string; status:Status; detail?:string; color:string }) {
  const sc = STATUS_COLOR[status];
  const bg = STATUS_BG[status];
  return (
    <div style={{ backgroundColor:"var(--bg-card)", border:`1px solid ${sc}30`, borderRadius:"var(--radius-lg)", padding:20, borderLeft:`4px solid ${color}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div style={{ padding:8, backgroundColor:bg, borderRadius:8, color:sc }}>{icon}</div>
        <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, backgroundColor:bg, color:sc }}>{STATUS_LABEL[status]}</span>
      </div>
      <div style={{ fontSize:12, color:"var(--text-secondary)", fontWeight:600, marginBottom:4 }}>{title}</div>
      <div style={{ fontSize:26, fontWeight:800, color:sc }}>
        {value ?? "—"}{unit && <span style={{ fontSize:13, fontWeight:400, marginLeft:3 }}>{unit}</span>}
      </div>
      {detail && <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:6 }}>{detail}</div>}
    </div>
  );
}

const ENDPOINTS = [
  { path:"/api/health",                  desc:"基础健康检查",       key:"health" },
  { path:"/api/readiness",               desc:"数据库就绪探针",     key:"ready"  },
  { path:"/api/auth/me",                 desc:"身份验证",           key:"ok"     },
  { path:"/api/dashboard/kpi",           desc:"仪表盘数据",         key:"ok"     },
  { path:"/api/farm-device/alerts/stream", desc:"SSE 实时推送",     key:"ok"     },
];

export default function SystemHealthPage() {
  const [health,     setHealth]     = useState<Status|null>(null);
  const [ready,      setReady]      = useState<Status|null>(null);
  const [apiLatency, setApiLatency] = useState<number|null>(null);
  const [memUsage,   setMemUsage]   = useState<{ used:string; pct:string; limit:string }|null>(null);
  const [lastCheck,  setLastCheck]  = useState<string|null>(null);
  const [checking,   setChecking]   = useState(false);
  const [history,    setHistory]    = useState<number[]>([]);

  const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token")||"" : "");

  const runCheck = useCallback(async () => {
    setChecking(true);
    const t0 = Date.now();

    try { const r = await fetch("/api/health"); const d = await r.json(); setHealth(d.status==="OK"?"ok":"error"); }
    catch { setHealth("error"); }

    try { const r = await fetch("/api/readiness"); const d = await r.json(); setReady(d.status==="READY"?"ok":"error"); }
    catch { setReady("error"); }

    const latency = Date.now() - t0;
    setApiLatency(latency);
    setHistory(prev => [...prev.slice(-19), latency]);

    const mem = (window.performance as any)?.memory;
    if (mem) {
      setMemUsage({
        used:  (mem.usedJSHeapSize  / 1024 / 1024).toFixed(1),
        pct:   ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(1),
        limit: (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0),
      });
    }

    setLastCheck(new Date().toLocaleTimeString("zh-CN"));
    setChecking(false);
  }, []);

  useEffect(() => { runCheck(); const t = setInterval(runCheck, 30000); return () => clearInterval(t); }, [runCheck]);

  const latencyStatus: Status = apiLatency==null?"loading":apiLatency<200?"ok":apiLatency<800?"warn":"error";
  const memStatus:     Status = memUsage==null?"loading":Number(memUsage.pct)<60?"ok":Number(memUsage.pct)<80?"warn":"error";
  const avgLatency = history.length ? Math.round(history.reduce((a,b)=>a+b,0)/history.length) : null;
  const maxLatency = history.length ? Math.max(...history) : null;
  const sparkMax   = Math.max(...history, 100);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="系统健康监控"
        subtitle="实时检测后端服务、数据库连接与前端性能"
        breadcrumb={["系统设置","健康监控"]}
        actions={
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {lastCheck && <span style={{ fontSize:12, color:"var(--text-secondary)" }}>上次检测: {lastCheck}</span>}
            <button type="button" onClick={runCheck} disabled={checking}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", cursor:checking?"not-allowed":"pointer", fontSize:13, opacity:checking?0.6:1, color:"var(--text-primary)" }}>
              <RefreshCw size={13} style={{ animation:checking?"spin 1s linear infinite":undefined }}/> 立即检测
            </button>
          </div>
        }
      />

      {/* 健康卡片 */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:16, marginBottom:24 }}>
        <HealthCard title="API 服务"       icon={<Activity size={20}/>} value={health==="ok"?"运行中":health==="error"?"异常":null} status={health||"loading"} color="#6366f1" detail="GET /api/health"/>
        <HealthCard title="数据库连接"     icon={<Database size={20}/>} value={ready==="ok"?"已就绪":ready==="error"?"断开":null}    status={ready||"loading"}  color="#22c55e" detail="GET /api/readiness (PostgreSQL)"/>
        <HealthCard title="API 响应延迟"   icon={<Wifi size={20}/>}     value={apiLatency} unit="ms" status={latencyStatus} color="#f59e0b"
          detail={avgLatency?`近${history.length}次平均 ${avgLatency}ms，最高 ${maxLatency}ms`:"首次检测"}/>
        <HealthCard title="前端内存占用"   icon={<Cpu size={20}/>}      value={memUsage?.used} unit="MB" status={memStatus} color="#8b5cf6"
          detail={memUsage?`${memUsage.pct}% / ${memUsage.limit}MB 上限`:"仅 Chromium 内核支持"}/>
      </div>

      {/* 延迟趋势迷你图 */}
      {history.length > 1 && (
        <div style={{ backgroundColor:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:20, marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:16, display:"flex", alignItems:"center", gap:8, color:"var(--text-primary)" }}>
            <Clock size={15}/> API 延迟历史（最近 {history.length} 次，30秒/次）
          </div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:80 }}>
            {history.map((v,i) => {
              const pct = Math.max(4, (v/sparkMax)*100);
              const col = v<200?"#22c55e":v<800?"#f59e0b":"#dc2626";
              return <div key={i} title={`${v}ms`} style={{ flex:1, height:`${pct}%`, backgroundColor:col, borderRadius:"3px 3px 0 0", opacity:i===history.length-1?1:0.65 }}/>;
            })}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:11, color:"var(--text-secondary)" }}>
            <span>最早</span>
            <span style={{ display:"flex", gap:12 }}>
              <span style={{ color:"#22c55e" }}>● &lt;200ms 正常</span>
              <span style={{ color:"#f59e0b" }}>● &lt;800ms 警告</span>
              <span style={{ color:"#dc2626" }}>● &gt;800ms 故障</span>
            </span>
            <span>最新</span>
          </div>
        </div>
      )}

      {/* 端点状态表 */}
      <div style={{ backgroundColor:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:20 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"var(--text-primary)" }}>关键端点状态</div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ backgroundColor:"var(--bg-page)" }}>
              {["端点","用途","状态"].map(h=>(
                <th key={h} style={{ padding:"8px 12px", textAlign:"left", color:"var(--text-secondary)", fontWeight:600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((row,i) => {
              const s: Status = row.key==="health"?(health||"loading"):row.key==="ready"?(ready||"loading"):"ok";
              const color = STATUS_COLOR[s];
              const Icon  = s==="ok"?CheckCircle:s==="error"?XCircle:AlertTriangle;
              return (
                <tr key={i} style={{ borderTop:"1px solid var(--border)" }}>
                  <td style={{ padding:"10px 12px", fontFamily:"monospace", fontSize:12, color:"var(--color-primary)" }}>{row.path}</td>
                  <td style={{ padding:"10px 12px", color:"var(--text-secondary)" }}>{row.desc}</td>
                  <td style={{ padding:"10px 12px" }}>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:4, color, fontWeight:600, fontSize:12 }}>
                      <Icon size={13}/>{STATUS_LABEL[s]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}

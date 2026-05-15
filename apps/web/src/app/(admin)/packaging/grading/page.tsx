"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Filter, CheckCircle, Layers, ChevronDown, ChevronUp } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDialog } from "@/contexts/DialogContext";
import s from "@/components/ui/admin-ui.module.css";

const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const GRADE_COLORS = [
  { color: '#7c3aed', bg: '#ede9fe' },
  { color: '#0A2540', bg: '#eff6ff' },
  { color: '#059669', bg: '#f0fdf4' },
  { color: '#d97706', bg: '#fef9c3' },
  { color: '#f59e0b', bg: '#fff7ed' },
  { color: '#dc2626', bg: '#fef2f2' },
];
const GRADE_UI_MAP: Record<string,{color:string;bg:string}> = {
  AAA:GRADE_COLORS[0],AA:GRADE_COLORS[1],A:GRADE_COLORS[2],
  B:GRADE_COLORS[3],C:GRADE_COLORS[4],X:GRADE_COLORS[5],
};
function getGradeColor(code:string,idx:number){return GRADE_UI_MAP[code]||GRADE_COLORS[idx]||GRADE_COLORS[GRADE_COLORS.length-1];}

// P0-2: 把 PG / SQLite 偶尔返回的 `YYYY-MM-DD HH:mm:ss` 形式补成 ISO，浏览器才会按 UTC 排序
function toUtcTs(v: unknown): string {
  if (!v) return "";
  const s = String(v).trim();
  if (!s) return "";
  // 已经带 Z 或带显式时区 (+08, -05 等) 的：原样
  if (/[zZ]$/.test(s) || /[+\-]\d{2}:?\d{2}$/.test(s)) return s;
  // 形如 "2026-05-13 11:30:00" → "2026-05-13T11:30:00Z"
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return s.replace(" ", "T") + "Z";
  return s;
}

// 翻译"鸡舍·班次"字符串到当前语言（V2 GradingOperation 复刻）
const _CH_NUM: Record<string,string> = { '一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10' };
function translateFarmHouse(text: string, lang: string, shiftMap: Record<string,{en?:string;lo?:string}>): string {
  if (!text || lang === 'zh') return text;
  const clean = text.replace(/\s*\[[^\]]*\]/g, '').trim();
  const parts = clean.split(/\s*[··]\s*/);
  return parts.map(part => {
    const p = part.trim();
    if (!p) return '';
    const houseM = p.match(/^([一二三四五六七八九十]+)号鸡舍(.*)$/);
    if (houseM) {
      const n = _CH_NUM[houseM[1]] || houseM[1];
      const base = lang === 'en' ? `House #${n}` : `ຄອກ #${n}`;
      const rest = houseM[2].trim();
      return rest ? `${base} ${rest}` : base;
    }
    // 班次：查 sys_dict.PKG_SHIFT 的 dict_label_en / dict_label_lo
    for (const [zh, m] of Object.entries(shiftMap)) {
      if (p.startsWith(zh)) {
        const rest = p.slice(zh.length).trim();
        const label = lang === 'en' ? (m.en || p) : (m.lo || p);
        return rest ? `${label} ${rest}` : label;
      }
    }
    return p;
  }).filter(Boolean).join(' · ');
}

// 兜底等级 — 与 sys_dict.PKG_EGG_GRADE 1-5 号蛋结构对齐（仅在 grade-config API 异常时显示）
// 真实生效来源永远是后端 /api/packaging/grade-config (读 sys_dict.PKG_EGG_GRADE.config_json)
// 管理员可在「系统设置 → 字典管理」修改 PKG_EGG_GRADE 即可热更新本页等级标准
const FALLBACK_GRADES: any[] = [
  { code:'1', name:'1号蛋', nameZh:'1号蛋（59-66g）', weightRange:'59-66g', saleable:true  },
  { code:'2', name:'2号蛋', nameZh:'2号蛋（53-59g）', weightRange:'53-59g', saleable:true  },
  { code:'3', name:'3号蛋', nameZh:'3号蛋（46-53g）', weightRange:'46-53g', saleable:true  },
  { code:'4', name:'4号蛋', nameZh:'4号蛋（40-46g）', weightRange:'40-46g', saleable:true  },
  { code:'5', name:'5号蛋', nameZh:'5号蛋（30-40g）', weightRange:'30-40g', saleable:true  },
].map((g, idx) => ({ ...g, ...getGradeColor(g.code, idx) }));
const FALLBACK_INPUTS = Object.fromEntries(FALLBACK_GRADES.map(g => [g.code, ""]));

export default function GradingPage() {
  const { t, lang } = useLanguage() as { t: (k:string,d?:string)=>string; lang?: string };
  const { showAlert } = useDialog() as { showAlert: (opts:{type?:string;title?:string;message?:string;icon?:string})=>Promise<boolean> };
  const curLang = (lang === 'en' || lang === 'lo') ? lang : 'zh';
  const searchParams = useSearchParams();
  const taskParam = searchParams.get("task");
  const autoRef = useRef(false);
  const rightRef = useRef<HTMLDivElement>(null);
  const [tasks,          setTasks]          = useState<any[]>([]);
  const [activeId,       setActiveId]       = useState<string|null>(null);
  const [grades,         setGrades]         = useState<any[]>(FALLBACK_GRADES);
  const [gradeInputs,    setGradeInputs]    = useState<Record<string,string>>(FALLBACK_INPUTS);
  const [presort,        setPresort]        = useState({xl:"",dirty:"",broken:""});
  const [anomalyReasons, setAnomalyReasons] = useState<any[]>([]);
  const [shiftLabelMap,  setShiftLabelMap]  = useState<Record<string,{en?:string;lo?:string}>>({});
  const [selectedReason, setSelectedReason] = useState("");
  const [submitAttempted,setSubmitAttempted]= useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [gradeStdOpen,   setGradeStdOpen]  = useState(false);
  const [justNavigated,  setJustNavigated] = useState(!!taskParam);
  // 提交成功后展示生成的批次清单（V2 GradingOperation 风格）
  const [submitResult,   setSubmitResult]   = useState<{ msg:string; batches: Array<{grade:string;qty:number;batch_no:string}> }|null>(null);

  const loadData = useCallback(async () => {
    const r = await fetch(`/api/packaging/grading-tasks?status=all&date=all&_t=${Date.now()}`, { headers: hdr() });
    const j = await r.json();
    const rows = ((j.data||[]) as any[]).filter((d:any)=>String(d.status||"").toUpperCase()!=="CANCELLED").map((d:any)=>{
      const st = String(d.status||"").toUpperCase();   // P0-3 同款：状态大小写不敏感
      return {
        id: d.task_no, batchNo: d.batch_no||d.task_no, farmHouse: d.source_item||"待分配",
        totalQty: Number(d.plan_qty)||0, gradedQty: Number(d.packed_qty)||0,
        status: st==="IN_PROGRESS"?"inProgress":st==="DONE"?"done":"pending",
        gradeResults:(()=>{try{return d.grade_results?(typeof d.grade_results==="string"?JSON.parse(d.grade_results):d.grade_results):null;}catch{return null;}})(),
        discrepancyQty:Number(d.discrepancy_qty)||0, breakageRate:Number(d.breakage_rate)||0,
        anomalyReason: d.anomaly_reason||"",
        // P0-2: toUtcTs — PG 偶尔返回 `YYYY-MM-DD HH:mm:ss`（无 T/Z），浏览器会当本地时间排序错；强制 ISO
        updatedAt: toUtcTs(d.updated_at) || toUtcTs(d.created_at) || "",
        operator:  d.operator||d.source_item||"---",
      };
    });
    setTasks(rows);
    if (taskParam && !autoRef.current) {
      const found = rows.find((r:any) => r.id===taskParam);
      if (found) { setActiveId(found.id); autoRef.current=true; setJustNavigated(true); setTimeout(()=>setJustNavigated(false),4000); return; }
    }
    if (rows.length>0 && !activeId) setActiveId(rows[0].id);
  }, [taskParam]);

  useEffect(()=>{ loadData(); },[]);

  // P2-6: 成功 modal 自动 4 秒消失（用户也可点遮罩或"关闭"主动关）
  useEffect(() => {
    if (!submitResult) return;
    const t = setTimeout(() => setSubmitResult(null), 4000);
    return () => clearTimeout(t);
  }, [submitResult]);

  useEffect(()=>{
    fetch("/api/packaging/grade-config",{headers:hdr()}).then(r=>r.json()).then(d=>{
      const g=(d.grades||[]).map((gr:any,idx:number)=>({...gr,...getGradeColor(gr.code,idx)}));
      if(g.length>0){setGrades(g);setGradeInputs(Object.fromEntries(g.map((x:any)=>[x.code,""])))}
    }).catch(()=>{});
    fetch("/api/crud/sys_dict?dict_type=PKG_ANOMALY_REASON&status=ACTIVE&limit=100",{headers:hdr()})
      .then(r=>r.json()).then(j=>{
        const list=((j.data||j) as any[]).filter((d:any)=>d.dict_type==="PKG_ANOMALY_REASON"&&d.status==="ACTIVE");
        if(list.length>0) setAnomalyReasons(list);
      }).catch(()=>{});
    // PKG_SHIFT 字典：构 dict_label_zh → {en, lo} 映射，用于 translateFarmHouse 多语展示
    fetch("/api/crud/sys_dict?dict_type=PKG_SHIFT&status=ACTIVE&limit=100",{headers:hdr()})
      .then(r=>r.json()).then(j=>{
        const list=((j.data||j) as any[]).filter((d:any)=>d.dict_type==="PKG_SHIFT"&&d.status==="ACTIVE");
        const map: Record<string,{en?:string;lo?:string}> = {};
        for (const d of list) {
          if (d.dict_label_zh) map[d.dict_label_zh] = { en: d.dict_label_en, lo: d.dict_label_lo };
        }
        if (Object.keys(map).length > 0) setShiftLabelMap(map);
      }).catch(()=>{});
  },[]);

  const selectTask=(id:string)=>{ setActiveId(id); setGradeInputs(Object.fromEntries(grades.map(g=>[g.code,""]))); setPresort({xl:"",dirty:"",broken:""}); setSelectedReason(""); setSubmitAttempted(false); setTimeout(()=>rightRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),50); };
  const cur=tasks.find(t=>t.id===activeId);
  const rawResult=cur?.gradeResults;
  const resultTotal=rawResult?Object.values(rawResult).reduce((s:number,v)=>s+Number(v),0):0;
  const result=(cur?.status==="done"&&resultTotal>0)?rawResult:null;

  const handleSubmit=async()=>{
    if(!cur)return; setSubmitAttempted(true);
    const gd:Record<string,number>={}; grades.forEach(g=>{gd[g.code]=Number(gradeInputs[g.code])||0;});
    const grandTotal=Object.values(gd).reduce((s,v)=>s+v,0);
    const pXl=Math.max(0,Number(presort.xl)||0), pDirty=Math.max(0,Number(presort.dirty)||0), pBroken=Math.max(0,Number(presort.broken)||0);
    const pTotal=pXl+pDirty+pBroken, allConsumed=grandTotal+pTotal, planQty=cur.totalQty;
    if(Object.values(gd).some(v=>v<0)){ showAlert({type:"warning",icon:"⚠️",title:"录入错误",message:"数量不能为负数"}); return; }
    if(grandTotal===0){ showAlert({type:"warning",icon:"📋",title:"提交不完整",message:"请至少填写一个等级的分级数量"}); return; }
    if(planQty>0&&allConsumed>planQty){ showAlert({type:"danger",icon:"❌",title:"超出计划量",message:`合计 ${allConsumed.toLocaleString()} 枚超出计划 ${planQty.toLocaleString()} 枚（多 ${(allConsumed-planQty).toLocaleString()} 枚）`}); return; }
    const nonS=grades.filter(g=>!g.saleable).reduce((s,g)=>s+(gd[g.code]||0),0);
    const bRate=grandTotal>0?(nonS+pBroken)/(planQty||grandTotal):0;
    const diff=planQty>0?planQty-allConsumed:0;
    if((diff!==0||bRate>0.001)&&!selectedReason){ showAlert({type:"warning",icon:"⚠️",title:"异常未说明",message:"存在数量差异或破损率超标，请先在下方选择异常原因再提交"}); return; }
    setSubmitting(true);
    try{
      const resp=await fetch(`/api/packaging/tasks/${cur.id}/grade`,{method:"POST",headers:hdr(),body:JSON.stringify({grade_results:gd,anomaly_reason:selectedReason||"",presort:{xl_qty:pXl,dirty_qty:pDirty,broken_qty:pBroken}})});
      const json=await resp.json();
      if(!resp.ok){ showAlert({type:"danger",icon:"❌",title:"提交失败",message:json.msg||`HTTP ${resp.status}`}); return; }
      // V2 风格的成功反馈：显示生成的等级批次清单（modal）
      setSubmitResult({ msg: json.msg || "分级结果已提交", batches: Array.isArray(json.grade_batches) ? json.grade_batches : [] });
      setGradeInputs(Object.fromEntries(grades.map(g=>[g.code,""]))); setPresort({xl:"",dirty:"",broken:""}); setSelectedReason(""); setSubmitAttempted(false); loadData();
    }catch{ showAlert({type:"danger",icon:"📡",title:"网络异常",message:"提交失败，请检查网络后重试"}); }
    finally{setSubmitting(false);}
  };

  const totalGraded=tasks.reduce((s,t)=>s+(t.gradedQty||0),0);
  const doneCount=tasks.filter(t=>t.status==="done").length;
  const nonSaleableCodes=new Set(grades.filter(g=>!g.saleable).map(g=>g.code));
  const cCount=tasks.reduce((s,t)=>{if(!t.gradeResults)return s;return s+Object.entries(t.gradeResults).filter(([c])=>nonSaleableCodes.has(c)).reduce((a,[,v])=>a+(Number(v)||0),0);},0);
  const cPct=totalGraded>0?(cCount/totalGraded*100).toFixed(2):"0.00";
  const graded=grades.reduce((s,g)=>s+(Number(gradeInputs[g.code])||0),0);
  const presorted=(Number(presort.xl)||0)+(Number(presort.dirty)||0)+(Number(presort.broken)||0);
  const entered=graded+presorted, plan=cur?.totalQty||0, diff2=plan-entered;
  const isOver2=diff2<0, isOk2=diff2===0;
  const nonS2=grades.filter(g=>!g.saleable).reduce((s,g)=>s+(Number(gradeInputs[g.code])||0),0);
  // P1-1: 与 handleSubmit 同款公式 — 含 presortBroken，分母用 planQty 兜底 grandTotal
  const pBroken2 = Math.max(0, Number(presort.broken)||0);
  const bRate2 = graded>0 ? (nonS2 + pBroken2) / (plan || graded) : 0;
  const needPanel = graded>0 && (diff2!==0 || bRate2>0.001);
  // P0-3: 对称比较函数（旧 `?-1:1` 不稳定）— inProgress < pending < done，rank 减法保证稳定
  const STATUS_RANK: Record<string, number> = { inProgress: 0, pending: 1, done: 2 };
  const todo = [...tasks].filter(t=>t.status!=="done")
    .sort((a,b)=> (STATUS_RANK[a.status]??1) - (STATUS_RANK[b.status]??1));
  const done2 = [...tasks].filter(t=>t.status==="done")
    .sort((a,b)=> new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div>
      <PageHeader
        title={t("packaging.grading","分级作业")}
        subtitle={t("ui.grading_subtitle","鸡蛋按重量分选入级")}
        breadcrumb={[t("menu.packaging","分级包装"), t("packaging.grading","分级作业")]}
      />
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {/* P2-2/3: KPI 文案 i18n + 单位三语 */}
        {(() => {
          const pcs = curLang==="en"?"pcs":curLang==="lo"?"ໜ່ວຍ":"枚";
          const batch = curLang==="en"?"batches":curLang==="lo"?"ບັອດ":"批";
          return [
            { icon:<Layers size={20}/>,      label:t("ui.今日分级总量","今日分级总量"), val:totalGraded.toLocaleString(), unit:pcs },
            { icon:<CheckCircle size={20}/>, label:t("ui.已完成任务","已完成任务"),     val:String(doneCount),             unit:batch },
            { icon:<Filter size={20}/>,      label:t("ui.次品率","次品率"),             val:cPct,                          unit:"%" },
            { icon:<Layers size={20}/>,      label:t("ui.待分级批次","待分级批次"),     val:String(tasks.filter(t=>t.status!=="done").length), unit:batch },
          ];
        })().map(k=>(
          <div key={k.label} className={s.kpiCard}><div className={s.kpiIcon}>{k.icon}</div><div><div className={s.kpiValue}>{k.val} <span style={{fontSize:12,fontWeight:400}}>{k.unit}</span></div><div className={s.kpiLabel}>{k.label}</div></div></div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:20,minHeight:600}}>
        {/* Left — dark panel like V2 */}
        <div style={{backgroundColor:"#1e293b",borderRadius:"var(--radius-lg)",padding:"16px 12px",display:"flex",flexDirection:"column",gap:0}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,textTransform:"uppercase",marginBottom:10,paddingLeft:4}}>{t("ui.分级任务列表","分级任务列表")}</div>
          {tasks.length===0&&<div style={{color:"#64748b",fontSize:13,textAlign:"center",padding:"40px 0"}}>{t("ui.暂无分级任务","暂无分级任务")}</div>}
          {todo.map(task=>{
            const isActive=activeId===task.id;
            const borderClr=task.status==="inProgress"?"#f59e0b":"#3b82f6";
            return(<div key={task.id} onClick={()=>selectTask(task.id)} style={{marginBottom:5,padding:"9px 10px 9px 14px",borderRadius:8,cursor:"pointer",borderLeft:`3px solid ${isActive?"#6366f1":borderClr}`,backgroundColor:isActive?"#6366f120":"#ffffff10",transition:"all 0.15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}><span style={{fontWeight:700,fontSize:12,color:isActive?"#fff":"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>{translateFarmHouse(task.farmHouse, curLang, shiftLabelMap)}</span><span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:999,backgroundColor:task.status==="inProgress"?"#f59e0b30":"#3b82f630",color:task.status==="inProgress"?"#fcd34d":"#93c5fd"}}>{task.status==="inProgress"?t("ui.进行中","进行中"):t("ui.待分级","待分级")}</span></div>
              {task.totalQty>0&&<div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:3}}><span style={{fontSize:18,fontWeight:900,color:isActive?"#fcd34d":"#f1f5f9",lineHeight:1}}>{task.totalQty.toLocaleString()}</span><span style={{fontSize:10,color:"#64748b",fontWeight:600}}>{curLang==="en"?"pcs":curLang==="lo"?"ໜ່ວຍ":"枚"}</span></div>}
              <div style={{fontSize:9,fontFamily:"monospace",color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.batchNo}</div>
              {task.totalQty>0&&<div style={{height:2,backgroundColor:"#334155",borderRadius:1,marginTop:5,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,Math.round(task.gradedQty/task.totalQty*100))}%`,background:"linear-gradient(90deg,#3b82f6,#6366f1)",borderRadius:1}}/></div>}
            </div>);
          })}
          {done2.length>0&&(<>
            <div style={{display:"flex",alignItems:"center",gap:6,margin:"10px 0 8px",padding:"0 4px"}}><div style={{flex:1,height:1,backgroundColor:"#334155"}}/><span style={{fontSize:10,color:"#475569",fontWeight:700,whiteSpace:"nowrap"}}>✓ 已完成 {done2.length}</span><div style={{flex:1,height:1,backgroundColor:"#334155"}}/></div>
            {done2.map(task=>{
              const isActive=activeId===task.id,hasDiff=task.discrepancyQty!==0,hasHiBrk=task.breakageRate>0.001,hasAnomaly=hasDiff||hasHiBrk,isSevere=Math.abs(task.discrepancyQty)>task.totalQty*0.05||task.breakageRate>0.005;
              const borderClr=!hasAnomaly?"#22c55e":isSevere?"#ef4444":"#f59e0b";
              return(<div key={task.id} onClick={()=>selectTask(task.id)} style={{marginBottom:4,padding:"8px 10px 8px 14px",borderRadius:8,cursor:"pointer",opacity:isActive?1:0.7,borderLeft:`3px solid ${borderClr}`,backgroundColor:isActive?`${borderClr}20`:"#ffffff08"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}><span style={{fontWeight:700,fontSize:11,color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{translateFarmHouse(task.farmHouse, curLang, shiftLabelMap)}</span><span style={{fontSize:9,color:hasAnomaly?(isSevere?"#f87171":"#fcd34d"):"#4ade80"}}>{hasAnomaly?(isSevere?"🔴":"⚠️"):"✓"}</span></div>
                <div style={{fontSize:16,fontWeight:900,lineHeight:1,marginBottom:2,color:"#f1f5f9"}}>{task.gradedQty.toLocaleString()} <span style={{fontSize:9,fontWeight:400}}>枚</span>{task.updatedAt&&<span style={{fontSize:9,color:"#4ade80",fontWeight:700,marginLeft:4}}>✓ {task.updatedAt.slice(11,16)}</span>}</div>
                <div style={{fontSize:9,fontFamily:"monospace",color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.batchNo}</div>
                {/* P2-4: 异常详情徽章 — V2 GradingOperation 复刻 (少/多 X 枚 + 破损率 N‰ + 异常原因) */}
                {hasAnomaly && (
                  <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                    {hasDiff && (
                      <span style={{fontSize:9,padding:"1px 6px",borderRadius:999,background:isSevere?"#ef444433":"#f59e0b33",color:isSevere?"#fca5a5":"#fcd34d",fontWeight:700}}>
                        {task.discrepancyQty>0?"少":"多"} {Math.abs(task.discrepancyQty).toLocaleString()} 枚
                      </span>
                    )}
                    {hasHiBrk && (
                      <span style={{fontSize:9,padding:"1px 6px",borderRadius:999,background:"#ef444433",color:"#fca5a5",fontWeight:700}}>
                        破损 {(task.breakageRate*1000).toFixed(2)}‰
                      </span>
                    )}
                    {task.anomalyReason && (
                      <span style={{fontSize:9,padding:"1px 6px",borderRadius:999,background:"#94a3b833",color:"#cbd5e1"}}>
                        {task.anomalyReason}
                      </span>
                    )}
                  </div>
                )}
              </div>);
            })}
          </>)}
          <div style={{marginTop:"auto",paddingTop:12,borderTop:"1px solid #334155"}}>
            <button type="button" onClick={()=>setGradeStdOpen(o=>!o)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 4px",background:"none",border:"none",cursor:"pointer",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.5px"}}>等级标准对照表 {gradeStdOpen?<ChevronUp size={11}/>:<ChevronDown size={11}/>}</button>
            {gradeStdOpen&&<div style={{display:"flex",flexDirection:"column",gap:3,marginTop:6}}>{grades.map((g:any)=><div key={g.code} style={{display:"flex",alignItems:"center",gap:8,padding:4}}><span style={{minWidth:30,textAlign:"center",fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,background:g.bg||"#e2e8f0",color:g.color||"#374151"}}>{g.code}</span><span style={{fontSize:10,color:"#64748b"}}>{g.weightRange}</span></div>)}</div>}
          </div>
        </div>

        {/* Right */}
        <div ref={rightRef}>
          {!cur?(<div className={s.emptyState} style={{padding:60}}><div className={s.emptyStateText}>请选择一个分级任务</div></div>)
          :result?(<div className={s.card}>
            <h3 style={{fontSize:14,fontWeight:700,marginBottom:10,color:"var(--color-primary)"}}>分级结果 — {cur.batchNo}</h3>
            <div style={{display:"grid",gridTemplateColumns:`repeat(${grades.length},1fr)`,gap:8,marginBottom:16}}>{grades.map(g=>(<div key={g.code} className={s.statBox}><div className={s.statValue}>{Number(result[g.code]||0).toLocaleString()}</div><div className={s.statLabel}>{g.name||g.code}</div><div style={{fontSize:10,color:"var(--text-secondary)"}}>{resultTotal>0?(Number(result[g.code]||0)/resultTotal*100).toFixed(1):"0.0"}%</div></div>))}</div>
            <div style={{display:"flex",height:28,borderRadius:6,overflow:"hidden",gap:2,marginBottom:8}}>{grades.map(g=>{const val=Number(result[g.code]||0);return<div key={g.code} style={{flex:val||0.01,background:"var(--color-primary)",opacity:0.4+(val/(resultTotal||1))*0.6,display:"flex",alignItems:"center",justifyContent:"center"}}>{resultTotal>0&&val/resultTotal>0.08&&<span style={{fontSize:10,fontWeight:700,color:"white"}}>{(val/resultTotal*100).toFixed(0)}%</span>}</div>})}</div>
            {/* P1-2: 合格率按 sys_dict.saleable=false 动态扣除（V2 同款），不再硬编码 X */}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text-secondary)"}}>
              <span>合计：{resultTotal.toLocaleString()} 枚</span>
              <span>合格率：{(() => {
                if (resultTotal <= 0) return "100.0";
                const nonSaleableInResult = grades.filter(g=>!g.saleable).reduce((s,g)=>s+Number(result[g.code]||0),0);
                return ((resultTotal - nonSaleableInResult)/resultTotal*100).toFixed(1);
              })()}%</span>
            </div>
          </div>)
          :(<div className={s.card} style={{minHeight:600,display:"flex",flexDirection:"column"}}>
            <div style={{marginBottom:16,paddingBottom:12,borderBottom:"1px solid var(--border)"}}>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>录入分级数量</div>
              <div style={{fontSize:15,fontWeight:800,fontFamily:"monospace",marginTop:2}}>{cur.batchNo}</div>
              {cur.totalQty>0&&<div style={{fontSize:12,color:"var(--text-secondary)",marginTop:3}}>计划量：<strong>{cur.totalQty.toLocaleString()}</strong> 枚 · {translateFarmHouse(cur.farmHouse, curLang, shiftLabelMap)}</div>}
            </div>
            {/* Step 1 */}
            <div style={{marginBottom:14,background:"var(--bg-muted)",borderRadius:12,padding:14,border:"2px solid var(--status-warning,#f59e0b)"}}>
              <div style={{fontSize:11,fontWeight:800,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                <span style={{background:"var(--status-warning,#f59e0b)",color:"#fff",borderRadius:"50%",width:20,height:20,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,flexShrink:0}}>1</span>
                预分拣 — 进分级机前剔除
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {([ ["xl","⭐ 特大号蛋 XL","≥66g·XL产品"],["dirty","🟡 脏蛋","低价/主管处置"],["broken","💔 破蛋","食堂/报废"] ] as [string,string,string][]).map(([key,label,sub])=>(
                  <div key={key} className={s.card} style={{padding:8}}>
                    <div style={{fontSize:10,fontWeight:700,marginBottom:4,color:"var(--text-secondary)"}}>{label}</div>
                    <input type="number" min="0" step="1" value={(presort as any)[key]} onChange={e=>setPresort(p=>({...p,[key]:String(Math.max(0,Math.floor(Number(e.target.value)||0))||"")}))} placeholder="0" className={s.inp} style={{fontSize:18,fontWeight:900,textAlign:"center"}}/>
                    <div style={{fontSize:9,color:"var(--text-secondary)",marginTop:3,textAlign:"center"}}>{sub}</div>
                  </div>
                ))}
              </div>
              {presorted>0&&<div style={{marginTop:8,fontSize:11,textAlign:"center",fontWeight:600}}>预分拣合计 <strong>{presorted.toLocaleString()}</strong> 枚{cur.totalQty>0&&<> · 剩余进分级机 <strong>{(cur.totalQty-presorted).toLocaleString()}</strong> 枚</>}</div>}
            </div>
            {/* Step 2 */}
            <div style={{background:"var(--bg-muted)",borderRadius:12,padding:14,border:"2px solid var(--color-primary)",marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:800,color:"var(--color-primary)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                <span style={{background:"var(--color-primary)",color:"#fff",borderRadius:"50%",width:20,height:20,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,flexShrink:0}}>2</span>
                标准分级录入
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
                {grades.map((g:any,idx:number)=>{
                  const gc=getGradeColor(g.code,idx);
                  return(<div key={g.code} style={{padding:"12px 10px 10px",display:"flex",flexDirection:"column",gap:6,borderRadius:8,border:`2px solid ${gc.color}20`,background:gc.bg}}>
                    <span style={{fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:4,background:gc.bg,color:gc.color,border:`1px solid ${gc.color}40`,alignSelf:"flex-start"}}>{g.name||g.code}</span>
                    <input type="number" min="0" step="1" value={gradeInputs[g.code]||""} onChange={e=>{const v=Math.max(0,Math.floor(Number(e.target.value)||0));setGradeInputs(p=>({...p,[g.code]:v?String(v):""}));}} placeholder="0" className={s.inp} style={{fontSize:22,fontWeight:900,textAlign:"center",color:gc.color,borderColor:gc.color}}/>
                    {g.weightRange&&<div style={{fontSize:9,color:gc.color,textAlign:"center",opacity:0.8}}>{g.weightRange}</div>}
                  </div>);
                })}
              </div>
              {cur.totalQty>0&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {([["计划量",plan.toLocaleString()+"枚","var(--text-primary)"],["预分拣+分级",entered.toLocaleString()+"枚","var(--text-primary)"],[isOver2?"超出":isOk2?"完全对账":"差额",isOver2?`❌ ${(-diff2).toLocaleString()}枚`:isOk2?"✅ 完全对账":`${diff2.toLocaleString()}枚`,isOver2?"var(--status-danger)":isOk2?"var(--status-success)":"var(--status-warning)"]] as [string,string,string][]).map(([label,val,c])=>(
                    <div key={label} style={{background:"var(--bg-card)",borderRadius:8,padding:"8px 10px",textAlign:"center",border:"1px solid var(--border)"}}>
                      <div style={{fontSize:10,color:"var(--text-secondary)",marginBottom:2}}>{label}</div>
                      <div style={{fontSize:13,fontWeight:800,color:c}}>{val}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Anomaly */}
            {submitAttempted&&needPanel&&(
              <div style={{background:"var(--bg-muted)",border:"2px solid var(--status-warning,#f59e0b)",borderRadius:12,padding:12,marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,marginBottom:8,display:"flex",gap:8,flexWrap:"wrap"}}>⚠️ 需选择异常原因
                  {diff2!==0&&<span style={{padding:"1px 8px",borderRadius:999,background:"var(--bg-card)",border:"1px solid var(--border)"}}>数量{diff2>0?"少":"多"} {Math.abs(diff2).toLocaleString()} 枚</span>}
                  {bRate2>0.001&&<span style={{padding:"1px 8px",borderRadius:999,color:"var(--status-danger)",background:"var(--bg-card)",border:"1px solid var(--border)"}}>破损率 {(bRate2*1000).toFixed(2)}‰</span>}
                </div>
                {anomalyReasons.length===0?<div style={{fontSize:12,color:"var(--text-secondary)"}}>字典加载中…</div>:(
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    {anomalyReasons.map((r:any)=>{
                      // P2-5: labelOf 三语 — 按当前语言选 dict_label_{zh|en|lo}
                      const label = curLang==="en" ? (r.dict_label_en || r.dict_label_zh || r.dict_code)
                                  : curLang==="lo" ? (r.dict_label_lo || r.dict_label_zh || r.dict_code)
                                  :                  (r.dict_label_zh || r.dict_code);
                      return (<button type="button" key={r.dict_code} onClick={()=>setSelectedReason(r.dict_code===selectedReason?"":r.dict_code)} style={{padding:"10px 16px",borderRadius:8,border:"2px solid",borderColor:selectedReason===r.dict_code?"var(--color-primary)":"var(--border)",background:selectedReason===r.dict_code?"var(--bg-muted)":"var(--bg-card)",fontWeight:selectedReason===r.dict_code?800:600,fontSize:13,cursor:"pointer"}}>{selectedReason===r.dict_code?"✓ ":""}{label}</button>);
                    })}
                  </div>
                )}
              </div>
            )}
            <button type="button" onClick={handleSubmit} disabled={submitting} style={{marginTop:"auto",width:"100%",padding:13,border:"none",borderRadius:10,cursor:submitting?"not-allowed":"pointer",fontWeight:800,fontSize:15,color:"white",background:submitting?"var(--text-secondary)":"linear-gradient(135deg,#059669,#0d9488)",boxShadow:submitting?"none":"0 4px 16px rgba(5,150,105,0.35)"}}>
              {submitting?"提交中…":"提交分级结果"}
            </button>
          </div>)}
        </div>
      </div>

      {/* 提交成功 Modal — V2 GradingOperation 风格，展示各等级生成的批次清单 */}
      {submitResult && (
        <div onClick={()=>setSubmitResult(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:14,padding:24,minWidth:380,maxWidth:520,boxShadow:"0 12px 48px rgba(0,0,0,.4)"}}>
            <div style={{fontSize:18,fontWeight:800,color:"var(--status-success)",marginBottom:8}}>✅ {t("ui.分级完成","Grading Complete")}</div>
            <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:14}}>{submitResult.msg}</div>
            {submitResult.batches.length > 0 && (
              <>
                <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:8,fontWeight:700}}>{t("ui.已生成批次","Batches Generated")}：</div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16,maxHeight:240,overflowY:"auto"}}>
                  {submitResult.batches.map(b => {
                    const g = grades.find(x => String(x.code) === String(b.grade));
                    const gName = g?.nameZh || g?.name || `${t("ui.等级","Grade")} ${b.grade}`;
                    const unit = curLang === "en" ? "pcs" : curLang === "lo" ? "ໜ່ວຍ" : "枚";
                    return (
                      <div key={b.batch_no} style={{fontFamily:"monospace",fontSize:12,padding:"6px 12px",borderRadius:8,background:"color-mix(in srgb, var(--status-success) 12%, transparent)",color:"#059669",wordBreak:"break-all"}}>
                        {gName} · {b.qty.toLocaleString()} {unit} → <strong>{b.batch_no}</strong>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <button type="button" onClick={()=>setSubmitResult(null)}
              style={{width:"100%",padding:10,border:"none",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:13,color:"white",background:"linear-gradient(135deg,#059669,#0d9488)"}}>
              {t("ui.关闭","Close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

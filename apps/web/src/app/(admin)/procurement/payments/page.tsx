"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw, DollarSign } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

// V3 表: fin_transactions (type=AP/PAYMENT)
// 字段: id, account_code, type, amount, ref_no, note, due_date, description,
//        status(PENDING/PAID/OVERDUE/PARTIAL), created_at
// (V3 migration 补充了 due_date, account_code, description 字段)

const TYPE_OPTS  = [
  { value:"AP",      label:"应付账款(AP)" },
  { value:"PAYMENT", label:"付款记录" },
];
const STATUS_CLS: Record<string,string>   = { PENDING:"badgeWarning", PAID:"badgeSuccess", OVERDUE:"badgeDanger", PARTIAL:"badgeInfo" };
const STATUS_LABEL: Record<string,string> = { PENDING:"待付款", PAID:"已付款", OVERDUE:"已逾期", PARTIAL:"部分付款" };
const PAYMENT_METHODS = ["银行转账","现金","支票","移动支付"];

interface Transaction {
  id:number; account_code?:string; type?:string; amount?:number; ref_no?:string;
  note?:string; due_date?:string; description?:string;
  status?:string; created_at?:string;
}
interface Form {
  account_code:string; type:string; amount:string; ref_no:string;
  note:string; due_date:string; description:string; payment_method:string;
}
const DEF: Form = {
  account_code:"AP-TRADE", type:"AP", amount:"0",
  ref_no:"", note:"", due_date:"", description:"", payment_method:"银行转账",
};

export default function PaymentsPage() {
  const toast = useToast();
  const [list, setList]       = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [typeFilter, setTypeFilter] = useState("AP");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<Transaction|null>(null);
  const [form, setForm]             = useState<Form>(DEF);
  const [saving, setSaving]         = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"") : "";
  const hdr = { Authorization:`Bearer ${token}`, "Content-Type":"application/json" };

  const load = useCallback(()=>{
    setLoading(true);
    fetch("/api/crud/fin_transactions?limit=300")
      .then(r=>r.json()).then(d=>setList(d.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{ load(); },[load]);

  const today = new Date().toISOString().slice(0,10);

  // 逾期自动检测
  const enriched = useMemo(()=>list.map(t=>{
    let status = t.status||"PENDING";
    if (status==="PENDING" && t.due_date && t.due_date.slice(0,10)<today) status="OVERDUE";
    return { ...t, status };
  }),[list,today]);

  const apList = useMemo(()=>enriched.filter(t=>
    (!typeFilter||t.type===typeFilter) &&
    (!search||(t.ref_no||"").includes(search)||(t.note||"").includes(search)||(t.description||"").includes(search))
  ),[enriched,search,typeFilter]);

  const totalAP       = enriched.filter(t=>t.type==="AP").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const totalPaid     = enriched.filter(t=>t.type==="AP"&&t.status==="PAID").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const totalOverdue  = enriched.filter(t=>t.status==="OVERDUE").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const pendingCnt    = enriched.filter(t=>t.type==="AP"&&t.status==="PENDING").length;

  function openNew() {
    setEditing(null);
    setForm({ ...DEF, due_date:new Date(Date.now()+30*864e5).toISOString().slice(0,10) });
    setDrawerOpen(true);
  }
  function openEdit(row: Transaction) {
    setEditing(row);
    setForm({
      account_code:row.account_code||"AP-TRADE", type:row.type||"AP",
      amount:String(row.amount||0), ref_no:row.ref_no||"",
      note:row.note||"", due_date:row.due_date?.slice(0,10)||"",
      description:row.description||"", payment_method:"银行转账",
    });
    setDrawerOpen(true);
  }
  const markPaid = async (row: Transaction) => {
    await fetch(`/api/crud/fin_transactions/${row.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify({ status:"PAID" }) });
    toast.success("已标记为已付款"); load();
  };
  const save = async () => {
    if (!form.ref_no||Number(form.amount)<=0) { toast.error("关联单号和金额为必填项"); return; }
    setSaving(true);
    try {
      const payload = { ...form, amount:Number(form.amount), status:"PENDING" };
      if (editing?.id) {
        await fetch(`/api/crud/fin_transactions/${editing.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify(payload) });
        toast.success("记录已更新");
      } else {
        await fetch("/api/crud/fin_transactions",{ method:"POST",headers:hdr,body:JSON.stringify(payload) });
        toast.success("付款记录已创建");
      }
      setDrawerOpen(false); setEditing(null); load();
    } catch { toast.error("操作失败"); } finally { setSaving(false); }
  };
  const setF = (k:keyof Form,v:string)=>setForm(p=>({...p,[k]:v}));
  const inp = { padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" } as React.CSSProperties;

  return (
    <div className="animate-fade-in">
      <PageHeader title="付款管理" subtitle="应付账款·付款记录·逾期预警" breadcrumb={["采购管理","付款管理"]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{ display:"flex",alignItems:"center",gap:6 }}><RefreshCw size={14}/> 刷新</button>
            <button type="button" className={s.btnPrimary} onClick={openNew} style={{ display:"flex",alignItems:"center",gap:6 }}><Plus size={14}/> 新增</button>
          </div>
        }/>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10,marginBottom:16 }}>
        {[
          { label:"应付账款总额",value:`¥${totalAP.toLocaleString()}`,        accent:"var(--color-primary)" },
          { label:"已付",        value:`¥${totalPaid.toLocaleString()}`,       accent:"#10b981" },
          { label:"逾期金额",    value:`¥${totalOverdue.toLocaleString()}`,    accent:"#ef4444" },
          { label:"待付单数",    value:`${pendingCnt} 笔`,                     accent:"#f59e0b" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px" }}>
            <div style={{ fontSize:11,color:k.accent,fontWeight:700,marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:18,fontWeight:800,color:k.accent }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex",gap:10,marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索关联单号 / 摘要 / 说明…"
          style={{ flex:1,...inp,padding:"9px 14px" }}/>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{ ...inp,width:160 }}>
          <option value="">全部类型</option>
          {TYPE_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {["科目代码","类型","关联单号","金额","摘要","到期日","状态","操作"].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading&&apList.length===0&&<tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>暂无付款记录</td></tr>}
            {!loading&&apList.map((row,i)=>{
              const st = row.status?.toUpperCase()||"PENDING";
              const isOverdue = st==="OVERDUE";
              return (
                <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:isOverdue?"rgba(239,68,68,0.05)":i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11 }}>{row.account_code||"—"}</td>
                  <td style={{ padding:"9px 12px" }}><span className={`${s.badge} ${s.badgeNeutral}`}>{row.type||"AP"}</span></td>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,fontWeight:700 }}>{row.ref_no||"—"}</td>
                  <td style={{ padding:"9px 12px",fontWeight:800,color:isOverdue?"#ef4444":"var(--color-primary)" }}>
                    ¥{Number(row.amount||0).toLocaleString()}
                  </td>
                  <td style={{ padding:"9px 12px",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{row.note||row.description||"—"}</td>
                  <td style={{ padding:"9px 12px",fontSize:11,color:isOverdue?"#ef4444":"var(--text-secondary)" }}>{row.due_date?.slice(0,10)||"—"}</td>
                  <td style={{ padding:"9px 12px" }}><span className={`${s.badge} ${s[STATUS_CLS[st]||'badgeNeutral']}`}>{STATUS_LABEL[st]||st}</span></td>
                  <td style={{ padding:"9px 12px",display:"flex",gap:6 }}>
                    <button className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>openEdit(row)}>编辑</button>
                    {["PENDING","OVERDUE"].includes(st)&&(
                      <button className={s.btnSuccess} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>markPaid(row)}>标记已付</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RightDrawer open={drawerOpen} title={editing?"编辑付款记录":"新增付款记录"} onClose={()=>{ setDrawerOpen(false); setEditing(null); }}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>科目代码</label>
              <input value={form.account_code} onChange={e=>setF("account_code",e.target.value)} style={{ ...inp }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>类型</label>
              <select value={form.type} onChange={e=>setF("type",e.target.value)} style={{ ...inp }}>
                {TYPE_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>关联单号 <span className={s.textDanger}>*</span></label>
            <input value={form.ref_no} onChange={e=>setF("ref_no",e.target.value)} placeholder="关联采购订单号 / 发票号" style={{ ...inp }}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>金额（¥） <span className={s.textDanger}>*</span></label>
              <input type="number" value={form.amount} onChange={e=>setF("amount",e.target.value)} style={{ ...inp }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>到期日</label>
              <input type="date" value={form.due_date} onChange={e=>setF("due_date",e.target.value)} style={{ ...inp }}/>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>付款方式</label>
            <select value={form.payment_method} onChange={e=>setF("payment_method",e.target.value)} style={{ ...inp }}>
              {PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>摘要</label>
            <input value={form.note} onChange={e=>setF("note",e.target.value)} placeholder="付款摘要说明" style={{ ...inp }}/>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>详细说明</label>
            <textarea value={form.description} onChange={e=>setF("description",e.target.value)} rows={3} style={{ ...inp,resize:"vertical" }}/>
          </div>
          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{ setDrawerOpen(false); setEditing(null); }}>取消</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>{saving?"保存中…":"保存"}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
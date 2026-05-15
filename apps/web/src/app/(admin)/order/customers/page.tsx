"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Users, RefreshCw, TrendingUp, Search, DollarSign } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

// V2 对照：TIER_COLORS
const TIER_STYLE: Record<string,{color:string;bg:string}> = {
  A:{ color:"#f59e0b", bg:"#fef3c7" },
  B:{ color:"#3b82f6", bg:"#dbeafe" },
  C:{ color:"#6b7280", bg:"#f3f4f6" },
};

interface Customer {
  id:number; customer_code?:string; customer_name?:string; customer_type?:string;
  tier?:string; credit_limit?:number; credit_used?:number; account_period?:number;
  contact_name?:string; contact_phone?:string; delivery_addr?:string; sales_rep?:string;
  status?:string; created_at?:string;
}
interface Form {
  customer_code:string; customer_name:string; customer_type:string; tier:string;
  credit_limit:string; account_period:string; contact_name:string; contact_phone:string;
  delivery_addr:string; sales_rep:string; status:string;
}
const DEF_FORM: Form = {
  customer_code:"", customer_name:"", customer_type:"B2B", tier:"C",
  credit_limit:"0", account_period:"30", contact_name:"", contact_phone:"",
  delivery_addr:"", sales_rep:"", status:"active",
};

export default function CustomersPage() {
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<Customer | null>(null);
  const [form, setForm]             = useState<Form>(DEF_FORM);
  const [saving, setSaving]         = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
  const hdr = { Authorization:`Bearer ${token}`, "Content-Type":"application/json" };

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/crud/ord_customers?limit=300")
      .then(r=>r.json()).then(d=>setCustomers(d.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    customers.filter(c =>
      !search || (c.customer_name||"").includes(search) || (c.customer_code||"").includes(search) || (c.contact_name||"").includes(search)
    ), [customers, search]);

  const totalCredit = customers.reduce((s,c)=>s+(Number(c.credit_limit)||0), 0);
  const totalUsed   = customers.reduce((s,c)=>s+(Number(c.credit_used)||0), 0);
  const activeCount = customers.filter(c=>c.status==="active").length;
  const b2bCount    = customers.filter(c=>c.customer_type==="B2B").length;

  function openNew() {
    setEditing(null);
    setForm({ ...DEF_FORM, customer_code:`CUS-B2B-${Date.now().toString().slice(-8)}` });
    setDrawerOpen(true);
  }
  function openEdit(row: Customer) {
    setEditing(row);
    setForm({
      customer_code: row.customer_code||"", customer_name: row.customer_name||"",
      customer_type: row.customer_type||"B2B", tier: row.tier||"C",
      credit_limit: String(row.credit_limit||0), account_period: String(row.account_period||30),
      contact_name: row.contact_name||"", contact_phone: row.contact_phone||"",
      delivery_addr: row.delivery_addr||"", sales_rep: row.sales_rep||"",
      status: row.status||"active",
    });
    setDrawerOpen(true);
  }

  const save = async () => {
    if (!form.customer_name) { toast.error("请填写客户名称"); return; }
    setSaving(true);
    try {
      const payload = { ...form, credit_limit:Number(form.credit_limit)||0, account_period:Number(form.account_period)||30 };
      if (editing?.id) {
        await fetch(`/api/crud/ord_customers/${editing.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify(payload) });
      } else {
        await fetch("/api/crud/ord_customers",{ method:"POST",headers:hdr,body:JSON.stringify(payload) });
      }
      toast.success(editing?"客户信息已更新":"客户已新增");
      setDrawerOpen(false); setEditing(null); load();
    } catch { toast.error("操作失败"); } finally { setSaving(false); }
  };

  const freeze = async (id:number, current:string) => {
    const next = current==="active"?"frozen":"active";
    await fetch(`/api/crud/ord_customers/${id}`,{ method:"PUT",headers:hdr,body:JSON.stringify({status:next}) });
    toast.success(next==="active"?"已解冻":"已冻结"); load();
  };

  const kpis = [
    { label:"客户总数",   value:String(customers.length), unit:"户", accent:"var(--color-primary)", icon:<Users size={18}/> },
    { label:"B2B 客户",  value:String(b2bCount),          unit:"户", accent:"#3b82f6",             icon:<TrendingUp size={18}/> },
    { label:"信用额度总额",value:`¥${totalCredit.toLocaleString()}`,  accent:"#10b981", icon:<DollarSign size={18}/> },
    { label:"已用额度",   value:`¥${totalUsed.toLocaleString()}`,     accent:"#f59e0b", icon:<DollarSign size={18}/> },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="客户管理" subtitle={`管理 B2B 客户档案·信用额度·账期 · 共 ${customers.length} 个客户`}
        breadcrumb={["销售","客户管理"]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> 刷新
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <Plus size={14}/> 新增客户
            </button>
          </div>
        }/>

      {/* KPI */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginBottom:20 }}>
        {kpis.map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`4px solid ${k.accent}`,borderRadius:"var(--radius-lg)",padding:"14px 18px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8,color:k.accent,fontSize:11,fontWeight:700,textTransform:"uppercase" }}>{k.icon}{k.label}</div>
            <div style={{ fontSize:22,fontWeight:800,color:k.accent }}>{String(k.value)}{k.unit&&<span style={{ fontSize:12,marginLeft:3,color:"var(--text-secondary)" }}>{k.unit}</span>}</div>
          </div>
        ))}
      </div>

      {/* 搜索 */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索客户名称 / 编码 / 联系人…"
        style={{ width:"100%",boxSizing:"border-box",padding:"9px 14px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",marginBottom:14 }}/>

      {/* 表格 */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"hidden" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {["客户编码","客户名称","等级","信用额度","已用额度","账期","联系人","状态","操作"].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={9} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={9} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>暂无客户记录</td></tr>}
            {!loading&&filtered.map((c,i)=>{
              const tier = TIER_STYLE[c.tier||"C"]||TIER_STYLE.C;
              const isActive = (c.status||"active")==="active";
              const usedPct = c.credit_limit ? Math.min(((c.credit_used||0)/c.credit_limit)*100,100) : 0;
              return (
                <tr key={c.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)" }}>{c.customer_code||"—"}</td>
                  <td style={{ padding:"9px 12px" }}>
                    <button type="button" onClick={()=>openEdit(c)} style={{ background:"none",border:"none",color:"var(--color-primary)",cursor:"pointer",fontWeight:700,fontSize:13,padding:0 }}>
                      {c.customer_name||"—"}
                    </button>
                  </td>
                  <td style={{ padding:"9px 12px" }}>
                    <span style={{ fontWeight:800,fontSize:12,color:tier.color,background:tier.bg,borderRadius:6,padding:"3px 10px" }}>{c.tier||"C"}级</span>
                  </td>
                  <td style={{ padding:"9px 12px",fontWeight:600 }}>¥{Number(c.credit_limit||0).toLocaleString()}</td>
                  <td style={{ padding:"9px 12px" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <span style={{ color:usedPct>80?"#ef4444":usedPct>60?"#f59e0b":"var(--text-primary)",fontWeight:600 }}>
                        ¥{Number(c.credit_used||0).toLocaleString()}
                      </span>
                      {c.credit_limit&&<div style={{ width:40,height:4,background:"var(--bg-page)",borderRadius:2 }}>
                        <div style={{ height:"100%",width:`${usedPct}%`,background:usedPct>80?"#ef4444":usedPct>60?"#f59e0b":"#10b981",borderRadius:2 }}/>
                      </div>}
                    </div>
                  </td>
                  <td style={{ padding:"9px 12px",color:"var(--text-secondary)" }}>{c.account_period||30}天</td>
                  <td style={{ padding:"9px 12px" }}>{c.contact_name||"—"}</td>
                  <td style={{ padding:"9px 12px" }}>
                    <span className={`${s.badge} ${isActive?s.badgeSuccess:s.badgeDanger}`}>{isActive?"正常":"已冻结"}</span>
                  </td>
                  <td style={{ padding:"9px 12px",display:"flex",gap:6,flexWrap:"wrap" }}>
                    <button className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>openEdit(c)}>编辑</button>
                    <button className={isActive?s.btnDanger:s.btnSuccess} style={{ padding:"4px 8px",fontSize:11 }}
                      onClick={()=>freeze(c.id, c.status||"active")}>{isActive?"冻结":"解冻"}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 编辑 / 新增 Drawer */}
      <RightDrawer open={drawerOpen} title={editing?"编辑客户档案":"新增客户"} onClose={()=>{setDrawerOpen(false);setEditing(null);}}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          {/* 基本信息 */}
          {([
            {k:"customer_code",l:"客户编码",t:"text",req:true,hint:"自动生成，可手动修改"},
            {k:"customer_name",l:"客户名称",t:"text",req:true},
            {k:"contact_name",l:"联系人",t:"text"},
            {k:"contact_phone",l:"联系电话",t:"tel"},
            {k:"delivery_addr",l:"收货地址",t:"text"},
            {k:"sales_rep",l:"绑定业务员账号",t:"text",hint:"填写系统登录账号"},
          ] as {k:string;l:string;t:string;req?:boolean;hint?:string}[]).map(f=>(
            <div key={f.k}>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>
                {f.l}{f.req&&<span className={s.textDanger}> *</span>}
                {f.hint&&<span style={{ fontSize:11,color:"var(--text-secondary)",marginLeft:6 }}>({f.hint})</span>}
              </label>
              <input type={f.t} value={form[f.k as keyof Form]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))}
                style={{ width:"100%",padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" }}/>
            </div>
          ))}
          {/* 等级 / 信用 */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>客户等级</label>
              <select value={form.tier} onChange={e=>setForm(p=>({...p,tier:e.target.value}))}
                style={{ width:"100%",padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}>
                <option value="A">A 级（VIP）</option>
                <option value="B">B 级（优质）</option>
                <option value="C">C 级（普通）</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>客户类型</label>
              <select value={form.customer_type} onChange={e=>setForm(p=>({...p,customer_type:e.target.value}))}
                style={{ width:"100%",padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}>
                <option value="B2B">B2B 大客户</option>
                <option value="RETAIL">零售门店</option>
                <option value="WHOLESALE">批发商</option>
              </select>
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>信用额度（¥）</label>
              <input type="number" value={form.credit_limit} onChange={e=>setForm(p=>({...p,credit_limit:e.target.value}))}
                style={{ width:"100%",padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>账期（天）</label>
              <input type="number" value={form.account_period} onChange={e=>setForm(p=>({...p,account_period:e.target.value}))}
                style={{ width:"100%",padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" }}/>
            </div>
          </div>
          {editing&&(
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>状态</label>
              <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}
                style={{ width:"100%",padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}>
                <option value="active">正常</option>
                <option value="frozen">已冻结</option>
              </select>
            </div>
          )}
          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{setDrawerOpen(false);setEditing(null);}}>取消</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>{saving?"保存中…":"保存客户"}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}

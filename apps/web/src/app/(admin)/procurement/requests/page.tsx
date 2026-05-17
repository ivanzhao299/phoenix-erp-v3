"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw, Send } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { crudApi } from "@/lib/api-client";
import s from "@/components/ui/admin-ui.module.css";

// V3 表: prc_purchase_orders（status=DRAFT 的即为采购申请）

interface Request {
  id:number; po_no:string; supplier_code?:string; supplier_name?:string;
  subject?:string; total_amount?:number; currency_code?:string;
  status:string; plan_qty?:number; expected_date?:string;
  remark?:string; created_at?:string; updated_at?:string;
}
interface Form {
  po_no:string; subject:string; supplier_code:string; supplier_name:string;
  total_amount:string; plan_qty:string; currency_code:string; expected_date:string;
  remark:string; urgency:string; dept:string;
}

export default function RequestsPage() {
  const toast = useToast();
  const { t } = useLanguage();

  const URGENCY_OPTS = [
    { value:"NORMAL", label:t("ui.普通","普通"),  color:"#6b7280" },
    { value:"URGENT", label:t("ui.加急","加急"),  color:"#ef4444" },
  ];
  const DEPT_OPTS = [
    t("ui.养殖部","养殖部"),
    t("ui.分级包装部","分级包装部"),
    t("ui.物流配送部","物流配送部"),
    t("ui.财务部","财务部"),
    t("ui.行政人力","行政人力"),
    t("ui.信息技术部","信息技术部"),
  ];

  const DEF: Form = {
    po_no:"", subject:"", supplier_code:"", supplier_name:"",
    total_amount:"0", plan_qty:"0", currency_code:"LAK",
    expected_date:"", remark:"", urgency:"NORMAL", dept:DEPT_OPTS[0],
  };

  const [list, setList]         = useState<Request[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]   = useState<Request|null>(null);
  const [form, setForm]         = useState<Form>(DEF);
  const [saving, setSaving]     = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"") : "";
  const hdr = { Authorization:`Bearer ${token}`, "Content-Type":"application/json" };

  const load = useCallback(()=>{
    setLoading(true);
    crudApi.list<Request>("prc_purchase_orders", { limit: 300 })
      .then(res=>{ const all = res.data||[]; setList(all.filter((o:Request)=>["DRAFT","PENDING"].includes(o.status?.toUpperCase()||""))); })
      .catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{ load(); },[load]);

  const filtered = useMemo(()=>list.filter(r=>
    !search||(r.po_no||"").includes(search)||(r.subject||"").includes(search)||(r.supplier_name||"").includes(search)
  ),[list,search]);

  const pendingCnt = list.filter(r=>r.status?.toUpperCase()==="PENDING").length;
  const draftCnt   = list.filter(r=>r.status?.toUpperCase()==="DRAFT").length;

  function openNew() {
    setEditing(null);
    const d = new Date().toISOString().slice(0,10).replace(/-/g,"");
    setForm({ ...DEF, po_no:`REQ-${d}-${Date.now().toString().slice(-5)}` });
    setDrawerOpen(true);
  }
  function openEdit(row: Request) {
    setEditing(row);
    setForm({
      po_no:row.po_no, subject:row.subject||"",
      supplier_code:row.supplier_code||"", supplier_name:row.supplier_name||"",
      total_amount:String(row.total_amount||0), plan_qty:String(row.plan_qty||0),
      currency_code:row.currency_code||"LAK", expected_date:row.expected_date?.slice(0,10)||"",
      remark:row.remark||"", urgency:"NORMAL", dept:DEPT_OPTS[0],
    });
    setDrawerOpen(true);
  }

  const save = async () => {
    if (!form.subject) { toast.error(t("ui.采购主题为必填项","采购主题为必填项")); return; }
    setSaving(true);
    try {
      const payload = { ...form, total_amount:Number(form.total_amount)||0, plan_qty:Number(form.plan_qty)||0, status:"DRAFT" };
      if (editing?.id) {
        await fetch(`/api/crud/prc_purchase_orders/${editing.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify(payload) });
        toast.success(t("ui.申请已更新","申请已更新"));
      } else {
        await fetch("/api/crud/prc_purchase_orders",{ method:"POST",headers:hdr,body:JSON.stringify(payload) });
        toast.success(t("ui.采购申请已提交","采购申请已提交"));
      }
      setDrawerOpen(false); setEditing(null); load();
    } catch { toast.error(t("ui.操作失败","操作失败")); } finally { setSaving(false); }
  };

  const submit = async (row: Request) => {
    await fetch(`/api/crud/prc_purchase_orders/${row.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify({ status:"PENDING" }) });
    toast.success(t("ui.申请已提交审批","申请已提交审批")); load();
  };

  const del = async (row: Request) => {
    if (!confirm(`${t("ui.确认撤销采购申请","确认撤销采购申请")} ${row.po_no}？`)) return;
    await fetch(`/api/crud/prc_purchase_orders/${row.id}`,{ method:"DELETE",headers:hdr });
    toast.success(t("ui.已撤销","已撤销")); load();
  };

  const setF = (k:keyof Form,v:string)=>setForm(p=>({...p,[k]:v}));
  const inp = { padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" } as React.CSSProperties;

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("ui.采购申请","采购申请")} subtitle={t("ui.采购申请副标题","提交采购需求·待审批·转采购订单")} breadcrumb={[t("ui.采购管理","采购管理"),t("ui.采购申请","采购申请")]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{ display:"flex",alignItems:"center",gap:6 }}><RefreshCw size={14}/> {t("common.refresh","刷新")}</button>
            <button type="button" className={s.btnPrimary} onClick={openNew} style={{ display:"flex",alignItems:"center",gap:6 }}><Plus size={14}/> {t("ui.新增申请","新增申请")}</button>
          </div>
        }/>

      <div style={{ display:"flex",gap:12,marginBottom:16,flexWrap:"wrap" }}>
        {[
          { label:t("ui.草稿","草稿"),   value:draftCnt,   accent:"#6b7280" },
          { label:t("ui.待审批","待审批"), value:pendingCnt,  accent:"#f59e0b" },
          { label:t("common.total","合计"),   value:list.length, accent:"var(--color-primary)" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px",display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontSize:20,fontWeight:800,color:k.accent }}>{k.value}</span>
            <span style={{ fontSize:12,color:"var(--text-secondary)" }}>{k.label}</span>
          </div>
        ))}
      </div>

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("ui.搜索申请编号主题供应商","搜索申请编号 / 主题 / 供应商…")}
        style={{ width:"100%",boxSizing:"border-box",...inp,marginBottom:14 }}/>

      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {[t("ui.申请编号","申请编号"),t("ui.采购主题","采购主题"),t("ui.供应商","供应商"),t("ui.预算金额","预算金额"),t("ui.计划数量","计划数量"),t("ui.期望到货","期望到货"),t("common.status","状态"),t("common.operation","操作")].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("common.loading","加载中…")}</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("ui.暂无采购申请","暂无采购申请")}</td></tr>}
            {!loading&&filtered.map((row,i)=>{
              const isDraft = row.status?.toUpperCase()==="DRAFT";
              return (
                <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)" }}>{row.po_no}</td>
                  <td style={{ padding:"9px 12px",fontWeight:600 }}>{row.subject||"—"}</td>
                  <td style={{ padding:"9px 12px" }}>{row.supplier_name||row.supplier_code||"—"}</td>
                  <td style={{ padding:"9px 12px",color:"var(--color-primary)",fontWeight:700 }}>
                    {row.currency_code||"LAK"} {Number(row.total_amount||0).toLocaleString()}
                  </td>
                  <td style={{ padding:"9px 12px" }}>{row.plan_qty||0}</td>
                  <td style={{ padding:"9px 12px",fontSize:11 }}>{row.expected_date?.slice(0,10)||"—"}</td>
                  <td style={{ padding:"9px 12px" }}>
                    <span className={`${s.badge} ${isDraft?s.badgeNeutral:s.badgeWarning}`}>{isDraft?t("ui.草稿","草稿"):t("ui.待审批","待审批")}</span>
                  </td>
                  <td style={{ padding:"9px 12px",display:"flex",gap:6,flexWrap:"wrap" }}>
                    <button className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>openEdit(row)}>{t("common.edit","编辑")}</button>
                    {isDraft&&<button className={s.btnSuccess} style={{ padding:"4px 8px",fontSize:11,display:"flex",alignItems:"center",gap:4 }} onClick={()=>submit(row)}><Send size={10}/> {t("ui.提交审批","提交审批")}</button>}
                    {isDraft&&<button className={s.btnDanger} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>del(row)}>{t("ui.撤销","撤销")}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RightDrawer open={drawerOpen} title={editing?t("ui.编辑采购申请","编辑采购申请"):t("ui.新增采购申请","新增采购申请")} onClose={()=>{ setDrawerOpen(false); setEditing(null); }}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.申请编号","申请编号")}</label>
              <input value={form.po_no} readOnly style={{ ...inp,background:"var(--bg-page)",color:"var(--text-secondary)",fontFamily:"monospace",fontSize:12 }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.紧急程度","紧急程度")}</label>
              <select value={form.urgency} onChange={e=>setF("urgency",e.target.value)} style={{ ...inp }}>
                {URGENCY_OPTS.map(o=><option key={o.value} value={o.value} style={{ color:o.color }}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.采购主题","采购主题")} <span className={s.textDanger}>*</span></label>
            <input value={form.subject} onChange={e=>setF("subject",e.target.value)} placeholder={t("ui.采购主题示例","例：饲料原料补库采购")} style={{ ...inp }}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.申请部门","申请部门")}</label>
              <select value={form.dept} onChange={e=>setF("dept",e.target.value)} style={{ ...inp }}>
                {DEPT_OPTS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.结算币种","结算币种")}</label>
              <select value={form.currency_code} onChange={e=>setF("currency_code",e.target.value)} style={{ ...inp }}>
                {["LAK","CNY","THB","USD"].map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.意向供应商","意向供应商")}</label>
            <input value={form.supplier_name} onChange={e=>setF("supplier_name",e.target.value)} placeholder={t("ui.供应商名称可选","供应商名称（可选）")} style={{ ...inp }}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.预算金额","预算金额")}</label>
              <input type="number" value={form.total_amount} onChange={e=>setF("total_amount",e.target.value)} style={{ ...inp }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.计划数量","计划数量")}</label>
              <input type="number" value={form.plan_qty} onChange={e=>setF("plan_qty",e.target.value)} style={{ ...inp }}/>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.期望到货日期","期望到货日期")}</label>
            <input type="date" value={form.expected_date} onChange={e=>setF("expected_date",e.target.value)} style={{ ...inp }}/>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.采购说明","采购说明")}</label>
            <textarea value={form.remark} onChange={e=>setF("remark",e.target.value)} rows={3} style={{ ...inp,resize:"vertical" }}/>
          </div>
          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{ setDrawerOpen(false); setEditing(null); }}>{t("common.cancel","取消")}</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>{saving?t("ui.保存中","保存中…"):t("ui.保存草稿","保存草稿")}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}

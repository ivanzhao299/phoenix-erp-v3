"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw, Users, TrendingUp } from "lucide-react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

// V3 表: b2b_customers
// 字段: id, customer_code, customer_name, contact_name, contact_phone, address,
//        credit_limit, credit_days, tax_no, area_code, store_code, sales_rep_id,
//        level(A/B/C/D), status(ACTIVE/INACTIVE/FROZEN), created_by, created_at, updated_at

const LEVEL_STYLE: Record<string,{color:string;bg:string}> = {
  A:{ color:"#f59e0b",bg:"#fef3c7" }, B:{ color:"#3b82f6",bg:"#dbeafe" },
  C:{ color:"#10b981",bg:"#d1fae5" }, D:{ color:"#6b7280",bg:"#f3f4f6" },
};
const STATUS_CLS: Record<string,string>   = { ACTIVE:"badgeSuccess",INACTIVE:"badgeNeutral",FROZEN:"badgeDanger" };
const AREA_OPTS = ["万象市","沙湾拿吉省","琅勃拉邦省","占巴塞省","沙耶武里省","其他"];

interface B2BCustomer {
  id:number; customer_code:string; customer_name:string; contact_name?:string;
  contact_phone?:string; address?:string; credit_limit?:number; credit_days?:number;
  tax_no?:string; area_code?:string; store_code?:string; sales_rep_id?:number;
  level?:string; status:string; created_by?:number; created_at?:string; updated_at?:string;
}
interface Form {
  customer_code:string; customer_name:string; contact_name:string; contact_phone:string;
  address:string; credit_limit:string; credit_days:string; tax_no:string;
  area_code:string; level:string; status:string;
}
const DEF: Form = {
  customer_code:"", customer_name:"", contact_name:"", contact_phone:"",
  address:"", credit_limit:"0", credit_days:"30", tax_no:"",
  area_code:"万象市", level:"C", status:"ACTIVE",
};

export default function B2BCustomersPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [list, setList]       = useState<B2BCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [levelF, setLevelF]   = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<B2BCustomer|null>(null);
  const [form, setForm]             = useState<Form>(DEF);
  const [saving, setSaving]         = useState(false);

  const STATUS_LABEL: Record<string,string> = {
    ACTIVE:   t("status.active", "活跃"),
    INACTIVE: t("status.inactive", "停用"),
    FROZEN:   t("ui.已冻结", "已冻结"),
  };

  const token = typeof window!=="undefined"?(sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||""):"";
  const hdr = { Authorization:`Bearer ${token}`,"Content-Type":"application/json" };

  const load = useCallback(()=>{
    setLoading(true);
    crudApi.list<B2BCustomer>("b2b_customers", { limit: 300 })
      .then(res=>setList(res.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{ load(); },[load]);

  const filtered = useMemo(()=>list.filter(c=>
    (!search||(c.customer_name||"").includes(search)||(c.customer_code||"").includes(search)||(c.contact_name||"").includes(search)) &&
    (!levelF||c.level===levelF)
  ),[list,search,levelF]);

  const totalCredit = list.reduce((s,c)=>s+(Number(c.credit_limit)||0),0);
  const activeCnt   = list.filter(c=>c.status==="ACTIVE").length;
  const topTierCnt  = list.filter(c=>["A","B"].includes(c.level||"")).length;

  function openNew() {
    setEditing(null);
    setForm({ ...DEF, customer_code:`B2B-${Date.now().toString().slice(-8)}` });
    setDrawerOpen(true);
  }
  function openEdit(row:B2BCustomer) {
    setEditing(row);
    setForm({
      customer_code:row.customer_code, customer_name:row.customer_name,
      contact_name:row.contact_name||"", contact_phone:row.contact_phone||"",
      address:row.address||"", credit_limit:String(row.credit_limit||0),
      credit_days:String(row.credit_days||30), tax_no:row.tax_no||"",
      area_code:row.area_code||"万象市", level:row.level||"C", status:row.status||"ACTIVE",
    });
    setDrawerOpen(true);
  }
  const save = async ()=>{
    if (!form.customer_name){ toast.error(t("ui.客户名称为必填项", "客户名称为必填项")); return; }
    setSaving(true);
    try {
      const payload = { ...form, credit_limit:Number(form.credit_limit)||0, credit_days:Number(form.credit_days)||30 };
      if (editing?.id) {
        await fetch(`/api/crud/b2b_customers/${editing.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify(payload) });
        toast.success(t("ui.B2B客户已更新", "B2B 客户已更新"));
      } else {
        await fetch("/api/crud/b2b_customers",{ method:"POST",headers:hdr,body:JSON.stringify(payload) });
        toast.success(t("ui.B2B客户已新增", "B2B 客户已新增"));
      }
      setDrawerOpen(false); setEditing(null); load();
    } catch { toast.error(t("ui.操作失败", "操作失败")); } finally { setSaving(false); }
  };
  const freeze = async (row:B2BCustomer)=>{
    const next = row.status==="ACTIVE"?"FROZEN":"ACTIVE";
    await fetch(`/api/crud/b2b_customers/${row.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify({ status:next }) });
    toast.success(next==="ACTIVE" ? t("ui.已解冻", "已解冻") : t("ui.已冻结", "已冻结")); load();
  };
  const setF = (k:keyof Form,v:string)=>setForm(p=>({...p,[k]:v}));
  const inp = { padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" } as React.CSSProperties;

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("ui.B2B客户管理", "B2B 客户管理")} subtitle={t("ui.分销商批发客户信用额度等级管理", "分销商·批发客户·信用额度·等级管理")} breadcrumb={[t("ui.B2B批发", "B2B 批发"), t("ui.客户管理", "客户管理")]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{ display:"flex",alignItems:"center",gap:6 }}><RefreshCw size={14}/> {t("common.refresh", "刷新")}</button>
            <button type="button" className={s.btnPrimary} onClick={openNew} style={{ display:"flex",alignItems:"center",gap:6 }}><Plus size={14}/> {t("ui.新增客户", "新增客户")}</button>
          </div>
        }/>

      {/* KPI */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:16 }}>
        {[
          { label: t("ui.B2B客户总数", "B2B 客户总数"), value:list.length,         accent:"var(--color-primary)",icon:<Users size={16}/> },
          { label: t("ui.AB级优质", "A/B 级优质"),       value:topTierCnt,          accent:"#f59e0b",             icon:<TrendingUp size={16}/> },
          { label: t("ui.活跃客户", "活跃客户"),         value:activeCnt,           accent:"#10b981",             icon:<Users size={16}/> },
          { label: t("ui.授信总额", "授信总额"),         value:`¥${totalCredit.toLocaleString()}`,accent:"#3b82f6",icon:<TrendingUp size={16}/> },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:4,fontSize:11,color:k.accent,fontWeight:700,marginBottom:4 }}>{k.icon}{k.label}</div>
            <div style={{ fontSize:18,fontWeight:800,color:k.accent }}>{String(k.value)}</div>
          </div>
        ))}
      </div>

      {/* 过滤 */}
      <div style={{ display:"flex",gap:10,marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("ui.搜索客户名称编码联系人", "搜索客户名称 / 编码 / 联系人…")}
          style={{ flex:1,...inp,padding:"9px 14px" }}/>
        <select value={levelF} onChange={e=>setLevelF(e.target.value)} style={{ ...inp,width:130 }}>
          <option value="">{t("ui.全部等级", "全部等级")}</option>
          {["A","B","C","D"].map(l=><option key={l} value={l}>{l} {t("ui.级", "级")}</option>)}
        </select>
      </div>

      {/* 表格 */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {[
                t("ui.客户编码", "客户编码"),
                t("ui.客户名称", "客户名称"),
                t("ui.等级", "等级"),
                t("ui.联系人", "联系人"),
                t("ui.联系电话", "联系电话"),
                t("ui.地区", "地区"),
                t("ui.授信额度", "授信额度"),
                t("ui.账期", "账期"),
                t("common.status", "状态"),
                t("common.operation", "操作"),
              ].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={10} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("common.loading", "加载中…")}</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={10} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("ui.暂无B2B客户", "暂无 B2B 客户")}</td></tr>}
            {!loading&&filtered.map((row,i)=>{
              const lv = LEVEL_STYLE[row.level||"C"]||LEVEL_STYLE.C;
              const st = row.status?.toUpperCase()||"ACTIVE";
              return (
                <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)" }}>{row.customer_code}</td>
                  <td style={{ padding:"9px 12px" }}>
                    <button type="button" onClick={()=>openEdit(row)} style={{ background:"none",border:"none",color:"var(--color-primary)",cursor:"pointer",fontWeight:700,fontSize:13,padding:0 }}>
                      {row.customer_name}
                    </button>
                  </td>
                  <td style={{ padding:"9px 12px" }}>
                    <span style={{ fontWeight:800,fontSize:12,color:lv.color,background:lv.bg,borderRadius:6,padding:"3px 10px" }}>{row.level||"C"}{t("ui.级", "级")}</span>
                  </td>
                  <td style={{ padding:"9px 12px" }}>{row.contact_name||"—"}</td>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:12 }}>{row.contact_phone||"—"}</td>
                  <td style={{ padding:"9px 12px" }}>{row.area_code||"—"}</td>
                  <td style={{ padding:"9px 12px",fontWeight:700,color:"var(--color-primary)" }}>¥{Number(row.credit_limit||0).toLocaleString()}</td>
                  <td style={{ padding:"9px 12px" }}>{row.credit_days||30}{t("ui.天", "天")}</td>
                  <td style={{ padding:"9px 12px" }}><span className={`${s.badge} ${s[STATUS_CLS[st]||'badgeNeutral']}`}>{STATUS_LABEL[st]||st}</span></td>
                  <td style={{ padding:"9px 12px",display:"flex",gap:5,flexWrap:"wrap" }}>
                    <button type="button" className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>openEdit(row)}>{t("common.edit", "编辑")}</button>
                    <button type="button" className={st==="ACTIVE"?s.btnDanger:s.btnSuccess} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>freeze(row)}>{st==="ACTIVE" ? t("ui.冻结", "冻结") : t("ui.解冻", "解冻")}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑B2B客户", "编辑 B2B 客户") : t("ui.新增B2B客户", "新增 B2B 客户")} onClose={()=>{ setDrawerOpen(false); setEditing(null); }}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.客户编码", "客户编码")}</label>
              <input value={form.customer_code} onChange={e=>setF("customer_code",e.target.value)} style={{ ...inp }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.客户等级", "客户等级")}</label>
              <select value={form.level} onChange={e=>setF("level",e.target.value)} style={{ ...inp }}>
                {[["A",`A${t("ui.级", "级")} (VIP)`],["B",`B${t("ui.级", "级")} (${t("ui.优质", "优质")})`],["C",`C${t("ui.级", "级")} (${t("ui.普通", "普通")})`],["D",`D${t("ui.级", "级")} (${t("ui.观察", "观察")})`]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.客户名称", "客户名称")} <span className={s.textDanger}>*</span></label>
            <input value={form.customer_name} onChange={e=>setF("customer_name",e.target.value)} style={{ ...inp }}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.联系人", "联系人")}</label>
              <input value={form.contact_name} onChange={e=>setF("contact_name",e.target.value)} style={{ ...inp }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.联系电话", "联系电话")}</label>
              <input type="tel" value={form.contact_phone} onChange={e=>setF("contact_phone",e.target.value)} style={{ ...inp }}/>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.地区", "地区")}</label>
            <select value={form.area_code} onChange={e=>setF("area_code",e.target.value)} style={{ ...inp }}>
              {AREA_OPTS.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.地址", "地址")}</label>
            <textarea value={form.address} onChange={e=>setF("address",e.target.value)} rows={2} style={{ ...inp,resize:"vertical" }}/>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.税务编号TIN", "税务编号（TIN）")}</label>
            <input value={form.tax_no} onChange={e=>setF("tax_no",e.target.value)} style={{ ...inp }}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.授信额度", "授信额度（¥）")}</label>
              <input type="number" value={form.credit_limit} onChange={e=>setF("credit_limit",e.target.value)} style={{ ...inp }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.账期天", "账期（天）")}</label>
              <input type="number" value={form.credit_days} onChange={e=>setF("credit_days",e.target.value)} style={{ ...inp }}/>
            </div>
          </div>
          {editing&&(
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("common.status", "状态")}</label>
              <select value={form.status} onChange={e=>setF("status",e.target.value)} style={{ ...inp }}>
                <option value="ACTIVE">{t("status.active", "活跃")}</option>
                <option value="INACTIVE">{t("status.inactive", "停用")}</option>
                <option value="FROZEN">{t("ui.冻结", "冻结")}</option>
              </select>
            </div>
          )}
          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{ setDrawerOpen(false); setEditing(null); }}>{t("common.cancel", "取消")}</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>{saving ? t("ui.保存中", "保存中…") : t("common.save", "保存")}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}

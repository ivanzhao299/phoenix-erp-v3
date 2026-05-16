"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

// V3 表: prc_suppliers

const TYPE_CLS: Record<string,string> = {
  FEED:"badgeSuccess", MEDICINE:"badgeInfo", EQUIPMENT:"badgeWarning",
  PACKAGING:"badgeNeutral", OTHER:"badgeNeutral",
};
const STATUS_CLS: Record<string,string> = {
  ACTIVE:"badgeSuccess", active:"badgeSuccess",
  INACTIVE:"badgeDanger", inactive:"badgeDanger",
  SUSPENDED:"badgeWarning",
};

interface Supplier {
  id:number; supplier_code:string; supplier_name:string; supplier_type:string;
  contact_name?:string; contact_phone?:string; address?:string;
  tax_no?:string; bank_account?:string; bank_name?:string;
  credit_days?:number; currency_code?:string; store_code?:string;
  status:string; created_by?:number; created_at?:string; updated_at?:string;
}
interface Form {
  supplier_code:string; supplier_name:string; supplier_type:string;
  contact_name:string; contact_phone:string; address:string;
  tax_no:string; bank_account:string; bank_name:string;
  credit_days:string; currency_code:string; status:string;
}

export default function SuppliersPage() {
  const toast = useToast();
  const { t } = useLanguage();

  const TYPE_OPTS = [
    { label:t("ui.饲料原料FEED","饲料原料 (FEED)"),     value:"FEED" },
    { label:t("ui.兽药疫苗MEDICINE","兽药疫苗 (MEDICINE)"), value:"MEDICINE" },
    { label:t("ui.设备耗材EQUIPMENT","设备耗材 (EQUIPMENT)"),value:"EQUIPMENT" },
    { label:t("ui.包装材料PACKAGING","包装材料 (PACKAGING)"),value:"PACKAGING" },
    { label:t("ui.其他OTHER","其他 (OTHER)"),        value:"OTHER" },
  ];
  const CURRENCY_OPTS = [
    { label:t("ui.老挝基普LAK","老挝基普 LAK"), value:"LAK" },
    { label:t("ui.人民币CNY","人民币 CNY"),   value:"CNY" },
    { label:t("ui.泰铢THB","泰铢 THB"),     value:"THB" },
    { label:t("ui.美元USD","美元 USD"),     value:"USD" },
  ];

  const DEF: Form = {
    supplier_code:"", supplier_name:"", supplier_type:"FEED",
    contact_name:"", contact_phone:"", address:"",
    tax_no:"", bank_account:"", bank_name:"",
    credit_days:"30", currency_code:"LAK", status:"ACTIVE",
  };

  const [list, setList]         = useState<Supplier[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]   = useState<Supplier|null>(null);
  const [form, setForm]         = useState<Form>(DEF);
  const [saving, setSaving]     = useState(false);
  const [confirmId, setConfirmId] = useState<number|null>(null);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"") : "";
  const hdr = { Authorization:`Bearer ${token}`, "Content-Type":"application/json" };

  const load = useCallback(()=>{
    setLoading(true);
    fetch("/api/crud/prc_suppliers?limit=300")
      .then(r=>r.json()).then(d=>setList(d.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{ load(); },[load]);

  const filtered = useMemo(()=>list.filter(s=>
    (!search||(s.supplier_name||"").includes(search)||(s.supplier_code||"").includes(search)||(s.contact_name||"").includes(search)) &&
    (!typeFilter||s.supplier_type===typeFilter)
  ),[list,search,typeFilter]);

  const activeCount = list.filter(s=>s.status?.toUpperCase()==="ACTIVE").length;
  const feedCount   = list.filter(s=>s.supplier_type==="FEED").length;

  function openNew() {
    setEditing(null);
    setForm({ ...DEF, supplier_code:`SUP-${Date.now().toString().slice(-8)}` });
    setDrawerOpen(true);
  }
  function openEdit(row: Supplier) {
    setEditing(row);
    setForm({
      supplier_code: row.supplier_code, supplier_name: row.supplier_name,
      supplier_type: row.supplier_type||"FEED",
      contact_name: row.contact_name||"", contact_phone: row.contact_phone||"",
      address: row.address||"", tax_no: row.tax_no||"",
      bank_account: row.bank_account||"", bank_name: row.bank_name||"",
      credit_days: String(row.credit_days||30), currency_code: row.currency_code||"LAK",
      status: row.status||"ACTIVE",
    });
    setDrawerOpen(true);
  }

  const save = async () => {
    if (!form.supplier_name) { toast.error(t("ui.供应商名称为必填项","供应商名称为必填项")); return; }
    setSaving(true);
    try {
      const payload = { ...form, credit_days:Number(form.credit_days)||30 };
      if (editing?.id) {
        await fetch(`/api/crud/prc_suppliers/${editing.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify(payload) });
        toast.success(t("ui.供应商信息已更新","供应商信息已更新"));
      } else {
        await fetch("/api/crud/prc_suppliers",{ method:"POST",headers:hdr,body:JSON.stringify(payload) });
        toast.success(t("ui.供应商已新增","供应商已新增"));
      }
      setDrawerOpen(false); setEditing(null); load();
    } catch { toast.error(t("ui.操作失败","操作失败")); } finally { setSaving(false); }
  };

  const del = async () => {
    if (!confirmId) return;
    await fetch(`/api/crud/prc_suppliers/${confirmId}`,{ method:"DELETE",headers:hdr });
    toast.success(t("ui.已删除","已删除")); setConfirmId(null); load();
  };

  const setF = (k:keyof Form, v:string) => setForm(p=>({...p,[k]:v}));

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("ui.供应商管理","供应商管理")} subtitle={`${t("ui.供应商管理副标题","维护采购供应商档案·账期·银行信息")} · ${t("ui.共","共")} ${list.length} ${t("ui.家","家")}`}
        breadcrumb={[t("ui.采购管理","采购管理"),t("ui.供应商管理","供应商管理")]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> {t("common.refresh","刷新")}
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <Plus size={14}/> {t("ui.新增供应商","新增供应商")}
            </button>
          </div>
        }/>

      {/* KPI 统计条 */}
      <div style={{ display:"flex",gap:12,marginBottom:16,flexWrap:"wrap" }}>
        {[
          { label:t("ui.供应商总数","供应商总数"), value:list.length, accent:"var(--color-primary)" },
          { label:t("ui.活跃","活跃"),       value:activeCount,  accent:"#10b981" },
          { label:t("ui.饲料类","饲料类"),     value:feedCount,     accent:"#f59e0b" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px",display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontSize:20,fontWeight:800,color:k.accent }}>{k.value}</span>
            <span style={{ fontSize:12,color:"var(--text-secondary)" }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* 搜索 + 类型筛选 */}
      <div style={{ display:"flex",gap:10,marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("ui.搜索供应商名称编码联系人","搜索供应商名称 / 编码 / 联系人…")}
          style={{ flex:1,padding:"9px 14px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}/>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
          style={{ padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}>
          <option value="">{t("ui.全部类型","全部类型")}</option>
          {TYPE_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* 数据表 */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {[t("ui.供应商编码","供应商编码"),t("ui.供应商名称","供应商名称"),t("ui.类型","类型"),t("ui.联系人","联系人"),t("ui.联系电话","联系电话"),t("ui.账期","账期"),t("ui.结算币种","结算币种"),t("common.status","状态"),t("common.operation","操作")].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={9} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("common.loading","加载中…")}</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={9} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("ui.暂无供应商记录","暂无供应商记录")}</td></tr>}
            {!loading&&filtered.map((row,i)=>(
              <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)" }}>{row.supplier_code}</td>
                <td style={{ padding:"9px 12px" }}>
                  <button type="button" onClick={()=>openEdit(row)}
                    style={{ background:"none",border:"none",color:"var(--color-primary)",cursor:"pointer",fontWeight:700,fontSize:13,padding:0 }}>
                    {row.supplier_name}
                  </button>
                </td>
                <td style={{ padding:"9px 12px" }}>
                  <span className={`${s.badge} ${s[TYPE_CLS[row.supplier_type]||'badgeNeutral']}`}>{TYPE_OPTS.find(tx=>tx.value===row.supplier_type)?.label.split("(")[0].trim()||row.supplier_type}</span>
                </td>
                <td style={{ padding:"9px 12px" }}>{row.contact_name||"—"}</td>
                <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:12 }}>{row.contact_phone||"—"}</td>
                <td style={{ padding:"9px 12px" }}>{row.credit_days||30}{t("ui.天","天")}</td>
                <td style={{ padding:"9px 12px" }}>{row.currency_code||"LAK"}</td>
                <td style={{ padding:"9px 12px" }}>
                  <span className={`${s.badge} ${s[STATUS_CLS[row.status]||'badgeNeutral']}`}>{row.status==="ACTIVE"||row.status==="active"?t("ui.活跃","活跃"):t("ui.停用","停用")}</span>
                </td>
                <td style={{ padding:"9px 12px",display:"flex",gap:6 }}>
                  <button className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>openEdit(row)}>{t("common.edit","编辑")}</button>
                  <button className={s.btnDanger}    style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>setConfirmId(row.id)}>{t("common.delete","删除")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 新增/编辑 Drawer */}
      <RightDrawer open={drawerOpen} title={editing?t("ui.编辑供应商","编辑供应商"):t("ui.新增供应商","新增供应商")} onClose={()=>{setDrawerOpen(false);setEditing(null);}}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          {/* 基本信息区 */}
          <div style={{ fontWeight:700,fontSize:13,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)",paddingBottom:6 }}>{t("ui.基本信息","基本信息")}</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.供应商编码","供应商编码")} <span className={s.textDanger}>*</span></label>
              <input value={form.supplier_code} onChange={e=>setF("supplier_code",e.target.value)}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.供应商类型","供应商类型")}</label>
              <select value={form.supplier_type} onChange={e=>setF("supplier_type",e.target.value)}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
                {TYPE_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.供应商名称","供应商名称")} <span className={s.textDanger}>*</span></label>
            <input value={form.supplier_name} onChange={e=>setF("supplier_name",e.target.value)}
              style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.联系人","联系人")}</label>
              <input value={form.contact_name} onChange={e=>setF("contact_name",e.target.value)}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.联系电话","联系电话")}</label>
              <input value={form.contact_phone} onChange={e=>setF("contact_phone",e.target.value)} type="tel"
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.地址","地址")}</label>
            <textarea value={form.address} onChange={e=>setF("address",e.target.value)} rows={2}
              style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",resize:"vertical",boxSizing:"border-box" }}/>
          </div>

          {/* 财务信息区 */}
          <div style={{ fontWeight:700,fontSize:13,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)",paddingBottom:6,marginTop:4 }}>{t("ui.财务信息","财务信息")}</div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.税务编号TIN","税务编号（TIN）")}</label>
            <input value={form.tax_no} onChange={e=>setF("tax_no",e.target.value)}
              style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.开户银行","开户银行")}</label>
              <input value={form.bank_name} onChange={e=>setF("bank_name",e.target.value)}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.银行账号","银行账号")}</label>
              <input value={form.bank_account} onChange={e=>setF("bank_account",e.target.value)}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.账期","账期")}（{t("ui.天","天")}）</label>
              <input type="number" value={form.credit_days} onChange={e=>setF("credit_days",e.target.value)}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.结算币种","结算币种")}</label>
              <select value={form.currency_code} onChange={e=>setF("currency_code",e.target.value)}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
                {CURRENCY_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {editing&&(
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("common.status","状态")}</label>
              <select value={form.status} onChange={e=>setF("status",e.target.value)}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
                <option value="ACTIVE">{t("ui.活跃","活跃")}</option>
                <option value="INACTIVE">{t("ui.停用","停用")}</option>
                <option value="SUSPENDED">{t("ui.暂停合作","暂停合作")}</option>
              </select>
            </div>
          )}

          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{setDrawerOpen(false);setEditing(null);}}>{t("common.cancel","取消")}</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>{saving?t("ui.保存中","保存中…"):t("ui.保存供应商","保存供应商")}</button>
          </div>
        </div>
      </RightDrawer>

      {/* 删除确认 */}
      {confirmId&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999 }}>
          <div style={{ background:"var(--bg-card)",borderRadius:"var(--radius-lg)",padding:28,maxWidth:380,width:"90%",boxShadow:"var(--shadow-lg)" }}>
            <div style={{ fontSize:18,fontWeight:700,marginBottom:10 }}>{t("ui.确认删除","确认删除")}</div>
            <div style={{ fontSize:14,color:"var(--text-secondary)",marginBottom:20 }}>{t("ui.删除不可恢复确认继续","删除后不可恢复，确认继续？")}</div>
            <div style={{ display:"flex",gap:10 }}>
              <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>setConfirmId(null)}>{t("common.cancel","取消")}</button>
              <button type="button" className={s.btnDanger} style={{ flex:1 }} onClick={del}>{t("ui.确认删除","确认删除")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

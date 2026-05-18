"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { crudApi } from "@/lib/api-client";
import s from "@/components/ui/admin-ui.module.css";

// V3 表: prc_purchase_orders

const STATUS_CLS: Record<string,string> = {
  DRAFT:"badgeNeutral", PENDING:"badgeWarning", CONFIRMED:"badgeInfo",
  APPROVED:"badgeInfo", ARRIVING:"badgeInfo", RECEIVED:"badgeSuccess", CANCELLED:"badgeDanger",
};

const STATUS_FLOW: Record<string,string> = {
  DRAFT:"CONFIRMED", PENDING:"CONFIRMED", CONFIRMED:"APPROVED", APPROVED:"ARRIVING", ARRIVING:"RECEIVED",
};

interface PO {
  id:number; po_no:string; supplier_code?:string; supplier_name?:string;
  subject?:string; total_amount?:number; currency_code?:string;
  status:string; plan_qty?:number; received_qty?:number;
  store_code?:string; expected_date?:string; remark?:string;
  created_by?:number; approved_by?:number; created_at?:string; updated_at?:string;
}
interface Supplier { id:number; supplier_code:string; supplier_name:string; }
interface Form {
  po_no:string; supplier_code:string; supplier_name:string; subject:string;
  total_amount:string; currency_code:string; plan_qty:string;
  expected_date:string; remark:string;
}
const DEF: Form = {
  po_no:"", supplier_code:"", supplier_name:"", subject:"",
  total_amount:"0", currency_code:"LAK", plan_qty:"0",
  expected_date:"", remark:"",
};

export default function ProcurementOrderPage() {
  const toast = useToast();
  const { t } = useLanguage();

  const STATUS_LABEL: Record<string,string> = {
    DRAFT:t("ui.草稿","草稿"), PENDING:t("ui.待审批","待审批"), CONFIRMED:t("ui.已确认","已确认"),
    APPROVED:t("ui.已批准","已批准"), ARRIVING:t("ui.在途中","在途中"), RECEIVED:t("ui.已收货","已收货"), CANCELLED:t("status.cancelled","已取消"),
  };
  const STATUS_NEXT_LABEL: Record<string,string> = {
    DRAFT:t("ui.提交确认","提交确认"), PENDING:t("ui.批准确认","批准确认"), CONFIRMED:t("ui.批准","批准"), APPROVED:t("ui.发货在途","发货在途"), ARRIVING:t("ui.确认收货","确认收货"),
  };

  const [orders, setOrders]       = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [detailRow, setDetailRow]       = useState<PO|null>(null);
  const [editing, setEditing]           = useState<PO|null>(null);
  const [form, setForm]                 = useState<Form>(DEF);
  const [saving, setSaving]             = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"") : "";
  const hdr = { Authorization:`Bearer ${token}`, "Content-Type":"application/json" };

  const load = useCallback(()=>{
    setLoading(true);
    Promise.all([
      crudApi.list<PO>("prc_purchase_orders", { limit: 300 }),
      crudApi.list<Supplier>("prc_suppliers", { limit: 200 }),
    ]).then(([od,sd])=>{
      setOrders(od.data||[]);
      setSuppliers(sd.data||[]);
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{ load(); },[load]);

  const filtered = useMemo(()=>orders.filter(o=>
    (!search||(o.po_no||"").includes(search)||(o.supplier_name||"").includes(search)||(o.subject||"").includes(search)) &&
    (!statusFilter||o.status?.toUpperCase()===statusFilter)
  ),[orders,search,statusFilter]);

  const monthlyAmt    = useMemo(()=>orders.reduce((sum,o)=>sum+(Number(o.total_amount)||0),0),[orders]);
  const inTransitCnt  = orders.filter(o=>["CONFIRMED","APPROVED","ARRIVING"].includes(o.status?.toUpperCase()||"")).length;
  const receivedCnt   = orders.filter(o=>o.status?.toUpperCase()==="RECEIVED").length;

  function genPoNo() {
    const d = new Date().toISOString().slice(0,10).replace(/-/g,"");
    return `PO-${d}-${Date.now().toString().slice(-5)}`;
  }

  function openNew() {
    setEditing(null); setDetailRow(null);
    setForm({ ...DEF, po_no:genPoNo() });
    setDrawerOpen(true);
  }
  function openEdit(row: PO) {
    setEditing(row); setDetailRow(null);
    setForm({
      po_no: row.po_no, supplier_code: row.supplier_code||"", supplier_name: row.supplier_name||"",
      subject: row.subject||"", total_amount: String(row.total_amount||0),
      currency_code: row.currency_code||"LAK", plan_qty: String(row.plan_qty||0),
      expected_date: row.expected_date?.slice(0,10)||"", remark: row.remark||"",
    });
    setDrawerOpen(true);
  }
  function openDetail(row: PO) {
    setDetailRow(row); setEditing(null); setDrawerOpen(true);
  }

  function onSupplierSelect(code:string) {
    const sup = suppliers.find(s=>s.supplier_code===code);
    setForm(p=>({ ...p, supplier_code:code, supplier_name:sup?.supplier_name||"" }));
  }

  const save = async () => {
    if (!form.supplier_code||!form.subject) { toast.error(t("ui.供应商和采购主题为必填项","供应商和采购主题为必填项")); return; }
    setSaving(true);
    try {
      const payload = {
        ...form, total_amount:Number(form.total_amount)||0,
        plan_qty:Number(form.plan_qty)||0, status:"DRAFT",
      };
      if (editing?.id) {
        await fetch(`/api/crud/prc_purchase_orders/${editing.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify(payload) });
        toast.success(t("ui.采购订单已更新","采购订单已更新"));
      } else {
        await fetch("/api/crud/prc_purchase_orders",{ method:"POST",headers:hdr,body:JSON.stringify(payload) });
        toast.success(t("ui.采购订单已创建","采购订单已创建"));
      }
      setDrawerOpen(false); setEditing(null); load();
    } catch { toast.error(t("ui.操作失败","操作失败")); } finally { setSaving(false); }
  };

  const advance = async (row: PO) => {
    const next = STATUS_FLOW[row.status?.toUpperCase()||""];
    if (!next) return;
    await fetch(`/api/crud/prc_purchase_orders/${row.id}`,{
      method:"PUT",headers:hdr,
      body:JSON.stringify({ status:next, ...(next==="RECEIVED"?{received_qty:row.plan_qty}:{}) }),
    });
    toast.success(`${t("ui.状态已推进为","状态已推进为")}：${STATUS_LABEL[next]||next}`);
    load();
  };

  const setF = (k:keyof Form,v:string) => setForm(p=>({...p,[k]:v}));

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("ui.采购订单","采购订单")} subtitle={`${t("ui.管理全部采购订单状态机流转","管理全部采购订单·状态机流转")}·${orders.length} ${t("ui.笔","笔")}`}
        breadcrumb={[t("ui.采购管理","采购管理"),t("ui.采购订单","采购订单")]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <RefreshCw size={14}/> {t("common.refresh","刷新")}
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <Plus size={14}/> {t("ui.新建采购单","新建采购单")}
            </button>
          </div>
        }/>

      {/* KPI */}
      <div style={{ display:"flex",gap:12,marginBottom:16,flexWrap:"wrap" }}>
        {[
          { label:t("ui.采购总额","采购总额"),   value:`¥${monthlyAmt.toLocaleString()}`, accent:"var(--color-primary)" },
          { label:t("ui.在途中","在途中"),     value:`${inTransitCnt} ${t("ui.单","单")}`,              accent:"#3b82f6" },
          { label:t("ui.已收货","已收货"),     value:`${receivedCnt} ${t("ui.单","单")}`,               accent:"#10b981" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px",display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontSize:18,fontWeight:800,color:k.accent }}>{k.value}</span>
            <span style={{ fontSize:12,color:"var(--text-secondary)" }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* 搜索 + 状态过滤 */}
      <div style={{ display:"flex",gap:10,marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("ui.搜索订单号供应商主题","搜索订单号 / 供应商 / 主题…")}
          style={{ flex:1,padding:"9px 14px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}/>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
          style={{ padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}>
          <option value="">{t("ui.全部状态","全部状态")}</option>
          {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* 表格 */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {[t("ui.订单号","订单号"),t("ui.供应商","供应商"),t("ui.采购主题","采购主题"),t("common.amount","金额"),t("ui.计划数量","计划数量"),t("ui.已收数量","已收数量"),t("ui.期望到货","期望到货"),t("common.status","状态"),t("common.operation","操作")].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={9} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("common.loading","加载中…")}</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={9} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("ui.暂无采购订单","暂无采购订单")}</td></tr>}
            {!loading&&filtered.map((row,i)=>{
              const st = row.status?.toUpperCase()||"DRAFT";
              const nextSt = STATUS_FLOW[st];
              return (
                <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)" }}>
                    <button type="button" onClick={()=>openDetail(row)} style={{ background:"none",border:"none",color:"var(--color-primary)",cursor:"pointer",fontWeight:700,fontFamily:"monospace",fontSize:11,padding:0 }}>
                      {row.po_no}
                    </button>
                  </td>
                  <td style={{ padding:"9px 12px",fontWeight:600 }}>{row.supplier_name||row.supplier_code||"—"}</td>
                  <td style={{ padding:"9px 12px",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{row.subject||"—"}</td>
                  <td style={{ padding:"9px 12px",fontWeight:700,color:"var(--color-primary)" }}>
                    {row.currency_code||"LAK"} {Number(row.total_amount||0).toLocaleString()}
                  </td>
                  <td style={{ padding:"9px 12px" }}>{row.plan_qty||0}</td>
                  <td style={{ padding:"9px 12px" }}>
                    <span style={{ color:(row.received_qty||0)>=(row.plan_qty||1)?"#10b981":"var(--text-primary)" }}>
                      {row.received_qty||0}
                    </span>
                  </td>
                  <td style={{ padding:"9px 12px",fontSize:11 }}>{row.expected_date?.slice(0,10)||"—"}</td>
                  <td style={{ padding:"9px 12px" }}>
                    <span className={`${s.badge} ${s[STATUS_CLS[st]||'badgeNeutral']}`}>{STATUS_LABEL[st]||st}</span>
                  </td>
                  <td style={{ padding:"9px 12px" }}>
                    <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                      {st==="DRAFT"&&<button type="button" className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>openEdit(row)}>{t("common.edit","编辑")}</button>}
                      {nextSt&&<button type="button" className={s.btnSuccess} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>advance(row)}>{STATUS_NEXT_LABEL[st]}</button>}
                      <button type="button" className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>openDetail(row)}>{t("common.detail","详情")}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 详情 / 新增/编辑 Drawer */}
      <RightDrawer open={drawerOpen} title={detailRow?t("ui.采购单详情","采购单详情"):editing?t("ui.编辑采购单","编辑采购单"):t("ui.新建采购单","新建采购单")}
        onClose={()=>{ setDrawerOpen(false); setEditing(null); setDetailRow(null); }}>
        {detailRow ? (
          /* 详情视图 */
          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
            {[
              { label:t("ui.订单号","订单号"),   value:detailRow.po_no, mono:true },
              { label:t("ui.供应商","供应商"),   value:detailRow.supplier_name||detailRow.supplier_code },
              { label:t("ui.采购主题","采购主题"), value:detailRow.subject },
              { label:t("common.amount","金额"),     value:`${detailRow.currency_code||"LAK"} ${Number(detailRow.total_amount||0).toLocaleString()}` },
              { label:t("ui.计划数量","计划数量"), value:String(detailRow.plan_qty||0) },
              { label:t("ui.已收数量","已收数量"), value:String(detailRow.received_qty||0) },
              { label:t("ui.期望到货","期望到货"), value:detailRow.expected_date?.slice(0,10)||"—" },
              { label:t("ui.创建时间","创建时间"), value:detailRow.created_at?.slice(0,16)||"—" },
              { label:t("ui.更新时间","更新时间"), value:detailRow.updated_at?.slice(0,16)||"—" },
              { label:t("common.remark","备注"),     value:detailRow.remark||"—" },
            ].map(r=>(
              <div key={r.label} style={{ display:"flex",gap:10 }}>
                <span style={{ width:80,fontSize:12,color:"var(--text-secondary)",flexShrink:0 }}>{r.label}</span>
                <span style={{ fontSize:13,fontWeight:600,color:"var(--text-primary)",fontFamily:r.mono?"monospace":"inherit" }}>{r.value||"—"}</span>
              </div>
            ))}
            <div style={{ marginTop:8 }}>
              <span style={{ width:80,fontSize:12,color:"var(--text-secondary)" }}>{t("ui.当前状态","当前状态")} </span>
              <span className={`${s.badge} ${s[STATUS_CLS[(detailRow.status||"DRAFT").toUpperCase()]||'badgeNeutral']}`}>
                {STATUS_LABEL[(detailRow.status||"DRAFT").toUpperCase()]||detailRow.status}
              </span>
            </div>
            {STATUS_FLOW[detailRow.status?.toUpperCase()||""]&&(
              <button type="button" className={s.btnPrimary} style={{ marginTop:8 }} onClick={()=>{setDrawerOpen(false);advance(detailRow);}}>
                {STATUS_NEXT_LABEL[detailRow.status?.toUpperCase()||""]}
              </button>
            )}
          </div>
        ) : (
          /* 新建/编辑表单 */
          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div>
                <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.订单号自动生成","订单号（自动生成）")}</label>
                <input value={form.po_no} readOnly
                  style={{ width:"100%",padding:"8px 10px",background:"var(--bg-page)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-secondary)",fontSize:12,boxSizing:"border-box",fontFamily:"monospace" }}/>
              </div>
              <div>
                <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.结算币种","结算币种")}</label>
                <select value={form.currency_code} onChange={e=>setF("currency_code",e.target.value)}
                  style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
                  {["LAK","CNY","THB","USD"].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.供应商","供应商")} <span className={s.textDanger}>*</span></label>
              <select value={form.supplier_code} onChange={e=>onSupplierSelect(e.target.value)}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
                <option value="">— {t("ui.请选择供应商","请选择供应商")} —</option>
                {suppliers.map(sp=><option key={sp.supplier_code} value={sp.supplier_code}>{sp.supplier_name} ({sp.supplier_code})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.采购主题","采购主题")} <span className={s.textDanger}>*</span></label>
              <input value={form.subject} onChange={e=>setF("subject",e.target.value)} placeholder={t("ui.采购主题日期示例","例：2025年5月饲料采购")}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div>
                <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.采购金额","采购金额")}</label>
                <input type="number" value={form.total_amount} onChange={e=>setF("total_amount",e.target.value)}
                  style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
              </div>
              <div>
                <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.计划数量","计划数量")}</label>
                <input type="number" value={form.plan_qty} onChange={e=>setF("plan_qty",e.target.value)}
                  style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
              </div>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.期望到货日期","期望到货日期")}</label>
              <input type="date" value={form.expected_date} onChange={e=>setF("expected_date",e.target.value)}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("common.remark","备注")}</label>
              <textarea value={form.remark} onChange={e=>setF("remark",e.target.value)} rows={3}
                style={{ width:"100%",padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",resize:"vertical",boxSizing:"border-box" }}/>
            </div>
            <div style={{ display:"flex",gap:10,paddingTop:8 }}>
              <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{setDrawerOpen(false);setEditing(null);}}>{t("common.cancel","取消")}</button>
              <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>{saving?t("ui.保存中","保存中…"):t("common.save","保存")}</button>
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}

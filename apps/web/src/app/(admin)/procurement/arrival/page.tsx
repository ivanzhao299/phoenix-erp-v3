"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw, Package, CheckCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

// V3 表: wms_inbound + wms_inbound_items
// wms_inbound:  id, task_no, source_po_no, source_type, warehouse_code, supplier_code,
//               total_amount, currency_code, status(PENDING/PROCESSING/COMPLETED/CANCELLED),
//               store_code, operator_id, confirmed_at, remark, created_by, created_at, updated_at
// wms_inbound_items: id, task_no, line_no, product_code, spec_code, batch_no,
//                    expire_date, planned_qty, actual_qty, unit, unit_cost, location_code, created_at

const STATUS_CLS: Record<string,string>   = { PENDING:"badgeWarning", PROCESSING:"badgeInfo", COMPLETED:"badgeSuccess", CANCELLED:"badgeDanger" };
const STATUS_LABEL: Record<string,string> = { PENDING:"待验收", PROCESSING:"验收中", COMPLETED:"已完成", CANCELLED:"已取消" };
const SOURCE_LABEL: Record<string,string> = { PURCHASE:"采购入库", TRANSFER:"调拨入库", RETURN:"退货入库" };

interface Inbound {
  id:number; task_no:string; source_po_no?:string; source_type?:string;
  warehouse_code?:string; supplier_code?:string; total_amount?:number;
  currency_code?:string; status:string; store_code?:string; operator_id?:number;
  confirmed_at?:string; remark?:string; created_by?:number; created_at?:string; updated_at?:string;
}
interface InboundItem {
  id:number; task_no:string; line_no?:number; product_code?:string; spec_code?:string;
  batch_no?:string; expire_date?:string; planned_qty?:number; actual_qty?:number;
  unit?:string; unit_cost?:number; location_code?:string; created_at?:string;
}
interface Form {
  task_no:string; source_po_no:string; source_type:string; warehouse_code:string;
  supplier_code:string; total_amount:string; currency_code:string; remark:string;
}
interface ItemForm { product_code:string; spec_code:string; batch_no:string; expire_date:string; planned_qty:string; actual_qty:string; unit:string; unit_cost:string; location_code:string; }
const DEF_FORM: Form = { task_no:"", source_po_no:"", source_type:"PURCHASE", warehouse_code:"WH-MAIN", supplier_code:"", total_amount:"0", currency_code:"LAK", remark:"" };
const DEF_ITEM: ItemForm = { product_code:"", spec_code:"", batch_no:"", expire_date:"", planned_qty:"0", actual_qty:"0", unit:"个", unit_cost:"0", location_code:"" };

export default function ArrivalPage() {
  const toast = useToast();
  const [list, setList]         = useState<Inbound[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [detailRow, setDetailRow]       = useState<Inbound|null>(null);
  const [items, setItems]               = useState<InboundItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [editing, setEditing]           = useState<Inbound|null>(null);
  const [form, setForm]                 = useState<Form>(DEF_FORM);
  const [formItems, setFormItems]       = useState<ItemForm[]>([{ ...DEF_ITEM }]);
  const [saving, setSaving]             = useState(false);

  const token = typeof window !== "undefined" ? (sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"") : "";
  const hdr = { Authorization:`Bearer ${token}`, "Content-Type":"application/json" };

  const load = useCallback(()=>{
    setLoading(true);
    fetch("/api/crud/wms_inbound?limit=300")
      .then(r=>r.json()).then(d=>setList(d.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{ load(); },[load]);

  const filtered = useMemo(()=>list.filter(r=>
    (!search||(r.task_no||"").includes(search)||(r.source_po_no||"").includes(search)||(r.supplier_code||"").includes(search)) &&
    (!statusFilter||r.status?.toUpperCase()===statusFilter)
  ),[list,search,statusFilter]);

  const pendingCnt    = list.filter(r=>r.status?.toUpperCase()==="PENDING").length;
  const processingCnt = list.filter(r=>r.status?.toUpperCase()==="PROCESSING").length;
  const completedCnt  = list.filter(r=>r.status?.toUpperCase()==="COMPLETED").length;
  const totalAmt      = list.reduce((s,r)=>s+(Number(r.total_amount)||0),0);

  async function loadItems(taskNo: string) {
    setItemsLoading(true);
    try {
      const r = await fetch(`/api/crud/wms_inbound_items?task_no=${encodeURIComponent(taskNo)}&limit=50`);
      const d = await r.json();
      setItems(d.data||[]);
    } catch { setItems([]); } finally { setItemsLoading(false); }
  }

  function openNew() {
    setEditing(null); setDetailRow(null);
    setForm({ ...DEF_FORM, task_no:`IB-${Date.now().toString().slice(-10)}` });
    setFormItems([{ ...DEF_ITEM }]);
    setDrawerOpen(true);
  }
  async function openDetail(row: Inbound) {
    setDetailRow(row); setEditing(null);
    setDrawerOpen(true);
    await loadItems(row.task_no);
  }

  async function confirm(row: Inbound) {
    await fetch(`/api/crud/wms_inbound/${row.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify({ status:"COMPLETED",confirmed_at:new Date().toISOString() }) });
    toast.success(`入库任务 ${row.task_no} 已完成确认`); load();
  }

  const addItemRow = () => setFormItems(p=>[...p,{ ...DEF_ITEM }]);
  const setItemF = (i:number, k:keyof ItemForm, v:string) => setFormItems(p=>p.map((r,idx)=>idx===i?{...r,[k]:v}:r));

  const save = async () => {
    if (!form.warehouse_code) { toast.error("仓库编码为必填项"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/crud/wms_inbound",{ method:"POST",headers:hdr,body:JSON.stringify(form) });
      const created = await res.json();
      const inbId = created?.data?.id || created?.id;
      // 写入明细行
      for (let i=0; i<formItems.length; i++) {
        const fi = formItems[i];
        if (!fi.product_code) continue;
        await fetch("/api/crud/wms_inbound_items",{ method:"POST",headers:hdr,body:JSON.stringify({
          task_no:form.task_no, line_no:i+1, product_code:fi.product_code,
          spec_code:fi.spec_code, batch_no:fi.batch_no, expire_date:fi.expire_date||null,
          planned_qty:Number(fi.planned_qty)||0, actual_qty:Number(fi.actual_qty)||0,
          unit:fi.unit||"个", unit_cost:Number(fi.unit_cost)||0, location_code:fi.location_code,
        })});
      }
      toast.success("入库任务已创建");
      setDrawerOpen(false); load();
    } catch { toast.error("创建失败"); } finally { setSaving(false); }
  };

  const setF = (k:keyof Form,v:string) => setForm(p=>({...p,[k]:v}));

  const inp = { padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" } as React.CSSProperties;

  return (
    <div className="animate-fade-in">
      <PageHeader title="到货收货" subtitle="采购入库验收·三单比对·收货确认" breadcrumb={["采购管理","到货收货"]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{ display:"flex",alignItems:"center",gap:6 }}>
              <RefreshCw size={14}/> 刷新
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew} style={{ display:"flex",alignItems:"center",gap:6 }}>
              <Plus size={14}/> 新建入库任务
            </button>
          </div>
        }/>

      {/* KPI */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:16 }}>
        {[
          { label:"待验收",  value:pendingCnt,                accent:"#f59e0b" },
          { label:"验收中",  value:processingCnt,             accent:"#3b82f6" },
          { label:"已完成",  value:completedCnt,              accent:"#10b981" },
          { label:"货值合计",value:`¥${totalAmt.toLocaleString()}`,accent:"var(--color-primary)" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px" }}>
            <div style={{ fontSize:11,color:k.accent,fontWeight:700,marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:20,fontWeight:800,color:k.accent }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* 过滤 */}
      <div style={{ display:"flex",gap:10,marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索任务号 / 关联采购单 / 供应商…"
          style={{ flex:1,...inp,padding:"9px 14px" }}/>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{ ...inp,width:140 }}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* 表格 */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {["任务号","关联采购单","来源类型","仓库","供应商","货值","状态","创建时间","操作"].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={9} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={9} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>暂无入库记录</td></tr>}
            {!loading&&filtered.map((row,i)=>{
              const st = row.status?.toUpperCase()||"PENDING";
              return (
                <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11 }}>
                    <button type="button" onClick={()=>openDetail(row)} style={{ background:"none",border:"none",color:"var(--color-primary)",cursor:"pointer",fontWeight:700,fontFamily:"monospace",fontSize:11,padding:0 }}>{row.task_no}</button>
                  </td>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)" }}>{row.source_po_no||"—"}</td>
                  <td style={{ padding:"9px 12px" }}>{SOURCE_LABEL[row.source_type||"PURCHASE"]||row.source_type}</td>
                  <td style={{ padding:"9px 12px" }}>{row.warehouse_code||"—"}</td>
                  <td style={{ padding:"9px 12px" }}>{row.supplier_code||"—"}</td>
                  <td style={{ padding:"9px 12px",fontWeight:700,color:"var(--color-primary)" }}>
                    {row.currency_code||"LAK"} {Number(row.total_amount||0).toLocaleString()}
                  </td>
                  <td style={{ padding:"9px 12px" }}><span className={`${s.badge} ${s[STATUS_CLS[st]||'badgeNeutral']}`}>{STATUS_LABEL[st]||st}</span></td>
                  <td style={{ padding:"9px 12px",fontSize:11,color:"var(--text-secondary)" }}>{row.created_at?.slice(0,10)||"—"}</td>
                  <td style={{ padding:"9px 12px",display:"flex",gap:6 }}>
                    <button className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>openDetail(row)}>详情</button>
                    {st==="PENDING"&&<button className={s.btnSuccess} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>confirm(row)}><CheckCircle size={11}/> 确认收货</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 抽屉：详情 or 新建 */}
      <RightDrawer open={drawerOpen} title={detailRow?`入库单详情 — ${detailRow.task_no}`:"新建入库任务"} onClose={()=>{ setDrawerOpen(false); setDetailRow(null); setEditing(null); }}>
        {detailRow ? (
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            {/* 基本信息 */}
            {[
              ["任务号",     detailRow.task_no, true],
              ["关联采购单", detailRow.source_po_no||"—", true],
              ["来源类型",   SOURCE_LABEL[detailRow.source_type||"PURCHASE"]||detailRow.source_type],
              ["仓库编码",   detailRow.warehouse_code],
              ["供应商",     detailRow.supplier_code],
              ["货值",       `${detailRow.currency_code||"LAK"} ${Number(detailRow.total_amount||0).toLocaleString()}`],
              ["备注",       detailRow.remark||"—"],
              ["创建时间",   detailRow.created_at?.slice(0,16)],
              ["确认时间",   detailRow.confirmed_at?.slice(0,16)||"—"],
            ].map(([l,v,m])=>(
              <div key={String(l)} style={{ display:"flex",gap:10 }}>
                <span style={{ width:80,fontSize:12,color:"var(--text-secondary)",flexShrink:0 }}>{l}</span>
                <span style={{ fontSize:13,fontWeight:600,fontFamily:m?"monospace":"inherit" }}>{String(v||"—")}</span>
              </div>
            ))}
            <div style={{ display:"flex",gap:10 }}>
              <span style={{ width:80,fontSize:12,color:"var(--text-secondary)" }}>状态</span>
              <span className={`${s.badge} ${s[STATUS_CLS[(detailRow.status||"").toUpperCase()]||'badgeNeutral']}`}>{STATUS_LABEL[(detailRow.status||"").toUpperCase()]||detailRow.status}</span>
            </div>

            {/* 明细行 */}
            <div style={{ fontWeight:700,fontSize:13,marginTop:10,borderBottom:"1px solid var(--border)",paddingBottom:6 }}>收货明细</div>
            {itemsLoading&&<div style={{ color:"var(--text-secondary)",fontSize:13 }}>加载明细…</div>}
            {!itemsLoading&&items.length===0&&<div style={{ color:"var(--text-secondary)",fontSize:13 }}>暂无明细</div>}
            {!itemsLoading&&items.map((it,idx)=>(
              <div key={it.id} style={{ background:"var(--bg-page)",borderRadius:"var(--radius-md)",padding:"10px 12px",border:"1px solid var(--border)" }}>
                <div style={{ fontWeight:700,fontSize:12,marginBottom:6 }}>第 {it.line_no||idx+1} 行 — {it.product_code}</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12,color:"var(--text-secondary)" }}>
                  {[["规格",it.spec_code],["批次",it.batch_no],["效期",it.expire_date?.slice(0,10)],["计划数",it.planned_qty],["实收数",it.actual_qty],["单位",it.unit],["单价",it.unit_cost],["库位",it.location_code]].map(([k,v])=>(
                    <div key={String(k)}><span style={{ color:"var(--text-muted)" }}>{k}：</span>{String(v||"—")}</div>
                  ))}
                </div>
              </div>
            ))}
            {detailRow.status?.toUpperCase()==="PENDING"&&(
              <button type="button" className={s.btnSuccess} style={{ marginTop:8 }} onClick={()=>{ confirm(detailRow); setDrawerOpen(false); }}>
                <CheckCircle size={13}/> 确认全部收货
              </button>
            )}
          </div>
        ) : (
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div>
                <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>任务号（自动）</label>
                <input value={form.task_no} readOnly style={{ ...inp,background:"var(--bg-page)",color:"var(--text-secondary)",fontFamily:"monospace",fontSize:12 }}/>
              </div>
              <div>
                <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>来源类型</label>
                <select value={form.source_type} onChange={e=>setF("source_type",e.target.value)} style={{ ...inp }}>
                  {Object.entries(SOURCE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            {[
              { k:"source_po_no",  l:"关联采购单号" },
              { k:"warehouse_code",l:"仓库编码", req:true },
              { k:"supplier_code", l:"供应商编码" },
              { k:"total_amount",  l:"货值金额", t:"number" },
            ].map(f=>(
              <div key={f.k}>
                <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{f.l}{f.req&&<span className={s.textDanger}> *</span>}</label>
                <input type={f.t||"text"} value={form[f.k as keyof Form]} onChange={e=>setF(f.k as keyof Form,e.target.value)} style={{ ...inp }}/>
              </div>
            ))}
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>备注</label>
              <textarea value={form.remark} onChange={e=>setF("remark",e.target.value)} rows={2} style={{ ...inp,resize:"vertical" }}/>
            </div>

            {/* 明细行 */}
            <div style={{ fontWeight:700,fontSize:13,marginTop:6,borderBottom:"1px solid var(--border)",paddingBottom:6 }}>收货明细行</div>
            {formItems.map((fi,idx)=>(
              <div key={idx} style={{ background:"var(--bg-page)",borderRadius:"var(--radius-md)",padding:"10px 12px",border:"1px solid var(--border)" }}>
                <div style={{ fontSize:12,fontWeight:700,marginBottom:6 }}>第 {idx+1} 行</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                  {[
                    { k:"product_code",l:"产品编码",req:true },
                    { k:"spec_code",   l:"规格" },
                    { k:"batch_no",    l:"批次号" },
                    { k:"expire_date", l:"效期",t:"date" },
                    { k:"planned_qty", l:"计划数量",t:"number" },
                    { k:"actual_qty",  l:"实收数量",t:"number" },
                    { k:"unit",        l:"单位" },
                    { k:"unit_cost",   l:"单价",t:"number" },
                    { k:"location_code",l:"库位编码" },
                  ].map(f=>(
                    <div key={f.k}>
                      <label style={{ fontSize:11,color:"var(--text-secondary)",display:"block",marginBottom:2 }}>{f.l}</label>
                      <input type={f.t||"text"} value={fi[f.k as keyof ItemForm]} onChange={e=>setItemF(idx,f.k as keyof ItemForm,e.target.value)} style={{ ...inp,fontSize:12 }}/>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className={s.btnSecondary} onClick={addItemRow}>+ 添加明细行</button>
            <div style={{ display:"flex",gap:10,paddingTop:8 }}>
              <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{ setDrawerOpen(false); }}>取消</button>
              <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>{saving?"保存中…":"创建入库任务"}</button>
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}

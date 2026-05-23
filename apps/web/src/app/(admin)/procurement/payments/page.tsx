"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { crudApi } from "@/lib/api-client";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface Transaction {
  id:number; txn_no?:string; account_code?:string; type?:string; amount?:number;
  ref_no?:string; note?:string; due_date?:string; description?:string;
  status?:string; created_at?:string; currency_code?:string;
  payment_ref?:string; payment_proof?:string; po_no?:string;
}

interface PendingPayment {
  id:number; txn_no?:string; amount?:number; currency_code?:string;
  status?:string; description?:string; due_date?:string; created_at?:string;
  po_no?:string; subject?:string; supplier_name?:string; supplier_code?:string;
  contract_no?:string; pay_deadline?:string;
}

interface PayForm {
  payment_ref:string; payment_proof:string; method:string;
}

interface Form {
  account_code:string; type:string; amount:string; ref_no:string;
  note:string; due_date:string; description:string; payment_method:string;
}

// ── 常量 ─────────────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string,string> = {
  PENDING:"badgeWarning", PAID:"badgeSuccess", OVERDUE:"badgeDanger", PARTIAL:"badgeInfo",
};
const PAYMENT_METHODS = ["银行转账","现金","移动支付","支票","其他"];

export default function PaymentsPage() {
  const toast = useToast();
  const { t } = useLanguage();

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"") : "";
  const hdr = { Authorization:`Bearer ${token}`, "Content-Type":"application/json" };

  const TYPE_OPTS = [
    { value:"AP",      label:t("ui.应付账款AP","应付账款(AP)") },
    { value:"PAYMENT", label:t("ui.付款记录","付款记录") },
  ];
  const STATUS_LABEL: Record<string,string> = {
    PENDING:t("ui.待付款","待付款"), PAID:t("ui.已付款","已付款"),
    OVERDUE:t("ui.已逾期","已逾期"), PARTIAL:t("ui.部分付款","部分付款"),
  };
  const DEF: Form = {
    account_code:"AP-TRADE", type:"AP", amount:"0",
    ref_no:"", note:"", due_date:"", description:"", payment_method:PAYMENT_METHODS[0],
  };
  const DEF_PAY: PayForm = { payment_ref:"", payment_proof:"", method:PAYMENT_METHODS[0] };

  // ── state ──────────────────────────────────────────────────────────────────

  const [list, setList]                   = useState<Transaction[]>([]);
  const [pending, setPending]             = useState<PendingPayment[]>([]);
  const [loading, setLoading]             = useState(true);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [search, setSearch]               = useState("");
  const [typeFilter, setTypeFilter]       = useState("AP");
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [editing, setEditing]             = useState<Transaction|null>(null);
  const [form, setForm]                   = useState<Form>(DEF);
  const [saving, setSaving]               = useState(false);

  // 付款确认弹层
  const [payTarget, setPayTarget]         = useState<PendingPayment|null>(null);
  const [payForm, setPayForm]             = useState<PayForm>(DEF_PAY);
  const [paying, setPaying]               = useState(false);

  const today = new Date().toISOString().slice(0,10);

  // ── 加载 ──────────────────────────────────────────────────────────────────

  const load = useCallback(()=>{
    setLoading(true);
    crudApi.list<Transaction>("fin_transactions", { limit: 300 })
      .then(res=>setList(res.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const loadPending = useCallback(()=>{
    setPendingLoading(true);
    fetch("/api/procurement/pending-payments",{ headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.json()).then(j=>setPending(j.data||[])).catch(()=>{})
      .finally(()=>setPendingLoading(false));
  },[token]);

  useEffect(()=>{ load(); loadPending(); },[load,loadPending]);

  // ── 统计 ──────────────────────────────────────────────────────────────────

  const enriched = useMemo(()=>list.map(tx=>{
    let status = tx.status||"PENDING";
    if (status==="PENDING" && tx.due_date && tx.due_date.slice(0,10)<today) status="OVERDUE";
    return { ...tx, status };
  }),[list,today]);

  const apList = useMemo(()=>enriched.filter(tx=>
    (!typeFilter||tx.type===typeFilter) &&
    (!search||(tx.ref_no||"").includes(search)||(tx.note||"").includes(search)||(tx.description||"").includes(search))
  ),[enriched,search,typeFilter]);

  const totalAP      = enriched.filter(tx=>tx.type==="AP").reduce((s,tx)=>s+(Number(tx.amount)||0),0);
  const totalPaid    = enriched.filter(tx=>tx.type==="AP"&&tx.status==="PAID").reduce((s,tx)=>s+(Number(tx.amount)||0),0);
  const totalOverdue = enriched.filter(tx=>tx.status==="OVERDUE").reduce((s,tx)=>s+(Number(tx.amount)||0),0);
  const pendingCnt   = enriched.filter(tx=>tx.type==="AP"&&tx.status==="PENDING").length;

  // ── 手动付款记录 ──────────────────────────────────────────────────────────

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
      description:row.description||"", payment_method:PAYMENT_METHODS[0],
    });
    setDrawerOpen(true);
  }
  const markPaid = async (row: Transaction) => {
    await fetch(`/api/crud/fin_transactions/${row.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify({ status:"PAID" }) });
    toast.success(t("ui.已标记为已付款","已标记为已付款")); load();
  };
  const save = async () => {
    if (!form.ref_no||Number(form.amount)<=0) { toast.error(t("ui.关联单号和金额为必填项","关联单号和金额为必填项")); return; }
    setSaving(true);
    try {
      const payload = { ...form, amount:Number(form.amount), status:"PENDING" };
      if (editing?.id) {
        await fetch(`/api/crud/fin_transactions/${editing.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify(payload) });
        toast.success(t("ui.记录已更新","记录已更新"));
      } else {
        await fetch("/api/crud/fin_transactions",{ method:"POST",headers:hdr,body:JSON.stringify(payload) });
        toast.success(t("ui.付款记录已创建","付款记录已创建"));
      }
      setDrawerOpen(false); setEditing(null); load();
    } catch { toast.error(t("ui.操作失败","操作失败")); } finally { setSaving(false); }
  };

  // ── 来自PO的付款确认 ──────────────────────────────────────────────────────

  const openPay = (item: PendingPayment) => {
    setPayTarget(item);
    setPayForm(DEF_PAY);
  };
  const confirmPay = async () => {
    if (!payTarget) return;
    if (!payForm.payment_ref.trim()) { toast.error("请填写付款流水号"); return; }
    setPaying(true);
    try {
      const res = await fetch(`/api/procurement/payments/${payTarget.id}/confirm`,{
        method:"POST", headers:hdr,
        body:JSON.stringify({ payment_ref:payForm.payment_ref.trim(), payment_proof:payForm.payment_proof.trim()||undefined, method:payForm.method }),
      });
      const json = await res.json().catch(()=>({}));
      if (res.ok) {
        toast.success(json.msg||"付款已确认");
        setPayTarget(null);
        load(); loadPending();
      } else { toast.error(json.msg||"确认失败"); }
    } catch { toast.error("网络错误，请重试"); } finally { setPaying(false); }
  };

  const setF = (k:keyof Form,v:string)=>setForm(p=>({...p,[k]:v}));
  const inp = { padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" } as React.CSSProperties;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("ui.付款管理","付款管理")}
        subtitle={t("ui.付款管理副标题","应付账款·付款记录·逾期预警")}
        breadcrumb={[t("ui.采购管理","采购管理"),t("ui.付款管理","付款管理")]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={()=>{load();loadPending();}} disabled={loading}
              style={{ display:"flex",alignItems:"center",gap:6 }}><RefreshCw size={14}/> {t("common.refresh","刷新")}</button>
            <button type="button" className={s.btnPrimary} onClick={openNew}
              style={{ display:"flex",alignItems:"center",gap:6 }}><Plus size={14}/> {t("common.new","新增")}</button>
          </div>
        }/>

      {/* KPI */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10,marginBottom:16 }}>
        {[
          { label:t("ui.应付账款总额","应付账款总额"), value:`¥${totalAP.toLocaleString()}`,       accent:"var(--color-primary)" },
          { label:t("ui.已付","已付"),                  value:`¥${totalPaid.toLocaleString()}`,     accent:"#10b981" },
          { label:t("ui.逾期金额","逾期金额"),           value:`¥${totalOverdue.toLocaleString()}`,  accent:"#ef4444" },
          { label:t("ui.待付单数","待付单数"),            value:`${pendingCnt} ${t("ui.笔","笔")}`,  accent:"#f59e0b" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px" }}>
            <div style={{ fontSize:11,color:k.accent,fontWeight:700,marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:18,fontWeight:800,color:k.accent }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── 来自采购订单的待付款 ── */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:"4px solid #f59e0b",borderRadius:"var(--radius-lg)",padding:"14px 16px",marginBottom:16 }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
          <AlertCircle size={16} color="#f59e0b"/>
          <span style={{ fontWeight:700,fontSize:14,color:"var(--text-primary)" }}>
            来自采购订单的待付款
          </span>
          <span style={{ fontSize:12,color:"var(--text-secondary)",marginLeft:4 }}>
            {pendingLoading?"加载中…":`共 ${pending.length} 笔`}
          </span>
        </div>

        {!pendingLoading && pending.length === 0 && (
          <div style={{ display:"flex",alignItems:"center",gap:6,color:"#10b981",fontSize:13 }}>
            <CheckCircle size={14}/> 暂无待付款项，全部已处理
          </div>
        )}

        {!pendingLoading && pending.length > 0 && (
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            {pending.map(item=>{
              const isOverdue = item.pay_deadline && item.pay_deadline.slice(0,10) < today;
              return (
                <div key={item.id} style={{ background:"var(--bg-page)",border:`1px solid ${isOverdue?"#ef4444":"var(--border)"}`,borderRadius:"var(--radius-md)",padding:"10px 14px" }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8 }}>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
                        <span style={{ fontFamily:"monospace",fontSize:12,fontWeight:700,color:"var(--color-primary)" }}>{item.po_no}</span>
                        {item.contract_no&&<span style={{ fontSize:11,color:"var(--text-secondary)" }}>合同：{item.contract_no}</span>}
                        {isOverdue&&<span style={{ fontSize:11,color:"#ef4444",fontWeight:700 }}>⚠ 逾期</span>}
                      </div>
                      <div style={{ fontSize:13,fontWeight:600,color:"var(--text-primary)",marginTop:2 }}>{item.subject||"—"}</div>
                      <div style={{ fontSize:12,color:"var(--text-secondary)",marginTop:2 }}>
                        供应商：{item.supplier_name||item.supplier_code||"—"}
                        {item.pay_deadline&&<span style={{ marginLeft:12,color:isOverdue?"#ef4444":"var(--text-secondary)" }}>截止：{item.pay_deadline.slice(0,10)}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign:"right",flexShrink:0 }}>
                      <div style={{ fontSize:18,fontWeight:800,color:"var(--color-primary)" }}>
                        {item.currency_code||"LAK"} {Number(item.amount||0).toLocaleString()}
                      </div>
                      <button type="button" className={s.btnSuccess} style={{ marginTop:6,fontSize:12,padding:"5px 12px" }} onClick={()=>openPay(item)}>
                        确认付款
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 全部付款记录 ── */}
      <div style={{ display:"flex",gap:10,marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("ui.搜索关联单号摘要说明","搜索关联单号 / 摘要 / 说明…")}
          style={{ flex:1,...inp,padding:"9px 14px" }}/>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{ ...inp,width:160 }}>
          <option value="">{t("ui.全部类型","全部类型")}</option>
          {TYPE_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {[t("ui.类型","类型"),t("ui.关联单号","关联单号"),t("common.amount","金额"),
                t("ui.摘要","摘要"),t("ui.到期日","到期日"),t("common.status","状态"),t("common.operation","操作")].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={7} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("common.loading","加载中…")}</td></tr>}
            {!loading&&apList.length===0&&<tr><td colSpan={7} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("ui.暂无付款记录","暂无付款记录")}</td></tr>}
            {!loading&&apList.map((row,i)=>{
              const st = row.status?.toUpperCase()||"PENDING";
              const isOverdue = st==="OVERDUE";
              return (
                <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:isOverdue?"rgba(239,68,68,0.05)":i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                  <td style={{ padding:"9px 12px" }}><span className={`${s.badge} ${s.badgeNeutral}`}>{row.type||"AP"}</span></td>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,fontWeight:700 }}>
                    {row.ref_no||"—"}
                    {row.po_no&&<span style={{ fontSize:10,color:"var(--text-secondary)",display:"block" }}>PO:{row.po_no}</span>}
                  </td>
                  <td style={{ padding:"9px 12px",fontWeight:800,color:isOverdue?"#ef4444":"var(--color-primary)" }}>
                    ¥{Number(row.amount||0).toLocaleString()}
                  </td>
                  <td style={{ padding:"9px 12px",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{row.note||row.description||"—"}</td>
                  <td style={{ padding:"9px 12px",fontSize:11,color:isOverdue?"#ef4444":"var(--text-secondary)" }}>{row.due_date?.slice(0,10)||"—"}</td>
                  <td style={{ padding:"9px 12px" }}><span className={`${s.badge} ${s[STATUS_CLS[st]||'badgeNeutral']}`}>{STATUS_LABEL[st]||st}</span></td>
                  <td style={{ padding:"9px 12px",display:"flex",gap:6 }}>
                    <button type="button" className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>openEdit(row)}>{t("common.edit","编辑")}</button>
                    {["PENDING","OVERDUE"].includes(st)&&!row.po_no&&(
                      <button type="button" className={s.btnSuccess} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>markPaid(row)}>{t("ui.标记已付","标记已付")}</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 手动新增/编辑 Drawer ── */}
      <RightDrawer open={drawerOpen} title={editing?t("ui.编辑付款记录","编辑付款记录"):t("ui.新增付款记录","新增付款记录")} onClose={()=>{ setDrawerOpen(false); setEditing(null); }}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.科目代码","科目代码")}</label>
              <input value={form.account_code} onChange={e=>setF("account_code",e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.类型","类型")}</label>
              <select value={form.type} onChange={e=>setF("type",e.target.value)} style={inp}>
                {TYPE_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.关联单号","关联单号")} <span className={s.textDanger}>*</span></label>
            <input value={form.ref_no} onChange={e=>setF("ref_no",e.target.value)} placeholder={t("ui.关联采购订单号发票号","关联采购订单号 / 发票号")} style={inp}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("common.amount","金额")}（¥） <span className={s.textDanger}>*</span></label>
              <input type="number" value={form.amount} onChange={e=>setF("amount",e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.到期日","到期日")}</label>
              <input type="date" value={form.due_date} onChange={e=>setF("due_date",e.target.value)} style={inp}/>
            </div>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.付款方式","付款方式")}</label>
            <select value={form.payment_method} onChange={e=>setF("payment_method",e.target.value)} style={inp}>
              {PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.摘要","摘要")}</label>
            <input value={form.note} onChange={e=>setF("note",e.target.value)} placeholder={t("ui.付款摘要说明","付款摘要说明")} style={inp}/>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.详细说明","详细说明")}</label>
            <textarea value={form.description} onChange={e=>setF("description",e.target.value)} rows={3} style={{ ...inp,resize:"vertical" }}/>
          </div>
          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{ setDrawerOpen(false); setEditing(null); }}>{t("common.cancel","取消")}</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>{saving?t("ui.保存中","保存中…"):t("common.save","保存")}</button>
          </div>
        </div>
      </RightDrawer>

      {/* ── 付款确认弹层 ── */}
      {payTarget && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
          <div style={{ background:"var(--bg-card)",borderRadius:"var(--radius-lg)",padding:24,width:"100%",maxWidth:440,boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontWeight:700,fontSize:16,color:"var(--text-primary)",marginBottom:4 }}>确认付款</div>
            <div style={{ fontSize:13,color:"var(--text-secondary)",marginBottom:16 }}>
              {payTarget.subject} · {payTarget.supplier_name||payTarget.supplier_code}
            </div>
            <div style={{ fontSize:22,fontWeight:800,color:"var(--color-primary)",marginBottom:20 }}>
              {payTarget.currency_code||"LAK"} {Number(payTarget.amount||0).toLocaleString()}
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
              <div>
                <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>付款方式</label>
                <select value={payForm.method} onChange={e=>setPayForm(p=>({...p,method:e.target.value}))} style={inp}>
                  {PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>银行流水号 / 凭证号 <span style={{ color:"#ef4444" }}>*</span></label>
                <input value={payForm.payment_ref} onChange={e=>setPayForm(p=>({...p,payment_ref:e.target.value}))}
                  placeholder="填写银行转账流水号或支付凭证号" style={inp}/>
              </div>
              <div>
                <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>备注（可选）</label>
                <textarea value={payForm.payment_proof} onChange={e=>setPayForm(p=>({...p,payment_proof:e.target.value}))}
                  rows={2} placeholder="付款备注，如分批付款说明" style={{ ...inp,resize:"vertical" }}/>
              </div>
            </div>
            <div style={{ display:"flex",gap:10,marginTop:20 }}>
              <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>setPayTarget(null)}>取消</button>
              <button type="button" className={s.btnSuccess} style={{ flex:2 }} disabled={paying} onClick={confirmPay}>
                {paying?"提交中…":"✓ 确认已付款"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

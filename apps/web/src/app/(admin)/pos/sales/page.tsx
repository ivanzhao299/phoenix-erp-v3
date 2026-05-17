"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { crudApi } from "@/lib/api-client";
import s from "@/components/ui/admin-ui.module.css";

// B1: pos_sales 真实列 — sale_no / store_code / cashier / member_phone /
//     total_amount / discount_amount / net_amount / pay_method / status /
//     session_no / sale_type / ref_sale_no / note / created_at
//     旧版引用的 member_id / paid_amount / payment_method / cashier_id / currency_code / remark
//     全部不存在 → 写入静默丢失，KPI 永远 0

const STATUS_CLS: Record<string,string> = { COMPLETED:"badgeSuccess",REFUNDED:"badgeWarning",VOIDED:"badgeDanger" };

interface Sale {
  id:number; sale_no:string;
  member_phone?:string; total_amount?:number;
  discount_amount?:number; net_amount?:number; pay_method?:string;
  store_code?:string; cashier?:string;
  status:string; note?:string; created_at?:string;
  session_no?:string; sale_type?:string; ref_sale_no?:string;
}

export default function PosSalesPage() {
  const toast = useToast();
  const { t } = useLanguage();

  const PAY_METHOD: Record<string,string> = {
    CASH:  t("ui.现金", "现金"),
    CARD:  t("ui.刷卡", "刷卡"),
    QR:    t("ui.扫码", "扫码"),
    MIXED: t("ui.混合", "混合"),
  };
  const STATUS_LABEL: Record<string,string> = {
    COMPLETED: t("status.done", "已完成"),
    REFUNDED:  t("ui.已退款", "已退款"),
    VOIDED:    t("ui.已作废", "已作废"),
  };

  const [list, setList]       = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [statusF, setStatusF] = useState("");
  const [methodF, setMethodF] = useState("");
  const [dateFrom, setDateFrom] = useState(()=>new Date().toISOString().slice(0,10));
  const [detailRow, setDetailRow] = useState<Sale|null>(null);

  const token = typeof window!=="undefined"?(sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||""):"";
  const hdr = { Authorization:`Bearer ${token}`,"Content-Type":"application/json" };

  const load = useCallback(()=>{
    setLoading(true);
    crudApi.list<Sale>("pos_sales", { limit: 500 })
      .then(res=>setList(res.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{ load(); },[load]);

  const filtered = useMemo(()=>list.filter(r=>
    (!search||(r.sale_no||"").includes(search)||(r.store_code||"").includes(search)) &&
    (!statusF||r.status===statusF) &&
    (!methodF||r.pay_method===methodF) &&
    (!dateFrom||(r.created_at||"").slice(0,10)>=dateFrom)
  ),[list,search,statusF,methodF,dateFrom]);

  // B1: 用 net_amount (实收金额) — DB 真实列；旧 paid_amount 不存在 → KPI 永远 0
  const totalRevenue = filtered.reduce((s,r)=>s+(Number(r.net_amount||0)),0);
  const totalDiscount= filtered.reduce((s,r)=>s+(Number(r.discount_amount||0)),0);
  const completedCnt = filtered.filter(r=>r.status==="COMPLETED").length;
  const refundedAmt  = filtered.filter(r=>r.status==="REFUNDED").reduce((s,r)=>s+(Number(r.net_amount||0)),0);

  // A1 + A2: 退款/作废走真实 POS service — 反向扣 inv_batches + 写 inv_ledger SALE_REFUND/SALE_VOID
  //          旧版仅 PUT status 字段、不写台账、不反库存 → 销售作废后库存数字永远错
  const refund = async (row:Sale)=>{
    const reason = prompt(t("ui.请输入退款原因必填", `请输入退款原因（必填）`), "");
    if (!reason) return;
    const r = await fetch(`/api/v3/pos/sales/${encodeURIComponent(row.sale_no)}/refund`, {
      method: "POST", headers: hdr, body: JSON.stringify({ reason }),
    });
    const j = await r.json().catch(() => ({}));
    if (j?.code === 200) { toast.success(t("ui.已退款库存已反向加回", "已退款 — 库存已反向加回")); load(); }
    else toast.error(j?.msg || t("ui.退款失败", "退款失败"));
  };
  const voidSale = async (row:Sale)=>{
    const reason = prompt(t("ui.请输入作废原因必填", `请输入作废原因（必填）`), "");
    if (!reason) return;
    const r = await fetch(`/api/v3/pos/sales/${encodeURIComponent(row.sale_no)}/void`, {
      method: "POST", headers: hdr, body: JSON.stringify({ reason }),
    });
    const j = await r.json().catch(() => ({}));
    if (j?.code === 200) { toast.success(t("ui.已作废库存已反向加回", "已作废 — 库存已反向加回")); load(); }
    else toast.error(j?.msg || t("ui.作废失败", "作废失败"));
  };

  const inp = { padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" } as React.CSSProperties;

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("ui.POS销售记录", "POS 销售记录")} subtitle={t("ui.零售交易明细退款作废管理", "零售交易明细·退款·作废管理")} breadcrumb={[t("ui.POS零售", "POS 零售"), t("ui.销售记录", "销售记录")]}
        actions={<button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{ display:"flex",alignItems:"center",gap:6 }}><RefreshCw size={14}/> {t("common.refresh", "刷新")}</button>}/>

      {/* KPI */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:10,marginBottom:16 }}>
        {[
          { label: t("ui.当日收入", "当日收入"),   value:`¥${totalRevenue.toLocaleString()}`, accent:"#10b981" },
          { label: t("ui.完成笔数", "完成笔数"),   value:`${completedCnt} 笔`,               accent:"var(--color-primary)" },
          { label: t("ui.优惠折扣", "优惠折扣"),   value:`¥${totalDiscount.toLocaleString()}`,accent:"#f59e0b" },
          { label: t("ui.退款金额", "退款金额"),   value:`¥${refundedAmt.toLocaleString()}`,  accent:"#ef4444" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px" }}>
            <div style={{ fontSize:11,color:k.accent,fontWeight:700,marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:18,fontWeight:800,color:k.accent }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* 过滤栏 */}
      <div style={{ display:"flex",gap:10,marginBottom:14,flexWrap:"wrap" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("ui.搜索交易号门店", "搜索交易号 / 门店…")}
          style={{ flex:1,minWidth:160,...inp,padding:"9px 14px" }}/>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ ...inp,width:140 }}/>
        <select value={methodF} onChange={e=>setMethodF(e.target.value)} style={{ ...inp,width:120 }}>
          <option value="">{t("ui.全部方式", "全部方式")}</option>
          {Object.entries(PAY_METHOD).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={{ ...inp,width:120 }}>
          <option value="">{t("ui.全部状态", "全部状态")}</option>
          {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* 表格 */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {[
                t("ui.交易号", "交易号"),
                t("ui.会员", "会员"),
                t("ui.实付金额", "实付金额"),
                t("ui.折扣", "折扣"),
                t("ui.支付方式", "支付方式"),
                t("ui.收银员", "收银员"),
                t("ui.门店", "门店"),
                t("common.status", "状态"),
                t("ui.交易时间", "交易时间"),
                t("common.operation", "操作"),
              ].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={10} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("common.loading", "加载中…")}</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={10} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("ui.暂无销售记录", "暂无销售记录")}</td></tr>}
            {!loading&&filtered.map((row,i)=>{
              const st = row.status?.toUpperCase()||"COMPLETED";
              return (
                <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                  <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,fontWeight:700 }}>
                    <button type="button" onClick={()=>setDetailRow(row)} style={{ background:"none",border:"none",color:"var(--color-primary)",cursor:"pointer",fontFamily:"monospace",fontSize:11,padding:0 }}>{row.sale_no}</button>
                  </td>
                  <td style={{ padding:"9px 12px",fontSize:11,color:"var(--text-secondary)" }}>{row.member_phone||t("ui.散客", "散客")}</td>
                  <td style={{ padding:"9px 12px",fontWeight:700,color:"#10b981" }}>¥{Number(row.net_amount||0).toLocaleString()}</td>
                  <td style={{ padding:"9px 12px",fontSize:12,color:"#f59e0b" }}>
                    {Number(row.discount_amount||0)>0?`-¥${Number(row.discount_amount).toLocaleString()}`:"—"}
                  </td>
                  <td style={{ padding:"9px 12px" }}>{PAY_METHOD[row.pay_method||"CASH"]||row.pay_method}</td>
                  <td style={{ padding:"9px 12px",fontSize:11 }}>{row.cashier||"—"}</td>
                  <td style={{ padding:"9px 12px",fontSize:11 }}>{row.store_code||"—"}</td>
                  <td style={{ padding:"9px 12px" }}><span className={`${s.badge} ${s[STATUS_CLS[st]||'badgeNeutral']}`}>{STATUS_LABEL[st]||st}</span></td>
                  <td style={{ padding:"9px 12px",fontSize:11,color:"var(--text-secondary)" }}>{row.created_at?.slice(0,16)||"—"}</td>
                  <td style={{ padding:"9px 12px",display:"flex",gap:5,flexWrap:"wrap" }}>
                    {st==="COMPLETED"&&(
                      <>
                        <button className={s.btnWarning} style={{ padding:"4px 8px",fontSize:11,display:"flex",alignItems:"center",gap:3 }} onClick={()=>refund(row)}><RotateCcw size={10}/> {t("ui.退款", "退款")}</button>
                        <button className={s.btnDanger}  style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>voidSale(row)}>{t("ui.作废", "作废")}</button>
                      </>
                    )}
                    <button className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:11 }} onClick={()=>setDetailRow(row)}>{t("common.detail", "详情")}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 详情 Drawer */}
      <RightDrawer open={!!detailRow} title={`${t("ui.交易详情", "交易详情")} — ${detailRow?.sale_no||""}`} onClose={()=>setDetailRow(null)}>
        {detailRow&&(
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            {[
              [t("ui.交易号", "交易号"),   detailRow.sale_no, true],
              [t("ui.门店", "门店"),       detailRow.store_code],
              [t("ui.支付方式", "支付方式"), PAY_METHOD[detailRow.pay_method||"CASH"]||detailRow.pay_method],
              [t("ui.会员", "会员"),       detailRow.member_phone||t("ui.散客", "散客")],
              [t("ui.小计", "小计"),       `¥${Number(detailRow.total_amount||0).toLocaleString()}`],
              [t("ui.折扣", "折扣"),       `¥${Number(detailRow.discount_amount||0).toLocaleString()}`],
              [t("ui.实付", "实付"),       `¥${Number(detailRow.net_amount||0).toLocaleString()}`],
              [t("ui.收银员", "收银员"),   String(detailRow.cashier||"—")],
              [t("common.remark", "备注"), detailRow.note||"—"],
              [t("ui.交易时间", "交易时间"), detailRow.created_at?.slice(0,16)],
            ].map(([l,v,m])=>(
              <div key={String(l)} style={{ display:"flex",gap:10 }}>
                <span style={{ width:70,fontSize:12,color:"var(--text-secondary)",flexShrink:0 }}>{l}</span>
                <span style={{ fontSize:13,fontWeight:600,fontFamily:m?"monospace":"inherit" }}>{String(v||"—")}</span>
              </div>
            ))}
            <div style={{ display:"flex",gap:10 }}>
              <span style={{ width:70,fontSize:12,color:"var(--text-secondary)" }}>{t("common.status", "状态")}</span>
              <span className={`${s.badge} ${s[STATUS_CLS[(detailRow.status||"").toUpperCase()]||'badgeNeutral']}`}>{STATUS_LABEL[(detailRow.status||"").toUpperCase()]||detailRow.status}</span>
            </div>
            {detailRow.status==="COMPLETED"&&(
              <button type="button" className={s.btnWarning} style={{ marginTop:8,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }} onClick={()=>{ refund(detailRow); setDetailRow(null); }}>
                <RotateCcw size={13}/> {t("ui.申请退款", "申请退款")}
              </button>
            )}
          </div>
        )}
      </RightDrawer>
    </div>
  );
}

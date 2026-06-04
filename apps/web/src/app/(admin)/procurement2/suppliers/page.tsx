"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw, Globe, Building2, FolderKanban } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型定义 ─────────────────────────────────────────────────────────────────
interface Supplier {
  id: string;
  supplierCode: string;
  supplierName: string;
  supplierNameEn?: string;
  countryCode: string;
  supplierType?: string;
  defaultCurrency: string;
  sharedScope: string;
  ownerCompanyCode?: string;
  ownerCompanyName?: string;
  ownerProjectCode?: string;
  ownerProjectName?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNo?: string;
  taxNo?: string;
  address?: string;
  creditDays?: number;
  status: string;
  isActive: boolean;
  remark?: string;
}
interface PageResult { items: Supplier[]; total: number; page: number; pageSize: number; }

// ── 常量 ─────────────────────────────────────────────────────────────────────
const SCOPE_OPTS = [
  { value: "GROUP",   label: "集团共享",  icon: <Globe size={12}/>,         cls: "badgeInfo",    accent: "#3b82f6" },
  { value: "COMPANY", label: "公司专用",  icon: <Building2 size={12}/>,     cls: "badgeSuccess", accent: "#10b981" },
  { value: "PROJECT", label: "项目专用",  icon: <FolderKanban size={12}/>,  cls: "badgeWarning", accent: "#f59e0b" },
];
const CURRENCY_OPTS = ["LAK","CNY","THB","USD","VND"];
const COUNTRY_OPTS  = [{ value:"LA",label:"老挝 LA"},{ value:"CN",label:"中国 CN"},{ value:"TH",label:"泰国 TH"},{ value:"VN",label:"越南 VN"},{ value:"US",label:"美国 US"},{ value:"OTHER",label:"其他"}];
const STATUS_OPTS   = [{ value:"ACTIVE",label:"启用",cls:"badgeSuccess"},{ value:"INACTIVE",label:"停用",cls:"badgeDanger"},{ value:"BLACKLISTED",label:"黑名单",cls:"badgeDanger"}];
const TYPE_OPTS     = [{ value:"FEED",label:"饲料"},{ value:"EQUIPMENT",label:"设备"},{ value:"MEDICINE",label:"兽药"},{ value:"PACKAGING",label:"包装"},{ value:"OTHER",label:"其他"}];

function scopeInfo(sc: string) { return SCOPE_OPTS.find(o=>o.value===sc) ?? SCOPE_OPTS[0]; }
function statusCls(st: string) { return STATUS_OPTS.find(o=>o.value===st)?.cls ?? "badgeNeutral"; }

const API_BASE = "/api/v2/procurement/suppliers";
type FormState = {
  supplierCode: string; supplierName: string; supplierNameEn: string;
  countryCode: string; supplierType: string; defaultCurrency: string;
  sharedScope: string;
  ownerCompanyCode: string; ownerCompanyName: string;
  ownerProjectCode: string; ownerProjectName: string;
  contactName: string; contactPhone: string; contactEmail: string;
  bankName: string; bankAccountName: string; bankAccountNo: string;
  taxNo: string; address: string; creditDays: string; remark: string;
};
const DEF: FormState = {
  supplierCode:"", supplierName:"", supplierNameEn:"",
  countryCode:"LA", supplierType:"OTHER", defaultCurrency:"LAK",
  sharedScope:"GROUP",
  ownerCompanyCode:"", ownerCompanyName:"",
  ownerProjectCode:"", ownerProjectName:"",
  contactName:"", contactPhone:"", contactEmail:"",
  bankName:"", bankAccountName:"", bankAccountNo:"",
  taxNo:"", address:"", creditDays:"30", remark:"",
};

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const toast = useToast();
  const { t } = useLanguage();

  const [data, setData]       = useState<PageResult>({ items:[], total:0, page:1, pageSize:20 });
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm]       = useState<FormState>(DEF);
  const [saving, setSaving]   = useState(false);

  // 筛选
  const [fScope, setFScope]     = useState("");
  const [fCountry, setFCountry] = useState("");
  const [fStatus, setFStatus]   = useState("");
  const [fKeyword, setFKeyword] = useState("");

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
  const hdr = { Authorization:`Bearer ${token}`, "Content-Type":"application/json" };

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize:"20" });
      if (fScope)   params.set("sharedScope", fScope);
      if (fCountry) params.set("countryCode",  fCountry);
      if (fStatus)  params.set("status",        fStatus);
      if (fKeyword) params.set("keyword",        fKeyword);
      const res = await fetch(`${API_BASE}?${params}`, { headers: hdr });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }, [page, fScope, fCountry, fStatus, fKeyword, token]); // eslint-disable-line

  useEffect(() => { load(1); setPage(1); }, [fScope, fCountry, fStatus, fKeyword]); // eslint-disable-line
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  function openNew() {
    setEditing(null);
    setForm({ ...DEF, supplierCode: `SUP-${Date.now().toString().slice(-6)}` });
    setDrawerOpen(true);
  }
  function openEdit(row: Supplier) {
    setEditing(row);
    setForm({
      supplierCode:     row.supplierCode,
      supplierName:     row.supplierName,
      supplierNameEn:   row.supplierNameEn  ?? "",
      countryCode:      row.countryCode,
      supplierType:     row.supplierType    ?? "OTHER",
      defaultCurrency:  row.defaultCurrency,
      sharedScope:      row.sharedScope,
      ownerCompanyCode: row.ownerCompanyCode ?? "",
      ownerCompanyName: row.ownerCompanyName ?? "",
      ownerProjectCode: row.ownerProjectCode ?? "",
      ownerProjectName: row.ownerProjectName ?? "",
      contactName:      row.contactName  ?? "",
      contactPhone:     row.contactPhone ?? "",
      contactEmail:     row.contactEmail ?? "",
      bankName:         row.bankName         ?? "",
      bankAccountName:  row.bankAccountName  ?? "",
      bankAccountNo:    row.bankAccountNo    ?? "",
      taxNo:            row.taxNo    ?? "",
      address:          row.address  ?? "",
      creditDays:       String(row.creditDays ?? 30),
      remark:           row.remark   ?? "",
    });
    setDrawerOpen(true);
  }

  const save = async () => {
    if (!form.supplierCode.trim())    { toast.error("供应商编码为必填项"); return; }
    if (!form.supplierName.trim())    { toast.error("供应商名称为必填项"); return; }
    if (!form.countryCode.trim())     { toast.error("国家为必填项"); return; }
    if (!form.defaultCurrency.trim()) { toast.error("默认货币为必填项"); return; }
    if (form.sharedScope === "COMPANY" && (!form.ownerCompanyCode.trim() || !form.ownerCompanyName.trim())) {
      toast.error("公司专用供应商必须填写归属公司代码和名称"); return;
    }
    if (form.sharedScope === "PROJECT" && (!form.ownerProjectCode.trim() || !form.ownerProjectName.trim())) {
      toast.error("项目专用供应商必须填写归属项目代码和名称"); return;
    }
    setSaving(true);
    try {
      const body = {
        supplierCode:     form.supplierCode.trim(),
        supplierName:     form.supplierName.trim(),
        supplierNameEn:   form.supplierNameEn || undefined,
        countryCode:      form.countryCode,
        supplierType:     form.supplierType || undefined,
        defaultCurrency:  form.defaultCurrency,
        sharedScope:      form.sharedScope,
        ownerCompanyCode: form.ownerCompanyCode || undefined,
        ownerCompanyName: form.ownerCompanyName || undefined,
        ownerProjectCode: form.ownerProjectCode || undefined,
        ownerProjectName: form.ownerProjectName || undefined,
        contactName:      form.contactName  || undefined,
        contactPhone:     form.contactPhone || undefined,
        contactEmail:     form.contactEmail || undefined,
        bankName:         form.bankName         || undefined,
        bankAccountName:  form.bankAccountName  || undefined,
        bankAccountNo:    form.bankAccountNo    || undefined,
        taxNo:            form.taxNo    || undefined,
        address:          form.address  || undefined,
        creditDays:       Number(form.creditDays) || 30,
        remark:           form.remark   || undefined,
      };
      if (editing) {
        const res = await fetch(`${API_BASE}/${editing.id}`, { method:"PATCH", headers:hdr, body:JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); toast.error(d.message ?? "更新失败"); return; }
        toast.success("供应商已更新");
      } else {
        const res = await fetch(API_BASE, { method:"POST", headers:hdr, body:JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); toast.error(d.message ?? "创建失败"); return; }
        toast.success("供应商已创建");
      }
      setDrawerOpen(false);
      load(page);
    } finally { setSaving(false); }
  };

  const toggleStatus = async (row: Supplier) => {
    const next = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const res = await fetch(`${API_BASE}/${row.id}/status`, {
      method:"PATCH", headers:hdr, body:JSON.stringify({ status: next }),
    });
    if (res.ok) { toast.success(`状态已更新`); load(page); }
    else { const d = await res.json(); toast.error(d.message ?? "操作失败"); }
  };

  const setF = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));
  const pageCount = Math.ceil(data.total / data.pageSize);
  const needOwnerCompany = form.sharedScope === "COMPANY" || form.sharedScope === "PROJECT";
  const needOwnerProject = form.sharedScope === "PROJECT";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="供应商管理"
        subtitle={`多公司共享 · 公司/项目专用三级范围 · 共 ${data.total} 家`}
        breadcrumb={["采购管理", "供应商管理"]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={()=>load(page)} disabled={loading}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> 刷新
            </button>
            {/* G4-B：禁止采购页直接建供应商；导向 G3 主数据中心 */}
            <a href="/master-data/suppliers" className={s.btnPrimary}
              style={{ display:"flex",alignItems:"center",gap:6,textDecoration:"none" }}>
              <Plus size={14}/> 前往主数据中心新增
            </a>
          </div>
        }
      />

      {/* G4-B：采购视图说明 */}
      <div style={{
        background:"var(--bg-info,#eff6ff)", border:"1px solid var(--color-info,#3b82f6)",
        borderRadius:"var(--radius-md)", padding:"10px 14px", marginBottom:12, fontSize:12.5,
        color:"var(--color-info,#1d4ed8)",
      }}>
        <strong>采购视图（只读）：</strong>供应商主数据已下沉至 <a href="/master-data/suppliers" style={{ color:"inherit",fontWeight:600,textDecoration:"underline" }}>主数据中心</a>，
        请在主数据中心完成新增/审批/资质上传。本页保留浏览、筛选、停用/启用、采购侧扩展信息编辑能力。
      </div>

      {/* KPI 统计条 */}
      <div style={{ display:"flex",gap:12,marginBottom:16,flexWrap:"wrap" }}>
        {[
          { label:"供应商总数", value:data.total, accent:"var(--color-primary)" },
          ...SCOPE_OPTS.map(o=>({ label:o.label, value:data.items.filter(i=>i.sharedScope===o.value).length, accent:o.accent })),
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px",display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontSize:20,fontWeight:800,color:k.accent }}>{k.value}</span>
            <span style={{ fontSize:12,color:"var(--text-secondary)" }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div style={{ display:"flex",gap:8,marginBottom:14,flexWrap:"wrap" }}>
        <input value={fKeyword} onChange={e=>setFKeyword(e.target.value)} placeholder="搜索供应商名称 / 编码…"
          style={{ flex:"1 1 200px",padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}/>
        <select value={fScope} onChange={e=>setFScope(e.target.value)}
          style={{ padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
          <option value="">全部范围</option>
          {SCOPE_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fCountry} onChange={e=>setFCountry(e.target.value)}
          style={{ padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
          <option value="">全部国家</option>
          {COUNTRY_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fStatus} onChange={e=>setFStatus(e.target.value)}
          style={{ padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
          <option value="">全部状态</option>
          {STATUS_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* 数据表 */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table className={s.table}>
          <thead>
            <tr>
              {["供应商编码","供应商名称","共享范围","归属","国家","默认货币","状态","操作"].map(h=>(
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && data.items.length === 0 && <tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>暂无供应商记录</td></tr>}
            {!loading && data.items.map((row, i) => {
              const si = scopeInfo(row.sharedScope);
              return (
                <tr key={row.id}>
                  <td style={{ fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)" }}>{row.supplierCode}</td>
                  <td>
                    <button type="button" onClick={()=>openEdit(row)}
                      style={{ background:"none",border:"none",color:"var(--color-primary)",cursor:"pointer",fontWeight:600,fontSize:13,padding:0 }}>
                      {row.supplierName}
                    </button>
                    {row.supplierNameEn && <div style={{ fontSize:10,color:"var(--text-secondary)" }}>{row.supplierNameEn}</div>}
                  </td>
                  <td>
                    <span className={`${s.badge} ${s[si.cls]}`} style={{ display:"inline-flex",alignItems:"center",gap:4 }}>
                      {si.icon}{si.label}
                    </span>
                  </td>
                  <td style={{ fontSize:11,color:"var(--text-secondary)" }}>
                    {row.sharedScope === "GROUP" ? "全集团" : row.sharedScope === "COMPANY" ? (row.ownerCompanyCode ?? "—") : (row.ownerProjectCode ?? "—")}
                  </td>
                  <td style={{ fontSize:12 }}>{row.countryCode}</td>
                  <td style={{ fontSize:12,fontWeight:600 }}>{row.defaultCurrency}</td>
                  <td>
                    <span className={`${s.badge} ${s[statusCls(row.status)]}`}>
                      {STATUS_OPTS.find(o=>o.value===row.status)?.label ?? row.status}
                    </span>
                  </td>
                  <td style={{ display:"flex",gap:6 }}>
                    <button type="button" className={s.btnSecondary} style={{ padding:"3px 8px",fontSize:11 }} onClick={()=>openEdit(row)}>编辑</button>
                    <button type="button"
                      className={row.status === "ACTIVE" ? s.btnDanger : s.btnSecondary}
                      style={{ padding:"3px 8px",fontSize:11 }}
                      onClick={()=>toggleStatus(row)}>
                      {row.status === "ACTIVE" ? "停用" : "启用"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {pageCount > 1 && (
        <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginTop:14 }}>
          <button type="button" className={s.btnSecondary} style={{ padding:"4px 12px",fontSize:12 }}
            disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>上一页</button>
          <span style={{ fontSize:13,color:"var(--text-secondary)" }}>第 {page} / {pageCount} 页 · 共 {data.total} 条</span>
          <button type="button" className={s.btnSecondary} style={{ padding:"4px 12px",fontSize:12 }}
            disabled={page>=pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>下一页</button>
        </div>
      )}

      {/* 新建/编辑 Drawer */}
      <RightDrawer open={drawerOpen} title={editing ? "编辑供应商" : "新增供应商"} onClose={()=>{setDrawerOpen(false);setEditing(null);}}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>

          <div style={{ fontWeight:700,fontSize:13,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)",paddingBottom:6 }}>基本信息</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>供应商编码 <span className={s.textDanger}>*</span></label>
              <input value={form.supplierCode} onChange={e=>setF("supplierCode",e.target.value)}
                disabled={!!editing}
                style={{ width:"100%",padding:"7px 10px",background:editing?"var(--bg-page)":"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>共享范围 <span className={s.textDanger}>*</span></label>
              <select value={form.sharedScope} onChange={e=>setF("sharedScope",e.target.value)}
                disabled={!!editing}
                style={{ width:"100%",padding:"7px 10px",background:editing?"var(--bg-page)":"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
                {SCOPE_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>供应商名称（中文/本地语） <span className={s.textDanger}>*</span></label>
            <input value={form.supplierName} onChange={e=>setF("supplierName",e.target.value)}
              style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
          </div>
          <div>
            <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>供应商名称（英文，跨境必填）</label>
            <input value={form.supplierNameEn} onChange={e=>setF("supplierNameEn",e.target.value)}
              style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>国家 <span className={s.textDanger}>*</span></label>
              <select value={form.countryCode} onChange={e=>setF("countryCode",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
                {COUNTRY_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>供应商类型</label>
              <select value={form.supplierType} onChange={e=>setF("supplierType",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
                {TYPE_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>默认货币 <span className={s.textDanger}>*</span></label>
              <select value={form.defaultCurrency} onChange={e=>setF("defaultCurrency",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
                {CURRENCY_OPTS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* 共享范围相关字段 */}
          {needOwnerCompany && (
            <>
              <div style={{ fontWeight:700,fontSize:13,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)",paddingBottom:6,marginTop:4 }}>归属公司 <span className={s.textDanger}>*</span></div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                <div>
                  <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>公司代码</label>
                  <input value={form.ownerCompanyCode} onChange={e=>setF("ownerCompanyCode",e.target.value)}
                    placeholder="如 PHX_AGRI"
                    style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
                </div>
                <div>
                  <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>公司名称</label>
                  <input value={form.ownerCompanyName} onChange={e=>setF("ownerCompanyName",e.target.value)}
                    placeholder="如 老挝凤凰农业发展有限公司"
                    style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
                </div>
              </div>
            </>
          )}
          {needOwnerProject && (
            <>
              <div style={{ fontWeight:700,fontSize:13,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)",paddingBottom:6,marginTop:4 }}>归属项目 <span className={s.textDanger}>*</span></div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                <div>
                  <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>项目编号</label>
                  <input value={form.ownerProjectCode} onChange={e=>setF("ownerProjectCode",e.target.value)}
                    placeholder="如 VTE_FOOD_FACTORY"
                    style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
                </div>
                <div>
                  <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>项目名称</label>
                  <input value={form.ownerProjectName} onChange={e=>setF("ownerProjectName",e.target.value)}
                    placeholder="如 万象食品厂建设项目"
                    style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
                </div>
              </div>
            </>
          )}

          {/* 联系信息 */}
          <div style={{ fontWeight:700,fontSize:13,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)",paddingBottom:6,marginTop:4 }}>联系信息</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>联系人</label>
              <input value={form.contactName} onChange={e=>setF("contactName",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>联系电话</label>
              <input value={form.contactPhone} onChange={e=>setF("contactPhone",e.target.value)} type="tel"
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
          </div>

          {/* 财务信息 */}
          <div style={{ fontWeight:700,fontSize:13,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)",paddingBottom:6,marginTop:4 }}>财务信息</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>账期（天）</label>
              <input type="number" value={form.creditDays} onChange={e=>setF("creditDays",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>税务号（TIN）</label>
              <input value={form.taxNo} onChange={e=>setF("taxNo",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>开户银行</label>
              <input value={form.bankName} onChange={e=>setF("bankName",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>银行账号</label>
              <input value={form.bankAccountNo} onChange={e=>setF("bankAccountNo",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
          </div>

          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{setDrawerOpen(false);setEditing(null);}}>取消</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>
              {saving ? "保存中…" : editing ? "保存更改" : "创建供应商"}
            </button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}

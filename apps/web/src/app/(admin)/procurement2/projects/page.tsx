"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw, Building2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型定义 ─────────────────────────────────────────────────────────────────
interface Project {
  id: string;
  companyId?: string;
  companyCode: string;
  companyName: string;
  projectCode: string;
  projectName: string;
  projectType?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  remark?: string;
  createdAt?: string;
}
interface PageResult { items: Project[]; total: number; page: number; pageSize: number; }

// ── 常量 ─────────────────────────────────────────────────────────────────────
const PROJECT_TYPES = [
  { value: "PRODUCTION",   label: "日常生产采购" },
  { value: "CONSTRUCTION", label: "基建工程" },
  { value: "EQUIPMENT",    label: "设备采购" },
  { value: "OPERATIONS",   label: "运营采购" },
  { value: "INIT",         label: "历史初始化" },
  { value: "OTHER",        label: "其他" },
];
const STATUS_OPTS = [
  { value: "ACTIVE",   label: "进行中", cls: "badgeSuccess" },
  { value: "INACTIVE", label: "已暂停", cls: "badgeWarning" },
  { value: "CLOSED",   label: "已关闭", cls: "badgeNeutral" },
];

function statusCls(st: string) { return STATUS_OPTS.find(o => o.value === st)?.cls ?? "badgeNeutral"; }
function statusLabel(st: string) { return STATUS_OPTS.find(o => o.value === st)?.label ?? st; }
function typeLabel(t?: string) { return PROJECT_TYPES.find(o => o.value === t)?.label ?? t ?? "—"; }

const API_BASE = "/api/v2/procurement/projects";
const DEF_FORM = { companyId: "", companyCode: "", companyName: "", projectCode: "", projectName: "", projectType: "PRODUCTION", startDate: "", endDate: "", remark: "" };
type FormState = typeof DEF_FORM;

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const toast = useToast();
  const { t } = useLanguage();

  const [data, setData]         = useState<PageResult>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]   = useState<Project | null>(null);
  const [form, setForm]         = useState<FormState>(DEF_FORM);
  const [saving, setSaving]     = useState(false);

  // 筛选条件
  const [filterCompany, setFilterCompany]   = useState("");
  const [filterStatus, setFilterStatus]     = useState("");
  const [filterType, setFilterType]         = useState("");
  const [filterKeyword, setFilterKeyword]   = useState("");

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (filterCompany) params.set("companyCode", filterCompany);
      if (filterStatus)  params.set("status",      filterStatus);
      if (filterType)    params.set("projectType",  filterType);
      if (filterKeyword) params.set("keyword",      filterKeyword);
      const res = await fetch(`${API_BASE}?${params}`, { headers: hdr });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }, [page, filterCompany, filterStatus, filterType, filterKeyword, token]); // eslint-disable-line

  useEffect(() => { load(1); setPage(1); }, [filterCompany, filterStatus, filterType, filterKeyword]); // eslint-disable-line
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  // ── 打开新建/编辑 ─────────────────────────────────────────────────────────
  function openNew() {
    setEditing(null);
    setForm(DEF_FORM);
    setDrawerOpen(true);
  }
  function openEdit(row: Project) {
    setEditing(row);
    setForm({
      companyId:   row.companyId ?? "",
      companyCode: row.companyCode,
      companyName: row.companyName,
      projectCode: row.projectCode,
      projectName: row.projectName,
      projectType: row.projectType ?? "PRODUCTION",
      startDate:   row.startDate ?? "",
      endDate:     row.endDate   ?? "",
      remark:      row.remark    ?? "",
    });
    setDrawerOpen(true);
  }

  // ── 保存 ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.companyCode.trim()) { toast.error("公司代码为必填项"); return; }
    if (!form.companyName.trim()) { toast.error("公司名称为必填项"); return; }
    if (!form.projectCode.trim()) { toast.error("项目编号为必填项"); return; }
    if (!form.projectName.trim()) { toast.error("项目名称为必填项"); return; }
    setSaving(true);
    try {
      const body = {
        companyCode: form.companyCode.trim(),
        companyName: form.companyName.trim(),
        projectCode: form.projectCode.trim(),
        projectName: form.projectName.trim(),
        projectType: form.projectType || undefined,
        startDate:   form.startDate || undefined,
        endDate:     form.endDate   || undefined,
        remark:      form.remark    || undefined,
      };
      if (editing) {
        const res = await fetch(`${API_BASE}/${editing.id}`, { method: "PATCH", headers: hdr, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); toast.error(d.message ?? "更新失败"); return; }
        toast.success("项目已更新");
      } else {
        const res = await fetch(API_BASE, { method: "POST", headers: hdr, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); toast.error(d.message ?? "创建失败"); return; }
        toast.success("项目已创建");
      }
      setDrawerOpen(false);
      load(page);
    } finally { setSaving(false); }
  };

  // ── 状态切换 ──────────────────────────────────────────────────────────────
  const toggleStatus = async (row: Project) => {
    const next = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const res = await fetch(`${API_BASE}/${row.id}/status`, {
      method: "PATCH", headers: hdr, body: JSON.stringify({ status: next }),
    });
    if (res.ok) { toast.success(`状态已更新为 ${statusLabel(next)}`); load(page); }
    else { const d = await res.json(); toast.error(d.message ?? "操作失败"); }
  };

  const setF = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));
  const pageCount = Math.ceil(data.total / data.pageSize);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="采购项目管理"
        subtitle={`多公司、多项目成本归集 · 共 ${data.total} 个项目`}
        breadcrumb={["采购 V2", "项目管理"]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={() => load(page)} disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }}/> 刷新
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14}/> 新建项目
            </button>
          </div>
        }
      />

      {/* KPI 统计条 */}
      {[
        { label: "项目总数",  value: data.total, accent: "var(--color-primary)" },
        { label: "进行中",    value: data.items.filter(i => i.status === "ACTIVE").length,   accent: "#10b981" },
        { label: "已暂停",    value: data.items.filter(i => i.status === "INACTIVE").length, accent: "#f59e0b" },
        { label: "已关闭",    value: data.items.filter(i => i.status === "CLOSED").length,   accent: "#6b7280" },
      ].reduce<React.ReactNode[]>((acc, k) => [
        ...acc,
        <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px",display:"flex",alignItems:"center",gap:10 }}>
          <span style={{ fontSize:20,fontWeight:800,color:k.accent }}>{k.value}</span>
          <span style={{ fontSize:12,color:"var(--text-secondary)" }}>{k.label}</span>
        </div>
      ], []).reduce<React.ReactNode>((prev, curr) => (
        <>{prev}{curr}</>
      ), <div style={{ display:"flex",gap:12,marginBottom:16,flexWrap:"wrap" }}></div>)}

      <div style={{ display:"flex",gap:12,marginBottom:16,flexWrap:"wrap" }}>
        {[
          { label:"项目总数", value:data.total, accent:"var(--color-primary)" },
          { label:"进行中",   value:data.items.filter(i=>i.status==="ACTIVE").length,   accent:"#10b981" },
          { label:"已暂停",   value:data.items.filter(i=>i.status==="INACTIVE").length, accent:"#f59e0b" },
          { label:"已关闭",   value:data.items.filter(i=>i.status==="CLOSED").length,   accent:"#6b7280" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 16px",display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontSize:20,fontWeight:800,color:k.accent }}>{k.value}</span>
            <span style={{ fontSize:12,color:"var(--text-secondary)" }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div style={{ display:"flex",gap:8,marginBottom:14,flexWrap:"wrap" }}>
        <input value={filterKeyword} onChange={e=>setFilterKeyword(e.target.value)} placeholder="搜索项目名称 / 编号 / 公司…"
          style={{ flex:"1 1 200px",padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}/>
        <input value={filterCompany} onChange={e=>setFilterCompany(e.target.value)} placeholder="公司代码过滤…"
          style={{ width:160,padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}/>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)}
          style={{ padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
          <option value="">全部类型</option>
          {PROJECT_TYPES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          style={{ padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
          <option value="">全部状态</option>
          {STATUS_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* 数据表 */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {["公司","项目编号","项目名称","类型","周期","状态","操作"].map(h=>(
                <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && data.items.length === 0 && <tr><td colSpan={7} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>暂无项目记录</td></tr>}
            {!loading && data.items.map((row, i) => (
              <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                <td style={{ padding:"8px 12px" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <Building2 size={13} style={{ color:"var(--text-secondary)" }}/>
                    <div>
                      <div style={{ fontWeight:600,fontSize:12 }}>{row.companyName}</div>
                      <div style={{ fontSize:10,color:"var(--text-secondary)",fontFamily:"monospace" }}>{row.companyCode}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding:"8px 12px",fontFamily:"monospace",fontSize:11,color:"var(--text-secondary)" }}>{row.projectCode}</td>
                <td style={{ padding:"8px 12px" }}>
                  <button type="button" onClick={()=>openEdit(row)}
                    style={{ background:"none",border:"none",color:"var(--color-primary)",cursor:"pointer",fontWeight:600,fontSize:13,padding:0 }}>
                    {row.projectName}
                  </button>
                </td>
                <td style={{ padding:"8px 12px",fontSize:12 }}>{typeLabel(row.projectType)}</td>
                <td style={{ padding:"8px 12px",fontSize:11,color:"var(--text-secondary)" }}>
                  {row.startDate ? `${row.startDate} ~ ${row.endDate ?? "—"}` : "—"}
                </td>
                <td style={{ padding:"8px 12px" }}>
                  <span className={`${s.badge} ${s[statusCls(row.status)]}`}>{statusLabel(row.status)}</span>
                </td>
                <td style={{ padding:"8px 12px",display:"flex",gap:6 }}>
                  <button type="button" className={s.btnSecondary} style={{ padding:"3px 8px",fontSize:11 }} onClick={()=>openEdit(row)}>编辑</button>
                  <button type="button"
                    className={row.status === "ACTIVE" ? s.btnDanger : s.btnSecondary}
                    style={{ padding:"3px 8px",fontSize:11 }}
                    onClick={()=>toggleStatus(row)}>
                    {row.status === "ACTIVE" ? "暂停" : "启用"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {pageCount > 1 && (
        <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginTop:14 }}>
          <button type="button" className={s.btnSecondary} style={{ padding:"4px 12px",fontSize:12 }}
            disabled={page <= 1} onClick={()=>setPage(p=>Math.max(1,p-1))}>上一页</button>
          <span style={{ fontSize:13,color:"var(--text-secondary)" }}>第 {page} / {pageCount} 页 · 共 {data.total} 条</span>
          <button type="button" className={s.btnSecondary} style={{ padding:"4px 12px",fontSize:12 }}
            disabled={page >= pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>下一页</button>
        </div>
      )}

      {/* 新建/编辑 Drawer */}
      <RightDrawer open={drawerOpen} title={editing ? "编辑项目" : "新建项目"} onClose={()=>{setDrawerOpen(false);setEditing(null);}}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>

          <div style={{ fontWeight:700,fontSize:13,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)",paddingBottom:6 }}>归属公司</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>公司代码 <span className={s.textDanger}>*</span></label>
              <input value={form.companyCode} onChange={e=>setF("companyCode",e.target.value)}
                disabled={!!editing}
                placeholder="如 PHX_AGRI"
                style={{ width:"100%",padding:"7px 10px",background:editing?"var(--bg-page)":"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>公司名称 <span className={s.textDanger}>*</span></label>
              <input value={form.companyName} onChange={e=>setF("companyName",e.target.value)}
                disabled={!!editing}
                placeholder="如 老挝凤凰农业发展有限公司"
                style={{ width:"100%",padding:"7px 10px",background:editing?"var(--bg-page)":"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
          </div>

          <div style={{ fontWeight:700,fontSize:13,color:"var(--text-secondary)",borderBottom:"1px solid var(--border)",paddingBottom:6,marginTop:4 }}>项目信息</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>项目编号 <span className={s.textDanger}>*</span></label>
              <input value={form.projectCode} onChange={e=>setF("projectCode",e.target.value)}
                disabled={!!editing}
                placeholder="如 DAILY_FEED"
                style={{ width:"100%",padding:"7px 10px",background:editing?"var(--bg-page)":"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>项目类型</label>
              <select value={form.projectType} onChange={e=>setF("projectType",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none" }}>
                {PROJECT_TYPES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>项目名称 <span className={s.textDanger}>*</span></label>
            <input value={form.projectName} onChange={e=>setF("projectName",e.target.value)}
              placeholder="如 日常饲料采购"
              style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>开始日期</label>
              <input type="date" value={form.startDate} onChange={e=>setF("startDate",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>结束日期</label>
              <input type="date" value={form.endDate} onChange={e=>setF("endDate",e.target.value)}
                style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" }}/>
            </div>
          </div>
          <div>
            <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>备注</label>
            <textarea value={form.remark} onChange={e=>setF("remark",e.target.value)} rows={2}
              style={{ width:"100%",padding:"7px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",resize:"vertical",boxSizing:"border-box" }}/>
          </div>

          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{setDrawerOpen(false);setEditing(null);}}>取消</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>
              {saving ? "保存中…" : editing ? "保存更改" : "创建项目"}
            </button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}

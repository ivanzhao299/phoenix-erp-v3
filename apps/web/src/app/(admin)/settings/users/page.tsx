"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import RightDrawer from "@/components/RightDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Users, Shield, Plus, Lock, Unlock, Key, Edit2, UserCheck, FlaskConical, RefreshCw, Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "");
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const API = async (path: string, opts: RequestInit = {}) => {
  const r = await fetch("/api/users" + path, { ...opts, headers: { ...hdr(), ...(opts.headers as any || {}) } });
  return r.json();
};

function UserTypeBadge({ type }: { type: string }) {
  return type === "TEST" ? (
    <span className={`${s.badge} ${s.badgePurple}`}><FlaskConical size={9} /> TEST</span>
  ) : (
    <span className={`${s.badge} ${s.badgeSuccess}`}><UserCheck size={9} /> 正式</span>
  );
}

interface User { id:number; username:string; real_name_zh:string; role?:string; role_name_zh?:string; org_id?:number; org_name?:string; store_code?:string; status:string; user_type:string; }
interface Role { role_code:string; role_name_zh:string; }
interface Org  { id:number; org_name:string; org_type:string; }

type SortKey = "username" | "real_name_zh" | "role_name_zh" | "org_name" | "status";
type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function UserManagementPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [users,      setUsers]      = useState<User[]>([]);
  const [roles,      setRoles]      = useState<Role[]>([]);
  const [orgs,       setOrgs]       = useState<Org[]>([]);
  const [loading,    setLoading]    = useState(true);

  // ── 筛选 & 搜索 ──────────────────────────────────────────────────────────────
  const [typeFilter,   setTypeFilter]   = useState("REAL");   // ALL / REAL / TEST
  const [statusFilter, setStatusFilter] = useState("ALL");    // ALL / ACTIVE / FROZEN
  const [roleFilter,   setRoleFilter]   = useState("");       // "" = 全部
  const [orgFilter,    setOrgFilter]    = useState("");       // "" = 全部，值为 org_id string
  const [search,       setSearch]       = useState("");

  // ── 排序 ─────────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("real_name_zh");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── 分页 ─────────────────────────────────────────────────────────────────────
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ── 抽屉 & 表单 ──────────────────────────────────────────────────────────────
  const [showDrawer, setShowDrawer] = useState(false);
  const [editId,     setEditId]     = useState<number|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm,    setConfirm]    = useState<{open:boolean; user?:User; nextStatus?:string}>({ open:false });
  const [form, setForm] = useState({
    username:"", real_name_zh:"", org_id:"", store_code:"",
    password:"", newPassword:"", role:"", user_type:"REAL",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, oRes] = await Promise.all([
        fetch("/api/users", { headers: hdr() }).then(r => r.json()),
        fetch("/api/crud/sys_orgs", { headers: hdr() }).then(r => r.json()),
      ]);
      setUsers(uRes.data || []);
      setRoles(uRes.roles || []);
      setOrgs(oRes.data || oRes || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 筛选、搜索、排序 pipeline
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users;
    if (typeFilter !== "ALL")   list = list.filter(u => (u.user_type||"REAL") === typeFilter);
    if (statusFilter !== "ALL") list = list.filter(u => u.status === statusFilter);
    if (roleFilter)             list = list.filter(u => u.role === roleFilter);
    if (orgFilter)              list = list.filter(u => String(u.org_id) === orgFilter);
    if (q) list = list.filter(u =>
      (u.username||"").toLowerCase().includes(q) ||
      (u.real_name_zh||"").toLowerCase().includes(q) ||
      (u.org_name||"").toLowerCase().includes(q) ||
      (u.role_name_zh||"").toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => {
      const va = String(a[sortKey] || "").toLowerCase();
      const vb = String(b[sortKey] || "").toLowerCase();
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [users, typeFilter, statusFilter, roleFilter, orgFilter, search, sortKey, sortDir]);

  // 分页
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  // 筛选条件变化时重置到第1页
  useEffect(() => { setPage(1); }, [typeFilter, statusFilter, roleFilter, orgFilter, search, sortKey, sortDir, pageSize]);

  const counts = {
    ALL:  users.length,
    REAL: users.filter(u => (u.user_type||"REAL") === "REAL").length,
    TEST: users.filter(u => u.user_type === "TEST").length,
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown size={12} style={{ opacity:0.3, marginLeft:3 }}/>;
    return sortDir === "asc"
      ? <ChevronUp   size={12} style={{ color:"var(--color-primary)", marginLeft:3 }}/>
      : <ChevronDown size={12} style={{ color:"var(--color-primary)", marginLeft:3 }}/>;
  };

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleAddNew = () => {
    setEditId(null);
    setForm({ username:"", real_name_zh:"", org_id:"", store_code:"", password:"", newPassword:"", role: roles[0]?.role_code||"", user_type:"REAL" });
    setShowDrawer(true);
  };

  const handleEdit = (u: User) => {
    if (u.username === "admin") { toast.error(t("ui.系统特权总控帐号已锁定拒绝面板编辑","系统特权总控帐号已锁定，拒绝面板编辑")); return; }
    setEditId(u.id);
    setForm({ username:u.username, real_name_zh:u.real_name_zh||"", org_id:String(u.org_id||""), store_code:u.store_code||"", password:"", newPassword:"", role:u.role||"", user_type:u.user_type||"REAL" });
    setShowDrawer(true);
  };

  const handleSubmit = async () => {
    if (!form.real_name_zh)                                   { toast.error(t("ui.姓名为必填项","姓名为必填项")); return; }
    if (!editId && !form.username)                            { toast.error(t("ui.账户名为必填项","账户名为必填项")); return; }
    if (!editId && (!form.password || form.password.length < 8)) { toast.error(t("ui.新建用户密码至少8位","新建用户密码至少 8 位")); return; }
    setSubmitting(true);
    try {
      let res: any;
      if (editId) {
        res = await API(`/${editId}`, { method:"PUT", body: JSON.stringify({ real_name_zh:form.real_name_zh, org_id:form.org_id||null, store_code:form.store_code }) });
        if (res.code === 200 && form.role)        await API(`/${editId}/role`, { method:"PUT", body: JSON.stringify({ role:form.role }) });
        if (res.code === 200 && form.newPassword && form.newPassword.length >= 8) {
          const pw = await API(`/${editId}/password`, { method:"PUT", body: JSON.stringify({ password:form.newPassword }) });
          if (pw.code !== 200) toast.error(pw.msg || t("ui.密码重置失败","密码重置失败"));
        }
      } else {
        res = await API("", { method:"POST", body: JSON.stringify({ username:form.username, real_name_zh:form.real_name_zh, role:form.role, org_id:form.org_id||null, store_code:form.store_code, password:form.password, user_type:form.user_type }) });
      }
      if (res.code === 200) { setShowDrawer(false); loadData(); toast.success(editId ? t("ui.修改成功","修改成功") : t("ui.用户创建成功","用户创建成功")); }
      else toast.error(res.msg || t("ui.操作失败","操作失败"));
    } finally { setSubmitting(false); }
  };

  const doToggleStatus = async () => {
    const { user, nextStatus } = confirm;
    if (!user) return;
    setConfirm({ open:false });
    const res = await API(`/${user.id}/status`, { method:"PUT", body: JSON.stringify({ status: nextStatus }) });
    if (res.code === 200) { loadData(); toast.success(nextStatus==="FROZEN" ? t("ui.已冻结","已冻结") : t("ui.已解冻","已解冻")); }
    else toast.error(res.msg);
  };

  const handleToggle = (u: User) => {
    if (u.username === "admin") { toast.error(t("ui.管理员账号不可操作","管理员账号不可操作")); return; }
    const nextStatus = u.status === "ACTIVE" ? "FROZEN" : "ACTIVE";
    setConfirm({ open:true, user:u, nextStatus });
  };

  const hasActiveFilters = statusFilter !== "ALL" || roleFilter !== "" || orgFilter !== "" || search !== "";

  return (
    <div className="animate-fade-in" style={{ paddingBottom:60 }}>
      <PageHeader
        title={t("ui.用户与权限管理","用户与权限管理")}
        subtitle={t("ui.管理系统用户账号角色分配与账号状态","管理系统用户账号、角色分配与账号状态")}
        breadcrumb={[t("ui.系统设置","系统设置"), t("ui.用户权限","用户权限")]}
        actions={
          <button type="button" onClick={handleAddNew} className={s.btnPrimaryGrad}>
            <Plus size={15}/> {t("ui.新建用户","新建用户")}
          </button>
        }
      />

      {/* 统计头卡 */}
      <div className={s.card} style={{ marginBottom:14 }}>
        <div style={{ padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:"linear-gradient(135deg,#f59e0b,#d97706)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Key size={18} color="white"/>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:"var(--text-primary)" }}>{t("ui.用户账号管理台","用户账号管理台")}</div>
              <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:2 }}>
                {t("ui.共","共")} {counts.ALL} {t("ui.个账号","个账号")} ·{" "}
                <span style={{ color:"#16a34a", fontWeight:600 }}>{t("ui.正式","正式")} {counts.REAL}</span> ·{" "}
                <span style={{ color:"#7c3aed", fontWeight:600 }}>{t("ui.测试","测试")} {counts.TEST}</span>
                {filtered.length !== users.length && (
                  <span style={{ color:"var(--color-primary)", fontWeight:600 }}> · {t("ui.筛选结果","筛选结果")} {filtered.length} {t("ui.条","条")}</span>
                )}
              </div>
            </div>
          </div>
          <button type="button" onClick={() => loadData()} className={s.btnSecondary}>
            <RefreshCw size={13}/> {t("common.refresh","刷新")}
          </button>
        </div>
      </div>

      {/* 工具栏：类型 Tab + 搜索 + 多维过滤 */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
        {/* 类型 Tab */}
        <div style={{ display:"flex", gap:6 }}>
          {([["ALL", t("ui.全部","全部")],["REAL","✅ " + t("ui.正式员工","正式员工")],["TEST","🧪 " + t("ui.测试账号","测试账号")]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTypeFilter(key)}
              className={`${s.tabPill} ${typeFilter===key ? s.tabPillActive : ""}`}>
              {label}
              <span style={{ marginLeft:5, fontSize:11, opacity:0.75 }}>({counts[key]})</span>
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:180,
          background:"var(--bg-card)", borderRadius:8, padding:"7px 12px",
          border:"1px solid var(--border)", maxWidth:280 }}>
          <Search size={13} color="var(--text-secondary)" style={{ flexShrink:0 }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder={t("ui.搜索姓名账号组织","搜索姓名、账号、组织…")}
            style={{ border:"none", background:"transparent", outline:"none",
              fontSize:13, color:"var(--text-primary)", width:"100%" }}/>
          {search && (
            <button onClick={()=>setSearch("")}
              style={{ border:"none", background:"transparent", cursor:"pointer",
                color:"var(--text-secondary)", padding:0, fontSize:14, lineHeight:1 }}>✕</button>
          )}
        </div>

        {/* 状态过滤 */}
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
          className={s.inp} style={{ width:"auto", padding:"7px 10px", fontSize:13, minWidth:100,
            borderColor: statusFilter !== "ALL" ? "var(--color-primary)" : undefined }}>
          <option value="ALL">{t("ui.全部状态","全部状态")}</option>
          <option value="ACTIVE">✅ {t("status.normal","正常")}</option>
          <option value="FROZEN">🔒 {t("ui.已冻结","已冻结")}</option>
        </select>

        {/* 角色过滤 */}
        <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}
          className={s.inp} style={{ width:"auto", padding:"7px 10px", fontSize:13, minWidth:140,
            borderColor: roleFilter ? "var(--color-primary)" : undefined }}>
          <option value="">{t("ui.全部角色","全部角色")}</option>
          {roles.map(r => <option key={r.role_code} value={r.role_code}>{r.role_name_zh}</option>)}
        </select>

        {/* 组织部门过滤 */}
        <select value={orgFilter} onChange={e=>setOrgFilter(e.target.value)}
          className={s.inp} style={{ width:"auto", padding:"7px 10px", fontSize:13, minWidth:140,
            borderColor: orgFilter ? "var(--color-primary)" : undefined }}>
          <option value="">{t("ui.全部部门","全部部门")}</option>
          {[...orgs]
            .sort((a,b) => a.org_type.localeCompare(b.org_type) || a.org_name.localeCompare(b.org_name))
            .map(o => (
              <option key={o.id} value={String(o.id)}>
                [{o.org_type}] {o.org_name}
              </option>
            ))
          }
        </select>

        {/* 清除过滤 */}
        {hasActiveFilters && (
          <button onClick={()=>{ setSearch(""); setStatusFilter("ALL"); setRoleFilter(""); setOrgFilter(""); }}
            style={{ fontSize:12, color:"#ef4444", background:"rgba(239,68,68,0.08)",
              border:"1px solid rgba(239,68,68,0.2)", borderRadius:6,
              padding:"6px 10px", cursor:"pointer", whiteSpace:"nowrap" }}>
            {t("ui.清除筛选","清除筛选")}
          </button>
        )}
      </div>

      {/* 用户列表 */}
      {loading ? (
        <div className={s.card}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:14 }}>
              <div className={s.shimmer} style={{ width:120, height:14, borderRadius:4 }}/>
              <div className={s.shimmer} style={{ width:80, height:14, borderRadius:4 }}/>
              <div className={s.shimmer} style={{ width:100, height:14, borderRadius:4, marginLeft:"auto" }}/>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.card}>
          <table className={s.table}>
            <thead>
              <tr>
                {([
                  ["username",    t("ui.用户名类型","用户名 / 类型")],
                  ["real_name_zh", t("ui.姓名","姓名")],
                  ["org_name",    t("ui.所属组织","所属组织")],
                  ["role_name_zh", t("ui.角色权限","角色权限")],
                  ["status",      t("common.status","状态")],
                ] as [SortKey, string][]).map(([col, label]) => (
                  <th key={col} onClick={() => handleSort(col)}
                    style={{ cursor:"pointer", userSelect:"none", whiteSpace:"nowrap" }}>
                    <span style={{ display:"inline-flex", alignItems:"center" }}>
                      {label}<SortIcon col={col}/>
                    </span>
                  </th>
                ))}
                <th style={{ textAlign:"right" }}>{t("common.operation","操作")}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={6}>
                  <div className={s.emptyState}>
                    <Users size={40}/>
                    <div className={s.emptyStateText}>{search || hasActiveFilters ? t("ui.没有匹配的用户","没有匹配的用户") : t("ui.暂无用户账号","暂无用户账号")}</div>
                    <div className={s.emptyStateHint}>
                      {search || hasActiveFilters ? t("ui.尝试修改搜索条件或清除筛选","尝试修改搜索条件或清除筛选") : t("ui.点击新建用户添加第一个账号","点击「新建用户」添加第一个账号")}
                    </div>
                  </div>
                </td></tr>
              ) : paginated.map((u, i) => (
                <tr key={u.id} className={`${s.rowEnter} ${s.rowEnterStagger}`}
                  style={{ "--i": i, background: u.status==="FROZEN"?"rgba(239,68,68,0.04)":u.user_type==="TEST"?"rgba(124,58,237,0.03)":"transparent" } as any}>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span className={s.code}>{u.username}</span>
                      <UserTypeBadge type={u.user_type||"REAL"}/>
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:3 }}>
                      ID: {u.id}{u.store_code && ` · ${t("ui.门店","门店")}: ${u.store_code}`}
                    </div>
                  </td>
                  <td style={{ fontWeight:600 }}>{u.real_name_zh}</td>
                  <td>
                    <span className={`${s.badge} ${u.org_name ? s.badgeInfo : s.badgeWarning}`}>
                      {u.org_name || t("ui.未挂靠","未挂靠")}
                    </span>
                  </td>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <Shield size={13} color={u.role==="ROLE_ADMIN"?"#d97706":"#9ca3af"}/>
                      <span style={{ fontSize:13, fontWeight:600, color:u.role==="ROLE_ADMIN"?"#b45309":"var(--text-primary)" }}>
                        {u.role_name_zh||u.role||"—"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span className={`${s.dot} ${u.status==="ACTIVE" ? s.dotOnline : s.dotOffline}`}/>
                      <span className={`${s.badge} ${u.status==="ACTIVE" ? s.badgeSuccess : s.badgeDanger}`}>
                        {u.status==="ACTIVE" ? t("status.normal","正常") : t("ui.已冻结","已冻结")}
                      </span>
                    </div>
                  </td>
                  <td>
                    {u.username==="admin" ? (
                      <div style={{ textAlign:"right" }}>
                        <span className={`${s.badge} ${s.badgeWarning}`}>{t("ui.超管保护","超管保护")}</span>
                      </div>
                    ) : (
                      <div className={s.tableActions}>
                        <button type="button" onClick={() => handleEdit(u)} className={s.btnIcon} title={t("common.edit","编辑")}>
                          <Edit2 size={13}/>
                        </button>
                        <button type="button" onClick={() => handleToggle(u)} className={`${s.btnSm} ${u.status==="ACTIVE" ? s.btnDanger : s.btnSecondary}`}>
                          {u.status==="ACTIVE" ? <><Lock size={11}/>{t("ui.冻结","冻结")}</> : <><Unlock size={11}/>{t("ui.解冻","解冻")}</>}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 分页栏 */}
          {filtered.length > 0 && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"12px 16px", borderTop:"1px solid var(--border)",
              fontSize:13, color:"var(--text-secondary)" }}>
              {/* 左：统计 + 每页条数 */}
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span>{t("common.total","共")} <strong style={{ color:"var(--text-primary)" }}>{filtered.length}</strong> {t("ui.条","条")}</span>
                <span style={{ opacity:0.4 }}>|</span>
                <span>{t("ui.每页","每页")}</span>
                <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));}}
                  style={{ border:"1px solid var(--border)", borderRadius:6,
                    background:"var(--bg-card)", color:"var(--text-primary)",
                    padding:"3px 6px", fontSize:13, cursor:"pointer" }}>
                  {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} {t("ui.条","条")}</option>)}
                </select>
              </div>
              {/* 右：页码 */}
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <button onClick={()=>setPage(1)} disabled={page===1}
                  style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)",
                    background:"var(--bg-card)", cursor:page===1?"not-allowed":"pointer",
                    opacity:page===1?0.4:1, fontSize:12 }}>«</button>
                <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
                  style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)",
                    background:"var(--bg-card)", cursor:page===1?"not-allowed":"pointer",
                    opacity:page===1?0.4:1, fontSize:12 }}>‹</button>

                {/* 页码按钮（最多显示5个） */}
                {Array.from({ length: totalPages }, (_,i)=>i+1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce<(number|"...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx-1] as number) > 1) acc.push("...");
                    acc.push(p); return acc;
                  }, [])
                  .map((p, i) => p === "..." ? (
                    <span key={`e${i}`} style={{ padding:"4px 4px", fontSize:12 }}>…</span>
                  ) : (
                    <button key={p} onClick={()=>setPage(p as number)}
                      style={{ padding:"4px 9px", borderRadius:6, fontSize:12, cursor:"pointer",
                        border: page===p ? "1px solid var(--color-primary)" : "1px solid var(--border)",
                        background: page===p ? "var(--color-primary)" : "var(--bg-card)",
                        color: page===p ? "#fff" : "var(--text-primary)",
                        fontWeight: page===p ? 700 : 400 }}>
                      {p}
                    </button>
                  ))}

                <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                  style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)",
                    background:"var(--bg-card)", cursor:page===totalPages?"not-allowed":"pointer",
                    opacity:page===totalPages?0.4:1, fontSize:12 }}>›</button>
                <button onClick={()=>setPage(totalPages)} disabled={page===totalPages}
                  style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)",
                    background:"var(--bg-card)", cursor:page===totalPages?"not-allowed":"pointer",
                    opacity:page===totalPages?0.4:1, fontSize:12 }}>»</button>
                <span style={{ marginLeft:6, opacity:0.6 }}>{page} / {totalPages} {t("ui.页","页")}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 新建/编辑抽屉 */}
      <RightDrawer isOpen={showDrawer} onClose={() => setShowDrawer(false)}
        title={editId ? t("ui.编辑用户","编辑用户") : t("ui.新建用户","新建用户")} width="480px"
        footer={
          <div className={s.drawerFooter}>
            <button type="button" onClick={() => setShowDrawer(false)} className={s.btnSecondary}>{t("common.cancel","取消")}</button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className={s.btnPrimaryGrad}>
              {submitting ? t("ui.处理中","处理中...") : (editId ? t("common.save","保存修改") : t("ui.创建用户","创建用户"))}
            </button>
          </div>
        }>
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
          <div className={s.formSection}><Users size={12}/>{t("ui.基本信息","基本信息")}</div>
          <div className={s.field}>
            <label className={s.lbl}>{t("ui.登录用户名","登录用户名")} {!editId && <span style={{color:"var(--status-danger)"}}>*</span>}</label>
            <input disabled={!!editId} value={form.username} onChange={e=>f("username",e.target.value)}
              placeholder="字母+数字，如 store_mgr2" className={s.inp}
              style={{ fontFamily:"monospace", opacity:editId?0.6:1 }}/>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t("ui.姓名","姓名")} <span style={{color:"var(--status-danger)"}}>*</span></label>
            <input value={form.real_name_zh} onChange={e=>f("real_name_zh",e.target.value)} placeholder="如 张三" className={s.inp}/>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{t("ui.所属组织","所属组织")}</label>
              <select value={form.org_id||""} onChange={e=>f("org_id",e.target.value)} className={s.inp}>
                <option value="">— {t("ui.未挂靠","未挂靠")} —</option>
                {orgs.map(o => <option key={o.id} value={o.id}>[{o.org_type}] {o.org_name}</option>)}
              </select>
            </div>
            <div>
              <label className={s.lbl}>{t("ui.门店代码可选","门店代码（可选）")}</label>
              <input value={form.store_code} onChange={e=>f("store_code",e.target.value)} placeholder="如 ST-VTE-001" className={s.inp}/>
            </div>
          </div>
          {!editId && (
            <>
              <div className={s.formSection}><UserCheck size={12}/>{t("ui.账号类型","账号类型")}</div>
              <div className={s.field} style={{ display:"flex", gap:10 }}>
                {([["REAL","✅ " + t("ui.正式员工","正式员工"),"#15803d","#dcfce7","#86efac"],["TEST","🧪 " + t("ui.测试账号","测试账号"),"#7c3aed","#ede9fe","#c4b5fd"]] as const).map(([val,lbl,col,bg,bc]) => (
                  <label key={val} style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:8,
                    border:`1.5px solid ${form.user_type===val?bc:"var(--border)"}`, background:form.user_type===val?bg:"var(--bg-card)",
                    cursor:"pointer", fontSize:13, fontWeight:600, color:form.user_type===val?col:"var(--text-secondary)", transition:"all 0.18s" }}>
                    <input type="radio" name="user_type" value={val} checked={form.user_type===val} onChange={e=>f("user_type",e.target.value)} style={{ accentColor:col }}/>{lbl}
                  </label>
                ))}
              </div>
            </>
          )}
          <div className={s.formSection}><Shield size={12}/>{t("ui.角色权限分配","角色权限分配")}</div>
          <div className={s.field}>
            <label className={s.lbl}>{t("ui.系统角色","系统角色")}</label>
            <select value={form.role} onChange={e=>f("role",e.target.value)} className={s.inp}>
              <option value="">— {t("ui.暂不分配角色","暂不分配角色")} —</option>
              {roles.map(r => <option key={r.role_code} value={r.role_code}>{r.role_name_zh}（{r.role_code}）</option>)}
            </select>
            <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:5 }}>{t("ui.角色决定用户可访问的功能菜单与操作权限","角色决定用户可访问的功能菜单与操作权限")}</div>
          </div>
          <div className={s.formSection} style={{ color: !editId ? "var(--status-danger)" : form.newPassword ? "#f97316" : "var(--text-secondary)" }}>
            <Key size={12}/>{editId ? t("ui.重置密码可选","重置密码（可选）") : t("ui.初始密码","初始密码")}
          </div>
          <div className={s.field}>
            {!editId ? (
              <>
                <label className={s.lbl}>{t("ui.密码","密码")} <span style={{color:"var(--status-danger)"}}>*</span></label>
                <input type="password" value={form.password} onChange={e=>f("password",e.target.value)}
                  placeholder={t("ui.至少8位含字母数字","至少 8 位，含字母 + 数字")} className={s.inp}/>
                <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:5 }}>⚠️ {t("ui.请告知用户初始密码登录后可在个人中心修改","请告知用户初始密码，登录后可在个人中心修改")}</div>
              </>
            ) : (
              <>
                <label className={s.lbl}>{t("ui.新密码留空则不修改","新密码（留空则不修改）")}</label>
                <input type="password" value={form.newPassword} onChange={e=>f("newPassword",e.target.value)}
                  placeholder={t("ui.至少8位留空保持原密码","至少 8 位；留空保持原密码")} className={s.inp}/>
                <div style={{ fontSize:11, marginTop:5, color: form.newPassword&&form.newPassword.length<8?"#f97316":form.newPassword&&form.newPassword.length>=8?"#16a34a":"var(--text-secondary)" }}>
                  {form.newPassword&&form.newPassword.length<8 ? `⚠️ ${t("ui.密码长度不足8位","密码长度不足 8 位")}` : form.newPassword ? `✓ ${t("ui.保存后将更新登录密码","保存后将更新登录密码")}` : t("ui.留空则保持原密码不变","留空则保持原密码不变")}
                </div>
              </>
            )}
          </div>
        </div>
      </RightDrawer>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.nextStatus==="FROZEN" ? t("ui.冻结用户","冻结用户") : t("ui.解冻用户","解冻用户")}
        message={`${t("common.confirm","确认")}${confirm.nextStatus==="FROZEN" ? t("ui.冻结","冻结") : t("ui.解冻","解冻")}${t("ui.用户","用户")} ${confirm.user?.real_name_zh}？`}
        confirmLabel={confirm.nextStatus==="FROZEN" ? t("ui.确认冻结","确认冻结") : t("ui.确认解冻","确认解冻")}
        danger={confirm.nextStatus==="FROZEN"}
        onConfirm={doToggleStatus}
        onCancel={() => setConfirm({ open:false })}
      />
    </div>
  );
}

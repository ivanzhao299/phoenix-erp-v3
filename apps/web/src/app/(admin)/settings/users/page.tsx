"use client";
import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import RightDrawer from "@/components/RightDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
import { Users, Shield, Plus, Lock, Unlock, Key, Edit2, UserCheck, FlaskConical, RefreshCw } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// ── API ─────────────────────────────────────────────────────────────────────
const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "");
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const API = async (path: string, opts: RequestInit = {}) => {
  const r = await fetch("/api/users" + path, { ...opts, headers: { ...hdr(), ...(opts.headers as any || {}) } });
  return r.json();
};

// ── 子组件 ───────────────────────────────────────────────────────────────────
function UserTypeBadge({ type }: { type: string }) {
  return type === "TEST" ? (
    <span className={`${s.badge} ${s.badgePurple}`}><FlaskConical size={9} /> TEST</span>
  ) : (
    <span className={`${s.badge} ${s.badgeSuccess}`}><UserCheck size={9} /> 正式</span>
  );
}

// ── 主页面 ───────────────────────────────────────────────────────────────────
interface User { id:number; username:string; real_name_zh:string; role?:string; role_name_zh?:string; org_id?:number; org_name?:string; store_code?:string; status:string; user_type:string; }
interface Role { role_code:string; role_name_zh:string; }
interface Org  { id:number; org_name:string; org_type:string; }

const FILTERS = [{ key:"ALL", label:"全部" }, { key:"REAL", label:"✅ 正式员工" }, { key:"TEST", label:"🧪 测试账号" }];

export default function UserManagementPage() {
  const toast = useToast();
  const [users,       setUsers]       = useState<User[]>([]);
  const [roles,       setRoles]       = useState<Role[]>([]);
  const [orgs,        setOrgs]        = useState<Org[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState("REAL");
  const [showDrawer,  setShowDrawer]  = useState(false);
  const [editId,      setEditId]      = useState<number|null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [confirm,     setConfirm]     = useState<{open:boolean; user?:User; nextStatus?:string}>({ open:false });

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

  const visible = filter === "ALL" ? users : users.filter(u => (u.user_type || "REAL") === filter);
  const counts  = { ALL: users.length, REAL: users.filter(u => (u.user_type||"REAL")==="REAL").length, TEST: users.filter(u => u.user_type==="TEST").length };

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleAddNew = () => {
    setEditId(null);
    setForm({ username:"", real_name_zh:"", org_id:"", store_code:"", password:"", newPassword:"", role: roles[0]?.role_code||"", user_type:"REAL" });
    setShowDrawer(true);
  };

  const handleEdit = (u: User) => {
    if (u.username === "admin") { toast.error("系统特权总控帐号已锁定，拒绝面板编辑"); return; }
    setEditId(u.id);
    setForm({ username:u.username, real_name_zh:u.real_name_zh||"", org_id:String(u.org_id||""), store_code:u.store_code||"", password:"", newPassword:"", role:u.role||"", user_type:u.user_type||"REAL" });
    setShowDrawer(true);
  };

  const handleSubmit = async () => {
    if (!form.real_name_zh)                             { toast.error("姓名为必填项"); return; }
    if (!editId && !form.username)                      { toast.error("账户名为必填项"); return; }
    if (!editId && (!form.password || form.password.length < 8)) { toast.error("新建用户密码至少 8 位"); return; }
    setSubmitting(true);
    try {
      let res: any;
      if (editId) {
        res = await API(`/${editId}`, { method:"PUT", body: JSON.stringify({ real_name_zh:form.real_name_zh, org_id:form.org_id||null, store_code:form.store_code }) });
        if (res.code === 200 && form.role)        await API(`/${editId}/role`, { method:"PUT", body: JSON.stringify({ role:form.role }) });
        if (res.code === 200 && form.newPassword && form.newPassword.length >= 8) {
          const pw = await API(`/${editId}/password`, { method:"PUT", body: JSON.stringify({ password:form.newPassword }) });
          if (pw.code !== 200) toast.error(pw.msg || "密码重置失败");
        }
      } else {
        res = await API("", { method:"POST", body: JSON.stringify({ username:form.username, real_name_zh:form.real_name_zh, role:form.role, org_id:form.org_id||null, store_code:form.store_code, password:form.password, user_type:form.user_type }) });
      }
      if (res.code === 200) { setShowDrawer(false); loadData(); toast.success(editId ? "修改成功" : "用户创建成功"); }
      else toast.error(res.msg || "操作失败");
    } finally { setSubmitting(false); }
  };

  const doToggleStatus = async () => {
    const { user, nextStatus } = confirm;
    if (!user) return;
    setConfirm({ open:false });
    const res = await API(`/${user.id}/status`, { method:"PUT", body: JSON.stringify({ status: nextStatus }) });
    if (res.code === 200) { loadData(); toast.success(nextStatus==="FROZEN" ? "已冻结" : "已解冻"); }
    else toast.error(res.msg);
  };

  const handleToggle = (u: User) => {
    if (u.username === "admin") { toast.error("管理员账号不可操作"); return; }
    const nextStatus = u.status === "ACTIVE" ? "FROZEN" : "ACTIVE";
    setConfirm({ open:true, user:u, nextStatus });
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom:60 }}>
      <PageHeader
        title="用户与权限管理"
        subtitle="管理系统用户账号、角色分配与账号状态"
        breadcrumb={["系统设置","用户权限"]}
        actions={
          <button type="button" onClick={handleAddNew} className={s.btnPrimaryGrad}>
            <Plus size={15}/> 新建用户
          </button>
        }
      />

      {/* 信息头卡 */}
      <div className={s.card} style={{ marginBottom:16 }}>
        <div style={{ padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"linear-gradient(135deg,#f59e0b,#d97706)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Key size={20} color="white"/>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:"var(--text-primary)" }}>用户账号管理台</div>
              <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:2 }}>
                共 {counts.ALL} 个账号 ·{" "}
                <span style={{ color:"#16a34a", fontWeight:600 }}>正式 {counts.REAL}</span> ·{" "}
                <span style={{ color:"#7c3aed", fontWeight:600 }}>测试 {counts.TEST}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => loadData()} className={s.btnSecondary}>
            <RefreshCw size={13}/> 刷新
          </button>
        </div>
      </div>

      {/* 胶囊 Tab 筛选 */}
      <div className={s.toolbar} style={{ marginBottom:14 }}>
        <div style={{ display:"flex", gap:6 }}>
          {FILTERS.map(tab => (
            <button key={tab.key} type="button" onClick={() => setFilter(tab.key)}
              className={`${s.tabPill} ${filter===tab.key ? s.tabPillActive : ""}`}>
              {tab.label}
              <span style={{ marginLeft:6, fontSize:11, opacity:0.75 }}>({counts[tab.key as keyof typeof counts]})</span>
            </button>
          ))}
        </div>
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
                {["用户名 / 类型","姓名","所属组织","角色权限","状态","操作"].map((h,i) => (
                  <th key={h} style={{ textAlign: i===5?"right":"left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={6}>
                  <div className={s.emptyState}>
                    <Users size={40}/>
                    <div className={s.emptyStateText}>暂无用户账号</div>
                    <div className={s.emptyStateHint}>点击「新建用户」添加第一个账号</div>
                  </div>
                </td></tr>
              ) : visible.map((u, i) => (
                <tr key={u.id} className={`${s.rowEnter} ${s.rowEnterStagger}`}
                  style={{ "--i": i, background: u.status==="FROZEN"?"rgba(239,68,68,0.04)":u.user_type==="TEST"?"rgba(124,58,237,0.03)":"transparent" } as any}>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span className={s.code}>{u.username}</span>
                      <UserTypeBadge type={u.user_type||"REAL"}/>
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:3 }}>
                      ID: {u.id}{u.store_code && ` · 门店: ${u.store_code}`}
                    </div>
                  </td>
                  <td style={{ fontWeight:600 }}>{u.real_name_zh}</td>
                  <td>
                    <span className={`${s.badge} ${u.org_name ? s.badgeInfo : s.badgeWarning}`}>
                      {u.org_name || "未挂靠"}
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
                        {u.status==="ACTIVE"?"正常":"已冻结"}
                      </span>
                    </div>
                  </td>
                  <td>
                    {u.username==="admin" ? (
                      <div style={{ textAlign:"right" }}>
                        <span className={`${s.badge} ${s.badgeWarning}`}>超管保护</span>
                      </div>
                    ) : (
                      <div className={s.tableActions}>
                        <button type="button" onClick={() => handleEdit(u)} className={s.btnIcon} title="编辑">
                          <Edit2 size={13}/>
                        </button>
                        <button type="button" onClick={() => handleToggle(u)} className={`${s.btnSm} ${u.status==="ACTIVE" ? s.btnDanger : s.btnSecondary}`}>
                          {u.status==="ACTIVE" ? <><Lock size={11}/>冻结</> : <><Unlock size={11}/>解冻</>}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 新建/编辑抽屉 */}
      <RightDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        title={editId ? "编辑用户" : "新建用户"}
        width="480px"
        footer={
          <div className={s.drawerFooter}>
            <button type="button" onClick={() => setShowDrawer(false)} className={s.btnSecondary}>取消</button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className={s.btnPrimaryGrad}>
              {submitting ? "处理中..." : (editId ? "保存修改" : "创建用户")}
            </button>
          </div>
        }
      >
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
          {/* 基本信息 */}
          <div className={s.formSection}><Users size={12}/>基本信息</div>
          <div className={s.field}>
            <label className={s.lbl}>登录用户名 {!editId && <span style={{color:"var(--status-danger)"}}>*</span>}</label>
            <input disabled={!!editId} value={form.username} onChange={e=>f("username",e.target.value)}
              placeholder="字母+数字，如 store_mgr2" className={s.inp} style={{ fontFamily:"monospace", opacity:editId?0.6:1 }}/>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>姓名 <span style={{color:"var(--status-danger)"}}>*</span></label>
            <input value={form.real_name_zh} onChange={e=>f("real_name_zh",e.target.value)} placeholder="如 张三" className={s.inp}/>
          </div>
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>所属组织</label>
              <select value={form.org_id||""} onChange={e=>f("org_id",e.target.value)} className={s.inp}>
                <option value="">— 未挂靠 —</option>
                {orgs.map(o => <option key={o.id} value={o.id}>[{o.org_type}] {o.org_name}</option>)}
              </select>
            </div>
            <div>
              <label className={s.lbl}>门店代码（可选）</label>
              <input value={form.store_code} onChange={e=>f("store_code",e.target.value)} placeholder="如 ST-VTE-001" className={s.inp}/>
            </div>
          </div>

          {/* 账号类型（仅新建） */}
          {!editId && (
            <>
              <div className={s.formSection}><UserCheck size={12}/>账号类型</div>
              <div className={s.field} style={{ display:"flex", gap:10 }}>
                {([["REAL","✅ 正式员工","#15803d","#dcfce7","#86efac"],["TEST","🧪 测试账号","#7c3aed","#ede9fe","#c4b5fd"]] as const).map(([val,lbl,col,bg,bc]) => (
                  <label key={val} style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:8,
                    border:`1.5px solid ${form.user_type===val?bc:"var(--border)"}`, background:form.user_type===val?bg:"var(--bg-card)",
                    cursor:"pointer", fontSize:13, fontWeight:600, color:form.user_type===val?col:"var(--text-secondary)", transition:"all 0.18s" }}>
                    <input type="radio" name="user_type" value={val} checked={form.user_type===val} onChange={e=>f("user_type",e.target.value)} style={{ accentColor:col }}/>{lbl}
                  </label>
                ))}
              </div>
            </>
          )}

          {/* 角色权限 */}
          <div className={s.formSection}><Shield size={12}/>角色权限分配</div>
          <div className={s.field}>
            <label className={s.lbl}>系统角色</label>
            <select value={form.role} onChange={e=>f("role",e.target.value)} className={s.inp}>
              <option value="">— 暂不分配角色 —</option>
              {roles.map(r => <option key={r.role_code} value={r.role_code}>{r.role_name_zh}（{r.role_code}）</option>)}
            </select>
            <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:5 }}>角色决定用户可访问的功能菜单与操作权限</div>
          </div>

          {/* 密码 */}
          <div className={s.formSection} style={{ color: !editId ? "var(--status-danger)" : form.newPassword ? "#f97316" : "var(--text-secondary)" }}>
            <Key size={12}/>{editId ? "重置密码（可选）" : "初始密码"}
          </div>
          <div className={s.field}>
            {!editId ? (
              <>
                <label className={s.lbl}>密码 <span style={{color:"var(--status-danger)"}}>*</span></label>
                <input type="password" value={form.password} onChange={e=>f("password",e.target.value)}
                  placeholder="至少 8 位，含字母 + 数字" className={s.inp}/>
                <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:5 }}>⚠️ 请告知用户初始密码，登录后可在个人中心修改</div>
              </>
            ) : (
              <>
                <label className={s.lbl}>新密码（留空则不修改）</label>
                <input type="password" value={form.newPassword} onChange={e=>f("newPassword",e.target.value)}
                  placeholder="至少 8 位；留空保持原密码" className={s.inp}/>
                <div style={{ fontSize:11, marginTop:5, color: form.newPassword&&form.newPassword.length<8?"#f97316":form.newPassword&&form.newPassword.length>=8?"#16a34a":"var(--text-secondary)" }}>
                  {form.newPassword&&form.newPassword.length<8?"⚠️ 密码长度不足 8 位":form.newPassword?"✓ 保存后将更新登录密码":"留空则保持原密码不变"}
                </div>
              </>
            )}
          </div>
        </div>
      </RightDrawer>

      {/* 冻结/解冻确认 */}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.nextStatus==="FROZEN"?"冻结用户":"解冻用户"}
        message={`确认${confirm.nextStatus==="FROZEN"?"冻结":"解冻"}用户 ${confirm.user?.real_name_zh}？`}
        confirmLabel={confirm.nextStatus==="FROZEN"?"确认冻结":"确认解冻"}
        danger={confirm.nextStatus==="FROZEN"}
        onConfirm={doToggleStatus}
        onCancel={() => setConfirm({ open:false })}
      />
    </div>
  );
}
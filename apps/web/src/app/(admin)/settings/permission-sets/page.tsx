"use client";

/**
 * G118-B 权限集（PBAC 能力集）管理
 * 能力集 = 可复用的 菜单×操作 捆绑；角色/用户由能力集组合。
 * 运行时解析在 auth.service 三路并集（role / role_set / user_set）。
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
import { Layers, Plus, Trash2, Edit2, Save, Users, Shield, X, AlertTriangle } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";

interface SetRow {
  set_id: number; set_code: string; set_name_zh: string; description: string | null;
  item_count: number; role_count: number; user_count: number;
}
interface MenuItem { menu_code: string; menu_name_zh: string; sensitive: boolean; }
interface MenuGroup { domain: string; domain_label_zh: string; domain_color: string; menus: MenuItem[]; }
interface RoleOpt { role_code: string; role_name_zh: string; status?: string; }
interface UserOpt { id: string; username: string; real_name_zh: string | null; }
interface SetDetail {
  set_code: string; set_name_zh: string; description: string | null;
  items: Array<{ menu_code: string; menu_name_zh: string; perm_codes: string }>;
  roles: Array<{ role_code: string; role_name_zh: string }>;
  users: Array<{ user_id: string; username: string; real_name_zh: string | null }>;
}

const PERM_ORDER = ["V", "C", "E", "D", "A", "X"] as const;
const PERM_META: Record<string, { label: string; color: string }> = {
  V: { label: "查看", color: "var(--color-accent)" }, C: { label: "新增", color: "var(--status-success)" },
  E: { label: "编辑", color: "var(--status-warning)" }, D: { label: "删除", color: "var(--status-danger)" },
  A: { label: "审批", color: "var(--status-special)" }, X: { label: "导出", color: "var(--color-accent)" },
};
const SET_CODE_RE = /^PSET_[A-Z][A-Z0-9_]*$/;

const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const jget = (p: string) => fetch(p, { headers: hdr() }).then(r => r.json());
const jsend = (p: string, m: string, b?: unknown) => fetch(p, { method: m, headers: hdr(), body: b ? JSON.stringify(b) : undefined }).then(r => r.json());

export default function PermissionSetsPage() {
  const toast = useToast();
  const [sets, setSets] = useState<SetRow[]>([]);
  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([]);
  const [roleOpts, setRoleOpts] = useState<RoleOpt[]>([]);
  const [userOpts, setUserOpts] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(false);

  const [showDrawer, setShowDrawer] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [form, setForm] = useState({ set_code: "PSET_", set_name_zh: "", description: "" });
  const [perms, setPerms] = useState<Record<string, Set<string>>>({});
  const [boundRoles, setBoundRoles] = useState<string[]>([]);
  const [boundUsers, setBoundUsers] = useState<string[]>([]);
  const [codeErr, setCodeErr] = useState("");
  const [confirmDel, setConfirmDel] = useState<SetRow | null>(null);

  const allMenus = useMemo(() => menuGroups.flatMap(g => g.menus), [menuGroups]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const r = await jget("/api/permission-sets");
      setSets(Array.isArray(r.data) ? r.data : []);
      const mg = await jget("/api/permissions/menus");
      setMenuGroups(Array.isArray(mg.data) ? mg.data : []);
      const ro = await jget("/api/crud/sys_role");
      const rawRoles = Array.isArray(ro.data) ? ro.data : Array.isArray(ro) ? ro : [];
      setRoleOpts(rawRoles.filter((x: any) => x.status !== "DEPRECATED").map((x: any) => ({ role_code: x.role_code, role_name_zh: x.role_name_zh })));
      const uo = await jget("/api/users?pageSize=500");
      const rawUsers = uo.data?.items ?? uo.data ?? uo.items ?? [];
      setUserOpts(rawUsers.filter((u: any) => u.status === "ACTIVE").map((u: any) => ({ id: String(u.id), username: u.username, real_name_zh: u.real_name_zh })));
    } catch (e: any) {
      setTimeout(() => toast.error("加载失败: " + (e.message || String(e))), 0);
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const openNew = () => {
    setEditCode(null); setForm({ set_code: "PSET_", set_name_zh: "", description: "" });
    setPerms({}); setBoundRoles([]); setBoundUsers([]); setCodeErr(""); setShowDrawer(true);
  };
  const openEdit = async (row: SetRow) => {
    setEditCode(row.set_code);
    setForm({ set_code: row.set_code, set_name_zh: row.set_name_zh, description: row.description || "" });
    setCodeErr("");
    try {
      const r = await jget(`/api/permission-sets/${encodeURIComponent(row.set_code)}`);
      const d: SetDetail = r.data;
      const p: Record<string, Set<string>> = {};
      for (const it of d.items || []) p[it.menu_code] = new Set(it.perm_codes.split(",").map(x => x.trim()).filter(Boolean));
      setPerms(p);
      setBoundRoles((d.roles || []).map(x => x.role_code));
      setBoundUsers((d.users || []).map(x => String(x.user_id)));
    } catch { setPerms({}); setBoundRoles([]); setBoundUsers([]); }
    setShowDrawer(true);
  };

  const togglePerm = (mc: string, c: string) => setPerms(prev => {
    const next = { ...prev }; const set = new Set(next[mc] || []);
    set.has(c) ? set.delete(c) : set.add(c);
    if (set.size === 0) delete next[mc]; else next[mc] = set;
    return next;
  });

  const handleSave = async () => {
    if (!editCode) {
      if (!SET_CODE_RE.test(form.set_code)) { toast.error("编码格式：PSET_ + 大写字母/数字/下划线"); return; }
      if (sets.some(x => x.set_code === form.set_code)) { toast.error("该能力集编码已存在"); return; }
    }
    if (!form.set_name_zh.trim()) { toast.error("能力集名称必填"); return; }
    setLoading(true);
    try {
      const code = form.set_code;
      if (editCode) {
        await jsend(`/api/permission-sets/${encodeURIComponent(code)}`, "PATCH", { set_name_zh: form.set_name_zh, description: form.description || null });
      } else {
        const r = await jsend("/api/permission-sets", "POST", { set_code: code, set_name_zh: form.set_name_zh, description: form.description || null });
        if (r.code && r.code !== 200) throw new Error(r.message || r.msg || "创建失败");
      }
      const items = Object.entries(perms).filter(([, set]) => set.size > 0).map(([menu_code, set]) => ({ menu_code, perm_codes: Array.from(set).join(",") }));
      const ri = await jsend(`/api/permission-sets/${encodeURIComponent(code)}/items`, "PUT", { items });
      if (ri.code && ri.code !== 200) throw new Error(ri.message || "明细保存失败");
      toast.success(editCode ? "能力集已更新" : "能力集已创建");
      setShowDrawer(false); loadAll();
    } catch (e: any) { toast.error(e.message || "保存失败"); } finally { setLoading(false); }
  };

  // 绑定角色/用户：即时调 API
  const toggleRole = async (rc: string) => {
    if (!editCode) { toast.error("请先保存能力集再绑定角色"); return; }
    const has = boundRoles.includes(rc);
    try {
      await jsend(`/api/permission-sets/${encodeURIComponent(editCode)}/roles/${encodeURIComponent(rc)}`, has ? "DELETE" : "POST");
      setBoundRoles(prev => has ? prev.filter(x => x !== rc) : [...prev, rc]);
    } catch (e: any) { toast.error(e.message || "操作失败"); }
  };
  const toggleUser = async (uid: string) => {
    if (!editCode) { toast.error("请先保存能力集再绑定用户"); return; }
    const has = boundUsers.includes(uid);
    try {
      await jsend(`/api/permission-sets/${encodeURIComponent(editCode)}/users/${uid}`, has ? "DELETE" : "POST");
      setBoundUsers(prev => has ? prev.filter(x => x !== uid) : [...prev, uid]);
    } catch (e: any) { toast.error(e.message || "操作失败"); }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      const r = await jsend(`/api/permission-sets/${encodeURIComponent(confirmDel.set_code)}`, "DELETE");
      if (r.code && r.code !== 200) throw new Error(r.msg);
      toast.success("已删除"); setConfirmDel(null); loadAll();
    } catch (e: any) { toast.error("删除失败: " + e.message); }
  };

  const permCount = Object.keys(perms).length;

  return <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
    <PageHeader title="权限集（能力集）" subtitle="PBAC 第 2 层 · 可复用的 菜单×操作 捆绑；角色/用户由能力集组合（运行时与角色直绑权限并集）" breadcrumb={["系统设置", "权限集"]}
      actions={<button type="button" className={s.btnPrimaryGrad} onClick={openNew}><Plus size={14} /> 新建能力集</button>} />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
      {sets.length === 0 && !loading && <div style={{ color: "var(--text-secondary)", fontSize: 13, padding: 12 }}>暂无能力集，点「新建能力集」创建。</div>}
      {sets.map(row => <div key={row.set_code} className={s.card} style={{ display: "flex", flexDirection: "column", borderLeft: "3px solid var(--status-special)" }}>
        <div style={{ padding: "12px 14px 6px", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={s.cardTitle} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
              <Layers size={13} color="var(--status-special)" />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.set_name_zh}</span>
            </div>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-secondary)", marginTop: 2 }}>{row.set_code}</div>
          </div>
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            <button type="button" className={s.btnIcon} title="编辑" onClick={() => openEdit(row)}><Edit2 size={12} /></button>
            <button type="button" className={s.btnIcon} title="删除" onClick={() => setConfirmDel(row)} style={{ color: "var(--color-danger)" }}><Trash2 size={12} /></button>
          </div>
        </div>
        {row.description && <div style={{ padding: "0 14px 8px", fontSize: 11, lineHeight: 1.6, color: "var(--text-secondary)", fontStyle: "italic", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{row.description}</div>}
        <div style={{ padding: "6px 14px", borderTop: "1px solid var(--border)", fontSize: 11, display: "flex", gap: 12, color: "var(--text-secondary)" }}>
          <span>{row.item_count} 项明细</span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Shield size={10} /> {row.role_count} 角色</span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Users size={10} /> {row.user_count} 用户</span>
        </div>
      </div>)}
    </div>

    <RightDrawer open={showDrawer} onClose={() => setShowDrawer(false)} title={editCode ? `编辑：${editCode}` : "新建能力集"} width="640px">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className={s.field}>
          <label className={s.lbl}>能力集编码 *</label>
          <input className={s.inp} disabled={!!editCode} value={form.set_code} placeholder="PSET_SHAREHOLDER_READONLY"
            onChange={e => { const v = e.target.value.toUpperCase(); setForm({ ...form, set_code: v }); setCodeErr(!editCode && v !== "PSET_" && !SET_CODE_RE.test(v) ? "格式：PSET_ + 大写字母/数字/下划线" : ""); }}
            style={{ fontFamily: "monospace", fontWeight: 700, borderColor: codeErr ? "var(--color-danger)" : undefined }} />
          {codeErr && <div style={{ fontSize: 11, color: "var(--color-danger)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={10} /> {codeErr}</div>}
        </div>
        <div className={s.field}>
          <label className={s.lbl}>名称 *</label>
          <input className={s.inp} value={form.set_name_zh} onChange={e => setForm({ ...form, set_name_zh: e.target.value })} placeholder="如：股东权益只读" />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>说明</label>
          <textarea className={s.textarea} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="描述这个能力集的用途边界" style={{ lineHeight: 1.7 }} />
        </div>

        {/* 明细：菜单 × 操作 */}
        <div className={s.field}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label className={s.lbl} style={{ margin: 0 }}>菜单 × 操作明细</label>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--status-special-bg-medium)", color: "var(--color-primary)", fontWeight: 600 }}>已配 {permCount} / {allMenus.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {menuGroups.map(group => <div key={group.domain} style={{ border: `1px solid ${group.domain_color}33`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "6px 12px", background: `${group.domain_color}14`, fontSize: 12, fontWeight: 700, color: group.domain_color }}>{group.domain_label_zh}</div>
              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {group.menus.map(menu => {
                  const set = perms[menu.menu_code] || new Set<string>();
                  return <div key={menu.menu_code} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "4px 8px", borderRadius: 4, background: set.size > 0 ? `${group.domain_color}10` : "transparent" }}>
                    <span style={{ fontSize: 12, fontWeight: set.size > 0 ? 600 : 400 }}>{menu.menu_name_zh}</span>
                    <div style={{ display: "flex", gap: 2 }}>
                      {PERM_ORDER.map(c => { const on = set.has(c); const m = PERM_META[c]; return <button type="button" key={c} title={m.label} onClick={() => togglePerm(menu.menu_code, c)} style={{ minWidth: 22, height: 22, fontSize: 10, fontWeight: 700, borderRadius: 3, cursor: "pointer", border: `1px solid ${on ? m.color : "var(--border)"}`, background: on ? m.color : "var(--bg-card)", color: on ? "white" : "var(--text-secondary)" }}>{c}</button>; })}
                    </div>
                  </div>;
                })}
              </div>
            </div>)}
          </div>
        </div>

        {/* 绑定角色 / 用户（需先保存） */}
        <div className={s.field}>
          <label className={s.lbl}>绑定角色（持此角色者继承本能力集）</label>
          {!editCode && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>保存能力集后可绑定。</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflow: "auto" }}>
            {roleOpts.map(r => { const on = boundRoles.includes(r.role_code); return <button type="button" key={r.role_code} disabled={!editCode} onClick={() => toggleRole(r.role_code)} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 12, cursor: editCode ? "pointer" : "not-allowed", border: `1px solid ${on ? "var(--status-special)" : "var(--border)"}`, background: on ? "var(--status-special)" : "var(--bg-card)", color: on ? "white" : "var(--text-secondary)", opacity: editCode ? 1 : 0.5 }}>{r.role_name_zh}</button>; })}
          </div>
        </div>
        <div className={s.field}>
          <label className={s.lbl}>绑定用户（直接授予指定人，用于例外）</label>
          {!editCode && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>保存能力集后可绑定。</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflow: "auto" }}>
            {userOpts.map(u => { const on = boundUsers.includes(u.id); return <button type="button" key={u.id} disabled={!editCode} onClick={() => toggleUser(u.id)} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 12, cursor: editCode ? "pointer" : "not-allowed", border: `1px solid ${on ? "var(--color-accent)" : "var(--border)"}`, background: on ? "var(--color-accent)" : "var(--bg-card)", color: on ? "white" : "var(--text-secondary)", opacity: editCode ? 1 : 0.5 }}>{u.real_name_zh || u.username}</button>; })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" onClick={() => setShowDrawer(false)} style={{ ...secondaryActionButton, flex: 1, justifyContent: "center" }}>取消</button>
          <button type="button" onClick={handleSave} disabled={loading || !!codeErr} style={{ ...primaryActionButton, flex: 2, justifyContent: "center" }}><Save size={14} /> {loading ? "保存中…" : "保存"}</button>
        </div>
      </div>
    </RightDrawer>

    <ConfirmDialog open={!!confirmDel} title={`删除能力集：${confirmDel?.set_name_zh || ""}`}
      message={confirmDel ? `${confirmDel.role_count + confirmDel.user_count > 0 ? `⚠️ 该能力集已绑定 ${confirmDel.role_count} 角色 + ${confirmDel.user_count} 用户，删除后将解绑并失去相应权限。\n\n` : ""}确认删除 [${confirmDel.set_code}]?` : ""}
      confirmLabel="确认删除" onConfirm={handleDelete} onCancel={() => setConfirmDel(null)} danger />
  </div>;
}

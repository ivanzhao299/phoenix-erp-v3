"use client";
import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import RightDrawer from "@/components/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useDialog } from "@/contexts/DialogContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Network, Plus, Users, Edit3, Trash2, Building, Store,
  ChevronRight, ChevronDown, FolderPlus
} from "lucide-react";

const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const inp: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  fontSize: 13,
  boxSizing: "border-box",
  lineHeight: 1.5,
  appearance: "none",
  WebkitAppearance: "none",
};
const lbl: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 5,
  letterSpacing: "0.02em",
};
const btnPrimary: React.CSSProperties = {
  padding: "9px 18px",
  background: "var(--color-primary)",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

type Org = { id: number; org_code?: string; org_name: string; org_type: string; parent_id: number; sort_no?: number; remark?: string; status?: string; };
type User = { id: number; username: string; real_name: string; role: string; role_name_zh?: string; status: string; org_id: number | null };
type DictOption = { dict_code: string; dict_label_zh: string; dict_label_lo?: string; sort_no: number; };

export default function OrganizationsPage() {
  const toast = useToast();
  const { showConfirm } = useDialog();
  const { t } = useLanguage();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [orgTypes, setOrgTypes] = useState<DictOption[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Org | null>(null);
  const [form, setForm] = useState({ org_name: "", org_type: "", parent_id: 0, sort_no: 0, remark: "" });
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  // 分配人员抽屉
  const [assignDrawer, setAssignDrawer] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [assigning, setAssigning] = useState<number | null>(null); // userId 正在操作中
  const [assignScopeLevel, setAssignScopeLevel] = useState("COMPANY"); // 数据范围等级
  // userId → { userOrgId, dataScopeLevel } for current org
  const [userOrgMap, setUserOrgMap] = useState<Record<number, { userOrgId: number; dataScopeLevel: string }>>({});

  const SCOPE_LEVELS = [
    { value: "SELF",    label: "个人（SELF）" },
    { value: "PROJECT", label: "项目（PROJECT）" },
    { value: "COMPANY", label: "公司（COMPANY）" },
    { value: "REGION",  label: "区域（REGION）" },
    { value: "GROUP",   label: "集团（GROUP）" },
  ] as const;

  const loadUsers = async () => {
    try {
      const r = await fetch("/api/users", { headers: hdr() });
      const d = await r.json();
      const raw = Array.isArray(d.data) ? d.data : [];
      // /api/users 返回 real_name_zh，映射回 User.real_name
      const list: User[] = raw.map((u: any) => ({
        id:           u.id,
        username:     u.username,
        real_name:    u.real_name_zh || u.real_name || '',
        role:         u.role || '',
        role_name_zh: u.role_name_zh || '',
        status:       u.status || '',
        org_id:       u.org_id ?? null,
      }));
      setUsers(list);
    } catch { /* 静默 */ }
  };

  const load = async () => {
    try {
      const r  = await fetch("/api/crud/sys_orgs?limit=500", { headers: hdr() });
      const or = await r.json();
      if (!r.ok) {
        const msg = or?.message || or?.msg || `HTTP ${r.status}`;
        setLoadMsg(`❌ ${t("ui.加载失败","加载失败")}：${msg}`);
        return;
      }
      const orgList: Org[] = Array.isArray(or.data) ? or.data : Array.isArray(or) ? or : [];
      orgList.sort((a, b) => (a.sort_no ?? 0) - (b.sort_no ?? 0) || a.id - b.id);
      setOrgs(orgList);
      setLoadMsg(orgList.length === 0 ? t("ui.数据库暂无组织节点请新建第一个","数据库暂无组织节点，请新建第一个") : null);
      if (!activeId && orgList.length > 0) {
        const root = orgList.find((o: Org) => !o.parent_id || o.parent_id === 0);
        if (root) setActiveId(root.id);
      }
    } catch (e: any) {
      console.error("[orgs] load error:", e);
      setLoadMsg(`❌ ${t("ui.网络异常","网络异常")}：${e?.message || t("ui.请检查后端服务是否运行","请检查后端服务是否运行")}`);
    }
  };

  const loadDicts = async (): Promise<DictOption[]> => {
    try {
      const r = await fetch("/api/crud/sys_dict?dict_type=SYS_ORG_LEVEL&status=ACTIVE&limit=100", { headers: hdr() }).then(r => r.json());
      const list: DictOption[] = Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : [];
      list.sort((a, b) => (a.sort_no ?? 0) - (b.sort_no ?? 0));
      setOrgTypes(list);
      return list;
    } catch { return []; }
  };

  useEffect(() => { load(); loadDicts(); loadUsers(); }, []);

  // 打开新建（顶级）——先确保字典已加载
  const openNew = async () => {
    setEditing(null);
    const types = orgTypes.length > 0 ? orgTypes : await loadDicts();
    const defaultType = types[0]?.dict_label_zh ?? "";
    setForm({ org_name: "", org_type: defaultType, parent_id: 0, sort_no: 0, remark: "" });
    setDrawer(true);
  };

  // 在某节点下新建子节点
  const openAddChild = async (parentOrg: Org) => {
    setEditing(null);
    const types = orgTypes.length > 0 ? orgTypes : await loadDicts();
    // 默认选子级类型：如果有第二个则用第二个，否则用第一个
    const childType = types[1]?.dict_label_zh ?? types[0]?.dict_label_zh ?? "";
    setForm({ org_name: "", org_type: childType, parent_id: parentOrg.id, sort_no: 0, remark: "" });
    setDrawer(true);
  };

  const openEdit = async (org: Org) => {
    setEditing(org);
    // 先确保字典已加载，再设置 form，保证下拉框能正确回填
    const types = orgTypes.length > 0 ? orgTypes : await loadDicts();
    // 如果当前 org_type 不在字典中，则回退到第一个选项
    const validType = types.find(t => t.dict_label_zh === org.org_type)
      ? org.org_type
      : (types[0]?.dict_label_zh ?? org.org_type);
    setForm({ org_name: org.org_name, org_type: validType, parent_id: org.parent_id, sort_no: org.sort_no ?? 0, remark: org.remark ?? "" });
    setDrawer(true);
  };

  const handleSubmit = async () => {
    if (!form.org_name.trim()) { toast.error(t("ui.组织名称不能为空","组织名称不能为空")); return; }
    if (!form.org_type)        { toast.error(t("ui.请选择组织类型","请选择组织类型")); return; }
    setSaving(true);
    try {
      const payload = {
        org_name: form.org_name.trim(),
        org_type: form.org_type,
        parent_id: Number(form.parent_id) || 0,
        sort_no:   Number(form.sort_no)   || 0,
        remark:    form.remark,
        status:    "ACTIVE",
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const res = await fetch(`/api/crud/sys_orgs/id/${editing.id}`, { method: "PUT", headers: hdr(), body: JSON.stringify(payload) });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || err.msg || `${t("ui.更新失败","更新失败")} (HTTP ${res.status})`);
        }
        toast.success(t("ui.组织节点已更新","组织节点已更新"));
      } else {
        const res = await fetch("/api/crud/sys_orgs", { method: "POST", headers: hdr(), body: JSON.stringify(payload) });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || err.msg || `${t("ui.创建失败","创建失败")} (HTTP ${res.status})`);
        }
        toast.success(t("ui.组织节点已创建","组织节点已创建"));
      }
      setDrawer(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || t("ui.操作失败请检查后端服务","操作失败，请检查后端服务"));
    } finally { setSaving(false); }
  };

  const handleDelete = async (org: Org) => {
    if (orgs.some(o => o.parent_id === org.id)) {
      toast.error(t("ui.该节点有下属部门请先删除下属部门","该节点有下属部门，请先删除下属部门")); return;
    }
    const ok = await showConfirm({
      icon: "🗑️", type: "danger", title: t("ui.确认删除","确认删除"),
      message: `${t("ui.确认删除","确认删除")}【${org.org_name}】？`, confirmLabel: t("ui.确认删除","确认删除"),
    });
    if (!ok) return;
    await fetch(`/api/crud/sys_orgs/id/${org.id}`, { method: "DELETE", headers: hdr() });
    if (activeId === org.id) setActiveId(null);
    toast.success(t("ui.已删除","已删除")); load();
  };

  // 加载当前组织的 sys_user_orgs 记录（用于显示 dataScopeLevel）
  const loadUserOrgs = async (orgId: number, memberIds: number[]) => {
    if (!memberIds.length) return;
    try {
      const results = await Promise.all(
        memberIds.map(uid =>
          fetch(`/api/org/user-orgs/${uid}`, { headers: hdr() })
            .then(r => r.json())
            .then(d => ({ uid, rows: Array.isArray(d.data) ? d.data : [] }))
            .catch(() => ({ uid, rows: [] }))
        )
      );
      const map: Record<number, { userOrgId: number; dataScopeLevel: string }> = {};
      results.forEach(({ uid, rows }) => {
        const row = rows.find((r: any) => r.orgId === orgId || r.org_id === orgId);
        if (row) map[uid] = { userOrgId: row.id, dataScopeLevel: row.dataScopeLevel || row.data_scope_level || "COMPANY" };
      });
      setUserOrgMap(map);
    } catch { /* 静默 */ }
  };

  // 将用户分配到当前选中的组织
  const assignUser = async (userId: number) => {
    if (!activeId) return;
    setAssigning(userId);
    try {
      // 1. 保留旧字段 org_id（向后兼容）
      const res1 = await fetch(`/api/crud/sys_user/id/${userId}`, {
        method: "PUT", headers: hdr(),
        body: JSON.stringify({ org_id: activeId }),
      });
      if (!res1.ok) throw new Error(`HTTP ${res1.status}`);

      // 2. 写入 sys_user_orgs（含数据范围等级）
      const res2 = await fetch("/api/org/user-orgs", {
        method: "POST", headers: hdr(),
        body: JSON.stringify({
          userId, orgId: activeId,
          dataScopeLevel: assignScopeLevel,
          isPrimary: true,
        }),
      });
      if (res2.ok) {
        const d2 = await res2.json();
        if (d2.code === 200 && d2.data?.id) {
          setUserOrgMap(prev => ({
            ...prev,
            [userId]: { userOrgId: d2.data.id, dataScopeLevel: assignScopeLevel },
          }));
        }
      }

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, org_id: activeId } : u));
      toast.success(t("ui.已分配","已分配到") + "「" + activeOrg?.org_name + "」");
    } catch (e: any) {
      toast.error(e?.message || t("ui.操作失败","操作失败"));
    } finally { setAssigning(null); }
  };

  // 更新已在本组织的用户数据范围等级
  const updateUserScope = async (userId: number, dataScopeLevel: string) => {
    const entry = userOrgMap[userId];
    if (!entry) return;
    try {
      const res = await fetch(`/api/org/user-orgs/${entry.userOrgId}`, {
        method: "PUT", headers: hdr(),
        body: JSON.stringify({ dataScopeLevel }),
      });
      const d = await res.json();
      if (d.code === 200) {
        setUserOrgMap(prev => ({ ...prev, [userId]: { ...entry, dataScopeLevel } }));
        toast.success("数据范围已更新");
      }
    } catch { toast.error("更新失败"); }
  };

  // 从当前组织移除用户（清空 org_id）
  const removeUser = async (userId: number) => {
    setAssigning(userId);
    try {
      const res = await fetch(`/api/crud/sys_user/id/${userId}`, {
        method: "PUT", headers: hdr(),
        body: JSON.stringify({ org_id: null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // 同步删除 sys_user_orgs 记录
      const entry = userOrgMap[userId];
      if (entry) {
        await fetch(`/api/org/user-orgs/${entry.userOrgId}`, {
          method: "DELETE", headers: hdr(),
        }).catch(() => {/* 忽略 */});
        setUserOrgMap(prev => { const m = { ...prev }; delete m[userId]; return m; });
      }

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, org_id: null } : u));
      toast.success(t("ui.已移除","已从部门移除"));
    } catch (e: any) {
      toast.error(e?.message || t("ui.操作失败","操作失败"));
    } finally { setAssigning(null); }
  };

  const toggleCollapse = (id: number) => {
    setCollapsed(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  // 递归渲染组织树 (keyed)
  const buildTree = (parentId = 0, depth = 0): React.ReactNode => {
    const children = orgs.filter(o => (o.parent_id || 0) == parentId);
    if (!children.length) return null;
    return children.map((org, i) => {
      const isActive = activeId === org.id;
      const hasChildren = orgs.some(o => o.parent_id === org.id);
      const isCollapsed = collapsed.has(org.id);
      return (
        <div key={org.id ?? `tree-${depth}-${i}`}>
          <div
            onClick={() => setActiveId(org.id)}
            style={{
              paddingLeft: `${12 + depth * 18}px`, paddingRight: 8,
              paddingTop: 8, paddingBottom: 8,
              cursor: "pointer", borderRadius: "var(--radius-sm)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: isActive ? "rgba(var(--color-primary-rgb),0.08)" : "transparent",
              borderLeft: `3px solid ${isActive ? "var(--color-primary)" : "transparent"}`,
              color: isActive ? "var(--color-primary)" : "var(--text-primary)",
              fontWeight: isActive ? 700 : 400, transition: "all 0.15s",
            }}
          >
            {/* 左侧：展开/折叠 + 图标 + 名称 */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, minWidth: 0 }}>
              <span
                style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                onClick={e => { e.stopPropagation(); if (hasChildren) toggleCollapse(org.id); }}
              >
                {hasChildren
                  ? (isCollapsed ? <ChevronRight size={13}/> : <ChevronDown size={13}/>)
                  : <span style={{ width: 13 }}/>}
              </span>
              {org.org_type?.includes("店") ? <Store size={13} style={{ flexShrink: 0 }}/> : <Building size={13} style={{ flexShrink: 0 }}/>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{org.org_name}</span>
              <span style={{ fontSize: 10, color: "var(--text-secondary)", background: "var(--bg-page)", padding: "1px 5px", borderRadius: 4, border: "1px solid var(--border)", flexShrink: 0 }}>
                {org.org_type}
              </span>
            </div>

            {/* 右侧：操作按钮（hover 显示） */}
            <div className="org-row-actions" style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              <button
                type="button"
                title={t("ui.新建子节点","新建子节点")}
                onClick={e => { e.stopPropagation(); openAddChild(org); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, color: "var(--color-primary)" }}
              >
                <FolderPlus size={13}/>
              </button>
              <button
                type="button"
                title={t("common.edit","编辑")}
                onClick={e => { e.stopPropagation(); openEdit(org); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, color: "var(--text-secondary)" }}
              >
                <Edit3 size={13}/>
              </button>
              <button
                type="button"
                title={t("common.delete","删除")}
                onClick={e => { e.stopPropagation(); handleDelete(org); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, color: "#dc2626" }}
              >
                <Trash2 size={13}/>
              </button>
            </div>
          </div>
          {!isCollapsed && buildTree(org.id, depth + 1)}
        </div>
      );
    });
  };

  const safeOrgs  = Array.isArray(orgs)  ? orgs  : [];
  const safeUsers = Array.isArray(users) ? users : [];
  const activeOrg = safeOrgs.find(o => o.id === activeId);
  const members   = safeUsers.filter(u => u.org_id === activeId);
  const statusColor = (s: string) => s === "ACTIVE" || s === "1" || s === "active" ? "#22c55e" : "#ef4444";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("ui.组织架构管理","组织架构管理")}
        subtitle={t("ui.维护集团组织树结构与人员归属","维护集团组织树结构与人员归属")}
        breadcrumb={[t("ui.系统设置","系统设置"), t("ui.组织架构","组织架构")]}
        actions={
          <button type="button" onClick={openNew} style={btnPrimary}>
            <Plus size={15}/>{t("ui.新建组织节点","新建组织节点")}
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, minHeight: 560 }}>

        {/* ── 左：组织树 ───────────────────────────────── */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <Network size={16} color="var(--color-primary)"/>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{t("ui.组织树","组织树")}</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-secondary)" }}>{orgs.length} {t("ui.个节点","个节点")}</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {loadMsg && (
              <div style={{ margin: "8px 4px", padding: "8px 12px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
                background: loadMsg.startsWith("❌") ? "#fef2f2" : "#fffbeb",
                color: loadMsg.startsWith("❌") ? "#dc2626" : "#92400e",
                border: `1px solid ${loadMsg.startsWith("❌") ? "#fca5a5" : "#fcd34d"}` }}>
                {loadMsg}
              </div>
            )}
            {orgs.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", color: "var(--text-secondary)", textAlign: "center", gap: 12 }}>
                <Network size={36} style={{ opacity: 0.2 }}/>
                <div style={{ fontSize: 13 }}>{t("ui.暂无组织节点","暂无组织节点")}</div>
                <button type="button" onClick={openNew} style={{ ...btnPrimary, fontSize: 12, padding: "7px 14px" }}>
                  <Plus size={13}/>{t("ui.新建第一个节点","新建第一个节点")}
                </button>
              </div>
            ) : buildTree(0)}
          </div>
        </div>

        {/* ── 右：成员面板 ─────────────────────────────── */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {activeOrg ? (
            <>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                    <Building size={18} color="var(--color-primary)"/>
                    {activeOrg.org_name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {t("ui.类型","类型")}：{activeOrg.org_type} · {t("ui.编号","编号")}：NODE_{String(activeOrg.id).padStart(4, "0")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {/* ✅ 上下文「新建子节点」按钮 */}
                  <button type="button" onClick={() => openAddChild(activeOrg)} style={{ padding: "6px 12px", border: "1px solid var(--color-primary)", background: "rgba(var(--color-primary-rgb),0.06)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 12, color: "var(--color-primary)", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                    <FolderPlus size={13}/>{t("ui.新建子节点","新建子节点")}
                  </button>
                  <button type="button" onClick={() => openEdit(activeOrg)} style={{ padding: "6px 12px", border: "1px solid var(--border)", background: "var(--bg-page)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                    <Edit3 size={13}/>{t("ui.编辑节点","编辑节点")}
                  </button>
                  <button type="button" onClick={() => {
                    setAssignSearch(""); setAssignDrawer(true);
                    const memberIds = safeUsers.filter(u => u.org_id === activeId).map(u => u.id);
                    if (activeId) loadUserOrgs(activeId, memberIds);
                  }}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "6px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", background: "var(--bg-page)", color: "var(--text-primary)" }}>
                    <Users size={13}/>{t("ui.分配人员","分配人员")}
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, overflowX: "auto" }}>
                {members.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-secondary)", gap: 8 }}>
                    <Users size={32} style={{ opacity: 0.2 }}/>
                    <div style={{ fontSize: 13 }}>{t("ui.该部门暂无人员","该部门暂无人员")}</div>
                    <button type="button" onClick={() => { setAssignSearch(""); setAssignDrawer(true); }}
                      style={{ fontSize: 12, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {t("ui.点击分配人员","点击「分配人员」开始添加")} →
                    </button>
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        {[t("ui.姓名账号","姓名 / 账号"), t("ui.系统角色","系统角色"), t("ui.账号状态","账号状态")].map(h => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((u, i) => (
                        <tr key={u.id ?? `m-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ fontWeight: 700 }}>{u.real_name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace" }}>{u.username}</div>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ fontSize: 12, background: "rgba(99,102,241,0.1)", color: "#6366f1", padding: "3px 8px", borderRadius: 4, fontWeight: 600 }}>{u.role_name_zh || u.role}</span>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: statusColor(u.status) }}>● {statusColor(u.status) === "#22c55e" ? t("status.normal","正常") : t("ui.冻结","冻结")}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-secondary)", gap: 12, padding: 40 }}>
              <Network size={48} style={{ opacity: 0.15 }}/>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{t("ui.在左侧点击组织节点以查看详情","在左侧点击组织节点以查看详情")}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("ui.可展开折叠节点鼠标悬停显示操作按钮","可展开/折叠节点，鼠标悬停显示操作按钮")}</div>
            </div>
          )}
        </div>
      </div>

      {/* 编辑 / 新建 抽屉 */}
      <RightDrawer
        isOpen={drawer}
        onClose={() => setDrawer(false)}
        title={editing ? `${t("common.edit","编辑")}：${editing.org_name}` : (form.parent_id ? t("ui.新建子节点","新建子节点") : t("ui.新建顶级组织","新建顶级组织"))}
        width="440px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

          {/* 表单区 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
            {/* 组织名称 */}
            <div>
              <label style={lbl}>{t("ui.组织名称","组织名称")} <span style={{ color: "#dc2626" }}>*</span></label>
              <input
                style={inp}
                value={form.org_name}
                onChange={e => setForm(p => ({ ...p, org_name: e.target.value }))}
                placeholder={t("ui.例直营零售事业部","例：直营零售事业部")}
                autoFocus
                onFocus={e => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(31,56,100,0.08)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            {/* 组织类型 */}
            <div style={{ position: "relative" }}>
              <label style={{ ...lbl, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{t("ui.组织类型","组织类型")}</span>
                <a href="/settings/dict" target="_blank" style={{ fontSize: 11, color: "var(--color-primary)", fontWeight: 400 }}
                   title={t("ui.前往字典管理页维护SYS_ORG_LEVEL","前往字典管理页维护 SYS_ORG_LEVEL")}>
                  ＋ {t("ui.管理类型","管理类型")}
                </a>
              </label>
              <div style={{ position: "relative" }}>
                <select
                  style={{ ...inp, paddingRight: 32, cursor: "pointer" }}
                  value={form.org_type}
                  onChange={e => setForm(p => ({ ...p, org_type: e.target.value }))}
                >
                  {orgTypes.length === 0 && <option value="">{t("common.loading","加载中…")}</option>}
                  {/* value 存中文标签，与数据库 org_type 字段保持一致 */}
                  {orgTypes.map(t => (
                    <option key={t.dict_code} value={t.dict_label_zh}>
                      {t.dict_label_zh}
                    </option>
                  ))}
                </select>
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-secondary)", fontSize: 11 }}>▼</span>
              </div>
            </div>

            {/* 上级组织 */}
            <div>
              <label style={lbl}>{t("ui.上级组织","上级组织")}</label>
              <div style={{ position: "relative" }}>
                <select
                  style={{ ...inp, paddingRight: 32, cursor: "pointer" }}
                  value={form.parent_id}
                  onChange={e => setForm(p => ({ ...p, parent_id: Number(e.target.value) }))}
                >
                  <option value={0}>{t("ui.无顶级组织","无（顶级组织）")}</option>
                  {safeOrgs.filter(o => o.id !== editing?.id).map((o, i) => (
                    <option key={o.id ?? `o-${i}`} value={o.id}>[{o.org_type}] {o.org_name}</option>
                  ))}
                </select>
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-secondary)", fontSize: 11 }}>▼</span>
              </div>
              {form.parent_id > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                  <span>↳ {t("ui.上级","上级")}：</span>
                  <strong style={{ color: "var(--color-primary)" }}>
                    {safeOrgs.find(o => o.id === form.parent_id)?.org_name || "—"}
                  </strong>
                </div>
              )}
            </div>

            {/* 排序号 + 备注 并排 */}
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>{t("ui.排序号","排序号")}</label>
                <input
                  type="number"
                  style={inp}
                  value={form.sort_no}
                  min={0}
                  onChange={e => setForm(p => ({ ...p, sort_no: Number(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label style={lbl}>{t("common.remark","备注")}</label>
                <input
                  style={inp}
                  value={form.remark}
                  onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                  placeholder={t("ui.可选","可选")}
                />
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: "flex", gap: 10, paddingTop: 20 }}>
            <button
              type="button"
              onClick={() => setDrawer(false)}
              style={{ flex: 1, padding: "10px", background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-muted)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--bg-page)"}
            >
              {t("common.cancel","取消")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              style={{ flex: 2, padding: "10px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              {saving ? t("ui.保存中","保存中…") : editing ? t("common.save","保存修改") : t("ui.创建节点","创建节点")}
            </button>
          </div>
        </div>
      </RightDrawer>

      {/* ── 分配人员抽屉 ────────────────────────────────────── */}
      <RightDrawer
        isOpen={assignDrawer}
        onClose={() => setAssignDrawer(false)}
        title={`${t("ui.分配人员","分配人员")} — ${activeOrg?.org_name ?? ""}`}
        width="480px"
      >
        {(() => {
          const keyword = assignSearch.trim().toLowerCase();
          // 当前部门成员 + 全部用户（按 keyword 过滤）
          const filtered = safeUsers.filter(u =>
            !keyword ||
            u.real_name?.toLowerCase().includes(keyword) ||
            u.username?.toLowerCase().includes(keyword)
          );
          const inOrg  = filtered.filter(u => u.org_id === activeId);
          const others = filtered.filter(u => u.org_id !== activeId);

          const rowStyle: React.CSSProperties = {
            display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
            borderBottom: "1px solid var(--border)",
          };
          const avatarStyle = (inCurrent: boolean): React.CSSProperties => ({
            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
            background: inCurrent ? "rgba(var(--color-primary-rgb),0.12)" : "var(--bg-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700,
            color: inCurrent ? "var(--color-primary)" : "var(--text-secondary)",
          });

          const UserRow = ({ u, inCurrent }: { u: User; inCurrent: boolean }) => {
            const uorgEntry = userOrgMap[u.id];
            return (
              <div style={rowStyle}>
                <div style={avatarStyle(inCurrent)}>
                  {(u.real_name || u.username || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{u.real_name || "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    {u.username}
                    {u.org_id && u.org_id !== activeId && (
                      <span style={{ marginLeft: 6, color: "#f59e0b" }}>
                        · {t("ui.现属于","现属于")}：{safeOrgs.find(o => o.id === u.org_id)?.org_name ?? `#${u.org_id}`}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "rgba(99,102,241,0.1)", color: "#6366f1", fontWeight: 600, flexShrink: 0 }}>
                  {u.role_name_zh || u.role}
                </span>
                {/* 已在本组织：显示当前数据范围等级（可修改） */}
                {inCurrent && uorgEntry && (
                  <select
                    value={uorgEntry.dataScopeLevel}
                    onChange={e => updateUserScope(u.id, e.target.value)}
                    title="修改数据范围等级"
                    style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer", flexShrink: 0 }}
                  >
                    {SCOPE_LEVELS.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
                  </select>
                )}
                {inCurrent ? (
                  <button
                    type="button"
                    disabled={assigning === u.id}
                    onClick={() => removeUser(u.id)}
                    style={{ flexShrink: 0, padding: "4px 12px", fontSize: 12, border: "1px solid #fca5a5", borderRadius: 6, background: "#fef2f2", color: "#dc2626", cursor: assigning === u.id ? "not-allowed" : "pointer", fontWeight: 600 }}
                  >
                    {assigning === u.id ? "…" : t("ui.移除","移除")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={assigning === u.id}
                    onClick={() => assignUser(u.id)}
                    style={{ flexShrink: 0, padding: "4px 12px", fontSize: 12, border: "1px solid var(--color-primary)", borderRadius: 6, background: "rgba(var(--color-primary-rgb),0.06)", color: "var(--color-primary)", cursor: assigning === u.id ? "not-allowed" : "pointer", fontWeight: 600 }}
                  >
                    {assigning === u.id ? "…" : t("ui.分配","分配")}
                  </button>
                )}
              </div>
            );
          };

          return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              {/* 搜索框 */}
              <input
                style={{ ...inp, marginBottom: 10 }}
                placeholder={t("ui.搜索姓名或账号","搜索姓名或账号…")}
                value={assignSearch}
                onChange={e => setAssignSearch(e.target.value)}
                autoFocus
              />
              {/* 新分配时使用的数据范围等级 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "8px 12px", background: "var(--bg-muted)", borderRadius: 6, border: "1px solid var(--border)" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, flexShrink: 0 }}>分配范围等级：</span>
                <select
                  style={{ ...inp, padding: "5px 8px", fontSize: 12, flex: 1 }}
                  value={assignScopeLevel}
                  onChange={e => setAssignScopeLevel(e.target.value)}
                >
                  {SCOPE_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div style={{ flex: 1, overflowY: "auto" }}>
                {/* 当前部门成员 */}
                {inOrg.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.06em", padding: "4px 0 8px", textTransform: "uppercase" }}>
                      {t("ui.当前部门成员","当前部门成员")} ({inOrg.length})
                    </div>
                    {inOrg.map((u, i) => <UserRow key={u.id ?? `in-${i}`} u={u} inCurrent />)}
                    <div style={{ height: 16 }} />
                  </>
                )}

                {/* 其他用户 */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.06em", padding: "4px 0 8px", textTransform: "uppercase" }}>
                  {t("ui.其他用户","其他用户")} ({others.length})
                </div>
                {others.length === 0 && (
                  <div style={{ color: "var(--text-secondary)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                    {keyword ? t("ui.无匹配结果","无匹配结果") : t("ui.所有用户均已在此部门","所有用户均已在此部门")}
                  </div>
                )}
                {others.map((u, i) => <UserRow key={u.id ?? `oth-${i}`} u={u} inCurrent={false} />)}
              </div>
            </div>
          );
        })()}
      </RightDrawer>

      <style>{`
        .org-row-actions { opacity: 0; transition: opacity 0.15s; }
        [style*="display: flex"][style*="justify-content: space-between"]:hover .org-row-actions { opacity: 1; }
      `}</style>
    </div>
  );
}

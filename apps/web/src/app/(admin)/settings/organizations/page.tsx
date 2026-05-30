"use client";
/**
 * 设置 — 组织架构管理
 * =====================
 * 已完全迁移至新版 API：
 *   · 组织 CRUD：GET/POST/PUT/DELETE /api/org/organizations
 *   · 成员列表：GET /api/org/organizations/:orgId/members
 *   · 用户分配：POST /api/org/user-orgs
 *   · 数据范围更新：PUT /api/org/user-orgs/:id
 *   · 移除成员：DELETE /api/org/user-orgs/:id
 *
 * 已废弃（已删除）：
 *   · /api/crud/sys_orgs（旧表 sys_orgs 已迁移并删除）
 *   · sys_user.org_id 字段（成员关系全部通过 sys_user_orgs 管理）
 */
import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import RightDrawer from "@/components/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useDialog } from "@/contexts/DialogContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Network, Plus, Users, Edit3, Trash2, Building, Store,
  ChevronRight, ChevronDown, FolderPlus, RefreshCw, Inbox,
} from "lucide-react";

// ── Token ────────────────────────────────────────────────────────────────────
const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

// ── 组织类型枚举（与 sys_organizations.org_type CHECK 约束对应）─────────────
const ORG_TYPES = [
  { value: "GROUP",      label: "集团",   icon: "🏛️" },
  { value: "COMPANY",    label: "公司",   icon: "🏢" },
  { value: "FACTORY",    label: "工厂/农场", icon: "🏭" },
  { value: "PROJECT",    label: "项目",   icon: "📋" },
  { value: "WAREHOUSE",  label: "仓库",   icon: "🏪" },
  { value: "STORE",      label: "门店",   icon: "🏬" },
  { value: "DEPARTMENT", label: "部门",   icon: "👥" },
] as const;

type OrgTypeValue = typeof ORG_TYPES[number]["value"];

// ── 数据范围等级 ──────────────────────────────────────────────────────────────
const SCOPE_LEVELS = [
  { value: "SELF",    label: "个人" },
  { value: "PROJECT", label: "项目" },
  { value: "COMPANY", label: "公司" },
  { value: "REGION",  label: "区域" },
  { value: "GROUP",   label: "集团" },
] as const;

// ── 类型定义 ──────────────────────────────────────────────────────────────────
interface Org {
  id:           number;
  orgCode:      string;
  orgName:      string;
  orgType:      OrgTypeValue;
  parentId:     number | null;
  level:        number;
  path:         string | null;
  status:       string;
  companyCode:  string | null;
  projectCode:  string | null;
  warehouseCode:string | null;
  remark:       string | null;
  managerUserId:number | null;
  managerName:  string | null;
}

interface OrgMember {
  userOrgId:      number;
  isPrimary:      boolean;
  dataScopeLevel: string;
  id:             number;
  username:       string;
  realNameZh:     string;
  role:           string;
  roleNameZh:     string;
  userStatus:     string | number;
}

interface AllUser {
  id:          number;
  username:    string;
  realNameZh:  string;
  role:        string;
  roleNameZh:  string;
  status:      string | number;
}

const emptyForm = (): {
  orgCode: string; orgName: string; orgType: OrgTypeValue;
  parentId: number | null; companyCode: string; managerName: string;
  remark: string;
} => ({
  orgCode: "", orgName: "", orgType: "DEPARTMENT",
  parentId: null, companyCode: "", managerName: "", remark: "",
});

// ── 样式常量 ─────────────────────────────────────────────────────────────────
const INP = "w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-page text-text outline-none focus:border-brand/50 transition-colors";
const LBL = "block text-xs font-semibold text-text-muted mb-1.5";

export default function OrganizationsPage() {
  const toast        = useToast();
  const { showConfirm } = useDialog();
  const { t }        = useLanguage();

  const [orgs,      setOrgs]      = useState<Org[]>([]);
  const [members,   setMembers]   = useState<OrgMember[]>([]);
  const [allUsers,  setAllUsers]  = useState<AllUser[]>([]);
  const [activeId,  setActiveId]  = useState<number | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // 折叠状态
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  // 编辑抽屉
  const [drawer,    setDrawer]    = useState(false);
  const [editing,   setEditing]   = useState<Org | null>(null);
  const [form,      setForm]      = useState(emptyForm());
  const [saving,    setSaving]    = useState(false);

  // 分配人员抽屉
  const [assignDrawer,  setAssignDrawer]  = useState(false);
  const [assignSearch,  setAssignSearch]  = useState("");
  const [assignScope,   setAssignScope]   = useState<string>("COMPANY");
  const [assigning,     setAssigning]     = useState<number | null>(null);

  // ── 加载 ──────────────────────────────────────────────────────────────────

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/org/organizations", { headers: hdr() });
      const json = await res.json();
      if (json.code === 200) {
        const list: Org[] = json.data ?? [];
        list.sort((a, b) => a.level - b.level || (a.orgCode ?? "").localeCompare(b.orgCode ?? ""));
        setOrgs(list);
        if (!activeId && list.length > 0) {
          setActiveId(list.find(o => !o.parentId)?.id ?? list[0].id);
        }
      }
    } catch (e: unknown) {
      toast.error("加载组织失败：" + (e instanceof Error ? e.message : "网络错误"));
    } finally {
      setLoading(false);
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMembers = useCallback(async (orgId: number) => {
    setLoadingMembers(true);
    try {
      const res  = await fetch(`/api/org/organizations/${orgId}/members`, { headers: hdr() });
      const json = await res.json();
      if (json.code === 200) {
        setMembers((json.data ?? []).map((r: Record<string, unknown>) => ({
          userOrgId:      r.user_org_id ?? r.userOrgId,
          isPrimary:      r.is_primary  ?? r.isPrimary,
          dataScopeLevel: String(r.data_scope_level ?? r.dataScopeLevel ?? "COMPANY"),
          id:             r.id,
          username:       r.username,
          realNameZh:     r.real_name_zh ?? r.realNameZh ?? "",
          role:           r.role ?? "",
          roleNameZh:     r.role_name_zh ?? r.roleNameZh ?? "",
          userStatus:     r.user_status  ?? r.userStatus ?? "ACTIVE",
        })));
      }
    } finally { setLoadingMembers(false); }
  }, []);

  const loadAllUsers = useCallback(async () => {
    try {
      const res  = await fetch("/api/users", { headers: hdr() });
      const json = await res.json();
      setAllUsers((Array.isArray(json.data) ? json.data : []).map((u: Record<string, unknown>) => ({
        id:         u.id,
        username:   u.username,
        realNameZh: u.real_name_zh ?? u.real_name ?? "",
        role:       u.role ?? "",
        roleNameZh: u.role_name_zh ?? "",
        status:     u.status ?? "ACTIVE",
      })));
    } catch { /* 静默 */ }
  }, []);

  useEffect(() => { loadOrgs(); loadAllUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeId) loadMembers(activeId);
    else setMembers([]);
  }, [activeId, loadMembers]);

  // ── 组织 CRUD ─────────────────────────────────────────────────────────────

  const openNew = (parentOrg?: Org) => {
    setEditing(null);
    setForm({ ...emptyForm(), parentId: parentOrg?.id ?? null });
    setDrawer(true);
  };

  const openEdit = (org: Org) => {
    setEditing(org);
    setForm({
      orgCode:     org.orgCode,
      orgName:     org.orgName,
      orgType:     org.orgType,
      parentId:    org.parentId,
      companyCode: org.companyCode ?? "",
      managerName: org.managerName ?? "",
      remark:      org.remark ?? "",
    });
    setDrawer(true);
  };

  const handleSubmit = async () => {
    if (!form.orgName.trim()) { toast.error("组织名称不能为空"); return; }
    if (!form.orgCode.trim() && !editing) { toast.error("组织编码不能为空"); return; }
    setSaving(true);
    try {
      const body = {
        orgCode:     form.orgCode.trim() || undefined,
        orgName:     form.orgName.trim(),
        orgType:     form.orgType,
        parentId:    form.parentId || undefined,
        companyCode: form.companyCode || undefined,
        managerName: form.managerName || undefined,
        remark:      form.remark || undefined,
      };
      const url    = editing ? `/api/org/organizations/${editing.id}` : "/api/org/organizations";
      const method = editing ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: hdr(), body: JSON.stringify(body) });
      const json   = await res.json();
      if (json.code === 200) {
        toast.success(editing ? "组织节点已更新" : "组织节点已创建");
        setDrawer(false);
        await loadOrgs();
      } else {
        throw new Error(json.message ?? json.msg ?? `HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : "操作失败"));
    } finally { setSaving(false); }
  };

  const handleDelete = async (org: Org) => {
    if (orgs.some(o => o.parentId === org.id)) {
      toast.error("该节点有下属部门，请先删除下属部门"); return;
    }
    const ok = await showConfirm({
      icon: "🗑️", type: "danger", title: "确认删除",
      message: `确认删除【${org.orgName}】？此操作不可恢复。`,
      confirmLabel: "确认删除",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/org/organizations/${org.id}`, { method: "DELETE", headers: hdr() });
      const json = await res.json();
      if (json.code === 200 || res.ok) {
        if (activeId === org.id) setActiveId(null);
        toast.success("已删除");
        await loadOrgs();
      } else {
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  // ── 人员管理 ──────────────────────────────────────────────────────────────

  const assignUser = async (userId: number) => {
    if (!activeId) return;
    setAssigning(userId);
    try {
      const res  = await fetch("/api/org/user-orgs", {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ userId, orgId: activeId, dataScopeLevel: assignScope, isPrimary: false }),
      });
      const json = await res.json();
      if (json.code === 200) {
        toast.success("已分配至「" + activeOrg?.orgName + "」");
        await loadMembers(activeId);
      } else {
        throw new Error(json.message ?? "分配失败");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally { setAssigning(null); }
  };

  const updateScope = async (member: OrgMember, dataScopeLevel: string) => {
    try {
      const res  = await fetch(`/api/org/user-orgs/${member.userOrgId}`, {
        method: "PUT", headers: hdr(), body: JSON.stringify({ dataScopeLevel }),
      });
      const json = await res.json();
      if (json.code === 200) {
        setMembers(prev => prev.map(m => m.userOrgId === member.userOrgId ? { ...m, dataScopeLevel } : m));
      }
    } catch { toast.error("更新失败"); }
  };

  const removeUser = async (member: OrgMember) => {
    setAssigning(member.id);
    try {
      await fetch(`/api/org/user-orgs/${member.userOrgId}`, { method: "DELETE", headers: hdr() });
      toast.success("已从部门移除");
      if (activeId) await loadMembers(activeId);
    } catch { toast.error("操作失败"); }
    finally { setAssigning(null); }
  };

  // ── 工具 ──────────────────────────────────────────────────────────────────

  const toggleCollapse = (id: number) =>
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const orgTypeLabel = (v: string) => ORG_TYPES.find(t => t.value === v)?.label ?? v;
  const orgTypeIcon  = (v: string) => ORG_TYPES.find(t => t.value === v)?.icon ?? "🏢";

  // ── 组织树渲染 ──────────────────────────────────────────────────────────────
  const buildTree = (parentId: number | null = null, depth = 0): React.ReactNode => {
    const children = orgs.filter(o => (o.parentId ?? null) === parentId);
    if (!children.length) return null;
    return children.map(org => {
      const isActive     = activeId === org.id;
      const hasChildren  = orgs.some(o => o.parentId === org.id);
      const isCollapsed  = collapsed.has(org.id);
      return (
        <div key={org.id}>
          <div
            onClick={() => setActiveId(org.id)}
            className={cn(
              "flex items-center justify-between py-2 pr-2 cursor-pointer rounded-lg transition-all group",
              isActive ? "bg-brand/8 border-l-2 border-brand text-brand font-semibold" : "hover:bg-bg-muted/50 border-l-2 border-transparent text-text",
            )}
            style={{ paddingLeft: `${12 + depth * 18}px` }}
          >
            {/* 左侧：折叠 + 图标 + 名称 + 类型徽章 */}
            <div className="flex items-center gap-1.5 min-w-0 text-sm">
              <span
                className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-text-dim"
                onClick={e => { e.stopPropagation(); if (hasChildren) toggleCollapse(org.id); }}
              >
                {hasChildren
                  ? (isCollapsed ? <ChevronRight size={12}/> : <ChevronDown size={12}/>)
                  : null}
              </span>
              <span className="flex-shrink-0 text-base leading-none">
                {org.orgType?.includes("STORE") ? <Store size={13}/> : <Building size={13}/>}
              </span>
              <span className="truncate">{org.orgName}</span>
              <span className={cn(
                "flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border",
                isActive
                  ? "bg-brand/10 text-brand border-brand/20"
                  : "bg-bg-muted text-text-dim border-border",
              )}>
                {orgTypeLabel(org.orgType)}
              </span>
            </div>

            {/* 右侧：操作按钮（hover 显示） */}
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button type="button" title="新建子节点"
                onClick={e => { e.stopPropagation(); openNew(org); }}
                className="p-1 rounded text-brand hover:bg-brand/10 transition-colors">
                <FolderPlus size={12}/>
              </button>
              <button type="button" title="编辑"
                onClick={e => { e.stopPropagation(); openEdit(org); }}
                className="p-1 rounded text-text-muted hover:bg-bg-muted transition-colors">
                <Edit3 size={12}/>
              </button>
              <button type="button" title="删除"
                onClick={e => { e.stopPropagation(); handleDelete(org); }}
                className="p-1 rounded text-danger hover:bg-danger/10 transition-colors">
                <Trash2 size={12}/>
              </button>
            </div>
          </div>
          {!isCollapsed && buildTree(org.id, depth + 1)}
        </div>
      );
    });
  };

  const activeOrg     = orgs.find(o => o.id === activeId);
  const memberUserIds = new Set(members.map(m => m.id));
  const otherUsers    = allUsers.filter(u => !memberUserIds.has(u.id));

  // ── 渲染 ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="组织架构管理"
        subtitle="维护集团组织树结构与人员归属"
        breadcrumb={["系统设置", "组织架构"]}
        actions={
          <button type="button" onClick={() => openNew()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-brand text-white hover:opacity-90 transition-opacity">
            <Plus size={14}/> 新建组织节点
          </button>
        }
      />

      <div className="grid gap-5" style={{ gridTemplateColumns: "280px 1fr", minHeight: 560 }}>

        {/* ── 左：组织树 ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-bg-card shadow-card flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Network size={15} className="text-brand flex-shrink-0"/>
            <span className="font-semibold text-sm text-text">组织树</span>
            <span className="ml-auto text-xs text-text-dim">{orgs.length} 个节点</span>
            <button onClick={() => { loadOrgs(); }} title="刷新"
              className="p-1 rounded text-text-dim hover:bg-bg-muted transition-colors">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""}/>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex flex-col gap-2 p-4">
                {[1,2,3].map(i => (
                  <div key={i} className="h-8 rounded-lg bg-bg-muted animate-pulse" style={{ marginLeft: i === 2 ? 18 : 0 }}/>
                ))}
              </div>
            ) : orgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-dim">
                <Inbox size={32} className="opacity-30"/>
                <div className="text-sm">暂无组织节点</div>
                <button onClick={() => openNew()}
                  className="text-xs text-brand hover:underline">+ 新建第一个节点</button>
              </div>
            ) : buildTree()}
          </div>
        </div>

        {/* ── 右：成员面板 ────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-bg-card shadow-card flex flex-col overflow-hidden">
          {activeOrg ? (
            <>
              {/* 面板 Header */}
              <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{orgTypeIcon(activeOrg.orgType)}</span>
                    <h2 className="text-base font-bold text-text">{activeOrg.orgName}</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                      {orgTypeLabel(activeOrg.orgType)}
                    </span>
                  </div>
                  <div className="text-xs text-text-dim">
                    编码：{activeOrg.orgCode} · 层级：L{activeOrg.level}
                    {activeOrg.companyCode && ` · 公司：${activeOrg.companyCode}`}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openNew(activeOrg)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-brand/30 text-brand bg-brand/5 hover:bg-brand/10 transition-colors">
                    <FolderPlus size={12}/> 新建子节点
                  </button>
                  <button onClick={() => openEdit(activeOrg)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-text-muted bg-bg-page hover:bg-bg-muted transition-colors">
                    <Edit3 size={12}/> 编辑
                  </button>
                  <button onClick={() => { setAssignSearch(""); setAssignDrawer(true); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-text-muted bg-bg-page hover:bg-bg-muted transition-colors">
                    <Users size={12}/> 分配人员
                  </button>
                </div>
              </div>

              {/* 成员表格 */}
              <div className="flex-1 overflow-x-auto">
                {loadingMembers ? (
                  <div className="flex items-center justify-center py-12 text-text-dim text-sm gap-2">
                    <RefreshCw size={14} className="animate-spin"/> 加载成员中…
                  </div>
                ) : members.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-text-dim gap-3">
                    <Users size={28} className="opacity-20"/>
                    <div className="text-sm">该组织暂无成员</div>
                    <button onClick={() => { setAssignSearch(""); setAssignDrawer(true); }}
                      className="text-xs text-brand hover:underline">点击「分配人员」添加 →</button>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-bg-muted/40">
                        {["姓名 / 账号", "系统角色", "数据范围", "账号状态", "操作"].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m, i) => (
                        <tr key={m.userOrgId} className={cn(
                          "border-b border-border/30 hover:bg-bg-muted/20 transition-colors",
                          i === members.length - 1 ? "border-b-0" : "",
                        )}>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-text">{m.realNameZh || "—"}</div>
                            <div className="text-xs font-mono text-text-dim">{m.username}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand/10 text-brand border border-brand/20">
                              {m.roleNameZh || m.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={m.dataScopeLevel}
                              onChange={e => updateScope(m, e.target.value)}
                              className="text-xs px-2 py-1 rounded-lg border border-border bg-bg-page text-text-muted cursor-pointer"
                            >
                              {SCOPE_LEVELS.map(s => (
                                <option key={s.value} value={s.value}>{s.label}（{s.value}）</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "text-xs font-semibold",
                              String(m.userStatus) === "1" || m.userStatus === "ACTIVE" ? "text-success" : "text-danger",
                            )}>
                              ● {String(m.userStatus) === "1" || m.userStatus === "ACTIVE" ? "正常" : "冻结"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => removeUser(m)}
                              disabled={assigning === m.id}
                              className="text-xs px-2.5 py-1 rounded-lg border border-danger/30 text-danger bg-danger/5 hover:bg-danger/10 disabled:opacity-50 transition-colors"
                            >
                              {assigning === m.id ? "…" : "移除"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-text-dim p-10">
              <Network size={48} className="opacity-15"/>
              <div className="text-sm font-medium text-text-muted">在左侧点击组织节点以查看详情</div>
              <div className="text-xs">可展开/折叠节点，鼠标悬停显示操作按钮</div>
            </div>
          )}
        </div>
      </div>

      {/* ── 编辑 / 新建抽屉 ─────────────────────────────────────────── */}
      <RightDrawer
        isOpen={drawer}
        onClose={() => setDrawer(false)}
        title={editing ? `编辑：${editing.orgName}` : (form.parentId ? "新建子节点" : "新建顶级组织")}
        width="440px"
      >
        <div className="flex flex-col gap-4">
          {/* 组织名称 */}
          <div>
            <label className={LBL}>组织名称 <span className="text-danger">*</span></label>
            <input className={INP} value={form.orgName} autoFocus
              onChange={e => setForm(p => ({ ...p, orgName: e.target.value }))}
              placeholder="例：直营零售事业部"/>
          </div>

          {/* 组织编码（仅新建时必填，编辑时只读） */}
          <div>
            <label className={LBL}>
              组织编码 {!editing && <span className="text-danger">*</span>}
              {editing && <span className="font-normal text-text-dim ml-1">（创建后不可修改）</span>}
            </label>
            <input className={cn(INP, editing ? "opacity-50 cursor-not-allowed" : "")}
              value={form.orgCode} readOnly={!!editing}
              onChange={e => setForm(p => ({ ...p, orgCode: e.target.value.toUpperCase() }))}
              placeholder="如 CO-FHA（字母数字连字符）"/>
          </div>

          {/* 组织类型 */}
          <div>
            <label className={LBL}>组织类型 <span className="text-danger">*</span></label>
            <select className={INP}
              value={form.orgType}
              onChange={e => setForm(p => ({ ...p, orgType: e.target.value as OrgTypeValue }))}>
              {ORG_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>

          {/* 上级组织 */}
          <div>
            <label className={LBL}>上级组织</label>
            <select className={INP}
              value={form.parentId ?? ""}
              onChange={e => setForm(p => ({ ...p, parentId: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">无（顶级组织）</option>
              {orgs.filter(o => o.id !== editing?.id).map(o => (
                <option key={o.id} value={o.id}>
                  {"　".repeat(o.level - 1)}{orgTypeLabel(o.orgType)}· {o.orgName}
                </option>
              ))}
            </select>
          </div>

          {/* 关联公司编码 */}
          <div>
            <label className={LBL}>关联公司编码（可选）</label>
            <input className={INP} value={form.companyCode}
              onChange={e => setForm(p => ({ ...p, companyCode: e.target.value }))}
              placeholder="如 CO-FHA，用于数据范围过滤"/>
          </div>

          {/* 负责人 */}
          <div>
            <label className={LBL}>负责人姓名（可选）</label>
            <input className={INP} value={form.managerName}
              onChange={e => setForm(p => ({ ...p, managerName: e.target.value }))}
              placeholder="用于审批路由中「直属上级」解析"/>
          </div>

          {/* 备注 */}
          <div>
            <label className={LBL}>备注</label>
            <input className={INP} value={form.remark}
              onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
              placeholder="可选"/>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-2 border-t border-border">
            <button type="button" onClick={() => setDrawer(false)}
              className="flex-1 py-2.5 text-sm rounded-lg border border-border text-text-muted bg-bg-page hover:bg-bg-muted transition-colors">
              取消
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="flex-[2] py-2.5 text-sm font-semibold rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-60 transition-opacity">
              {saving ? "保存中…" : editing ? "保存修改" : "创建节点"}
            </button>
          </div>
        </div>
      </RightDrawer>

      {/* ── 分配人员抽屉 ─────────────────────────────────────────────── */}
      <RightDrawer
        isOpen={assignDrawer}
        onClose={() => setAssignDrawer(false)}
        title={`分配人员 — ${activeOrg?.orgName ?? ""}`}
        width="460px"
      >
        <div className="flex flex-col h-full gap-3">
          {/* 搜索 */}
          <input className={INP} placeholder="搜索姓名或账号…" autoFocus
            value={assignSearch} onChange={e => setAssignSearch(e.target.value)}/>

          {/* 新分配的数据范围等级 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-muted border border-border text-sm">
            <span className="text-text-muted font-medium flex-shrink-0">新分配范围：</span>
            <select className="flex-1 bg-transparent text-text text-sm outline-none"
              value={assignScope} onChange={e => setAssignScope(e.target.value)}>
              {SCOPE_LEVELS.map(s => (
                <option key={s.value} value={s.value}>{s.label}（{s.value}）</option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {/* 当前成员 */}
            {members.filter(m => {
              const kw = assignSearch.toLowerCase();
              return !kw || m.realNameZh.toLowerCase().includes(kw) || m.username.toLowerCase().includes(kw);
            }).length > 0 && (
              <>
                <div className="text-[10px] font-bold text-text-dim tracking-widest uppercase py-2">
                  当前成员 ({members.length})
                </div>
                {members.filter(m => {
                  const kw = assignSearch.toLowerCase();
                  return !kw || m.realNameZh.toLowerCase().includes(kw) || m.username.toLowerCase().includes(kw);
                }).map(m => (
                  <div key={m.userOrgId} className="flex items-center gap-3 py-2.5 border-b border-border/40">
                    <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-sm font-bold text-brand flex-shrink-0">
                      {(m.realNameZh || m.username || "?")[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text">{m.realNameZh}</div>
                      <div className="text-xs font-mono text-text-dim">{m.username}</div>
                    </div>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                      {m.roleNameZh || m.role}
                    </span>
                    <button onClick={() => removeUser(m)} disabled={assigning === m.id}
                      className="text-xs px-2.5 py-1 rounded-lg border border-danger/30 text-danger bg-danger/5 hover:bg-danger/10 disabled:opacity-50">
                      {assigning === m.id ? "…" : "移除"}
                    </button>
                  </div>
                ))}
                <div className="h-4"/>
              </>
            )}

            {/* 可分配用户 */}
            <div className="text-[10px] font-bold text-text-dim tracking-widest uppercase py-2">
              其他用户
            </div>
            {otherUsers.filter(u => {
              const kw = assignSearch.toLowerCase();
              return !kw || u.realNameZh.toLowerCase().includes(kw) || u.username.toLowerCase().includes(kw);
            }).map(u => (
              <div key={u.id} className="flex items-center gap-3 py-2.5 border-b border-border/40">
                <div className="w-8 h-8 rounded-full bg-bg-muted flex items-center justify-center text-sm font-bold text-text-muted flex-shrink-0">
                  {(u.realNameZh || u.username || "?")[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text">{u.realNameZh}</div>
                  <div className="text-xs font-mono text-text-dim">{u.username}</div>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded bg-bg-muted text-text-muted border border-border">
                  {u.roleNameZh || u.role}
                </span>
                <button onClick={() => assignUser(u.id)} disabled={assigning === u.id}
                  className="text-xs px-2.5 py-1 rounded-lg border border-brand/30 text-brand bg-brand/5 hover:bg-brand/10 disabled:opacity-50">
                  {assigning === u.id ? "…" : "分配"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}

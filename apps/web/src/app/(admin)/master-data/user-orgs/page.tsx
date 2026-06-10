"use client";
/**
 * 主数据中心 — 用户组织权限管理
 * ====================================
 * Phase 1：以用户为中心视角管理其所属组织及数据范围
 *
 * API：
 *   GET  /api/users                      — 获取全部用户列表
 *   GET  /api/org/user-orgs/:userId       — 获取该用户绑定的组织列表
 *   GET  /api/organizations/tree          — 加载组织树（用于新增绑定下拉框）
 *   POST /api/org/user-orgs               — 新增用户-组织绑定
 *   PUT  /api/org/user-orgs/:id           — 更新数据范围等级 / 主组织标记
 *   DELETE /api/org/user-orgs/:id         — 移除绑定
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users, Search, RefreshCw, Building2, Shield, Star,
  StarOff, Trash2, Plus, Inbox, ChevronRight,
  UserCheck, AlertCircle,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import { SearchInput, SelectField, Panel } from "@/components/design-system";

// ── Auth helper ──────────────────────────────────────────────────────────────
const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") ||
      localStorage.getItem("phoenix_token") ||
      ""
    : "";
const hdr = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${tok()}`,
});

// ── 常量 ────────────────────────────────────────────────────────────────────

const SCOPE_LEVELS = [
  { value: "SELF",    label: "个人",  desc: "仅本人数据" },
  { value: "PROJECT", label: "项目",  desc: "所属项目数据" },
  { value: "COMPANY", label: "公司",  desc: "所属公司数据" },
  { value: "REGION",  label: "区域",  desc: "区域汇总数据" },
  { value: "GROUP",   label: "集团",  desc: "全集团数据" },
] as const;

type ScopeLevel = typeof SCOPE_LEVELS[number]["value"];

const SCOPE_COLOR: Record<ScopeLevel, string> = {
  SELF:    "text-text-dim   bg-bg-muted    border-border",
  PROJECT: "text-info       bg-info/10     border-info/20",
  COMPANY: "text-brand      bg-brand/10    border-brand/20",
  REGION:  "text-warning    bg-warning/10  border-warning/20",
  GROUP:   "text-danger     bg-danger/10   border-danger/20",
};

const ORG_TYPE_LABEL: Record<string, string> = {
  GROUP:      "集团",
  COMPANY:    "公司",
  FACTORY:    "工厂",
  FARM:       "农场",
  PROJECT:    "项目",
  WAREHOUSE:  "仓库",
  STORE:      "门店",
  DEPARTMENT: "部门",
  DEPT:       "部门",
  OTHER:      "其他",
};

// ── 类型定义 ─────────────────────────────────────────────────────────────────

interface UserItem {
  id:          number;
  username:    string;
  realNameZh:  string;
  role:        string;
  roleNameZh?: string;
  status:      string | number;
}

interface UserOrg {
  id:             number;   // sys_user_orgs.id
  orgId:          number;
  orgCode:        string;
  orgName:        string;
  orgType:        string;
  isPrimary:      boolean;
  dataScopeLevel: ScopeLevel;
  level:          number;
  companyCode:    string | null;
  projectCode:    string | null;
}

interface OrgTreeNode {
  id:       number;
  orgCode:  string;
  orgName:  string;
  orgType:  string;
  level:    number;
  parentId: number | null;
  children?: OrgTreeNode[];
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────

/** 将平铺 org 列表打平为带缩进的 select 选项 */
function flattenTree(
  nodes: OrgTreeNode[],
  depth = 0,
  result: { id: number; label: string; orgName: string }[] = [],
): typeof result {
  for (const n of nodes) {
    result.push({
      id:      n.id,
      label:   "　".repeat(depth) + (ORG_TYPE_LABEL[n.orgType] ?? "?") + "· " + n.orgName,
      orgName: n.orgName,
    });
    if (n.children?.length) flattenTree(n.children, depth + 1, result);
  }
  return result;
}

// ── 样式常量 ─────────────────────────────────────────────────────────────────
const INP = cn(
  "w-full px-3 py-2 text-sm rounded-lg border border-border",
  "bg-bg-page text-text outline-none focus:border-brand/50 transition-colors",
);

// ════════════════════════════════════════════════════════════════════════════
export default function UserOrgsPage() {
  const { canView, canCreate, canEdit, canDelete } =
    usePermission("MENU_SYS_ORG");
  const toast = useToast();

  // ── 用户列表 ──────────────────────────────────────────────────────────────
  const [users,        setUsers]        = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError,   setUsersError]   = useState("");
  const [search,       setSearch]       = useState("");
  const [roleFilter,   setRoleFilter]   = useState("");
  const [activeUser,   setActiveUser]   = useState<UserItem | null>(null);

  // ── 用户组织绑定列表 ───────────────────────────────────────────────────────
  const [userOrgs,        setUserOrgs]        = useState<UserOrg[]>([]);
  const [userOrgsLoading, setUserOrgsLoading] = useState(false);

  // ── 组织树（新增绑定用） ──────────────────────────────────────────────────
  const [orgTree,      setOrgTree]      = useState<OrgTreeNode[]>([]);
  const [orgFlat,      setOrgFlat]      = useState<{ id: number; label: string; orgName: string }[]>([]);

  // ── 新增绑定表单 ──────────────────────────────────────────────────────────
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [addOrgId,     setAddOrgId]     = useState<number | "">("");
  const [addScope,     setAddScope]     = useState<ScopeLevel>("COMPANY");
  const [addPrimary,   setAddPrimary]   = useState(false);
  const [adding,       setAdding]       = useState(false);

  // ── 操作中状态 ────────────────────────────────────────────────────────────
  const [mutatingId,   setMutatingId]   = useState<number | null>(null);

  // ── 加载用户列表 ──────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const res  = await fetch("/api/users", { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const arr: UserItem[] = (
        Array.isArray(json) ? json : (json.data ?? json.users ?? [])
      ).map((u: Record<string, unknown>) => ({
        id:         Number(u.id ?? u.user_id),
        username:   String(u.username ?? ""),
        realNameZh: String(u.real_name_zh ?? u.real_name ?? u.realName ?? ""),
        role:       String(u.role ?? ""),
        roleNameZh: String(u.role_name_zh ?? u.roleNameZh ?? ""),
        status:     u.status ?? "ACTIVE",
      }));
      setUsers(arr);
    } catch (e: unknown) {
      setUsersError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ── 加载用户的组织绑定 ─────────────────────────────────────────────────────
  const loadUserOrgs = useCallback(async (userId: number) => {
    setUserOrgsLoading(true);
    try {
      const res  = await fetch(`/api/org/user-orgs/${userId}`, { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const arr = (json.code === 200 ? json.data : (Array.isArray(json) ? json : []));
      setUserOrgs(
        arr.map((r: Record<string, unknown>) => ({
          id:             Number(r.id),
          orgId:          Number(r.org_id ?? r.orgId),
          orgCode:        String(r.org_code ?? r.orgCode ?? ""),
          orgName:        String(r.org_name ?? r.orgName ?? ""),
          orgType:        String(r.org_type ?? r.orgType ?? "OTHER"),
          isPrimary:      Boolean(r.is_primary ?? r.isPrimary),
          dataScopeLevel: String(r.data_scope_level ?? r.dataScopeLevel ?? "COMPANY") as ScopeLevel,
          level:          Number(r.level ?? 0),
          companyCode:    (r.company_code ?? r.companyCode ?? null) as string | null,
          projectCode:    (r.project_code ?? r.projectCode ?? null) as string | null,
        })),
      );
    } catch {
      toast.error("加载用户组织失败");
    } finally {
      setUserOrgsLoading(false);
    }
  }, [toast]);

  // ── 加载组织树 ─────────────────────────────────────────────────────────────
  const loadOrgTree = useCallback(async () => {
    try {
      const res  = await fetch("/api/organizations/tree", { headers: hdr() });
      if (!res.ok) return;
      const json = await res.json();
      const tree: OrgTreeNode[] = json.code === 200 ? (json.data ?? []) : (Array.isArray(json) ? json : []);
      setOrgTree(tree);
      setOrgFlat(flattenTree(tree));
    } catch { /* 静默 */ }
  }, []);

  useEffect(() => {
    if (canView) {
      loadUsers();
      loadOrgTree();
    }
  }, [canView, loadUsers, loadOrgTree]);

  useEffect(() => {
    if (activeUser) {
      loadUserOrgs(activeUser.id);
      setShowAddForm(false);
      setAddOrgId("");
      setAddScope("COMPANY");
      setAddPrimary(false);
    } else {
      setUserOrgs([]);
    }
  }, [activeUser, loadUserOrgs]);

  // ── 过滤用户 ──────────────────────────────────────────────────────────────
  const roles = useMemo(() => {
    const set = new Set(users.map(u => u.role).filter(Boolean));
    return Array.from(set);
  }, [users]);

  const filteredUsers = useMemo(() =>
    users.filter(u => {
      const kw = search.toLowerCase();
      const matchKw =
        !kw ||
        u.realNameZh.toLowerCase().includes(kw) ||
        u.username.toLowerCase().includes(kw);
      const matchRole = !roleFilter || u.role === roleFilter;
      return matchKw && matchRole;
    }),
  [users, search, roleFilter]);

  // ── 更新数据范围等级 ───────────────────────────────────────────────────────
  const handleUpdateScope = async (uo: UserOrg, level: ScopeLevel) => {
    if (!canEdit) return;
    setMutatingId(uo.id);
    try {
      const res  = await fetch(`/api/org/user-orgs/${uo.id}`, {
        method: "PUT", headers: hdr(),
        body: JSON.stringify({ dataScopeLevel: level }),
      });
      const json = await res.json();
      if (json.code === 200) {
        setUserOrgs(prev =>
          prev.map(x => x.id === uo.id ? { ...x, dataScopeLevel: level } : x),
        );
        toast.success("数据范围已更新");
      } else {
        throw new Error(json.message ?? "更新失败");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setMutatingId(null);
    }
  };

  // ── 切换主组织 ─────────────────────────────────────────────────────────────
  const handleTogglePrimary = async (uo: UserOrg) => {
    if (!canEdit) return;
    setMutatingId(uo.id);
    try {
      const res  = await fetch(`/api/org/user-orgs/${uo.id}`, {
        method: "PUT", headers: hdr(),
        body: JSON.stringify({ isPrimary: !uo.isPrimary }),
      });
      const json = await res.json();
      if (json.code === 200) {
        // 若设为主组织，将其他行的 isPrimary 清掉（后端也会做，前端同步显示）
        setUserOrgs(prev =>
          prev.map(x => ({
            ...x,
            isPrimary: x.id === uo.id ? !uo.isPrimary : (uo.isPrimary ? x.isPrimary : false),
          })),
        );
        toast.success(!uo.isPrimary ? "已设为主组织" : "已取消主组织");
      } else {
        throw new Error(json.message ?? "操作失败");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setMutatingId(null);
    }
  };

  // ── 移除绑定 ──────────────────────────────────────────────────────────────
  const handleRemove = async (uo: UserOrg) => {
    if (!canDelete) return;
    setMutatingId(uo.id);
    try {
      const res  = await fetch(`/api/org/user-orgs/${uo.id}`, {
        method: "DELETE", headers: hdr(),
      });
      if (res.ok || (await res.json().catch(() => ({}))).code === 200) {
        setUserOrgs(prev => prev.filter(x => x.id !== uo.id));
        toast.success(`已移除【${uo.orgName}】绑定`);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "移除失败");
    } finally {
      setMutatingId(null);
    }
  };

  // ── 新增绑定提交 ──────────────────────────────────────────────────────────
  const handleAddSubmit = async () => {
    if (!activeUser || !addOrgId) {
      toast.error("请选择要绑定的组织");
      return;
    }
    // 检查是否已绑定
    if (userOrgs.some(x => x.orgId === addOrgId)) {
      toast.error("该用户已绑定此组织");
      return;
    }
    setAdding(true);
    try {
      const res  = await fetch("/api/org/user-orgs", {
        method: "POST", headers: hdr(),
        body: JSON.stringify({
          userId:         activeUser.id,
          orgId:          Number(addOrgId),
          dataScopeLevel: addScope,
          isPrimary:      addPrimary,
        }),
      });
      const json = await res.json();
      if (json.code === 200) {
        toast.success("组织绑定成功");
        setShowAddForm(false);
        setAddOrgId("");
        setAddScope("COMPANY");
        setAddPrimary(false);
        await loadUserOrgs(activeUser.id);
      } else {
        throw new Error(json.message ?? "绑定失败");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "绑定失败");
    } finally {
      setAdding(false);
    }
  };

  // ── 无权限守卫 ────────────────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="flex items-center justify-center py-24 text-text-dim text-sm gap-2">
        <Shield size={16} className="opacity-50" />
        无权限查看用户组织权限管理
      </div>
    );
  }

  // ── 渲染 ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="用户组织权限"
        subtitle="以用户为视角管理其所属组织及数据访问范围"
        breadcrumb={["主数据中心", "用户组织权限"]}
      />

      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "300px 1fr", minHeight: 600 }}
      >
        {/* ══════════════════════════════════════════════════════
            左栏：用户列表
        ══════════════════════════════════════════════════════ */}
        <Panel
          title="用户列表"
          icon={<Users size={14} style={{ color: "var(--color-primary)", flexShrink: 0 }} />}
          extra={<>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{filteredUsers.length} 人</span>
            <button onClick={loadUsers} title="刷新" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 2, display: "flex" }}>
              <RefreshCw size={12} className={usersLoading ? "animate-spin" : ""} />
            </button>
          </>}
          bodyPadding={false}
          style={{ minHeight: 600 }}
        >
          {/* 搜索 + 角色筛选 */}
          <div className="px-3 pt-3 pb-2 flex flex-col gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="搜索姓名 / 账号…" />
            {roles.length > 0 && (
              <SelectField
                value={roleFilter}
                onChange={setRoleFilter}
                options={roles.map(r => ({ value: r, label: r }))}
                emptyLabel="全部角色"
                allowEmpty
              />
            )}
          </div>

          {/* 用户列表体 */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {usersLoading ? (
              <div className="flex flex-col gap-2 p-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className="h-14 rounded-xl bg-bg-muted animate-pulse"
                  />
                ))}
              </div>
            ) : usersError ? (
              <div className="flex flex-col items-center gap-2 py-10 text-danger text-xs text-center px-3">
                <AlertCircle size={20} className="opacity-60" />
                {usersError}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-text-dim">
                <Inbox size={28} className="opacity-30" />
                <span className="text-xs">无匹配用户</span>
              </div>
            ) : (
              filteredUsers.map(u => {
                const isActive = activeUser?.id === u.id;
                const isOnline =
                  String(u.status) === "1" || u.status === "ACTIVE";
                return (
                  <button
                    key={u.id}
                    onClick={() =>
                      setActiveUser(isActive ? null : u)
                    }
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl",
                      "transition-all cursor-pointer border",
                      "mb-1.5 last:mb-0",
                      isActive
                        ? "bg-brand/8 border-brand/30 shadow-sm"
                        : "border-transparent hover:bg-bg-muted/50",
                    )}
                  >
                    {/* 头像 */}
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center",
                        "text-sm font-bold flex-shrink-0",
                        isActive
                          ? "bg-brand text-white"
                          : "bg-bg-muted text-text-muted",
                      )}
                    >
                      {(u.realNameZh || u.username || "?")[0]}
                    </div>
                    {/* 信息 */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div
                        className={cn(
                          "text-sm font-semibold truncate leading-none",
                          isActive ? "text-brand" : "text-text",
                        )}
                      >
                        {u.realNameZh || u.username}
                      </div>
                      <div className="text-xs font-mono text-text-dim truncate leading-none">
                        {u.username}
                      </div>
                    </div>
                    {/* 状态 + 箭头 */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span
                        className={cn(
                          "text-[10px] font-semibold",
                          isOnline ? "text-success" : "text-danger",
                        )}
                      >
                        ●
                      </span>
                      {isActive && (
                        <ChevronRight
                          size={12}
                          className="text-brand"
                        />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Panel>

        {/* ══════════════════════════════════════════════════════
            右栏：组织权限面板
        ══════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-border bg-bg-card shadow-card flex flex-col overflow-hidden">
          {activeUser ? (
            <>
              {/* 面板 Header */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-base font-bold text-brand flex-shrink-0">
                    {(activeUser.realNameZh || activeUser.username || "?")[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-text">
                        {activeUser.realNameZh || activeUser.username}
                      </h2>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20 font-medium">
                        {activeUser.roleNameZh || activeUser.role || "—"}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-text-dim">
                      {activeUser.username}
                    </div>
                  </div>
                </div>

                {/* 刷新 + 新增 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => loadUserOrgs(activeUser.id)}
                    disabled={userOrgsLoading}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg",
                      "border border-border text-text-muted bg-bg-page",
                      "hover:bg-bg-muted disabled:opacity-50 transition-colors cursor-pointer",
                    )}
                  >
                    <RefreshCw
                      size={12}
                      className={userOrgsLoading ? "animate-spin" : ""}
                    />
                    刷新
                  </button>
                  {canCreate && (
                    <button
                      onClick={() => setShowAddForm(v => !v)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg",
                        "transition-colors cursor-pointer",
                        showAddForm
                          ? "bg-bg-muted border border-border text-text-muted"
                          : "bg-brand text-white hover:opacity-90",
                      )}
                    >
                      <Plus size={12} />
                      {showAddForm ? "取消" : "添加组织"}
                    </button>
                  )}
                </div>
              </div>

              {/* 新增绑定表单 */}
              {showAddForm && (
                <div className="px-5 py-4 border-b border-border bg-bg-muted/30">
                  <div className="flex flex-wrap items-end gap-3">
                    {/* 选择组织 */}
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[11px] font-semibold text-text-muted mb-1.5">
                        绑定组织 <span className="text-danger">*</span>
                      </label>
                      <select
                        value={addOrgId}
                        onChange={e =>
                          setAddOrgId(
                            e.target.value === ""
                              ? ""
                              : Number(e.target.value),
                          )
                        }
                        className={INP}
                      >
                        <option value="">请选择组织…</option>
                        {orgFlat.length > 0 ? (
                          orgFlat
                            .filter(
                              o => !userOrgs.some(x => x.orgId === o.id),
                            )
                            .map(o => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))
                        ) : (
                          <option disabled>加载组织中…</option>
                        )}
                      </select>
                    </div>

                    {/* 数据范围等级 */}
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-[11px] font-semibold text-text-muted mb-1.5">
                        数据范围等级
                      </label>
                      <select
                        value={addScope}
                        onChange={e =>
                          setAddScope(e.target.value as ScopeLevel)
                        }
                        className={INP}
                      >
                        {SCOPE_LEVELS.map(s => (
                          <option key={s.value} value={s.value}>
                            {s.label}（{s.value}）— {s.desc}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 设为主组织 */}
                    <div className="flex items-center gap-2 pb-2">
                      <input
                        type="checkbox"
                        id="add-primary-chk"
                        checked={addPrimary}
                        onChange={e => setAddPrimary(e.target.checked)}
                        className="w-4 h-4 accent-brand cursor-pointer"
                      />
                      <label
                        htmlFor="add-primary-chk"
                        className="text-xs text-text-muted cursor-pointer select-none"
                      >
                        设为主组织
                      </label>
                    </div>

                    {/* 提交 */}
                    <button
                      onClick={handleAddSubmit}
                      disabled={adding || !addOrgId}
                      className={cn(
                        "flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg",
                        "bg-brand text-white hover:opacity-90",
                        "disabled:opacity-50 transition-opacity cursor-pointer",
                      )}
                    >
                      <UserCheck size={13} />
                      {adding ? "绑定中…" : "确认绑定"}
                    </button>
                  </div>
                </div>
              )}

              {/* 绑定列表 */}
              <div className="flex-1 overflow-x-auto">
                {userOrgsLoading ? (
                  <div className="flex items-center justify-center py-14 text-text-dim text-sm gap-2">
                    <RefreshCw size={14} className="animate-spin" />
                    加载中…
                  </div>
                ) : userOrgs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-52 gap-3 text-text-dim">
                    <Building2 size={32} className="opacity-20" />
                    <div className="text-sm font-medium text-text-muted">
                      该用户暂未绑定任何组织
                    </div>
                    {canCreate && (
                      <button
                        onClick={() => setShowAddForm(true)}
                        className="text-xs text-brand hover:underline"
                      >
                        点击「添加组织」开始绑定 →
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-bg-muted/40">
                        {[
                          "组织名称",
                          "类型",
                          "数据范围",
                          "主组织",
                          "操作",
                        ].map(h => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {userOrgs.map((uo, i) => {
                        const scopeItem =
                          SCOPE_LEVELS.find(
                            s => s.value === uo.dataScopeLevel,
                          ) ?? SCOPE_LEVELS[2];
                        const isMutating = mutatingId === uo.id;
                        return (
                          <tr
                            key={uo.id}
                            className={cn(
                              "border-b border-border/30 hover:bg-bg-muted/20 transition-colors",
                              i === userOrgs.length - 1 ? "border-b-0" : "",
                              uo.isPrimary ? "bg-brand/3" : "",
                            )}
                          >
                            {/* 组织名称 */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Building2
                                  size={13}
                                  className="text-text-dim flex-shrink-0"
                                />
                                <div>
                                  <div className="font-semibold text-text">
                                    {uo.orgName}
                                  </div>
                                  <div className="text-xs font-mono text-text-dim">
                                    {uo.orgCode}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 类型 */}
                            <td className="px-4 py-3">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-bg-muted text-text-muted border border-border">
                                {ORG_TYPE_LABEL[uo.orgType] ?? uo.orgType}
                              </span>
                            </td>

                            {/* 数据范围等级 */}
                            <td className="px-4 py-3">
                              {canEdit ? (
                                <select
                                  value={uo.dataScopeLevel}
                                  disabled={isMutating}
                                  onChange={e =>
                                    handleUpdateScope(
                                      uo,
                                      e.target.value as ScopeLevel,
                                    )
                                  }
                                  className={cn(
                                    "text-xs px-2 py-1 rounded-lg border cursor-pointer",
                                    "bg-bg-page text-text outline-none",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    SCOPE_COLOR[uo.dataScopeLevel],
                                  )}
                                >
                                  {SCOPE_LEVELS.map(s => (
                                    <option key={s.value} value={s.value}>
                                      {s.label}（{s.value}）
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  className={cn(
                                    "text-xs px-2 py-0.5 rounded-full border font-semibold",
                                    SCOPE_COLOR[uo.dataScopeLevel],
                                  )}
                                >
                                  {scopeItem.label}
                                </span>
                              )}
                            </td>

                            {/* 主组织 */}
                            <td className="px-4 py-3">
                              {canEdit ? (
                                <button
                                  onClick={() => handleTogglePrimary(uo)}
                                  disabled={isMutating}
                                  title={
                                    uo.isPrimary
                                      ? "取消主组织"
                                      : "设为主组织"
                                  }
                                  className={cn(
                                    "flex items-center gap-1 text-xs px-2 py-1 rounded-lg border",
                                    "transition-colors cursor-pointer disabled:opacity-50",
                                    uo.isPrimary
                                      ? "text-warning bg-warning/10 border-warning/30 hover:bg-warning/20"
                                      : "text-text-dim bg-bg-muted border-border hover:text-warning hover:bg-warning/10",
                                  )}
                                >
                                  {uo.isPrimary ? (
                                    <>
                                      <Star size={11} className="fill-current" />
                                      主组织
                                    </>
                                  ) : (
                                    <>
                                      <StarOff size={11} />
                                      设为主
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span
                                  className={cn(
                                    "flex items-center gap-1 text-xs",
                                    uo.isPrimary
                                      ? "text-warning font-semibold"
                                      : "text-text-dim",
                                  )}
                                >
                                  {uo.isPrimary ? (
                                    <>
                                      <Star
                                        size={11}
                                        className="fill-current"
                                      />
                                      主组织
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </span>
                              )}
                            </td>

                            {/* 操作 */}
                            <td className="px-4 py-3">
                              {canDelete ? (
                                <button
                                  onClick={() => handleRemove(uo)}
                                  disabled={isMutating}
                                  className={cn(
                                    "flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border",
                                    "border-danger/30 text-danger bg-danger/5",
                                    "hover:bg-danger/10 disabled:opacity-50",
                                    "transition-colors cursor-pointer",
                                  )}
                                >
                                  {isMutating ? (
                                    <RefreshCw
                                      size={11}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Trash2 size={11} />
                                  )}
                                  移除
                                </button>
                              ) : (
                                <span className="text-xs text-text-dim">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 底部统计 */}
              {userOrgs.length > 0 && (
                <div className="px-5 py-2.5 border-t border-border bg-bg-muted/20 flex items-center gap-4 text-xs text-text-dim">
                  <span>
                    共绑定{" "}
                    <span className="font-semibold text-text-muted">
                      {userOrgs.length}
                    </span>{" "}
                    个组织
                  </span>
                  {userOrgs.some(x => x.isPrimary) && (
                    <span className="flex items-center gap-1">
                      <Star size={10} className="text-warning fill-current" />
                      主组织：
                      <span className="font-semibold text-text-muted">
                        {userOrgs.find(x => x.isPrimary)?.orgName ?? "—"}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            /* 未选中用户时的占位 */
            <div className="flex flex-col items-center justify-center flex-1 gap-4 text-text-dim p-12">
              <div className="w-16 h-16 rounded-full bg-bg-muted flex items-center justify-center">
                <Users size={28} className="opacity-30" />
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-text-muted mb-1">
                  在左侧选择用户
                </div>
                <div className="text-xs">
                  选中用户后，可在此管理其组织绑定与数据访问范围
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

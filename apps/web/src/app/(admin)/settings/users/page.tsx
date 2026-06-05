"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermission } from "@/hooks/usePermission";
import {
  Users, Shield, Plus, Lock, Unlock, Key, Edit2, UserCheck,
  FlaskConical, RefreshCw, Search, ChevronUp, ChevronDown,
  ChevronsUpDown, Star, X as XIcon, Info, LayoutGrid, List, ChevronRight,
} from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "");
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const API = async (path: string, opts: RequestInit = {}) => {
  const r = await fetch("/api/users" + path, { ...opts, headers: { ...hdr(), ...(opts.headers as any || {}) } });
  return r.json();
};

// ── 角色级别颜色 ────────────────────────────────────────────────────────────────
const LEVEL_COLOR: Record<number, string> = {
  4: "var(--status-warning)", 3: "var(--status-special)", 2: "var(--color-accent)", 1: "var(--status-success)", 0: "var(--text-secondary)",
};
const levelColor = (lv: number) => LEVEL_COLOR[lv] ?? "var(--text-secondary)";

function UserTypeBadge({ type }: { type: string }) {
  return type === "TEST" ? (
    <span className={`${s.badge} ${s.badgePurple}`}><FlaskConical size={9} /> TEST</span>
  ) : (
    <span className={`${s.badge} ${s.badgeSuccess}`}><UserCheck size={9} /> 正式</span>
  );
}

// 角色优先级标签
function LevelBadge({ level }: { level: number }) {
  const col = levelColor(level);
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 8,
      background: col + "22", color: col, border: `1px solid ${col}44`, marginLeft: 3 }}>
      L{level}
    </span>
  );
}

interface UserRole {
  role_code: string;
  role_name_zh: string;
  approval_level: number;
  is_primary: boolean;
}
interface UserRecord {
  id: number;
  username: string;
  real_name_zh: string;
  role?: string;
  role_name_zh?: string;
  store_code?: string;
  status: string;
  user_type?: string;
  roles_detail?: UserRole[];
}
interface RoleOption {
  role_code: string;
  role_name_zh: string;
  role_type: string;
  approval_level: number;
  description?: string;
}

type SortKey = "username" | "real_name_zh" | "role_name_zh" | "status";
type SortDir = "asc" | "desc";
const PAGE_SIZE_OPTIONS = [20, 50, 100];

// ── Role type grouping color (for RolePicker) ────────────────────
const TYPE_COLOR: Record<string, string> = {
  SYSTEM: "var(--status-warning)", DECISION: "var(--status-special)", FINANCE: "var(--color-accent)",
  MANAGEMENT: "var(--color-accent)", PRODUCTION: "var(--status-success)", QUALITY: "var(--status-success)",
  PACKAGING: "var(--status-success)", WAREHOUSE: "var(--status-warning)", LOGISTICS: "var(--status-warning)",
  PROCUREMENT: "var(--status-special)", STORE: "var(--color-accent)", SALES: "var(--color-accent)",
  EXTERNAL: "var(--text-secondary)", custom: "var(--text-disabled)",
};

// ── Role type meta (order / label / color / emoji) ────────────────
const ROLE_TYPE_META: Record<string, { order: number; label: string; color: string; emoji: string }> = {
  SYSTEM:      { order: 0,  label: "系统管理",  color: "var(--status-warning)", emoji: "⚙️" },
  DECISION:    { order: 1,  label: "决策层",    color: "var(--status-special)", emoji: "👑" },
  FINANCE:     { order: 2,  label: "财务",      color: "var(--color-accent)", emoji: "💰" },
  MANAGEMENT:  { order: 3,  label: "管理运营",  color: "var(--color-accent)", emoji: "📊" },
  PRODUCTION:  { order: 4,  label: "养殖生产",  color: "var(--status-success)", emoji: "🐔" },
  QUALITY:     { order: 5,  label: "品控质检",  color: "var(--status-success)", emoji: "🔬" },
  PACKAGING:   { order: 6,  label: "包装加工",  color: "var(--status-success)", emoji: "📦" },
  WAREHOUSE:   { order: 7,  label: "仓储物流",  color: "var(--status-warning)", emoji: "🏭" },
  LOGISTICS:   { order: 8,  label: "配送运输",  color: "var(--status-warning)", emoji: "🚛" },
  PROCUREMENT: { order: 9,  label: "采购供应",  color: "var(--status-special)", emoji: "🛒" },
  STORE:       { order: 10, label: "门店零售",  color: "var(--color-accent)", emoji: "🏪" },
  SALES:       { order: 11, label: "销售营销",  color: "var(--color-accent)", emoji: "📈" },
  EXTERNAL:    { order: 12, label: "外部协作",  color: "var(--text-secondary)", emoji: "🤝" },
  custom:      { order: 99, label: "自定义",    color: "var(--text-disabled)", emoji: "🔧" },
};
const TYPE_META_FALLBACK = { order: 98, label: "其他",      color: "var(--text-disabled)", emoji: "👤" };
const NO_ROLE_META       = { order: 97, label: "未分配角色", color: "var(--status-danger)", emoji: "❓" };

// ── Multi-role picker component ─────────────────────────────────
function RolePicker({ allRoles, selected, onChange }: {
  allRoles: RoleOption[];
  selected: UserRole[];
  onChange: (roles: UserRole[]) => void;
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = allRoles.filter(r =>
      r.role_code.toLowerCase().includes(q) || r.role_name_zh.toLowerCase().includes(q)
    );
    const map = new Map<string, RoleOption[]>();
    for (const r of filtered) {
      const g = r.role_type || "custom";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const lvA = Math.max(...a[1].map(r => r.approval_level));
      const lvB = Math.max(...b[1].map(r => r.approval_level));
      return lvB - lvA;
    });
  }, [allRoles, search]);

  const selectedSet = new Set(selected.map(r => r.role_code));
  const primaryCode = selected.find(r => r.is_primary)?.role_code;

  const toggle = (role: RoleOption) => {
    if (selectedSet.has(role.role_code)) {
      const next = selected.filter(r => r.role_code !== role.role_code);
      // 如果删掉的是 primary，把剩余中 level 最高的设为 primary
      if (role.role_code === primaryCode && next.length > 0) {
        const maxLv = Math.max(...next.map(r => r.approval_level));
        const newPrim = next.find(r => r.approval_level === maxLv)!;
        onChange(next.map(r => ({ ...r, is_primary: r.role_code === newPrim.role_code })));
      } else {
        onChange(next);
      }
    } else {
      const isFirst = selected.length === 0;
      onChange([...selected, {
        role_code: role.role_code,
        role_name_zh: role.role_name_zh,
        approval_level: role.approval_level,
        is_primary: isFirst,
      }]);
    }
  };

  const setPrimary = (code: string) => {
    onChange(selected.map(r => ({ ...r, is_primary: r.role_code === code })));
  };

  return (
    <div>
      {/* Already selected tags */}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {[...selected].sort((a, b) => b.approval_level - a.approval_level).map(r => {
            const col = levelColor(r.approval_level);
            return (
              <div key={r.role_code} style={{ display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px 4px 10px", borderRadius: 20,
                background: col + "18", border: `1.5px solid ${col}44`,
                fontSize: 12, color: col, fontWeight: 600 }}>
                {r.is_primary && <Star size={10} style={{ fill: col }}/>}
                {r.role_name_zh}
                <LevelBadge level={r.approval_level}/>
                {!r.is_primary && selected.length > 1 && (
                  <button type="button" onClick={() => setPrimary(r.role_code)}
                    title={t("ui.设为主角色", "设为主角色")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px",
                      color: col, opacity: 0.5, fontSize: 10, lineHeight: 1 }}>
                    ★
                  </button>
                )}
                <button type="button" onClick={() => toggle({ role_code: r.role_code, role_name_zh: r.role_name_zh,
                    role_type: "", approval_level: r.approval_level, description: "" })}
                  style={{ background: "none", border: "none", cursor: "pointer",
                    padding: "0 2px", color: col, opacity: 0.7 }}>
                  <XIcon size={10}/>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
        background: "var(--bg-page)", borderRadius: 8, padding: "6px 10px",
        border: "1px solid var(--border)" }}>
        <Search size={12} color="var(--text-secondary)"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t("ui.搜索角色", "搜索角色...")}
          style={{ border: "none", background: "transparent", outline: "none",
            fontSize: 12, color: "var(--text-primary)", width: "100%" }}/>
      </div>

      {/* Role list grouped by type */}
      <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {grouped.map(([type, roles]) => (
          <div key={type}>
            <div style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[type] ?? "var(--text-disabled)",
              textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
              padding: "2px 6px", background: (TYPE_COLOR[type] ?? "var(--text-disabled)") + "15",
              borderRadius: 4, display: "inline-block" }}>
              {type}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {roles.map(r => {
                const isSelected = selectedSet.has(r.role_code);
                const col = levelColor(r.approval_level);
                return (
                  <button type="button" key={r.role_code} onClick={() => toggle(r)}
                    title={`${r.role_code}${r.description ? " — " + r.description : ""}`}
                    style={{
                      padding: "4px 10px", borderRadius: 12, fontSize: 12, cursor: "pointer",
                      fontWeight: isSelected ? 700 : 400,
                      background: isSelected ? col + "22" : "var(--bg-page)",
                      border: `1.5px solid ${isSelected ? col : "var(--border)"}`,
                      color: isSelected ? col : "var(--text-secondary)",
                      transition: "all 0.15s",
                    }}>
                    {isSelected && "✓ "}
                    {r.role_name_zh}
                    <LevelBadge level={r.approval_level}/>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 12, padding: "16px 0" }}>
            {t("common.no_data", "暂无数据")}
          </div>
        )}
      </div>

      {selected.length > 1 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)",
          display: "flex", alignItems: "center", gap: 4 }}>
          <Info size={10}/>
          {t("ui.星号角色为主角色点击角色旁星号切换", "★ 为主角色，点击角色旁 ★ 切换")}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const { canCreate, canEdit } = usePermission("MENU_SETTINGS_USER");

  const [users,     setUsers]     = useState<UserRecord[]>([]);
  const [allRoles,  setAllRoles]  = useState<RoleOption[]>([]);
  const [loading,   setLoading]   = useState(true);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [typeFilter,   setTypeFilter]   = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleFilter,   setRoleFilter]   = useState("");
  const [search,       setSearch]       = useState("");

  // ── Sort ──────────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("real_name_zh");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── Pagination ────────────────────────────────────────────────────────────────
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ── Drawer / Form ─────────────────────────────────────────────────────────────
  const [showDrawer, setShowDrawer] = useState(false);
  const [editUser,   setEditUser]   = useState<UserRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm,    setConfirm]    = useState<{ open: boolean; user?: UserRecord; nextStatus?: string }>({ open: false });

  const [form, setForm] = useState({
    username: "", real_name_zh: "", store_code: "",
    password: "", newPassword: "", user_type: "REAL",
  });
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);

  // ── View mode ─────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const uRes = await fetch("/api/users", { headers: hdr() }).then(r => r.json());
      setUsers(uRes.data || []);
      setAllRoles(uRes.roles || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtered + sorted list ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users;
    if (typeFilter !== "ALL")   list = list.filter(u => (u.user_type || "REAL") === typeFilter);
    if (statusFilter !== "ALL") list = list.filter(u => u.status === statusFilter);
    if (roleFilter)             list = list.filter(u =>
      (u.roles_detail || []).some(r => r.role_code === roleFilter)
    );
    if (q) list = list.filter(u =>
      (u.username || "").toLowerCase().includes(q) ||
      (u.real_name_zh || "").toLowerCase().includes(q) ||
      (u.roles_detail || []).some(r => r.role_name_zh.toLowerCase().includes(q))
    );
    return [...list].sort((a, b) => {
      const va = String((a as unknown as Record<string, unknown>)[sortKey] || "").toLowerCase();
      const vb = String((b as unknown as Record<string, unknown>)[sortKey] || "").toLowerCase();
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [users, typeFilter, statusFilter, roleFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [typeFilter, statusFilter, roleFilter, search, sortKey, sortDir, pageSize]);

  const counts = {
    ALL:  users.length,
    REAL: users.filter(u => (u.user_type || "REAL") === "REAL").length,
    TEST: users.filter(u => u.user_type === "TEST").length,
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.3, marginLeft: 3 }}/>;
    return sortDir === "asc"
      ? <ChevronUp   size={12} style={{ color: "var(--color-primary)", marginLeft: 3 }}/>
      : <ChevronDown size={12} style={{ color: "var(--color-primary)", marginLeft: 3 }}/>;
  };

  // ── Role type lookup map ──────────────────────────────────────────────────────
  const roleTypeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRoles) m.set(r.role_code, r.role_type || "custom");
    return m;
  }, [allRoles]);

  // ── Grouped users (by primary role's role_type) ───────────────────────────────
  const userGroups = useMemo(() => {
    const groupMap = new Map<string, UserRecord[]>();
    for (const u of filtered) {
      const primaryRole = (u.roles_detail || []).find(r => r.is_primary)
        ?? [...(u.roles_detail || [])].sort((a, b) => b.approval_level - a.approval_level)[0];
      const type = primaryRole ? (roleTypeMap.get(primaryRole.role_code) || "custom") : "NO_ROLE";
      if (!groupMap.has(type)) groupMap.set(type, []);
      groupMap.get(type)!.push(u);
    }
    // Sort users within each group: primary role level desc, then name asc
    for (const [, gUsers] of groupMap) {
      gUsers.sort((a, b) => {
        const pa = (a.roles_detail || []).find(r => r.is_primary)
          ?? [...(a.roles_detail || [])].sort((x, y) => y.approval_level - x.approval_level)[0];
        const pb = (b.roles_detail || []).find(r => r.is_primary)
          ?? [...(b.roles_detail || [])].sort((x, y) => y.approval_level - x.approval_level)[0];
        const la = pa?.approval_level ?? 0;
        const lb = pb?.approval_level ?? 0;
        if (lb !== la) return lb - la;
        return (a.real_name_zh || "").localeCompare(b.real_name_zh || "");
      });
    }
    return Array.from(groupMap.entries())
      .map(([type, gUsers]) => ({
        type,
        meta: type === "NO_ROLE" ? NO_ROLE_META : (ROLE_TYPE_META[type] ?? TYPE_META_FALLBACK),
        users: gUsers,
      }))
      .sort((a, b) => a.meta.order - b.meta.order);
  }, [filtered, roleTypeMap]);

  const toggleGroup = useCallback((type: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleAddNew = () => {
    setEditUser(null);
    setForm({ username: "", real_name_zh: "", store_code: "", password: "", newPassword: "", user_type: "REAL" });
    setSelectedRoles([]);
    setShowDrawer(true);
  };

  const handleEdit = (u: UserRecord) => {
    if (u.username === "admin") { toast.error(t("ui.系统特权总控帐号已锁定拒绝面板编辑", "系统特权总控帐号已锁定，拒绝面板编辑")); return; }
    setEditUser(u);
    setForm({ username: u.username, real_name_zh: u.real_name_zh || "", store_code: u.store_code || "", password: "", newPassword: "", user_type: u.user_type || "REAL" });
    setSelectedRoles(u.roles_detail || []);
    setShowDrawer(true);
  };

  const handleSubmit = async () => {
    if (!form.real_name_zh) { toast.error(t("ui.姓名为必填项", "姓名为必填项")); return; }
    if (!editUser && !form.username) { toast.error(t("ui.账户名为必填项", "账户名为必填项")); return; }
    if (!editUser && (!form.password || form.password.length < 8)) { toast.error(t("ui.新建用户密码至少8位", "新建用户密码至少 8 位")); return; }
    setSubmitting(true);
    try {
      let res: { code?: number; data?: { id?: number }; msg?: string } = {};
      if (editUser) {
        // 更新基本信息
        res = await API(`/${editUser.id}`, {
          method: "PUT",
          body: JSON.stringify({ real_name_zh: form.real_name_zh, store_code: form.store_code }),
        });
        // 更新角色列表（多角色）
        if (res.code === 200 && selectedRoles.length > 0) {
          const rolesRes = await API(`/${editUser.id}/roles`, {
            method: "PUT",
            body: JSON.stringify({ roles: selectedRoles.map(r => ({ role_code: r.role_code, is_primary: r.is_primary })) }),
          });
          if (rolesRes.code !== 200) toast.error(rolesRes.msg || t("ui.角色更新失败", "角色更新失败"));
        } else if (res.code === 200 && selectedRoles.length === 0) {
          // 清除所有角色（传空数组）
          await API(`/${editUser.id}/roles`, { method: "PUT", body: JSON.stringify({ roles: [] }) });
        }
        // 可选：重置密码
        if (res.code === 200 && form.newPassword && form.newPassword.length >= 8) {
          const pw = await API(`/${editUser.id}/password`, { method: "PUT", body: JSON.stringify({ password: form.newPassword }) });
          if (pw.code !== 200) toast.error(pw.msg || t("ui.密码重置失败", "密码重置失败"));
        }
      } else {
        // 新建用户
        const primaryRole = selectedRoles.find(r => r.is_primary) ?? selectedRoles[0];
        res = await API("", {
          method: "POST",
          body: JSON.stringify({
            username: form.username, real_name_zh: form.real_name_zh,
            store_code: form.store_code, password: form.password,
            user_type: form.user_type,
            role: primaryRole?.role_code || "",
          }),
        });
        // 若新建成功且有多个角色，再设置完整角色列表
        if (res.code === 200 && res.data?.id && selectedRoles.length > 1) {
          await API(`/${res.data.id}/roles`, {
            method: "PUT",
            body: JSON.stringify({ roles: selectedRoles.map(r => ({ role_code: r.role_code, is_primary: r.is_primary })) }),
          });
        }
      }
      if (res.code === 200) {
        setShowDrawer(false);
        loadData();
        toast.success(editUser ? t("ui.修改成功", "修改成功") : t("ui.用户创建成功", "用户创建成功"));
      } else {
        toast.error(res.msg || t("ui.操作失败", "操作失败"));
      }
    } finally { setSubmitting(false); }
  };

  const doToggleStatus = async () => {
    const { user, nextStatus } = confirm;
    if (!user) return;
    setConfirm({ open: false });
    const res = await API(`/${user.id}/status`, { method: "PUT", body: JSON.stringify({ status: nextStatus }) });
    if (res.code === 200) { loadData(); toast.success(nextStatus === "FROZEN" ? t("ui.已冻结", "已冻结") : t("ui.已解冻", "已解冻")); }
    else toast.error(res.msg);
  };

  const handleToggle = (u: UserRecord) => {
    if (u.username === "admin") { toast.error(t("ui.管理员账号不可操作", "管理员账号不可操作")); return; }
    const nextStatus = u.status === "ACTIVE" ? "FROZEN" : "ACTIVE";
    setConfirm({ open: true, user: u, nextStatus });
  };

  const hasActiveFilters = statusFilter !== "ALL" || roleFilter !== "" || search !== "";

  return (
    <div className="animate-fade-in" style={{ paddingBottom: 60 }}>
      <PageHeader
        title={t("ui.用户与权限管理", "用户与权限管理")}
        subtitle={t("ui.管理系统用户账号角色分配与账号状态", "管理系统用户账号、角色分配与账号状态")}
        breadcrumb={[t("ui.系统设置", "系统设置"), t("ui.用户权限", "用户权限")]}
        actions={
          canCreate && (
            <button type="button" onClick={handleAddNew} className={s.btnPrimaryGrad}>
              <Plus size={15}/> {t("ui.新建用户", "新建用户")}
            </button>
          )
        }
      />

      {/* Stats card */}
      <div className={s.card} style={{ marginBottom: 14 }}>
        <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,var(--status-warning),var(--status-warning))",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Key size={18} color="white"/>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{t("ui.用户账号管理台", "用户账号管理台")}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {t("ui.共", "共")} {counts.ALL} {t("ui.个账号", "个账号")} ·{" "}
                <span style={{ color: "var(--status-success)", fontWeight: 600 }}>{t("ui.正式", "正式")} {counts.REAL}</span> ·{" "}
                <span style={{ color: "var(--status-special)", fontWeight: 600 }}>{t("ui.测试", "测试")} {counts.TEST}</span>
                {filtered.length !== users.length && (
                  <span style={{ color: "var(--color-primary)", fontWeight: 600 }}> · {t("ui.筛选结果", "筛选结果")} {filtered.length} {t("ui.条", "条")}</span>
                )}
              </div>
            </div>
          </div>
          <button type="button" onClick={() => loadData()} className={s.btnSecondary}>
            <RefreshCw size={13}/> {t("common.refresh", "刷新")}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {/* View mode toggle */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-card)", borderRadius: 8,
          padding: 3, border: "1px solid var(--border)", flexShrink: 0 }}>
          {([["grouped", <LayoutGrid size={13}/>, t("ui.分组视图", "分组视图")],
             ["flat",    <List size={13}/>,       t("ui.列表视图", "列表视图")]] as const).map(([mode, icon, label]) => (
            <button key={mode} type="button" onClick={() => setViewMode(mode as "grouped" | "flat")}
              title={label}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: viewMode === mode ? "var(--color-primary)" : "transparent",
                color: viewMode === mode ? "var(--bg-card)" : "var(--text-secondary)",
                transition: "all 0.15s" }}>
              {icon} <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Type tabs */}
        <div style={{ display: "flex", gap: 6 }}>
          {([["ALL", t("ui.全部", "全部")], ["REAL", "✅ " + t("ui.正式员工", "正式员工")], ["TEST", "🧪 " + t("ui.测试账号", "测试账号")]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTypeFilter(key)}
              className={`${s.tabPill} ${typeFilter === key ? s.tabPillActive : ""}`}>
              {label}
              <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.75 }}>({counts[key]})</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180,
          background: "var(--bg-card)", borderRadius: 8, padding: "7px 12px",
          border: "1px solid var(--border)", maxWidth: 280 }}>
          <Search size={13} color="var(--text-secondary)" style={{ flexShrink: 0 }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t("ui.搜索姓名账号角色", "搜索姓名、账号、角色…")}
            style={{ border: "none", background: "transparent", outline: "none",
              fontSize: 13, color: "var(--text-primary)", width: "100%" }}/>
          {search && (
            <button type="button" onClick={() => setSearch("")}
              style={{ border: "none", background: "transparent", cursor: "pointer",
                color: "var(--text-secondary)", padding: 0, fontSize: 14, lineHeight: 1 }}>✕</button>
          )}
        </div>

        {/* Status filter */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className={s.inp} style={{ width: "auto", padding: "7px 10px", fontSize: 13, minWidth: 100,
            borderColor: statusFilter !== "ALL" ? "var(--color-primary)" : undefined }}>
          <option value="ALL">{t("ui.全部状态", "全部状态")}</option>
          <option value="ACTIVE">✅ {t("status.normal", "正常")}</option>
          <option value="FROZEN">🔒 {t("ui.已冻结", "已冻结")}</option>
        </select>

        {/* Role filter */}
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className={s.inp} style={{ width: "auto", padding: "7px 10px", fontSize: 13, minWidth: 140,
            borderColor: roleFilter ? "var(--color-primary)" : undefined }}>
          <option value="">{t("ui.全部角色", "全部角色")}</option>
          {allRoles.map(r => <option key={r.role_code} value={r.role_code}>{r.role_name_zh}</option>)}
        </select>

        {hasActiveFilters && (
          <button type="button" onClick={() => { setSearch(""); setStatusFilter("ALL"); setRoleFilter(""); }}
            style={{ fontSize: 12, color: "var(--status-danger)", background: "var(--status-danger-bg-faint)",
              border: "1px solid var(--status-danger-bg-medium)", borderRadius: 6,
              padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
            {t("ui.清除筛选", "清除筛选")}
          </button>
        )}
      </div>

      {/* User table / grouped view */}
      {loading ? (
        <div className={s.card}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14 }}>
              <div className={s.shimmer} style={{ width: 120, height: 14, borderRadius: 4 }}/>
              <div className={s.shimmer} style={{ width: 80, height: 14, borderRadius: 4 }}/>
              <div className={s.shimmer} style={{ width: 100, height: 14, borderRadius: 4, marginLeft: "auto" }}/>
            </div>
          ))}
        </div>
      ) : viewMode === "grouped" ? (
        /* ── Grouped view ─────────────────────────────────────────── */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {userGroups.length === 0 ? (
            <div className={s.card}>
              <div className={s.emptyState}>
                <Users size={40}/>
                <div className={s.emptyStateText}>{search || hasActiveFilters ? t("ui.没有匹配的用户", "没有匹配的用户") : t("ui.暂无用户账号", "暂无用户账号")}</div>
                <div className={s.emptyStateHint}>
                  {search || hasActiveFilters ? t("ui.尝试修改搜索条件或清除筛选", "尝试修改搜索条件或清除筛选") : t("ui.点击新建用户添加第一个账号", "点击「新建用户」添加第一个账号")}
                </div>
              </div>
            </div>
          ) : userGroups.map(({ type, meta, users: groupUsers }) => {
            const collapsed = collapsedGroups.has(type);
            return (
              <div key={type} className={s.card}
                style={{ overflow: "hidden", borderLeft: `3px solid ${meta.color}` }}>
                {/* Group header */}
                <div onClick={() => toggleGroup(type)}
                  style={{ display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 18px", cursor: "pointer", userSelect: "none",
                    background: meta.color + "0d",
                    borderBottom: collapsed ? "none" : "1px solid var(--border)" }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{meta.emoji}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: meta.color }}>{meta.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 9px", borderRadius: 10,
                    background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}33` }}>
                    {groupUsers.length} {t("ui.人", "人")}
                  </span>
                  <span style={{ marginLeft: "auto", color: "var(--text-secondary)", display: "flex", alignItems: "center" }}>
                    {collapsed ? <ChevronRight size={15}/> : <ChevronDown size={15}/>}
                  </span>
                </div>
                {/* Group table */}
                {!collapsed && (
                  <table className={s.table}>
                    <tbody>
                      {groupUsers.map((u, i) => {
                        const rolesSorted = [...(u.roles_detail || [])].sort((a, b) => b.approval_level - a.approval_level);
                        return (
                          <tr key={u.id} className={`${s.rowEnter} ${s.rowEnterStagger}`}
                            style={{ "--i": i, background: u.status === "FROZEN" ? "var(--status-danger-bg-page)" : u.user_type === "TEST" ? "rgba(124,58,237,0.03)" : "transparent" } as any}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span className={s.code}>{u.username}</span>
                                <UserTypeBadge type={u.user_type || "REAL"}/>
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
                                ID: {u.id}{u.store_code && u.store_code !== "ALL" ? ` · ${t("ui.门店", "门店")}: ${u.store_code}` : ""}
                              </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{u.real_name_zh}</td>
                            <td>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {rolesSorted.slice(0, 3).map(r => {
                                  const col = levelColor(r.approval_level);
                                  return (
                                    <span key={r.role_code} style={{ fontSize: 11, fontWeight: r.is_primary ? 700 : 400,
                                      padding: "2px 7px", borderRadius: 10, display: "flex", alignItems: "center", gap: 3,
                                      background: col + "18", color: col, border: `1px solid ${col}33` }}>
                                      {r.is_primary && <Star size={9} style={{ fill: col }}/>}
                                      {r.role_name_zh}
                                    </span>
                                  );
                                })}
                                {rolesSorted.length > 3 && (
                                  <span style={{ fontSize: 11, color: "var(--text-secondary)",
                                    padding: "2px 6px", borderRadius: 10,
                                    background: "var(--bg-page)", border: "1px solid var(--border)" }}>
                                    +{rolesSorted.length - 3}
                                  </span>
                                )}
                                {rolesSorted.length === 0 && (
                                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                    {t("ui.未分配角色", "未分配角色")}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span className={`${s.dot} ${u.status === "ACTIVE" ? s.dotOnline : s.dotOffline}`}/>
                                <span className={`${s.badge} ${u.status === "ACTIVE" ? s.badgeSuccess : s.badgeDanger}`}>
                                  {u.status === "ACTIVE" ? t("status.normal", "正常") : t("ui.已冻结", "已冻结")}
                                </span>
                              </div>
                            </td>
                            <td>
                              {u.username === "admin" ? (
                                <div style={{ textAlign: "right" }}>
                                  <span className={`${s.badge} ${s.badgeWarning}`}>{t("ui.超管保护", "超管保护")}</span>
                                </div>
                              ) : (
                                <div className={s.tableActions}>
                                  {canEdit && (
                                    <button type="button" onClick={() => handleEdit(u)} className={s.btnIcon} title={t("common.edit", "编辑")}>
                                      <Edit2 size={13}/>
                                    </button>
                                  )}
                                  <button type="button" onClick={() => handleToggle(u)}
                                    className={`${s.btnSm} ${u.status === "ACTIVE" ? s.btnDanger : s.btnSecondary}`}>
                                    {u.status === "ACTIVE" ? <><Lock size={11}/>{t("ui.冻结", "冻结")}</> : <><Unlock size={11}/>{t("ui.解冻", "解冻")}</>}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
          {/* Grouped view footer */}
          {userGroups.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 4px", fontSize: 12, color: "var(--text-secondary)" }}>
              <span>
                {t("common.total", "共")} <strong style={{ color: "var(--text-primary)" }}>{filtered.length}</strong> {t("ui.人", "人")} ·{" "}
                {userGroups.length} {t("ui.个分组", "个分组")}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => setCollapsedGroups(new Set())}
                  style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                    border: "1px solid var(--border)", background: "var(--bg-card)",
                    color: "var(--text-secondary)" }}>
                  {t("ui.全部展开", "全部展开")}
                </button>
                <button type="button" onClick={() => setCollapsedGroups(new Set(userGroups.map(g => g.type)))}
                  style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                    border: "1px solid var(--border)", background: "var(--bg-card)",
                    color: "var(--text-secondary)" }}>
                  {t("ui.全部折叠", "全部折叠")}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Flat table view ──────────────────────────────────────── */
        <div className={s.card}>
          <table className={s.table}>
            <thead>
              <tr>
                {([
                  ["username",     t("ui.用户名类型", "用户名 / 类型")],
                  ["real_name_zh", t("ui.姓名", "姓名")],
                  ["role_name_zh", t("ui.角色权限", "角色权限")],
                  ["status",      t("common.status", "状态")],
                ] as [SortKey, string][]).map(([col, label]) => (
                  <th key={col} onClick={() => handleSort(col)}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center" }}>
                      {label}<SortIcon col={col}/>
                    </span>
                  </th>
                ))}
                <th style={{ textAlign: "right" }}>{t("common.operation", "操作")}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={5}>
                  <div className={s.emptyState}>
                    <Users size={40}/>
                    <div className={s.emptyStateText}>{search || hasActiveFilters ? t("ui.没有匹配的用户", "没有匹配的用户") : t("ui.暂无用户账号", "暂无用户账号")}</div>
                    <div className={s.emptyStateHint}>
                      {search || hasActiveFilters ? t("ui.尝试修改搜索条件或清除筛选", "尝试修改搜索条件或清除筛选") : t("ui.点击新建用户添加第一个账号", "点击「新建用户」添加第一个账号")}
                    </div>
                  </div>
                </td></tr>
              ) : paginated.map((u, i) => {
                const rolesSorted = [...(u.roles_detail || [])].sort((a, b) => b.approval_level - a.approval_level);
                return (
                  <tr key={u.id} className={`${s.rowEnter} ${s.rowEnterStagger}`}
                    style={{ "--i": i, background: u.status === "FROZEN" ? "var(--status-danger-bg-page)" : u.user_type === "TEST" ? "rgba(124,58,237,0.03)" : "transparent" } as any}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={s.code}>{u.username}</span>
                        <UserTypeBadge type={u.user_type || "REAL"}/>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
                        ID: {u.id}{u.store_code && u.store_code !== "ALL" ? ` · ${t("ui.门店", "门店")}: ${u.store_code}` : ""}
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{u.real_name_zh}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {rolesSorted.slice(0, 3).map(r => {
                          const col = levelColor(r.approval_level);
                          return (
                            <span key={r.role_code} style={{ fontSize: 11, fontWeight: r.is_primary ? 700 : 400,
                              padding: "2px 7px", borderRadius: 10, display: "flex", alignItems: "center", gap: 3,
                              background: col + "18", color: col, border: `1px solid ${col}33` }}>
                              {r.is_primary && <Star size={9} style={{ fill: col }}/>}
                              {r.role_name_zh}
                            </span>
                          );
                        })}
                        {rolesSorted.length > 3 && (
                          <span style={{ fontSize: 11, color: "var(--text-secondary)",
                            padding: "2px 6px", borderRadius: 10,
                            background: "var(--bg-page)", border: "1px solid var(--border)" }}>
                            +{rolesSorted.length - 3}
                          </span>
                        )}
                        {rolesSorted.length === 0 && (
                          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            {t("ui.未分配角色", "未分配角色")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className={`${s.dot} ${u.status === "ACTIVE" ? s.dotOnline : s.dotOffline}`}/>
                        <span className={`${s.badge} ${u.status === "ACTIVE" ? s.badgeSuccess : s.badgeDanger}`}>
                          {u.status === "ACTIVE" ? t("status.normal", "正常") : t("ui.已冻结", "已冻结")}
                        </span>
                      </div>
                    </td>
                    <td>
                      {u.username === "admin" ? (
                        <div style={{ textAlign: "right" }}>
                          <span className={`${s.badge} ${s.badgeWarning}`}>{t("ui.超管保护", "超管保护")}</span>
                        </div>
                      ) : (
                        <div className={s.tableActions}>
                          {canEdit && (
                            <button type="button" onClick={() => handleEdit(u)} className={s.btnIcon} title={t("common.edit", "编辑")}>
                              <Edit2 size={13}/>
                            </button>
                          )}
                          <button type="button" onClick={() => handleToggle(u)}
                            className={`${s.btnSm} ${u.status === "ACTIVE" ? s.btnDanger : s.btnSecondary}`}>
                            {u.status === "ACTIVE" ? <><Lock size={11}/>{t("ui.冻结", "冻结")}</> : <><Unlock size={11}/>{t("ui.解冻", "解冻")}</>}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", borderTop: "1px solid var(--border)",
              fontSize: 13, color: "var(--text-secondary)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span>{t("common.total", "共")} <strong style={{ color: "var(--text-primary)" }}>{filtered.length}</strong> {t("ui.条", "条")}</span>
                <span style={{ opacity: 0.4 }}>|</span>
                <span>{t("ui.每页", "每页")}</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); }}
                  style={{ border: "1px solid var(--border)", borderRadius: 6,
                    background: "var(--bg-card)", color: "var(--text-primary)",
                    padding: "3px 6px", fontSize: 13, cursor: "pointer" }}>
                  {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} {t("ui.条", "条")}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button type="button" onClick={() => setPage(1)} disabled={page === 1}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)",
                    background: "var(--bg-card)", cursor: page === 1 ? "not-allowed" : "pointer",
                    opacity: page === 1 ? 0.4 : 1, fontSize: 12 }}>«</button>
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)",
                    background: "var(--bg-card)", cursor: page === 1 ? "not-allowed" : "pointer",
                    opacity: page === 1 ? 0.4 : 1, fontSize: 12 }}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                    acc.push(p); return acc;
                  }, [])
                  .map((p, i) => p === "..." ? (
                    <span key={`e${i}`} style={{ padding: "4px 4px", fontSize: 12 }}>…</span>
                  ) : (
                    <button type="button" key={p} onClick={() => setPage(p as number)}
                      style={{ padding: "4px 9px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                        border: page === p ? "1px solid var(--color-primary)" : "1px solid var(--border)",
                        background: page === p ? "var(--color-primary)" : "var(--bg-card)",
                        color: page === p ? "var(--bg-card)" : "var(--text-primary)",
                        fontWeight: page === p ? 700 : 400 }}>
                      {p}
                    </button>
                  ))}
                <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)",
                    background: "var(--bg-card)", cursor: page === totalPages ? "not-allowed" : "pointer",
                    opacity: page === totalPages ? 0.4 : 1, fontSize: 12 }}>›</button>
                <button type="button" onClick={() => setPage(totalPages)} disabled={page === totalPages}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)",
                    background: "var(--bg-card)", cursor: page === totalPages ? "not-allowed" : "pointer",
                    opacity: page === totalPages ? 0.4 : 1, fontSize: 12 }}>»</button>
                <span style={{ marginLeft: 6, opacity: 0.6 }}>{page} / {totalPages} {t("ui.页", "页")}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit drawer */}
      <RightDrawer open={showDrawer} onClose={() => setShowDrawer(false)}
        title={editUser ? t("ui.编辑用户", "编辑用户") : t("ui.新建用户", "新建用户")} width="520px"
        footer={
          <div className={s.drawerFooter}>
            <button type="button" onClick={() => setShowDrawer(false)} className={s.btnSecondary}>{t("common.cancel", "取消")}</button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className={s.btnPrimaryGrad}>
              {submitting ? t("ui.处理中", "处理中...") : (editUser ? t("common.save", "保存修改") : t("ui.创建用户", "创建用户"))}
            </button>
          </div>
        }>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Basic Info */}
          <div className={s.formSection}><Users size={12}/>{t("ui.基本信息", "基本信息")}</div>
          <div className={s.field}>
            <label className={s.lbl}>{t("ui.登录用户名", "登录用户名")} {!editUser && <span style={{ color: "var(--status-danger)" }}>*</span>}</label>
            <input disabled={!!editUser} value={form.username} onChange={e => f("username", e.target.value)}
              placeholder="字母+数字，如 store_mgr2" className={s.inp}
              style={{ fontFamily: "monospace", opacity: editUser ? 0.6 : 1 }}/>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t("ui.姓名", "姓名")} <span style={{ color: "var(--status-danger)" }}>*</span></label>
            <input value={form.real_name_zh} onChange={e => f("real_name_zh", e.target.value)} placeholder="如 张三" className={s.inp}/>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t("ui.门店代码可选", "门店代码（可选）")}</label>
            <input value={form.store_code} onChange={e => f("store_code", e.target.value)} placeholder="如 STORE-VTE-01 或留空" className={s.inp}/>
          </div>

          {/* Account type (new only) */}
          {!editUser && (
            <>
              <div className={s.formSection}><UserCheck size={12}/>{t("ui.账号类型", "账号类型")}</div>
              <div className={s.field} style={{ display: "flex", gap: 10 }}>
                {([["REAL", "✅ " + t("ui.正式员工", "正式员工"), "var(--status-success)", "color-mix(in srgb, var(--status-success) 14%, transparent)", "var(--status-success)"], ["TEST", "🧪 " + t("ui.测试账号", "测试账号"), "var(--status-special)", "color-mix(in srgb, var(--status-special) 12%, transparent)", "var(--status-special)"]] as const).map(([val, lbl, col, bg, bc]) => (
                  <label key={val} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8,
                    border: `1.5px solid ${form.user_type === val ? bc : "var(--border)"}`, background: form.user_type === val ? bg : "var(--bg-card)",
                    cursor: "pointer", fontSize: 13, fontWeight: 600, color: form.user_type === val ? col : "var(--text-secondary)", transition: "all 0.18s" }}>
                    <input type="radio" name="user_type" value={val} checked={form.user_type === val} onChange={e => f("user_type", e.target.value)} style={{ accentColor: col }}/>{lbl}
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Multi-role picker */}
          <div className={s.formSection}><Shield size={12}/>{t("ui.角色权限分配", "角色权限分配")}</div>
          <div className={s.field}>
            <label className={s.lbl} style={{ marginBottom: 8 }}>
              {t("ui.系统角色", "系统角色")}
              {selectedRoles.length > 0 && (
                <span style={{ marginLeft: 6, fontSize: 11, color: "var(--color-primary)", fontWeight: 700 }}>
                  ({selectedRoles.length} {t("ui.个", "个")})
                </span>
              )}
            </label>
            <RolePicker
              allRoles={allRoles}
              selected={selectedRoles}
              onChange={setSelectedRoles}
            />
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>
              {t("ui.可为用户分配多个角色权限取各角色并集主角色用于显示", "可为用户分配多个角色，权限取各角色并集。主角色（★）用于显示")}
            </div>
          </div>

          {/* Password */}
          <div className={s.formSection} style={{ color: !editUser ? "var(--status-danger)" : form.newPassword ? "var(--status-warning)" : "var(--text-secondary)" }}>
            <Key size={12}/>{editUser ? t("ui.重置密码可选", "重置密码（可选）") : t("ui.初始密码", "初始密码")}
          </div>
          <div className={s.field}>
            {!editUser ? (
              <>
                <label className={s.lbl}>{t("ui.密码", "密码")} <span style={{ color: "var(--status-danger)" }}>*</span></label>
                <input type="password" value={form.password} onChange={e => f("password", e.target.value)}
                  placeholder={t("ui.至少8位含字母数字", "至少 8 位，含字母 + 数字")} className={s.inp}/>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 5 }}>
                  ⚠️ {t("ui.请告知用户初始密码登录后可在个人中心修改", "请告知用户初始密码，登录后可在个人中心修改")}
                </div>
              </>
            ) : (
              <>
                <label className={s.lbl}>{t("ui.新密码留空则不修改", "新密码（留空则不修改）")}</label>
                <input type="password" value={form.newPassword} onChange={e => f("newPassword", e.target.value)}
                  placeholder={t("ui.至少8位留空保持原密码", "至少 8 位；留空保持原密码")} className={s.inp}/>
                <div style={{ fontSize: 11, marginTop: 5,
                  color: form.newPassword && form.newPassword.length < 8 ? "var(--status-warning)" : form.newPassword ? "var(--status-success)" : "var(--text-secondary)" }}>
                  {form.newPassword && form.newPassword.length < 8
                    ? `⚠️ ${t("ui.密码长度不足8位", "密码长度不足 8 位")}`
                    : form.newPassword
                      ? `✓ ${t("ui.保存后将更新登录密码", "保存后将更新登录密码")}`
                      : t("ui.留空则保持原密码不变", "留空则保持原密码不变")}
                </div>
              </>
            )}
          </div>
        </div>
      </RightDrawer>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.nextStatus === "FROZEN" ? t("ui.冻结用户", "冻结用户") : t("ui.解冻用户", "解冻用户")}
        message={`${t("common.confirm", "确认")}${confirm.nextStatus === "FROZEN" ? t("ui.冻结", "冻结") : t("ui.解冻", "解冻")}${t("ui.用户", "用户")} ${confirm.user?.real_name_zh}？`}
        confirmLabel={confirm.nextStatus === "FROZEN" ? t("ui.确认冻结", "确认冻结") : t("ui.确认解冻", "确认解冻")}
        danger={confirm.nextStatus === "FROZEN"}
        onConfirm={doToggleStatus}
        onCancel={() => setConfirm({ open: false })}
      />
    </div>
  );
}

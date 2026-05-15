"use client";
/**
 * V3 角色权限管理 — 完整 RBAC 矩阵编辑
 * 设计参照: V3 DDL (sys_role + sys_menu + sys_user_role + sys_role_menu_permission + sys_role_conflict)
 *
 * 核心能力:
 *   1. 角色卡片列表（含用户绑定数）
 *   2. 编辑抽屉：菜单按 domain 动态加载 + V/C/E/D/A/X 三元组 checkbox
 *   3. 实时冲突预警（基于 sys_role_conflict 6 条 RACI 红线）
 *   4. 复制角色（含权限三元组）
 *   5. 权限矩阵全景视图（N 角色 × M 菜单）
 *   6. 删除前预警受影响用户数
 *   7. role_code 实时正则校验
 *   8. 敏感菜单 🔒 标记
 *
 * 权限码: V=查看 C=新增 E=编辑 D=删除 A=审批 X=导出 *=全部
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import RightDrawer from "@/components/RightDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
import {
  Shield, Plus, Trash2, Edit2, Save, Copy, Grid, AlertTriangle, Users, Lock, X,
} from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型定义 ─────────────────────────────────────────────────────────────
interface MenuItem {
  menu_code: string;
  menu_name_zh: string;
  menu_name_lo: string | null;
  route: string | null;
  icon: string | null;
  sort_order: number;
  sensitive: boolean;
}
interface MenuGroup {
  domain: string;
  domain_label_zh: string;
  domain_color: string;
  menus: MenuItem[];
}
interface RoleRow {
  role_id: number;
  role_code: string;
  role_name_zh: string;
  role_name_lo: string | null;
  role_type: string;
  approval_level: number;
  description: string | null;
}
interface RolePerm {
  menu_code: string;
  perm_codes: string;
}
interface ConflictRule {
  id: number;
  menu_a: string;
  menu_b: string;
  reason_zh: string;
  severity: "WARN" | "BLOCK" | "INFO";
}
interface MatrixCell {
  menu_code: string;
  perm_codes: string;
  granted: boolean;
}
interface MatrixRole {
  role_code: string;
  role_name_zh: string;
  role_type: string;
  is_admin: boolean;
  cells: MatrixCell[];
}
interface MatrixData {
  menus: Array<{ menu_code: string; menu_name_zh: string; domain: string; sensitive: boolean }>;
  matrix: MatrixRole[];
}

// 权限码元数据
const PERM_CODE_META: Record<string, { label: string; color: string; tip: string }> = {
  V: { label: "查看", color: "#3b82f6", tip: "查看（View）" },
  C: { label: "新增", color: "#22c55e", tip: "新增（Create）" },
  E: { label: "编辑", color: "#f59e0b", tip: "编辑（Edit）" },
  D: { label: "删除", color: "#ef4444", tip: "删除（Delete）" },
  A: { label: "审批", color: "#8b5cf6", tip: "审批（Approve）" },
  X: { label: "导出", color: "#06b6d4", tip: "导出（eXport）" },
};
const PERM_CODE_ORDER: Array<keyof typeof PERM_CODE_META> = ["V", "C", "E", "D", "A", "X"];

// role_code 格式：ROLE_ + 大写/数字/下划线
const ROLE_CODE_RE = /^ROLE_[A-Z][A-Z0-9_]*$/;

// ── API helpers ─────────────────────────────────────────────────────────
const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "");
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const apiGet = (path: string) => fetch(path, { headers: hdr() }).then((r) => r.json());
const apiPost = (path: string, body: any) =>
  fetch(path, { method: "POST", headers: hdr(), body: JSON.stringify(body) }).then((r) => r.json());
const apiPut = (path: string, body: any) =>
  fetch(path, { method: "PUT", headers: hdr(), body: JSON.stringify(body) }).then((r) => r.json());

// ─────────────────────────────────────────────────────────────────────────
export default function RoleManagementPage() {
  const toast = useToast();

  // 主数据
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRule[]>([]);
  const [userCountByRole, setUserCountByRole] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({ role_count: 0, menu_count: 0, sensitive_count: 0, conflict_count: 0 });
  const [loading, setLoading] = useState(false);

  // 抽屉 / 矩阵
  const [showDrawer, setShowDrawer] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);

  // 表单
  const [editCode, setEditCode] = useState<string | null>(null);  // 编辑模式时存原 role_code
  const [form, setForm] = useState({
    role_code: "ROLE_",
    role_name_zh: "",
    role_name_lo: "",
    role_type: "COMMON",
    approval_level: 1,
    description: "",
  });
  // perms: Map<menu_code, Set<perm_code>>
  const [perms, setPerms] = useState<Record<string, Set<string>>>({});
  const [codeError, setCodeError] = useState("");

  // 删除确认
  const [confirmDel, setConfirmDel] = useState<RoleRow | null>(null);

  // ── 数据加载 ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // 1) 角色列表（走 generic-crud sys_role 表）
      const r = await apiGet("/api/crud/sys_role");
      const rows: RoleRow[] = (r.data || r || []).map((d: any) => ({
        role_id: d.role_id,
        role_code: d.role_code,
        role_name_zh: d.role_name_zh,
        role_name_lo: d.role_name_lo,
        role_type: d.role_type || "COMMON",
        approval_level: d.approval_level ?? 0,
        description: d.description,
      }));
      setRoles(rows);

      // 2) 菜单分组（V3 真正的单一真相）
      const mg = await apiGet("/api/permissions/menus");
      setMenuGroups(mg.data || []);

      // 3) 冲突规则
      const cf = await apiGet("/api/permissions/conflicts");
      setConflicts(cf.data || []);

      // 4) 顶部统计
      const st = await apiGet("/api/permissions/stats");
      setStats({
        role_count: st.data?.role_count || rows.length,
        menu_count: st.data?.menu_count || 0,
        sensitive_count: st.data?.sensitive_count || 0,
        conflict_count: st.data?.conflict_count || 0,
      });
      setUserCountByRole(st.data?.user_count_by_role || {});
    } catch (e: any) {
      toast.error("加载失败: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── 平铺所有菜单（便于查找） ───────────────────────────────────────────
  const allMenus = useMemo(() => menuGroups.flatMap((g) => g.menus), [menuGroups]);

  // ── 实时冲突检测 ─────────────────────────────────────────────────────
  const currentConflicts = useMemo(() => {
    const grantedCodes = new Set(Object.keys(perms).filter((mc) => perms[mc] && perms[mc].size > 0));
    return conflicts.filter((c) => grantedCodes.has(c.menu_a) && grantedCodes.has(c.menu_b));
  }, [perms, conflicts]);

  const hasBlockingConflict = currentConflicts.some((c) => c.severity === "BLOCK");

  // ── 敏感权限计数 ─────────────────────────────────────────────────────
  const sensitiveCount = useMemo(() => {
    const sensSet = new Set(allMenus.filter((m) => m.sensitive).map((m) => m.menu_code));
    let n = 0;
    for (const mc of Object.keys(perms)) {
      if (sensSet.has(mc) && perms[mc] && perms[mc].size > 0) n++;
    }
    return n;
  }, [perms, allMenus]);

  // ── role_code 校验 ───────────────────────────────────────────────────
  const validateCode = useCallback((code: string) => {
    if (editCode) return ""; // 编辑模式 code 不可改
    if (!code.startsWith("ROLE_")) return "必须以 ROLE_ 开头";
    if (!ROLE_CODE_RE.test(code)) return "格式：ROLE_ + 大写字母/数字/下划线";
    if (roles.some((r) => r.role_code === code)) return "该角色代码已存在";
    return "";
  }, [editCode, roles]);

  useEffect(() => {
    if (showDrawer) setCodeError(validateCode(form.role_code));
  }, [form.role_code, validateCode, showDrawer]);

  // ── 操作 ────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditCode(null);
    setForm({ role_code: "ROLE_", role_name_zh: "", role_name_lo: "", role_type: "COMMON", approval_level: 1, description: "" });
    setPerms({});
    setCodeError("");
    setShowDrawer(true);
  };

  const openEdit = async (role: RoleRow) => {
    setEditCode(role.role_code);
    setForm({
      role_code: role.role_code,
      role_name_zh: role.role_name_zh,
      role_name_lo: role.role_name_lo || "",
      role_type: role.role_type,
      approval_level: role.approval_level,
      description: role.description || "",
    });
    // 加载该角色现有的菜单权限三元组
    try {
      const r = await apiGet(`/api/permissions/role/${role.role_code}/perms`);
      const data: RolePerm[] = r.data || [];
      const p: Record<string, Set<string>> = {};
      for (const it of data) {
        p[it.menu_code] = new Set(it.perm_codes.split(",").map((x) => x.trim()).filter(Boolean));
      }
      setPerms(p);
    } catch (e: any) {
      toast.error("加载角色权限失败: " + e.message);
      setPerms({});
    }
    setCodeError("");
    setShowDrawer(true);
  };

  const openCopy = async (role: RoleRow) => {
    setEditCode(null);
    setForm({
      role_code: "ROLE_",
      role_name_zh: role.role_name_zh + " 副本",
      role_name_lo: role.role_name_lo || "",
      role_type: role.role_type,
      approval_level: role.approval_level,
      description: `（复制自 ${role.role_code}）${role.description || ""}`,
    });
    try {
      const r = await apiGet(`/api/permissions/role/${role.role_code}/perms`);
      const data: RolePerm[] = r.data || [];
      const p: Record<string, Set<string>> = {};
      for (const it of data) {
        p[it.menu_code] = new Set(it.perm_codes.split(",").map((x) => x.trim()).filter(Boolean));
      }
      setPerms(p);
    } catch {
      setPerms({});
    }
    setCodeError("请填入新的角色代码");
    setShowDrawer(true);
  };

  // 切换单菜单单权限码
  const togglePerm = (menuCode: string, code: string) => {
    setPerms((prev) => {
      const next = { ...prev };
      const set = new Set(next[menuCode] || []);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      if (set.size === 0) delete next[menuCode];
      else next[menuCode] = set;
      return next;
    });
  };

  // 一键给该菜单授全部 V/C/E/D/A/X
  const toggleMenuAll = (menuCode: string) => {
    setPerms((prev) => {
      const next = { ...prev };
      const cur = next[menuCode];
      const isAll = cur && PERM_CODE_ORDER.every((c) => cur.has(c));
      if (isAll) delete next[menuCode];
      else next[menuCode] = new Set(PERM_CODE_ORDER);
      return next;
    });
  };

  // 一键给整个 domain 授 V (只读)
  const toggleDomainView = (group: MenuGroup) => {
    setPerms((prev) => {
      const next = { ...prev };
      const allHasView = group.menus.every((m) => next[m.menu_code]?.has("V"));
      if (allHasView) {
        for (const m of group.menus) {
          const set = new Set(next[m.menu_code] || []);
          set.delete("V");
          if (set.size === 0) delete next[m.menu_code];
          else next[m.menu_code] = set;
        }
      } else {
        for (const m of group.menus) {
          const set = new Set(next[m.menu_code] || []);
          set.add("V");
          next[m.menu_code] = set;
        }
      }
      return next;
    });
  };

  // 保存
  const handleSubmit = async () => {
    if (!editCode) {
      const err = validateCode(form.role_code);
      if (err) { toast.error(err); return; }
    }
    if (!form.role_name_zh.trim()) { toast.error("角色中文名称必填"); return; }

    // BLOCK 级别冲突硬阻止
    if (hasBlockingConflict) {
      toast.error("存在 BLOCK 级岗位分离冲突，无法保存。请先取消冲突菜单的权限。");
      return;
    }

    setLoading(true);
    try {
      // 1) 写入/更新 sys_role 主表
      const roleBody = {
        role_code: form.role_code.toUpperCase(),
        role_name_zh: form.role_name_zh,
        role_name_lo: form.role_name_lo || null,
        role_type: form.role_type,
        approval_level: form.approval_level,
        description: form.description || null,
      };
      if (editCode) {
        await apiPut(`/api/crud/sys_role/${editCode}?pk=role_code`, roleBody);
      } else {
        const r = await apiPost("/api/crud/sys_role", roleBody);
        if (r.code && r.code !== 200) throw new Error(r.msg || "角色保存失败");
      }

      // 2) 批量覆盖三元组到 sys_role_menu_permission
      const permsPayload = Object.entries(perms)
        .filter(([, set]) => set && set.size > 0)
        .map(([menu_code, set]) => ({
          menu_code,
          perm_codes: Array.from(set).join(","),
        }));
      const setR = await apiPut(`/api/permissions/role/${roleBody.role_code}/perms`, { perms: permsPayload });
      if (setR.code && setR.code !== 200) throw new Error(setR.msg || "权限保存失败");

      toast.success(editCode ? "角色与权限已更新" : "角色已创建");
      setShowDrawer(false);
      loadAll();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    } finally {
      setLoading(false);
    }
  };

  // 删除
  const handleDelete = async () => {
    if (!confirmDel) return;
    if (confirmDel.role_code === "ROLE_ADMIN") {
      toast.error("超管角色不可删除");
      setConfirmDel(null);
      return;
    }
    try {
      const r = await fetch(`/api/crud/sys_role/${confirmDel.role_code}?pk=role_code`, {
        method: "DELETE", headers: hdr(),
      }).then((x) => x.json());
      if (r.code && r.code !== 200) throw new Error(r.msg);
      toast.success("已删除");
      setConfirmDel(null);
      loadAll();
    } catch (e: any) {
      toast.error("删除失败: " + e.message);
    }
  };

  // 矩阵全景
  const openMatrix = async () => {
    setShowMatrix(true);
    if (!matrixData) {
      const r = await apiGet("/api/permissions/matrix");
      setMatrixData(r.data);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <PageHeader
        title="角色与权限管理"
        subtitle="V3 RBAC：角色 × 菜单 × CRUD 三元组（V/C/E/D/A/X），含岗位分离红线"
        breadcrumb={["系统设置", "角色与权限"]}
        actions={
          <div style={{ display: "flex", gap: "8px" }}>
            <button className={s.btnSecondary} onClick={openMatrix}>
              <Grid size={14} /> 权限矩阵全景
            </button>
            <button className={s.btnPrimaryGrad} onClick={openNew}>
              <Plus size={14} /> 新建角色
            </button>
          </div>
        }
      />

      {/* 顶部统计胶囊 */}
      <div className={s.statsRow}>
        <StatPill label="角色总数"     value={stats.role_count}      color="var(--color-primary)" icon={<Shield size={14} />} />
        <StatPill label="菜单定义"     value={stats.menu_count}      color="#10b981" icon={<Grid size={14} />} />
        <StatPill label="敏感菜单"     value={stats.sensitive_count} color="#ef4444" icon={<Lock size={14} />} />
        <StatPill label="岗位分离规则" value={stats.conflict_count}  color="#f59e0b" icon={<AlertTriangle size={14} />} />
      </div>

      {/* 角色卡片列表 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
        {roles.map((role) => {
          const userCnt = userCountByRole[role.role_code] || 0;
          const isAdmin = role.role_code === "ROLE_ADMIN";
          return (
            <div key={role.role_code} className={s.card}>
              <div className={s.cardHeader} style={{ position: "relative" }}>
                {isAdmin && (
                  <div style={{
                    position: "absolute", top: 8, right: 8, width: 10, height: 10,
                    background: "#d97706", borderRadius: "50%",
                    boxShadow: "0 0 0 3px rgba(217,119,6,0.25)",
                  }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={s.cardTitle} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Shield size={16} color={isAdmin ? "#d97706" : "var(--color-primary)"} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{role.role_name_zh}</span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-secondary)", marginTop: 3 }}>
                    {role.role_code} · L{role.approval_level} · {role.role_type}
                  </div>
                  <div style={{ fontSize: 12, color: userCnt > 0 ? "var(--color-primary)" : "var(--text-secondary)", marginTop: 4, display: "flex", alignItems: "center", gap: 4, fontWeight: userCnt > 0 ? 600 : 400 }}>
                    <Users size={11} /> 绑定 {userCnt} 个用户
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className={s.btnIcon} title="复制" onClick={() => openCopy(role)}><Copy size={13} /></button>
                  <button className={s.btnIcon} title="编辑" onClick={() => openEdit(role)}><Edit2 size={13} /></button>
                  {!isAdmin && (
                    <button className={s.btnIcon} title="删除" onClick={() => setConfirmDel(role)} style={{ color: "var(--color-danger)" }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className={s.cardBody}>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                  {role.description || "（暂无说明）"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 编辑/新建 抽屉 ───────────────────────────────────────────── */}
      <RightDrawer isOpen={showDrawer} onClose={() => setShowDrawer(false)} title={editCode ? `编辑：${editCode}` : "新建角色"} width="620px">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* role_code */}
          <div className={s.field}>
            <label className={s.lbl}>角色代码 *</label>
            <input
              className={s.inp}
              disabled={!!editCode}
              value={form.role_code}
              onChange={(e) => setForm({ ...form, role_code: e.target.value.toUpperCase() })}
              placeholder="ROLE_CASHIER"
              style={{
                fontFamily: "monospace", fontWeight: 700,
                borderColor: !editCode && codeError ? "var(--color-danger)" : undefined,
              }}
            />
            {!editCode && codeError && (
              <div style={{ fontSize: 11, color: "var(--color-danger)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={10} /> {codeError}
              </div>
            )}
            {!editCode && !codeError && form.role_code !== "ROLE_" && (
              <div style={{ fontSize: 11, color: "var(--color-success)", marginTop: 4 }}>✓ 格式正确</div>
            )}
          </div>

          {/* name */}
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>中文名 *</label>
              <input className={s.inp} value={form.role_name_zh} onChange={(e) => setForm({ ...form, role_name_zh: e.target.value })} />
            </div>
            <div>
              <label className={s.lbl}>老挝语名</label>
              <input className={s.inp} value={form.role_name_lo} onChange={(e) => setForm({ ...form, role_name_lo: e.target.value })} />
            </div>
          </div>

          {/* role_type / approval_level */}
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>角色业务域</label>
              <select className={s.inp} value={form.role_type} onChange={(e) => setForm({ ...form, role_type: e.target.value })}>
                {["SYSTEM","DECISION","FINANCE","MANAGEMENT","PRODUCTION","QUALITY","PACKAGING","WAREHOUSE","LOGISTICS","COMMON","PROCUREMENT","STORE","SALES","EXTERNAL"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={s.lbl}>审批级别 0-99</label>
              <input className={s.inp} type="number" min={0} max={99} value={form.approval_level} onChange={(e) => setForm({ ...form, approval_level: Number(e.target.value) || 0 })} />
            </div>
          </div>

          {/* description */}
          <div className={s.field}>
            <label className={s.lbl}>角色说明</label>
            <textarea className={s.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="描述该角色的职能边界" />
          </div>

          {/* 冲突警告区 */}
          {currentConflicts.length > 0 && (
            <div style={{
              padding: 10, borderRadius: 8,
              background: hasBlockingConflict ? "#fef2f2" : "#fffbeb",
              border: `1px solid ${hasBlockingConflict ? "#fca5a5" : "#fcd34d"}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: hasBlockingConflict ? "#b91c1c" : "#92400e", display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                <AlertTriangle size={12} /> 检测到 {currentConflicts.length} 项岗位分离冲突
                {hasBlockingConflict && <span style={{ marginLeft: 8, padding: "1px 6px", background: "#dc2626", color: "white", borderRadius: 4, fontSize: 10 }}>BLOCK 硬阻止</span>}
              </div>
              {currentConflicts.map((c) => (
                <div key={c.id} style={{ fontSize: 11, color: hasBlockingConflict ? "#7f1d1d" : "#78350f", lineHeight: 1.5 }}>
                  • <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>{c.menu_a}</code> + <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>{c.menu_b}</code> [{c.severity}] {c.reason_zh}
                </div>
              ))}
            </div>
          )}

          {/* 权限矩阵 - 按 domain 分组 */}
          <div className={s.field}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label className={s.lbl} style={{ margin: 0 }}>菜单 × CRUD 权限</label>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "rgba(99,102,241,0.1)", color: "var(--color-primary)", fontWeight: 600 }}>
                已配 {Object.keys(perms).length} / {allMenus.length} 菜单
                {sensitiveCount > 0 && <span style={{ color: "#ef4444", marginLeft: 6 }}>· {sensitiveCount} 敏感</span>}
              </span>
            </div>

            {menuGroups.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: 12 }}>菜单加载中...</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {menuGroups.map((group) => (
                <div key={group.domain} style={{ border: `1px solid ${group.domain_color}33`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{
                    padding: "6px 12px", background: `${group.domain_color}14`,
                    borderBottom: `1px solid ${group.domain_color}22`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: group.domain_color }}>{group.domain_label_zh}</span>
                    <button
                      onClick={() => toggleDomainView(group)}
                      style={{
                        fontSize: 11, padding: "1px 8px", borderRadius: 4,
                        border: `1px solid ${group.domain_color}`,
                        background: "transparent", color: group.domain_color,
                        cursor: "pointer", fontWeight: 600,
                      }}>
                      一键授「查看」
                    </button>
                  </div>
                  <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {group.menus.map((menu) => {
                      const set = perms[menu.menu_code] || new Set<string>();
                      return (
                        <div key={menu.menu_code} style={{
                          display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8,
                          alignItems: "center", padding: "4px 8px", borderRadius: 4,
                          background: set.size > 0 ? `${group.domain_color}10` : "transparent",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                            {menu.sensitive && <Lock size={10} color="#ef4444" />}
                            <span title={menu.menu_code} style={{ fontWeight: set.size > 0 ? 600 : 400 }}>{menu.menu_name_zh}</span>
                          </div>
                          <div style={{ display: "flex", gap: 2 }}>
                            {PERM_CODE_ORDER.map((c) => {
                              const meta = PERM_CODE_META[c];
                              const on = set.has(c);
                              return (
                                <button
                                  key={c}
                                  title={meta.tip}
                                  onClick={() => togglePerm(menu.menu_code, c)}
                                  style={{
                                    minWidth: 22, height: 22, fontSize: 10, fontWeight: 700,
                                    borderRadius: 3, cursor: "pointer", border: `1px solid ${on ? meta.color : "var(--border-color)"}`,
                                    background: on ? meta.color : "var(--bg-surface)",
                                    color: on ? "white" : "var(--text-secondary)",
                                    transition: "all 0.1s",
                                  }}>
                                  {c}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            onClick={() => toggleMenuAll(menu.menu_code)}
                            style={{
                              fontSize: 10, padding: "1px 6px", borderRadius: 3,
                              border: "1px solid var(--border-color)",
                              background: PERM_CODE_ORDER.every((c) => set.has(c)) ? "var(--color-primary)" : "var(--bg-surface)",
                              color: PERM_CODE_ORDER.every((c) => set.has(c)) ? "white" : "var(--text-secondary)",
                              cursor: "pointer", fontWeight: 600,
                            }}>
                            全选
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 保存按钮 */}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className={s.btnSecondary} style={{ flex: 1 }} onClick={() => setShowDrawer(false)}>取消</button>
            <button
              className={s.btnPrimaryGrad}
              style={{ flex: 2 }}
              onClick={handleSubmit}
              disabled={loading || (!editCode && !!codeError) || hasBlockingConflict}
            >
              <Save size={14} /> {loading ? "保存中…" : (hasBlockingConflict ? "存在 BLOCK 冲突 - 无法保存" : (currentConflicts.length > 0 ? "保存（含 WARN 冲突）" : "保存"))}
            </button>
          </div>
        </div>
      </RightDrawer>

      {/* ── 权限矩阵全景 ────────────────────────────────────────────── */}
      {showMatrix && (
        <div onClick={() => setShowMatrix(false)} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--bg-surface)", borderRadius: 12,
            width: "95vw", height: "92vh", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className={s.cardTitle} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Grid size={18} /> 角色 × 菜单 × CRUD 矩阵全景 — {matrixData?.matrix?.length || 0} 角色 × {matrixData?.menus?.length || 0} 菜单
              </div>
              <button className={s.btnIcon} onClick={() => setShowMatrix(false)}><X size={16} /></button>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {!matrixData ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>加载中...</div>
              ) : (
                <table className={s.table} style={{ minWidth: "100%", fontSize: 10 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 5 }}>
                    <tr>
                      <th style={{
                        padding: "8px 10px", borderBottom: "2px solid var(--border-color)", borderRight: "1px solid var(--border-color)",
                        textAlign: "left", position: "sticky", left: 0, background: "var(--bg-surface)", zIndex: 6, minWidth: 180,
                      }}>角色 ↓ / 菜单 →</th>
                      {matrixData.menus.map((m) => (
                        <th key={m.menu_code} title={m.menu_code} style={{
                          padding: "6px 4px", borderBottom: "2px solid var(--border-color)",
                          borderRight: "1px solid var(--border-color)",
                          minWidth: 60, maxWidth: 60,
                          writingMode: "vertical-rl", textAlign: "left",
                          fontWeight: 600,
                          background: m.sensitive ? "#fef2f2" : "transparent",
                        }}>
                          {m.menu_name_zh}{m.sensitive ? " 🔒" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.matrix.map((r) => (
                      <tr key={r.role_code}>
                        <td style={{ padding: "6px 10px", borderRight: "1px solid var(--border-color)", borderBottom: "1px solid var(--border-color)", position: "sticky", left: 0, background: "var(--bg-surface)", fontWeight: 600, fontSize: 11 }}>
                          <div>{r.role_name_zh}</div>
                          <div style={{ fontSize: 9, color: "var(--text-secondary)", fontFamily: "monospace" }}>{r.role_code}</div>
                        </td>
                        {r.cells.map((c) => (
                          <td key={c.menu_code} style={{
                            padding: "3px 2px", textAlign: "center",
                            borderRight: "1px solid var(--border-color)", borderBottom: "1px solid var(--border-color)",
                            background: c.granted ? (r.is_admin ? "#fbbf24" : "rgba(99,102,241,0.15)") : "transparent",
                            color: c.granted ? (r.is_admin ? "#78350f" : "var(--color-primary)") : "var(--text-secondary)",
                            fontWeight: c.granted ? 700 : 400,
                            fontSize: 9, fontFamily: "monospace",
                          }}>
                            {c.perm_codes === "*" ? "*" : (c.perm_codes || "·")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 删除确认 ─────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!confirmDel}
        title={`删除角色：${confirmDel?.role_name_zh || ""}`}
        message={
          confirmDel
            ? `${(userCountByRole[confirmDel.role_code] || 0) > 0
                ? `⚠️ 该角色仍有 ${userCountByRole[confirmDel.role_code]} 个用户绑定！删除后这些用户将失去对应权限。建议先转移用户角色。\n\n`
                : ""}确认删除角色 [${confirmDel.role_code}]?`
            : ""
        }
        confirmLabel={
          confirmDel && (userCountByRole[confirmDel.role_code] || 0) > 0
            ? `仍然删除（影响 ${userCountByRole[confirmDel.role_code]} 个用户）`
            : "确认删除"
        }
        onConfirm={handleDelete}
        onCancel={() => setConfirmDel(null)}
        danger
      />
    </div>
  );
}

// ── 顶部统计胶囊 ─────────────────────────────────────────────────────
function StatPill({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className={s.statCard} style={{ borderLeft: `4px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color, marginBottom: 4 }}>
        {icon} <span className={s.statLabel}>{label}</span>
      </div>
      <div className={s.statValue} style={{ color }}>{value}</div>
    </div>
  );
}

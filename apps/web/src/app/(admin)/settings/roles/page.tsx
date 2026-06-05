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
import { RightDrawer } from "@/components/ui/RightDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Shield, Plus, Trash2, Edit2, Save, Copy, Grid, AlertTriangle, Users, Lock, X,
  ChevronDown, ChevronRight,
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
  V: { label: "查看", color: "var(--color-accent)", tip: "查看（View）" },
  C: { label: "新增", color: "var(--status-success)", tip: "新增（Create）" },
  E: { label: "编辑", color: "var(--status-warning)", tip: "编辑（Edit）" },
  D: { label: "删除", color: "var(--status-danger)", tip: "删除（Delete）" },
  A: { label: "审批", color: "var(--status-special)", tip: "审批（Approve）" },
  X: { label: "导出", color: "var(--color-accent)", tip: "导出（eXport）" },
};
const PERM_CODE_ORDER: Array<keyof typeof PERM_CODE_META> = ["V", "C", "E", "D", "A", "X"];

// role_code 格式：ROLE_ + 大写/数字/下划线
const ROLE_CODE_RE = /^ROLE_[A-Z][A-Z0-9_]*$/;

// 各业务域默认角色说明（新建角色时自动填充，可手动修改）
const ROLE_TYPE_DEFAULT_DESC: Record<string, string> = {
  SYSTEM:      "系统管理员，负责系统配置、用户权限、组织架构及基础数据维护。拥有最高操作权限，须由专职 IT 人员担任。",
  DECISION:    "决策层管理角色，拥有全局数据查看与审批权限，负责战略决策与绩效审核，通常不参与日常业务操作。",
  FINANCE:     "财务管理角色，负责应收应付、成本核算、财务结算及审计合规，须遵守岗位分离原则，不兼任收款与审计。",
  MANAGEMENT:  "管理层角色，负责跨部门协调、审批流程及运营报表查阅，具备所辖业务域的查看与审批权限。",
  PRODUCTION:  "生产作业角色，负责养殖生产日报录入、鸡群档案管理及免疫用药记录，数据权限限定于所属养殖场。",
  QUALITY:     "质检追溯角色，负责场端与成品质检、不合格品处置及品质标准维护，提出人与审批人须分离。",
  PACKAGING:   "包装作业角色，负责分级包装操作、批次管理及异常处理，作业数据仅限当日班次范围。",
  WAREHOUSE:   "仓储管理角色，负责出入库操作、库存盘点、调拨及仓库主档管理，不兼任分级统计岗位。",
  LOGISTICS:   "物流配送角色，负责配货计划制定、配送波次跟踪及到店签收，装车执行与出库复核须双人分离。",
  COMMON:      "通用业务角色，承担跨部门基础操作，具体权限范围视业务需要分配，适用于兼岗或临时授权场景。",
  PROCUREMENT: "采购供应角色，负责采购申请、订单跟进、到货收货及供应商档案管理，付款审批须由上级审批人完成。",
  STORE:       "门店运营角色，负责门店收货验收、库存管理、补货申请及日结操作，权限范围限定于所属门店。",
  SALES:       "销售营销角色，负责客户档案维护、订单管理、B2B 分销及会员营销活动，不兼任财务审计岗位。",
  EXTERNAL:    "外部合作角色，权限范围受限，仅可访问指定的协作功能模块，数据可见范围由管理员单独配置。",
  FIELD:       "一线作业角色，负责现场生产、质检或仓库具体操作，权限范围限定于所属班组或工作站，不具备管理审批权限。",
};

// ── role_type 分组元数据（展示顺序 / 中文标签 / 颜色）────────────────────
const ROLE_TYPE_META: Record<string, { label: string; color: string; emoji: string; order: number }> = {
  SYSTEM:      { label: "系统管理",  color: "var(--status-special)", emoji: "⚙️",  order: 0 },
  DECISION:    { label: "决策层",    color: "var(--status-warning)", emoji: "🏛️",  order: 1 },
  MANAGEMENT:  { label: "管理层",    color: "var(--color-accent)", emoji: "📋",  order: 2 },
  FINANCE:     { label: "财务",      color: "var(--color-accent)", emoji: "💰",  order: 3 },
  PRODUCTION:  { label: "养殖生产",  color: "var(--status-success)", emoji: "🐔",  order: 4 },
  QUALITY:     { label: "质检追溯",  color: "var(--status-success)", emoji: "🧪",  order: 5 },
  PACKAGING:   { label: "包装作业",  color: "var(--status-success)", emoji: "📦",  order: 6 },
  WAREHOUSE:   { label: "仓储",      color: "var(--status-warning)", emoji: "🏭",  order: 7 },
  LOGISTICS:   { label: "物流配送",  color: "var(--status-warning)", emoji: "🚚",  order: 8 },
  PROCUREMENT: { label: "采购供应",  color: "var(--status-special)", emoji: "🛒",  order: 9 },
  STORE:       { label: "门店",      color: "var(--color-accent)", emoji: "🏪",  order: 10 },
  SALES:       { label: "销售营销",  color: "var(--color-accent)", emoji: "📊",  order: 11 },
  FIELD:       { label: "一线作业",  color: "var(--text-secondary)", emoji: "🔧",  order: 12 },
  COMMON:      { label: "通用",      color: "var(--text-disabled)", emoji: "🔗",  order: 13 },
  EXTERNAL:    { label: "外部合作",  color: "var(--text-secondary)", emoji: "🌐",  order: 14 },
};
const TYPE_META_FALLBACK = { label: "其他", color: "var(--text-disabled)", emoji: "📁", order: 99 };

// ── API helpers ─────────────────────────────────────────────────────────
const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "");
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const apiGet = (path: string) => fetch(path, { headers: hdr() }).then((r) => r.json());
const apiPost = (path: string, body: Record<string, unknown>) =>
  fetch(path, { method: "POST", headers: hdr(), body: JSON.stringify(body) }).then((r) => r.json());
const apiPut = (path: string, body: Record<string, unknown>) =>
  fetch(path, { method: "PUT", headers: hdr(), body: JSON.stringify(body) }).then((r) => r.json());

// ─────────────────────────────────────────────────────────────────────────
export default function RoleManagementPage() {
  const toast = useToast();
  const { t } = useLanguage();

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

  // 分组折叠状态（默认全展开）
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (type: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });

  // 按 role_type 分组，组内按 approval_level 降序排列
  const roleGroups = useMemo(() => {
    const map = new Map<string, RoleRow[]>();
    for (const role of roles) {
      const type = role.role_type || "COMMON";
      if (!map.has(type)) map.set(type, []);
      map.get(type)!.push(role);
    }
    // 组内按 approval_level 降序，相同则按 role_name_zh 升序
    for (const arr of map.values()) {
      arr.sort((a, b) => b.approval_level - a.approval_level || a.role_name_zh.localeCompare(b.role_name_zh));
    }
    // 组间按预定义顺序排列，未知类型排末尾
    return Array.from(map.entries()).sort(([a], [b]) => {
      const oa = (ROLE_TYPE_META[a] ?? TYPE_META_FALLBACK).order;
      const ob = (ROLE_TYPE_META[b] ?? TYPE_META_FALLBACK).order;
      return oa - ob;
    });
  }, [roles]);

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
  // 注意：不要把 toast/t 放进依赖数组，它们每次渲染都是新引用，会造成无限循环
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // 1) 角色列表（generic-crud 返回 { code:200, data: [...] } 或直接数组）
      const r = await apiGet("/api/crud/sys_role");
      const raw = Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : [];
      const rows: RoleRow[] = raw.map((d: Record<string, unknown>) => ({
        role_id: d.role_id,
        role_code: d.role_code,
        role_name_zh: d.role_name_zh,
        role_name_lo: d.role_name_lo,
        role_type: d.role_type || "COMMON",
        approval_level: d.approval_level ?? 0,
        description: d.description,
      }));
      setRoles(rows);

      // 2) 菜单分组
      const mg = await apiGet("/api/permissions/menus");
      setMenuGroups(Array.isArray(mg.data) ? mg.data : []);

      // 3) 冲突规则
      const cf = await apiGet("/api/permissions/conflicts");
      setConflicts(Array.isArray(cf.data) ? cf.data : []);

      // 4) 顶部统计
      const st = await apiGet("/api/permissions/stats");
      setStats({
        role_count: st.data?.role_count ?? rows.length,
        menu_count: st.data?.menu_count ?? 0,
        sensitive_count: st.data?.sensitive_count ?? 0,
        conflict_count: st.data?.conflict_count ?? 0,
      });
      setUserCountByRole(st.data?.user_count_by_role ?? {});
    } catch (e: any) {
      // 用 setTimeout 避免在渲染阶段触发 state 更新
      setTimeout(() => toast.error("加载失败: " + (e.message || String(e))), 0);
    } finally {
      setLoading(false);
    }
  // toast/t are intentionally omitted: they are context functions that change
  // reference every render; including them would trigger infinite re-fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── 平铺所有菜单（便于查找） ───────────────────────────────────────────
  const allMenus = useMemo(() => menuGroups.flatMap((g) => g.menus), [menuGroups]);

  // ── 实时冲突检测 ─────────────────────────────────────────────────────
  // SoD 原则：当且仅当角色对冲突两侧菜单都持有「写操作」权限时才视为冲突。
  // 单纯的 V（查看）或 X（导出）不构成职责混淆，不触发红线。
  const WRITE_PERM_CODES = useMemo(() => new Set(['C', 'E', 'D', 'A']), []);

  const currentConflicts = useMemo(() => {
    // 持有至少一项写权限（C/E/D/A）的菜单集合
    const writeGranted = new Set(
      Object.keys(perms).filter((mc) => {
        const set = perms[mc];
        return set && set.size > 0 && Array.from(set).some((c) => WRITE_PERM_CODES.has(c));
      })
    );
    return conflicts.filter((c) => writeGranted.has(c.menu_a) && writeGranted.has(c.menu_b));
  }, [perms, conflicts, WRITE_PERM_CODES]);

  const hasBlockingConflict = currentConflicts.some((c) => c.severity === "BLOCK");

  // ── 敏感权限计数 ─────────────────────────────────────────────────────
  // 只有对敏感菜单持有写权限（C/E/D/A）时才计入，纯 View 不算敏感风险
  const sensitiveCount = useMemo(() => {
    const sensSet = new Set(allMenus.filter((m) => m.sensitive).map((m) => m.menu_code));
    let n = 0;
    for (const mc of Object.keys(perms)) {
      const set = perms[mc];
      if (sensSet.has(mc) && set && Array.from(set).some((c) => WRITE_PERM_CODES.has(c))) n++;
    }
    return n;
  }, [perms, allMenus, WRITE_PERM_CODES]);

  // ── role_code 校验 ───────────────────────────────────────────────────
  const validateCode = useCallback((code: string) => {
    if (editCode) return ""; // 编辑模式 code 不可改
    if (!code.startsWith("ROLE_")) return t("ui.必须以ROLE_开头","必须以 ROLE_ 开头");
    if (!ROLE_CODE_RE.test(code)) return t("ui.格式ROLE_大写字母数字下划线","格式：ROLE_ + 大写字母/数字/下划线");
    if (roles.some((r) => r.role_code === code)) return t("ui.该角色代码已存在","该角色代码已存在");
    return "";
  }, [editCode, roles]);

  useEffect(() => {
    if (showDrawer) setCodeError(validateCode(form.role_code));
  }, [form.role_code, validateCode, showDrawer]);

  // ── 操作 ────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditCode(null);
    const defaultType = "COMMON";
    setForm({ role_code: "ROLE_", role_name_zh: "", role_name_lo: "", role_type: defaultType, approval_level: 1, description: ROLE_TYPE_DEFAULT_DESC[defaultType] });
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
      toast.error(t("ui.加载角色权限失败","加载角色权限失败") + ": " + e.message);
      setPerms({});
    }
    setCodeError("");
    setShowDrawer(true);
  };

  const openCopy = async (role: RoleRow) => {
    setEditCode(null);
    setForm({
      role_code: "ROLE_",
      role_name_zh: role.role_name_zh + " " + t("ui.副本","副本"),
      role_name_lo: role.role_name_lo || "",
      role_type: role.role_type,
      approval_level: role.approval_level,
      description: `（${t("ui.复制自","复制自")} ${role.role_code}）${role.description || ""}`,
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
    setCodeError(t("ui.请填入新的角色代码","请填入新的角色代码"));
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
    if (!form.role_name_zh.trim()) { toast.error(t("ui.角色中文名称必填","角色中文名称必填")); return; }

    // BLOCK 级别冲突硬阻止
    if (hasBlockingConflict) {
      toast.error(t("ui.存在BLOCK级岗位分离冲突无法保存请先取消冲突菜单的权限","存在 BLOCK 级岗位分离冲突，无法保存。请先取消冲突菜单的权限。"));
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
        if (r.code && r.code !== 200) throw new Error(r.msg || t("ui.角色保存失败","角色保存失败"));
      }

      // 2) 批量覆盖三元组到 sys_role_menu_permission
      const permsPayload = Object.entries(perms)
        .filter(([, set]) => set && set.size > 0)
        .map(([menu_code, set]) => ({
          menu_code,
          perm_codes: Array.from(set).join(","),
        }));
      const setR = await apiPut(`/api/permissions/role/${roleBody.role_code}/perms`, { perms: permsPayload });
      if (setR.code && setR.code !== 200) throw new Error(setR.msg || t("ui.权限保存失败","权限保存失败"));

      toast.success(editCode ? t("ui.角色与权限已更新","角色与权限已更新") : t("ui.角色已创建","角色已创建"));
      setShowDrawer(false);
      loadAll();
    } catch (e: any) {
      toast.error(e.message || t("ui.保存失败","保存失败"));
    } finally {
      setLoading(false);
    }
  };

  // 删除
  const handleDelete = async () => {
    if (!confirmDel) return;
    if (confirmDel.role_code === "ROLE_ADMIN") {
      toast.error(t("ui.超管角色不可删除","超管角色不可删除"));
      setConfirmDel(null);
      return;
    }
    try {
      const r = await fetch(`/api/crud/sys_role/${confirmDel.role_code}?pk=role_code`, {
        method: "DELETE", headers: hdr(),
      }).then((x) => x.json());
      if (r.code && r.code !== 200) throw new Error(r.msg);
      toast.success(t("ui.已删除","已删除"));
      setConfirmDel(null);
      loadAll();
    } catch (e: any) {
      toast.error(t("ui.删除失败","删除失败") + ": " + e.message);
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
        title={t("ui.角色与权限管理","角色与权限管理")}
        subtitle={t("ui.V3RBAC角色菜单CRUD三元组含岗位分离红线","角色 × 菜单 × 操作权限三维管控（查/创/改/删/审/导），含岗位分离红线")}
        breadcrumb={[t("ui.系统设置","系统设置"), t("ui.角色与权限","角色与权限")]}
        actions={
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className={s.btnSecondary} onClick={openMatrix}>
              <Grid size={14} /> {t("ui.权限矩阵全景","权限矩阵全景")}
            </button>
            <button type="button" className={s.btnPrimaryGrad} onClick={openNew}>
              <Plus size={14} /> {t("ui.新建角色","新建角色")}
            </button>
          </div>
        }
      />

      {/* 顶部统计胶囊 */}
      <div className={s.statsRow}>
        <StatPill label={t("ui.角色总数","角色总数")}     value={stats.role_count}      color="var(--color-primary)" icon={<Shield size={14} />}      tip="系统中已定义的角色数量" />
        <StatPill label={t("ui.菜单定义","菜单定义")}     value={stats.menu_count}      color="var(--status-success)" icon={<Grid size={14} />}           tip="系统注册的菜单/功能点总数" />
        <StatPill label={t("ui.敏感菜单","敏感菜单")}     value={stats.sensitive_count} color="var(--status-danger)" icon={<Lock size={14} />}            tip="标记为高风险的菜单数（如财务审计、审批、结算等），仅统计数量，不代表错误" />
        <StatPill label={t("ui.岗位分离规则","岗位分离规则")} value={stats.conflict_count}  color="var(--status-warning)" icon={<AlertTriangle size={14} />} tip="SoD 红线规则总数（编辑角色权限时实时校验）；仅当两侧菜单均有写权限时才报错" />
      </div>

      {/* 角色卡片 — 按 role_type 分组展示 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {roleGroups.map(([type, groupRoles]) => {
          const meta = ROLE_TYPE_META[type] ?? TYPE_META_FALLBACK;
          const collapsed = collapsedGroups.has(type);
          const totalUsers = groupRoles.reduce((sum, r) => sum + (userCountByRole[r.role_code] || 0), 0);
          return (
            <div key={type}>
              {/* 分组标题栏 */}
              <div
                onClick={() => toggleGroup(type)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 14px", marginBottom: collapsed ? 0 : 12,
                  borderRadius: 8, cursor: "pointer", userSelect: "none",
                  background: `${meta.color}12`,
                  border: `1px solid ${meta.color}30`,
                  transition: "background 0.15s",
                }}
              >
                <span style={{ fontSize: 16 }}>{meta.emoji}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: meta.color }}>{meta.label}</span>
                <span style={{
                  fontSize: 11, padding: "1px 7px", borderRadius: 10,
                  background: `${meta.color}20`, color: meta.color, fontWeight: 600,
                }}>
                  {groupRoles.length} 个角色
                </span>
                {totalUsers > 0 && (
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3 }}>
                    <Users size={10} /> {totalUsers} 人
                  </span>
                )}
                <span style={{ marginLeft: "auto", color: meta.color, fontSize: 12, opacity: 0.7 }}>
                  {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </span>
              </div>

              {/* 该分组的卡片网格 */}
              {!collapsed && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                  {groupRoles.map((role) => {
                    const userCnt = userCountByRole[role.role_code] || 0;
                    const isAdmin = role.role_code === "ROLE_ADMIN";
                    const desc = role.description?.trim();
                    const fallback = ROLE_TYPE_DEFAULT_DESC[role.role_type];
                    return (
                      <div key={role.role_code} className={s.card} style={{ display: "flex", flexDirection: "column", borderLeft: `3px solid ${meta.color}60` }}>
                        {/* 卡片头 */}
                        <div style={{ padding: "12px 14px 0", display: "flex", alignItems: "flex-start", gap: 8, position: "relative" }}>
                          {isAdmin && (
                            <div style={{
                              position: "absolute", top: 6, right: 6, width: 8, height: 8,
                              background: "var(--status-warning)", borderRadius: "50%",
                              boxShadow: "0 0 0 3px rgba(217,119,6,0.25)",
                            }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className={s.cardTitle} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
                              <Shield size={13} color={isAdmin ? "var(--status-warning)" : meta.color} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{role.role_name_zh}</span>
                            </div>
                            <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-secondary)", marginTop: 2 }}>
                              {role.role_code} · L{role.approval_level}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                            <button type="button" className={s.btnIcon} title={t("ui.复制","复制")} onClick={() => openCopy(role)}><Copy size={12} /></button>
                            <button type="button" className={s.btnIcon} title={t("common.edit","编辑")} onClick={() => openEdit(role)}><Edit2 size={12} /></button>
                            {!isAdmin && (
                              <button type="button" className={s.btnIcon} title={t("common.delete","删除")} onClick={() => setConfirmDel(role)} style={{ color: "var(--color-danger)" }}>
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 说明文字 */}
                        <div style={{ padding: "5px 14px 10px", flex: 1 }}>
                          <p style={{
                            fontSize: 11, lineHeight: 1.6, margin: 0,
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            color: "var(--text-secondary)", fontStyle: "italic",
                          }}>
                            {desc || fallback || `（${t("ui.暂无说明","暂无说明")}）`}
                          </p>
                        </div>

                        {/* 底栏 */}
                        <div style={{
                          padding: "6px 14px", borderTop: "1px solid var(--border)",
                          fontSize: 11, display: "flex", alignItems: "center", gap: 3,
                          color: userCnt > 0 ? meta.color : "var(--text-secondary)",
                          fontWeight: userCnt > 0 ? 600 : 400,
                          background: userCnt > 0 ? `${meta.color}08` : "transparent",
                        }}>
                          <Users size={10} /> {t("ui.绑定","绑定")} {userCnt} {t("ui.个用户","个用户")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 编辑/新建 抽屉 ───────────────────────────────────────────── */}
      <RightDrawer open={showDrawer} onClose={() => setShowDrawer(false)} title={editCode ? `${t("common.edit","编辑")}：${editCode}` : t("ui.新建角色","新建角色")} width="620px">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* role_code */}
          <div className={s.field}>
            <label className={s.lbl}>{t("ui.角色代码","角色代码")} *</label>
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
              <div style={{ fontSize: 11, color: "var(--color-success)", marginTop: 4 }}>✓ {t("ui.格式正确","格式正确")}</div>
            )}
          </div>

          {/* name */}
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{t("ui.中文名","中文名")} *</label>
              <input className={s.inp} value={form.role_name_zh} onChange={(e) => setForm({ ...form, role_name_zh: e.target.value })} />
            </div>
            <div>
              <label className={s.lbl}>{t("ui.老挝语名","老挝语名")}</label>
              <input className={s.inp} value={form.role_name_lo} onChange={(e) => setForm({ ...form, role_name_lo: e.target.value })} />
            </div>
          </div>

          {/* role_type / approval_level */}
          <div className={s.fieldRow}>
            <div>
              <label className={s.lbl}>{t("ui.角色业务域","角色业务域")}</label>
              <select
                className={s.inp}
                value={form.role_type}
                onChange={(e) => {
                  const newType = e.target.value;
                  // 若当前说明是旧业务域的默认文本（未手动修改），则自动替换为新域默认说明
                  const oldDefault = ROLE_TYPE_DEFAULT_DESC[form.role_type] ?? "";
                  const isUnmodified = !editCode && (form.description === oldDefault || form.description === "");
                  setForm({
                    ...form,
                    role_type: newType,
                    description: isUnmodified ? (ROLE_TYPE_DEFAULT_DESC[newType] ?? "") : form.description,
                  });
                }}
              >
                {["SYSTEM","DECISION","FINANCE","MANAGEMENT","PRODUCTION","QUALITY","PACKAGING","WAREHOUSE","LOGISTICS","COMMON","PROCUREMENT","STORE","SALES","EXTERNAL","FIELD"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={s.lbl}>{t("ui.审批级别0-99","审批级别 0-99")}</label>
              <input className={s.inp} type="number" min={0} max={99} value={form.approval_level} onChange={(e) => setForm({ ...form, approval_level: Number(e.target.value) || 0 })} />
            </div>
          </div>

          {/* description */}
          <div className={s.field}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <label className={s.lbl} style={{ margin: 0 }}>{t("ui.角色说明","角色说明")}</label>
              {ROLE_TYPE_DEFAULT_DESC[form.role_type] && form.description !== ROLE_TYPE_DEFAULT_DESC[form.role_type] && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, description: ROLE_TYPE_DEFAULT_DESC[form.role_type] })}
                  style={{
                    fontSize: 11, padding: "1px 8px", borderRadius: 4, cursor: "pointer",
                    border: "1px solid var(--border)", background: "var(--bg-card)",
                    color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3,
                  }}
                  title="恢复为该业务域的默认说明文本"
                >
                  ↩ {t("ui.恢复默认","恢复默认")}
                </button>
              )}
            </div>
            <textarea
              className={s.textarea}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={ROLE_TYPE_DEFAULT_DESC[form.role_type] || t("ui.描述该角色的职能边界","描述该角色的职能边界")}
              style={{ lineHeight: 1.7 }}
            />
            {!form.description && ROLE_TYPE_DEFAULT_DESC[form.role_type] && (
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 }}>
                💡 {t("ui.建议说明","建议说明")}：{ROLE_TYPE_DEFAULT_DESC[form.role_type]}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, description: ROLE_TYPE_DEFAULT_DESC[form.role_type] })}
                  style={{ marginLeft: 6, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, textDecoration: "underline" }}
                >
                  {t("ui.一键填入","一键填入")}
                </button>
              </div>
            )}
          </div>

          {/* 冲突警告区 */}
          {currentConflicts.length > 0 && (
            <div style={{
              padding: 10, borderRadius: 8,
              background: hasBlockingConflict ? "color-mix(in srgb, var(--status-danger) 10%, transparent)" : "color-mix(in srgb, var(--status-warning) 12%, transparent)",
              border: `1px solid ${hasBlockingConflict ? "var(--status-danger)" : "var(--status-warning)"}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: hasBlockingConflict ? "var(--status-danger)" : "var(--status-warning)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <AlertTriangle size={12} /> {t("ui.检测到","检测到")} {currentConflicts.length} {t("ui.项岗位分离冲突","项岗位分离冲突（双侧均有写权限）")}
                {hasBlockingConflict && <span style={{ marginLeft: 8, padding: "1px 6px", background: "var(--status-danger)", color: "white", borderRadius: 4, fontSize: 10 }}>BLOCK {t("ui.硬阻止","硬阻止")}</span>}
              </div>
              <div style={{ fontSize: 10, color: hasBlockingConflict ? "var(--status-danger)" : "var(--status-warning)", marginBottom: 6, lineHeight: 1.4 }}>
                {t("ui.仅当两侧菜单同时持有写操作权限CEDA时触发纯查看V不算冲突","💡 仅当两侧菜单同时持有写操作（C/E/D/A）时触发；纯查看（V）不算冲突")}
              </div>
              {currentConflicts.map((c) => (
                <div key={c.id} style={{ fontSize: 11, color: hasBlockingConflict ? "var(--status-danger)" : "var(--status-warning)", lineHeight: 1.6 }}>
                  • <code style={{ background: "var(--overlay-black-06)", padding: "1px 4px", borderRadius: 3 }}>{c.menu_a}</code>
                  {" "}+{" "}
                  <code style={{ background: "var(--overlay-black-06)", padding: "1px 4px", borderRadius: 3 }}>{c.menu_b}</code>
                  {" "}
                  <span style={{ padding: "0 4px", borderRadius: 3, background: c.severity === "BLOCK" ? "var(--status-danger)" : "color-mix(in srgb, var(--status-warning) 18%, transparent)", fontSize: 10, fontWeight: 700 }}>{c.severity}</span>
                  {" "}{c.reason_zh}
                </div>
              ))}
              {hasBlockingConflict && (
                <div style={{ fontSize: 11, color: "var(--status-danger)", marginTop: 6, padding: "4px 8px", background: "var(--status-danger)", borderRadius: 4 }}>
                  ⚠️ {t("ui.请取消其中一侧菜单的写权限CEDABlock级别冲突不允许保存","请取消其中一侧菜单的写权限（C/E/D/A），BLOCK 级冲突不允许保存。")}
                </div>
              )}
            </div>
          )}

          {/* 权限矩阵 - 按 domain 分组 */}
          <div className={s.field}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className={s.lbl} style={{ margin: 0 }}>{t("ui.菜单CRUD权限","菜单 × CRUD 权限")}</label>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--status-special-bg-medium)", color: "var(--color-primary)", fontWeight: 600 }}>
                {t("ui.已配","已配")} {Object.keys(perms).length} / {allMenus.length} {t("ui.菜单","菜单")}
                {sensitiveCount > 0 && <span style={{ color: "var(--status-danger)", marginLeft: 6 }}>· {sensitiveCount} {t("ui.敏感","敏感")}</span>}
              </span>
            </div>

            {/* 权限码图例 */}
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10,
              padding: "6px 10px", borderRadius: 6,
              background: "var(--bg-muted)", border: "1px solid var(--border)",
            }}>
              {PERM_CODE_ORDER.map((c) => {
                const meta = PERM_CODE_META[c];
                return (
                  <span key={c} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 20, height: 20, borderRadius: 3,
                      background: meta.color, color: "white",
                      fontSize: 10, fontWeight: 700,
                    }}>{c}</span>
                    <span>{meta.label}</span>
                    <span style={{ color: "var(--text-secondary)", opacity: 0.5, fontSize: 10 }}>({meta.tip.match(/\((.+)\)/)?.[1] ?? c})</span>
                  </span>
                );
              })}
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-secondary)", opacity: 0.6, alignSelf: "center" }}>
                🔒 = 敏感菜单，建议谨慎授写权限
              </span>
            </div>

            {menuGroups.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: 12 }}>{t("ui.菜单加载中","菜单加载中...")}</div>
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
type="button"                       onClick={() => toggleDomainView(group)}
                      style={{
                        fontSize: 11, padding: "1px 8px", borderRadius: 4,
                        border: `1px solid ${group.domain_color}`,
                        background: "transparent", color: group.domain_color,
                        cursor: "pointer", fontWeight: 600,
                      }}>
                      {t("ui.一键授查看","一键授「查看」")}
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
                            {menu.sensitive && <Lock size={10} color="var(--status-danger)" />}
                            <span title={menu.menu_code} style={{ fontWeight: set.size > 0 ? 600 : 400 }}>{menu.menu_name_zh}</span>
                          </div>
                          <div style={{ display: "flex", gap: 2 }}>
                            {PERM_CODE_ORDER.map((c) => {
                              const meta = PERM_CODE_META[c];
                              const on = set.has(c);
                              return (
                                <button
type="button"                                   key={c}
                                  title={meta.tip}
                                  onClick={() => togglePerm(menu.menu_code, c)}
                                  style={{
                                    minWidth: 22, height: 22, fontSize: 10, fontWeight: 700,
                                    borderRadius: 3, cursor: "pointer", border: `1px solid ${on ? meta.color : "var(--border)"}`,
                                    background: on ? meta.color : "var(--bg-card)",
                                    color: on ? "white" : "var(--text-secondary)",
                                    transition: "all 0.1s",
                                  }}>
                                  {c}
                                </button>
                              );
                            })}
                          </div>
                          <button
type="button"                             onClick={() => toggleMenuAll(menu.menu_code)}
                            style={{
                              fontSize: 10, padding: "1px 6px", borderRadius: 3,
                              border: "1px solid var(--border)",
                              background: PERM_CODE_ORDER.every((c) => set.has(c)) ? "var(--color-primary)" : "var(--bg-card)",
                              color: PERM_CODE_ORDER.every((c) => set.has(c)) ? "white" : "var(--text-secondary)",
                              cursor: "pointer", fontWeight: 600,
                            }}>
                            {t("ui.全选","全选")}
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
            <button type="button" className={s.btnSecondary} style={{ flex: 1 }} onClick={() => setShowDrawer(false)}>{t("common.cancel","取消")}</button>
            <button
type="button"               className={s.btnPrimaryGrad}
              style={{ flex: 2 }}
              onClick={handleSubmit}
              disabled={loading || (!editCode && !!codeError) || hasBlockingConflict}
            >
              <Save size={14} /> {loading ? t("ui.保存中","保存中…") : (hasBlockingConflict ? t("ui.存在BLOCK冲突无法保存","存在 BLOCK 冲突 - 无法保存") : (currentConflicts.length > 0 ? t("ui.保存含WARN冲突","保存（含 WARN 冲突）") : t("common.save","保存")))}
            </button>
          </div>
        </div>
      </RightDrawer>

      {/* ── 权限矩阵全景 ────────────────────────────────────────────── */}
      {showMatrix && (
        <div onClick={() => setShowMatrix(false)} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "var(--overlay-black-50)", backdropFilter: "blur(2px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--bg-card)", borderRadius: 12,
            width: "95vw", height: "92vh", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 50px var(--overlay-black-30)",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className={s.cardTitle} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Grid size={18} /> {t("ui.角色菜单CRUD矩阵全景","角色 × 菜单 × CRUD 矩阵全景")} — {matrixData?.matrix?.length || 0} {t("ui.角色","角色")} × {matrixData?.menus?.length || 0} {t("ui.菜单","菜单")}
              </div>
              <button type="button" className={s.btnIcon} onClick={() => setShowMatrix(false)}><X size={16} /></button>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {!matrixData ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>{t("common.loading","加载中...")}</div>
              ) : (
                <table className={s.table} style={{ minWidth: "100%", fontSize: 10 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 5 }}>
                    <tr>
                      <th style={{
                        padding: "8px 10px", borderBottom: "2px solid var(--border)", borderRight: "1px solid var(--border)",
                        textAlign: "left", position: "sticky", left: 0, background: "var(--bg-card)", zIndex: 6, minWidth: 180,
                      }}>{t("ui.角色↓菜单→","角色 ↓ / 菜单 →")}</th>
                      {matrixData.menus.map((m) => (
                        <th key={m.menu_code} title={m.menu_code} style={{
                          padding: "6px 4px", borderBottom: "2px solid var(--border)",
                          borderRight: "1px solid var(--border)",
                          minWidth: 60, maxWidth: 60,
                          writingMode: "vertical-rl", textAlign: "left",
                          fontWeight: 600,
                          background: m.sensitive ? "color-mix(in srgb, var(--status-danger) 10%, transparent)" : "transparent",
                        }}>
                          {m.menu_name_zh}{m.sensitive ? " 🔒" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.matrix.map((r) => (
                      <tr key={r.role_code}>
                        <td style={{ padding: "6px 10px", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", position: "sticky", left: 0, background: "var(--bg-card)", fontWeight: 600, fontSize: 11 }}>
                          <div>{r.role_name_zh}</div>
                          <div style={{ fontSize: 9, color: "var(--text-secondary)", fontFamily: "monospace" }}>{r.role_code}</div>
                        </td>
                        {r.cells.map((c) => (
                          <td key={c.menu_code} style={{
                            padding: "3px 2px", textAlign: "center",
                            borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                            background: c.granted ? (r.is_admin ? "var(--status-warning)" : "var(--status-special-bg-medium)") : "transparent",
                            color: c.granted ? (r.is_admin ? "var(--status-warning)" : "var(--color-primary)") : "var(--text-secondary)",
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
        title={`${t("common.delete","删除")}${t("ui.角色","角色")}：${confirmDel?.role_name_zh || ""}`}
        message={
          confirmDel
            ? `${(userCountByRole[confirmDel.role_code] || 0) > 0
                ? `⚠️ ${t("ui.该角色仍有","该角色仍有")} ${userCountByRole[confirmDel.role_code]} ${t("ui.个用户绑定删除后这些用户将失去对应权限建议先转移用户角色","个用户绑定！删除后这些用户将失去对应权限。建议先转移用户角色。")}\n\n`
                : ""}${t("ui.确认删除角色","确认删除角色")} [${confirmDel.role_code}]?`
            : ""
        }
        confirmLabel={
          confirmDel && (userCountByRole[confirmDel.role_code] || 0) > 0
            ? `${t("ui.仍然删除影响","仍然删除（影响")} ${userCountByRole[confirmDel.role_code]} ${t("ui.个用户","个用户")}）`
            : t("ui.确认删除","确认删除")
        }
        onConfirm={handleDelete}
        onCancel={() => setConfirmDel(null)}
        danger
      />
    </div>
  );
}

// ── 顶部统计胶囊 ─────────────────────────────────────────────────────
function StatPill({ label, value, color, icon, tip }: { label: string; value: number; color: string; icon: React.ReactNode; tip?: string }) {
  return (
    <div className={s.statCard} style={{ borderLeft: `var(--card-accent-width) solid ${color}`, cursor: tip ? "help" : "default" }} title={tip}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color, marginBottom: 4 }}>
        {icon}
        <span className={s.statLabel}>{label}</span>
        {tip && <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>ⓘ</span>}
      </div>
      <div className={s.statValue} style={{ color }}>{value}</div>
    </div>
  );
}

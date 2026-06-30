"use client";

/**
 * V3 角色权限详情页 — 路由式全宽编辑（替代列表页侧抽屉）
 * 完全沿用列表页 settings/roles/page.tsx 的端点与保存/冲突逻辑：
 *   - 角色信息：sys_role 主表（PUT /api/crud/sys_role/{code}?pk=role_code）
 *   - 权限矩阵：菜单 × V/C/E/D/A/X 三元组（PUT /api/permissions/role/{code}/perms）
 *   - 岗位冲突：基于 sys_role_conflict 的实时 WARN/BLOCK 检测，BLOCK 硬阻止保存
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { EntityWorkspace, Panel } from "@/components/design-system";
import { inlineBadge, primaryActionButton, secondaryActionButton, actionPill } from "@/components/design-system/cockpit-styles";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermission } from "@/hooks/usePermission";
import { Shield, Save, AlertTriangle, Lock, Grid, FileText } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型定义（与列表页一致）─────────────────────────────────────────────
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

// role_type 业务域选项与默认说明（与列表页一致）
const ROLE_TYPE_OPTIONS = ["SYSTEM", "DECISION", "FINANCE", "MANAGEMENT", "PRODUCTION", "QUALITY", "PACKAGING", "WAREHOUSE", "LOGISTICS", "COMMON", "PROCUREMENT", "STORE", "SALES", "EXTERNAL", "FIELD"];
const ROLE_TYPE_DEFAULT_DESC: Record<string, string> = {
  SYSTEM: "系统管理员，负责系统配置、用户权限、组织架构及基础数据维护。拥有最高操作权限，须由专职 IT 人员担任。",
  DECISION: "决策层管理角色，拥有全局数据查看与审批权限，负责战略决策与绩效审核，通常不参与日常业务操作。",
  FINANCE: "财务管理角色，负责应收应付、成本核算、财务结算及审计合规，须遵守岗位分离原则，不兼任收款与审计。",
  MANAGEMENT: "管理层角色，负责跨部门协调、审批流程及运营报表查阅，具备所辖业务域的查看与审批权限。",
  PRODUCTION: "生产作业角色，负责养殖生产日报录入、鸡群档案管理及免疫用药记录，数据权限限定于所属养殖场。",
  QUALITY: "质检追溯角色，负责场端与成品质检、不合格品处置及品质标准维护，提出人与审批人须分离。",
  PACKAGING: "包装作业角色，负责分级包装操作、批次管理及异常处理，作业数据仅限当日班次范围。",
  WAREHOUSE: "仓储管理角色，负责出入库操作、库存盘点、调拨及仓库主档管理，不兼任分级统计岗位。",
  LOGISTICS: "物流配送角色，负责配货计划制定、配送波次跟踪及到店签收，装车执行与出库复核须双人分离。",
  COMMON: "通用业务角色，承担跨部门基础操作，具体权限范围视业务需要分配，适用于兼岗或临时授权场景。",
  PROCUREMENT: "采购供应角色，负责采购申请、订单跟进、到货收货及供应商档案管理，付款审批须由上级审批人完成。",
  STORE: "门店运营角色，负责门店收货验收、库存管理、补货申请及日结操作，权限范围限定于所属门店。",
  SALES: "销售营销角色，负责客户档案维护、订单管理、B2B 分销及会员营销活动，不兼任财务审计岗位。",
  EXTERNAL: "外部合作角色，权限范围受限，仅可访问指定的协作功能模块，数据可见范围由管理员单独配置。",
  FIELD: "一线作业角色，负责现场生产、质检或仓库具体操作，权限范围限定于所属班组或工作站，不具备管理审批权限。",
};

// ── API helpers ─────────────────────────────────────────────────────────
const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "");
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const apiGet = (path: string) => fetch(path, { headers: hdr() }).then(r => r.json());
const apiPut = (path: string, body: Record<string, unknown>) =>
  fetch(path, { method: "PUT", headers: hdr(), body: JSON.stringify(body) }).then(r => r.json());

// ─────────────────────────────────────────────────────────────────────────
export default function RoleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const { canEdit } = usePermission("MENU_SETTINGS_ROLE");

  const roleCode = decodeURIComponent(String(params?.code || ""));

  const [role, setRole] = useState<RoleRow | null>(null);
  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 角色信息表单（role_code 在编辑模式下不可改）
  const [form, setForm] = useState({
    role_name_zh: "",
    role_name_lo: "",
    role_type: "COMMON",
    approval_level: 1,
    description: "",
  });
  // perms: Map<menu_code, Set<perm_code>>
  const [perms, setPerms] = useState<Record<string, Set<string>>>({});

  const isAdmin = roleCode === "ROLE_ADMIN";

  // ── 数据加载 ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // 1) 角色列表 → 找该角色
      const r = await apiGet("/api/crud/sys_role");
      const raw = Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : [];
      const rows: RoleRow[] = raw.map((d: Record<string, unknown>) => ({
        role_id: d.role_id as number,
        role_code: d.role_code as string,
        role_name_zh: d.role_name_zh as string,
        role_name_lo: d.role_name_lo as string | null,
        role_type: (d.role_type as string) || "COMMON",
        approval_level: (d.approval_level as number) ?? 0,
        description: d.description as string | null,
      }));
      const found = rows.find(x => x.role_code === roleCode) || null;
      setRole(found);
      if (found) {
        setForm({
          role_name_zh: found.role_name_zh,
          role_name_lo: found.role_name_lo || "",
          role_type: found.role_type,
          approval_level: found.approval_level,
          description: found.description || "",
        });
      }

      // 2) 菜单分组
      const mg = await apiGet("/api/permissions/menus");
      setMenuGroups(Array.isArray(mg.data) ? mg.data : []);

      // 3) 冲突规则
      const cf = await apiGet("/api/permissions/conflicts");
      setConflicts(Array.isArray(cf.data) ? cf.data : []);

      // 4) 该角色现有权限三元组
      if (found) {
        try {
          const pr = await apiGet(`/api/permissions/role/${found.role_code}/perms`);
          const data: RolePerm[] = pr.data || [];
          const p: Record<string, Set<string>> = {};
          for (const it of data) {
            p[it.menu_code] = new Set(it.perm_codes.split(",").map(x => x.trim()).filter(Boolean));
          }
          setPerms(p);
        } catch {
          setPerms({});
        }
      }
    } catch (e: any) {
      setTimeout(() => toast.error("加载失败: " + (e.message || String(e))), 0);
    } finally {
      setLoading(false);
    }
    // toast/t 为每次渲染变化的 context 函数，故意不入依赖，避免无限拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleCode]);
  useEffect(() => { loadAll(); }, [loadAll]);

  // ── 平铺所有菜单 ───────────────────────────────────────────────────────
  const allMenus = useMemo(() => menuGroups.flatMap(g => g.menus), [menuGroups]);

  // ── 实时冲突检测（SoD：双侧均有写权限 C/E/D/A 才触发）──────────────────
  const WRITE_PERM_CODES = useMemo(() => new Set(["C", "E", "D", "A"]), []);
  const currentConflicts = useMemo(() => {
    const writeGranted = new Set(Object.keys(perms).filter(mc => {
      const set = perms[mc];
      return set && set.size > 0 && Array.from(set).some(c => WRITE_PERM_CODES.has(c));
    }));
    return conflicts.filter(c => writeGranted.has(c.menu_a) && writeGranted.has(c.menu_b));
  }, [perms, conflicts, WRITE_PERM_CODES]);
  const hasBlockingConflict = currentConflicts.some(c => c.severity === "BLOCK");

  // ── 敏感权限计数（仅敏感菜单写权限计入）──────────────────────────────
  const sensitiveCount = useMemo(() => {
    const sensSet = new Set(allMenus.filter(m => m.sensitive).map(m => m.menu_code));
    let n = 0;
    for (const mc of Object.keys(perms)) {
      const set = perms[mc];
      if (sensSet.has(mc) && set && Array.from(set).some(c => WRITE_PERM_CODES.has(c))) n++;
    }
    return n;
  }, [perms, allMenus, WRITE_PERM_CODES]);

  // ── 矩阵操作（与列表页一致）─────────────────────────────────────────
  const togglePerm = (menuCode: string, code: string) => {
    if (!editable) return;
    setPerms(prev => {
      const next = { ...prev };
      const set = new Set(next[menuCode] || []);
      if (set.has(code)) set.delete(code); else set.add(code);
      if (set.size === 0) delete next[menuCode]; else next[menuCode] = set;
      return next;
    });
  };
  const toggleMenuAll = (menuCode: string) => {
    if (!editable) return;
    setPerms(prev => {
      const next = { ...prev };
      const cur = next[menuCode];
      const isAll = cur && PERM_CODE_ORDER.every(c => cur.has(c));
      if (isAll) delete next[menuCode]; else next[menuCode] = new Set(PERM_CODE_ORDER);
      return next;
    });
  };
  const toggleDomainView = (group: MenuGroup) => {
    if (!editable) return;
    setPerms(prev => {
      const next = { ...prev };
      const allHasView = group.menus.every(m => next[m.menu_code]?.has("V"));
      if (allHasView) {
        for (const m of group.menus) {
          const set = new Set(next[m.menu_code] || []);
          set.delete("V");
          if (set.size === 0) delete next[m.menu_code]; else next[m.menu_code] = set;
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

  // ── 保存：角色信息 + 权限矩阵（BLOCK 冲突硬阻止，与列表页一致）────────
  const handleSave = async () => {
    if (!role) return;
    if (!canEdit) { toast.error(t("ui.无编辑权限", "无编辑权限")); return; }
    if (isAdmin) { toast.error(t("ui.超管角色受保护", "超管角色受保护，禁止面板编辑")); return; }
    if (!form.role_name_zh.trim()) { toast.error(t("ui.角色中文名称必填", "角色中文名称必填")); return; }
    if (hasBlockingConflict) {
      toast.error(t("ui.存在BLOCK级岗位分离冲突无法保存请先取消冲突菜单的权限", "存在 BLOCK 级岗位分离冲突，无法保存。请先取消冲突菜单的权限。"));
      return;
    }
    setSubmitting(true);
    try {
      // 1) 更新 sys_role 主表
      const roleBody = {
        role_code: role.role_code,
        role_name_zh: form.role_name_zh,
        role_name_lo: form.role_name_lo || null,
        role_type: form.role_type,
        approval_level: form.approval_level,
        description: form.description || null,
      };
      await apiPut(`/api/crud/sys_role/${role.role_code}?pk=role_code`, roleBody);

      // 2) 批量覆盖权限三元组
      const permsPayload = Object.entries(perms)
        .filter(([, set]) => set && set.size > 0)
        .map(([menu_code, set]) => ({ menu_code, perm_codes: Array.from(set).join(",") }));
      const setR = await apiPut(`/api/permissions/role/${role.role_code}/perms`, { perms: permsPayload });
      if (setR.code && setR.code !== 200) throw new Error(setR.msg || t("ui.权限保存失败", "权限保存失败"));

      toast.success(t("ui.角色与权限已更新", "角色与权限已更新"));
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || t("ui.保存失败", "保存失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const editable = canEdit && !isAdmin;

  // ── Loading / not found ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <div className={s.card}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 14 }}>
              <div className={s.shimmer} style={{ width: 140, height: 14, borderRadius: 4 }} />
              <div className={s.shimmer} style={{ width: 200, height: 14, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <div className={s.card}>
          <div className={s.emptyState}>
            <Shield size={40} />
            <div className={s.emptyStateText}>{t("ui.未找到该角色", "未找到该角色")}</div>
            <button type="button" onClick={() => router.push("/settings/roles")} style={{ ...secondaryActionButton, marginTop: 12 }}>
              {t("common.back", "返回")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tab 1：角色信息 ───────────────────────────────────────────────────
  const infoTab = (
    <Panel title={t("ui.角色信息", "角色信息")} icon={<FileText size={14} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <div className={s.field}>
          <label className={s.lbl}>{t("ui.角色代码", "角色代码")}</label>
          <input disabled value={role.role_code} className={s.inp}
            style={{ fontFamily: "monospace", fontWeight: 700, opacity: 0.6, cursor: "not-allowed", background: "var(--bg-muted)" }} />
        </div>
        <div className={s.fieldRow}>
          <div>
            <label className={s.lbl}>{t("ui.中文名", "中文名")} <span style={{ color: "var(--status-danger)" }}>*</span></label>
            <input className={s.inp} value={form.role_name_zh} disabled={!editable}
              onChange={e => setForm({ ...form, role_name_zh: e.target.value })}
              style={{ opacity: editable ? 1 : 0.6 }} />
          </div>
          <div>
            <label className={s.lbl}>{t("ui.老挝语名", "老挝语名")}</label>
            <input className={s.inp} value={form.role_name_lo} disabled={!editable}
              onChange={e => setForm({ ...form, role_name_lo: e.target.value })}
              style={{ opacity: editable ? 1 : 0.6 }} />
          </div>
        </div>
        <div className={s.fieldRow}>
          <div>
            <label className={s.lbl}>{t("ui.角色业务域", "角色业务域")}</label>
            <select className={s.inp} value={form.role_type} disabled={!editable}
              onChange={e => {
                const newType = e.target.value;
                const oldDefault = ROLE_TYPE_DEFAULT_DESC[form.role_type] ?? "";
                const isUnmodified = form.description === oldDefault || form.description === "";
                setForm({ ...form, role_type: newType, description: isUnmodified ? ROLE_TYPE_DEFAULT_DESC[newType] ?? "" : form.description });
              }}
              style={{ opacity: editable ? 1 : 0.6 }}>
              {ROLE_TYPE_OPTIONS.map(ty => <option key={ty} value={ty}>{ty}</option>)}
            </select>
          </div>
          <div>
            <label className={s.lbl}>{t("ui.审批级别0-99", "审批级别 0-99")}</label>
            <input className={s.inp} type="number" min={0} max={99} value={form.approval_level} disabled={!editable}
              onChange={e => setForm({ ...form, approval_level: Number(e.target.value) || 0 })}
              style={{ opacity: editable ? 1 : 0.6 }} />
          </div>
        </div>
        <div className={s.field}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <label className={s.lbl} style={{ margin: 0 }}>{t("ui.角色说明", "角色说明")}</label>
            {editable && ROLE_TYPE_DEFAULT_DESC[form.role_type] && form.description !== ROLE_TYPE_DEFAULT_DESC[form.role_type] && (
              <button type="button" onClick={() => setForm({ ...form, description: ROLE_TYPE_DEFAULT_DESC[form.role_type] })}
                style={{ fontSize: 11, padding: "1px 8px", borderRadius: 4, cursor: "pointer", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3 }}
                title={t("ui.恢复为该业务域的默认说明文本","恢复为该业务域的默认说明文本")}>
                ↩ {t("ui.恢复默认", "恢复默认")}
              </button>
            )}
          </div>
          <textarea className={s.textarea} value={form.description} disabled={!editable}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder={ROLE_TYPE_DEFAULT_DESC[form.role_type] || t("ui.描述该角色的职能边界", "描述该角色的职能边界")}
            style={{ lineHeight: 1.7, opacity: editable ? 1 : 0.6 }} />
        </div>
        {isAdmin && (
          <div style={{ fontSize: 11, color: "var(--status-warning)", marginTop: 4 }}>
            ⚠️ {t("ui.超管角色受保护禁止编辑", "超管角色（ROLE_ADMIN）受保护，禁止编辑。")}
          </div>
        )}
      </div>
    </Panel>
  );

  // ── Tab 2：权限矩阵 ───────────────────────────────────────────────────
  const matrixTab = (
    <Panel title={t("ui.菜单CRUD权限", "菜单 × CRUD 权限")} icon={<Grid size={14} />}
      extra={
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--status-special-bg-medium)", color: "var(--color-primary)", fontWeight: 600 }}>
          {t("ui.已配", "已配")} {Object.keys(perms).length} / {allMenus.length} {t("ui.菜单", "菜单")}
          {sensitiveCount > 0 && <span style={{ color: "var(--status-danger)", marginLeft: 6 }}>· {sensitiveCount} {t("ui.敏感", "敏感")}</span>}
        </span>
      }>
      {/* 权限码图例 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, padding: "6px 10px", borderRadius: 6, background: "var(--bg-muted)", border: "1px solid var(--border)" }}>
        {PERM_CODE_ORDER.map(c => {
          const meta = PERM_CODE_META[c];
          return (
            <span key={c} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 3, background: meta.color, color: "white", fontSize: 10, fontWeight: 700 }}>{c}</span>
              <span>{meta.label}</span>
              <span style={{ color: "var(--text-secondary)", opacity: 0.5, fontSize: 10 }}>({meta.tip.match(/\((.+)\)/)?.[1] ?? c})</span>
            </span>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-secondary)", opacity: 0.6, alignSelf: "center" }}>
          🔒 = {t("ui.敏感菜单建议谨慎授写权限","敏感菜单，建议谨慎授写权限")}
        </span>
      </div>

      {menuGroups.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: 12 }}>{t("ui.菜单加载中", "菜单加载中...")}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {menuGroups.map(group => (
          <div key={group.domain} style={{ border: `1px solid ${group.domain_color}33`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "6px 12px", background: `${group.domain_color}14`, borderBottom: `1px solid ${group.domain_color}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: group.domain_color }}>{group.domain_label_zh}</span>
              {editable && (
                <button type="button" onClick={() => toggleDomainView(group)}
                  style={{ fontSize: 11, padding: "1px 8px", borderRadius: 4, border: `1px solid ${group.domain_color}`, background: "transparent", color: group.domain_color, cursor: "pointer", fontWeight: 600 }}>
                  {t("ui.一键授查看", "一键授「查看」")}
                </button>
              )}
            </div>
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {group.menus.map(menu => {
                const set = perms[menu.menu_code] || new Set<string>();
                return (
                  <div key={menu.menu_code} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "4px 8px", borderRadius: 4, background: set.size > 0 ? `${group.domain_color}10` : "transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      {menu.sensitive && <Lock size={10} color="var(--status-danger)" />}
                      <span title={menu.menu_code} style={{ fontWeight: set.size > 0 ? 600 : 400 }}>{menu.menu_name_zh}</span>
                    </div>
                    <div style={{ display: "flex", gap: 2 }}>
                      {PERM_CODE_ORDER.map(c => {
                        const meta = PERM_CODE_META[c];
                        const on = set.has(c);
                        return (
                          <button type="button" key={c} title={meta.tip} onClick={() => togglePerm(menu.menu_code, c)}
                            style={{ minWidth: 22, height: 22, fontSize: 10, fontWeight: 700, borderRadius: 3, cursor: editable ? "pointer" : "not-allowed", border: `1px solid ${on ? meta.color : "var(--border)"}`, background: on ? meta.color : "var(--bg-card)", color: on ? "white" : "var(--text-secondary)", transition: "all 0.1s", opacity: editable ? 1 : 0.7 }}>
                            {c}
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => toggleMenuAll(menu.menu_code)}
                      style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, border: "1px solid var(--border)", background: PERM_CODE_ORDER.every(c => set.has(c)) ? "var(--color-primary)" : "var(--bg-card)", color: PERM_CODE_ORDER.every(c => set.has(c)) ? "white" : "var(--text-secondary)", cursor: editable ? "pointer" : "not-allowed", fontWeight: 600, opacity: editable ? 1 : 0.7 }}>
                      {t("ui.全选", "全选")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );

  // ── Tab 3：岗位冲突 ───────────────────────────────────────────────────
  const conflictTab = (
    <Panel title={t("ui.岗位分离冲突", "岗位分离冲突（SoD 红线）")} icon={<AlertTriangle size={14} />}
      extra={
        currentConflicts.length > 0 ? (
          <span style={inlineBadge(hasBlockingConflict ? "danger" : "warning")}>
            {currentConflicts.length} {t("ui.项冲突", "项冲突")}
          </span>
        ) : (
          <span style={inlineBadge("success")}>{t("ui.无冲突", "无冲突")}</span>
        )
      }>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
        💡 {t("ui.仅当两侧菜单同时持有写操作权限CEDA时触发纯查看V不算冲突", "仅当两侧菜单同时持有写操作（C/E/D/A）时触发；纯查看（V）不算冲突。BLOCK 级冲突不允许保存。")}
      </div>
      {currentConflicts.length === 0 ? (
        <div style={{ padding: "16px 12px", fontSize: 12, color: "var(--status-success)", display: "flex", alignItems: "center", gap: 6 }}>
          ✓ {t("ui.当前授权未触发任何岗位分离红线", "当前授权未触发任何岗位分离红线。")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {currentConflicts.map(c => {
            const isBlock = c.severity === "BLOCK";
            return (
              <div key={c.id} style={{ padding: 10, borderRadius: 8, background: isBlock ? "color-mix(in srgb, var(--status-danger) 10%, transparent)" : "color-mix(in srgb, var(--status-warning) 12%, transparent)", border: `1px solid ${isBlock ? "var(--status-danger)" : "var(--status-warning)"}` }}>
                <div style={{ fontSize: 11, color: isBlock ? "var(--status-danger)" : "var(--status-warning)", lineHeight: 1.6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <code style={{ background: "var(--overlay-black-06)", padding: "1px 4px", borderRadius: 3 }}>{c.menu_a}</code>
                  +
                  <code style={{ background: "var(--overlay-black-06)", padding: "1px 4px", borderRadius: 3 }}>{c.menu_b}</code>
                  <span style={{ padding: "0 4px", borderRadius: 3, background: isBlock ? "var(--status-danger)" : "color-mix(in srgb, var(--status-warning) 18%, transparent)", color: isBlock ? "white" : undefined, fontSize: 10, fontWeight: 700 }}>{c.severity}</span>
                  <span>{c.reason_zh}</span>
                </div>
              </div>
            );
          })}
          {hasBlockingConflict && (
            <div style={{ fontSize: 11, color: "white", padding: "6px 10px", background: "var(--status-danger)", borderRadius: 6 }}>
              ⚠️ {t("ui.请取消其中一侧菜单的写权限CEDABlock级别冲突不允许保存", "请取消其中一侧菜单的写权限（C/E/D/A），BLOCK 级冲突不允许保存。")}
            </div>
          )}
        </div>
      )}
    </Panel>
  );

  // ── 头部状态徽章 / 操作 ───────────────────────────────────────────────
  const statusBadge = (
    <span style={inlineBadge(isAdmin ? "warning" : "default")}>{role.role_type}</span>
  );

  const actions = (
    <>
      {editable && (
        <button type="button" onClick={handleSave} disabled={submitting || hasBlockingConflict} className={s.btnPrimaryGrad}>
          <Save size={14} />
          {submitting
            ? t("ui.保存中", "保存中…")
            : hasBlockingConflict
              ? t("ui.存在BLOCK冲突无法保存", "存在 BLOCK 冲突 - 无法保存")
              : currentConflicts.length > 0
                ? t("ui.保存含WARN冲突", "保存（含 WARN 冲突）")
                : t("common.save", "保存")}
        </button>
      )}
      {isAdmin && <span style={inlineBadge("warning")}>{t("ui.超管保护", "超管保护")}</span>}
    </>
  );

  return (
    <div className="animate-fade-in">
      <EntityWorkspace
        title={role.role_name_zh || role.role_code}
        subtitle={`${role.role_code} · L${form.approval_level}`}
        status={statusBadge}
        onBack={() => router.push("/settings/roles")}
        actions={actions}
        tabs={[
          { key: "info", label: t("ui.角色信息", "角色信息"), content: infoTab },
          { key: "matrix", label: t("ui.权限矩阵", "权限矩阵"), content: matrixTab },
          {
            key: "conflict",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {t("ui.岗位冲突", "岗位冲突")}
                {currentConflicts.length > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, fontSize: 10, fontWeight: 700, background: hasBlockingConflict ? "var(--status-danger)" : "var(--status-warning)", color: "white" }}>
                    {currentConflicts.length}
                  </span>
                )}
              </span>
            ),
            content: conflictTab,
          },
        ]}
      />
    </div>
  );
}

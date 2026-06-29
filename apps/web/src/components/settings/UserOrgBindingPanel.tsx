"use client";
/**
 * UserOrgBindingPanel — 用户组织绑定 / 数据范围管理面板（G80 Phase 2）
 * ════════════════════════════════════════════════════════════════════
 * 从原 /master-data/user-orgs 右栏抽出的可复用组件，供「用户管理」抽屉集成。
 * 职责：加载并管理某用户的多组织绑定（组织 / 数据范围等级 / 主组织）。
 *
 * API（不改后端）：
 *   GET    /api/org/user-orgs/:userId   — 该用户绑定的组织列表
 *   GET    /api/organizations/tree      — 组织树（新增绑定下拉）
 *   POST   /api/org/user-orgs           — 新增绑定
 *   PUT    /api/org/user-orgs/:id        — 改数据范围等级 / 主组织
 *   DELETE /api/org/user-orgs/:id        — 移除绑定
 *
 * 样式：仅用 design-system 全局件 / token（DataTableV3 / SelectField / Panel /
 *       inlineBadge / badgeButton），枚举中文化。
 */
import { useState, useEffect, useCallback } from "react";
import {
  Building2, RefreshCw, Star, StarOff, Trash2, Plus, UserCheck,
} from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { SelectField, DataTableV3 } from "@/components/design-system";
import { inlineBadge, badgeButton } from "@/components/design-system/cockpit-styles";
import type { ColumnV3 } from "@/components/design-system";

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

const ORG_TYPE_LABEL: Record<string, string> = {
  GROUP:      "集团",
  BU:         "事业群",
  COMPANY:    "公司",
  FACTORY:    "工厂",
  FARM:       "农场",
  PROJECT:    "项目",
  WAREHOUSE:  "仓库",
  STORE:      "门店",
  DEPARTMENT: "部门",
  DEPT:       "部门",
  SITE:       "场站",
  REGION:     "区域",
  TEAM:       "班组",
  VIRTUAL_ORGANIZATION: "虚拟组织",
  OTHER:      "其他",
};

// ── 类型定义 ─────────────────────────────────────────────────────────────────
interface UserOrg {
  id:             number;
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
/** 将组织树打平为带缩进的下拉选项 */
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

// ════════════════════════════════════════════════════════════════════════════
export interface UserOrgBindingPanelProps {
  userId: number;
  /** 权限开关，默认全开（由父页 usePermission 传入更佳） */
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function UserOrgBindingPanel({
  userId,
  canCreate = true,
  canEdit = true,
  canDelete = true,
}: UserOrgBindingPanelProps) {
  const { t } = useLanguage();
  const toast = useToast();

  const [userOrgs,        setUserOrgs]        = useState<UserOrg[]>([]);
  const [userOrgsLoading, setUserOrgsLoading] = useState(false);

  // 组织树（新增绑定用）
  const [orgFlat, setOrgFlat] = useState<{ id: number; label: string; orgName: string }[]>([]);

  // 新增绑定表单
  const [showAddForm, setShowAddForm] = useState(false);
  const [addOrgId,    setAddOrgId]    = useState<number | "">("");
  const [addScope,    setAddScope]    = useState<ScopeLevel>("COMPANY");
  const [addPrimary,  setAddPrimary]  = useState(false);
  const [adding,      setAdding]      = useState(false);

  // 操作中状态
  const [mutatingId, setMutatingId] = useState<number | null>(null);

  // ── 加载用户的组织绑定 ─────────────────────────────────────────────────────
  const loadUserOrgs = useCallback(async (uid: number) => {
    setUserOrgsLoading(true);
    try {
      const res  = await fetch(`/api/org/user-orgs/${uid}`, { headers: hdr() });
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
      toast.error(t('ui.加载用户组织失败','加载用户组织失败'));
    } finally {
      setUserOrgsLoading(false);
    }
  }, [toast, t]);

  // ── 加载组织树 ─────────────────────────────────────────────────────────────
  const loadOrgTree = useCallback(async () => {
    try {
      const res  = await fetch("/api/organizations/tree", { headers: hdr() });
      if (!res.ok) return;
      const json = await res.json();
      const tree: OrgTreeNode[] = json.code === 200 ? (json.data ?? []) : (Array.isArray(json) ? json : []);
      setOrgFlat(flattenTree(tree));
    } catch { /* 静默 */ }
  }, []);

  useEffect(() => { loadOrgTree(); }, [loadOrgTree]);

  useEffect(() => {
    if (userId) {
      loadUserOrgs(userId);
      setShowAddForm(false);
      setAddOrgId("");
      setAddScope("COMPANY");
      setAddPrimary(false);
    } else {
      setUserOrgs([]);
    }
  }, [userId, loadUserOrgs]);

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
        toast.success(t('ui.数据范围已更新','数据范围已更新'));
      } else {
        throw new Error(json.message ?? t('ui.更新失败','更新失败'));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ui.更新失败','更新失败'));
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
        setUserOrgs(prev =>
          prev.map(x => ({
            ...x,
            isPrimary: x.id === uo.id ? !uo.isPrimary : (uo.isPrimary ? x.isPrimary : false),
          })),
        );
        toast.success(!uo.isPrimary ? t('ui.已设为主组织','已设为主组织') : t('ui.已取消主组织','已取消主组织'));
      } else {
        throw new Error(json.message ?? t('ui.操作失败','操作失败'));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ui.操作失败','操作失败'));
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
        toast.success(`${t('ui.已移除','已移除')}【${uo.orgName}】${t('ui.绑定','绑定')}`);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ui.移除失败','移除失败'));
    } finally {
      setMutatingId(null);
    }
  };

  // ── 新增绑定提交 ──────────────────────────────────────────────────────────
  const handleAddSubmit = async () => {
    if (!userId || !addOrgId) {
      toast.error(t('ui.请选择要绑定的组织','请选择要绑定的组织'));
      return;
    }
    if (userOrgs.some(x => x.orgId === addOrgId)) {
      toast.error(t('ui.该用户已绑定此组织','该用户已绑定此组织'));
      return;
    }
    setAdding(true);
    try {
      const res  = await fetch("/api/org/user-orgs", {
        method: "POST", headers: hdr(),
        body: JSON.stringify({
          userId,
          orgId:          Number(addOrgId),
          dataScopeLevel: addScope,
          isPrimary:      addPrimary,
        }),
      });
      const json = await res.json();
      if (json.code === 200) {
        toast.success(t('ui.组织绑定成功','组织绑定成功'));
        setShowAddForm(false);
        setAddOrgId("");
        setAddScope("COMPANY");
        setAddPrimary(false);
        await loadUserOrgs(userId);
      } else {
        throw new Error(json.message ?? t('ui.绑定失败','绑定失败'));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ui.绑定失败','绑定失败'));
    } finally {
      setAdding(false);
    }
  };

  // ── 渲染 ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* 工具条：刷新 + 新增 */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs text-text-dim">
          {t('ui.共绑定','共绑定')}{" "}
          <span className="font-semibold text-text-muted">{userOrgs.length}</span>{" "}
          {t('ui.个组织','个组织')}
          {userOrgs.some(x => x.isPrimary) && (
            <>
              {" · "}
              <Star size={10} className="inline text-warning fill-current" />{" "}
              {t('ui.主组织：','主组织：')}
              <span className="font-semibold text-text-muted">
                {userOrgs.find(x => x.isPrimary)?.orgName ?? "—"}
              </span>
            </>
          )}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => loadUserOrgs(userId)}
            disabled={userOrgsLoading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg",
              "border border-border text-text-muted bg-bg-page",
              "hover:bg-bg-muted disabled:opacity-50 transition-colors cursor-pointer",
            )}
          >
            <RefreshCw size={12} className={userOrgsLoading ? "animate-spin" : ""} />
            {t('ui.刷新','刷新')}
          </button>
          {canCreate && (
            <button
              type="button"
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
              {showAddForm ? t('ui.取消','取消') : t('ui.添加组织','添加组织')}
            </button>
          )}
        </div>
      </div>

      {/* 新增绑定表单 */}
      {showAddForm && (
        <div className="mb-3 p-3 rounded-lg border border-border bg-bg-muted/30 flex flex-col gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-text-muted mb-1.5">
              {t('ui.绑定组织','绑定组织')} <span className="text-danger">*</span>
            </label>
            <SelectField
              value={addOrgId === "" ? "" : String(addOrgId)}
              onChange={v => setAddOrgId(v === "" ? "" : Number(v))}
              options={orgFlat
                .filter(o => !userOrgs.some(x => x.orgId === o.id))
                .map(o => ({ value: String(o.id), label: o.label }))}
              emptyLabel={orgFlat.length > 0 ? t('ui.请选择组织…','请选择组织…') : t('ui.加载组织中…','加载组织中…')}
              allowEmpty
              filter
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-muted mb-1.5">
              {t('ui.数据范围等级','数据范围等级')}
            </label>
            <SelectField
              value={addScope}
              onChange={v => setAddScope(v as ScopeLevel)}
              options={SCOPE_LEVELS.map(sl => ({
                value: sl.value,
                label: `${sl.label} — ${sl.desc}`,
              }))}
              allowEmpty={false}
              filter
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addPrimary}
                onChange={e => setAddPrimary(e.target.checked)}
                className="w-4 h-4 accent-brand cursor-pointer"
              />
              <span className="text-xs text-text-muted">{t('ui.设为主组织','设为主组织')}</span>
            </label>
            <button
              type="button"
              onClick={handleAddSubmit}
              disabled={adding || !addOrgId}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg",
                "bg-brand text-white hover:opacity-90",
                "disabled:opacity-50 transition-opacity cursor-pointer",
              )}
            >
              <UserCheck size={13} />
              {adding ? t('ui.绑定中…','绑定中…') : t('ui.确认绑定','确认绑定')}
            </button>
          </div>
        </div>
      )}

      {/* 绑定列表 */}
      {userOrgsLoading ? (
        <div className="flex items-center justify-center py-10 text-text-dim text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" />
          {t('ui.加载中…','加载中…')}
        </div>
      ) : userOrgs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-text-dim">
          <Building2 size={28} className="opacity-20" />
          <div className="text-sm font-medium text-text-muted">{t('ui.该用户暂未绑定任何组织','该用户暂未绑定任何组织')}</div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="text-xs text-brand hover:underline"
            >
              {t('ui.点击「添加组织」开始绑定 →','点击「添加组织」开始绑定 →')}
            </button>
          )}
        </div>
      ) : (
        <DataTableV3
          rows={userOrgs}
          rowKey={(uo: UserOrg) => uo.id}
          columns={[
            {
              key: "orgName",
              title: t('ui.组织名称','组织名称'),
              render: (uo: UserOrg) => (
                <div className="flex items-center gap-2">
                  <Building2 size={13} className="text-text-dim flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-text">{uo.orgName}</div>
                    <div className="text-xs font-mono text-text-dim">{uo.orgCode}</div>
                  </div>
                </div>
              ),
            },
            {
              key: "orgType",
              title: t('ui.类型','类型'),
              render: (uo: UserOrg) => (
                <span style={inlineBadge("default")}>
                  {ORG_TYPE_LABEL[uo.orgType] ?? uo.orgType}
                </span>
              ),
            },
            {
              key: "dataScopeLevel",
              title: t('ui.数据范围','数据范围'),
              render: (uo: UserOrg) => {
                const scopeItem =
                  SCOPE_LEVELS.find(sl => sl.value === uo.dataScopeLevel) ?? SCOPE_LEVELS[2];
                const isMutating = mutatingId === uo.id;
                return canEdit ? (
                  <SelectField
                    value={uo.dataScopeLevel}
                    disabled={isMutating}
                    onChange={v => handleUpdateScope(uo, v as ScopeLevel)}
                    options={SCOPE_LEVELS.map(sl => ({ value: sl.value, label: sl.label }))}
                    allowEmpty={false}
                    filter
                  />
                ) : (
                  <span style={inlineBadge("default")}>{scopeItem.label}</span>
                );
              },
            },
            {
              key: "isPrimary",
              title: t('ui.主组织','主组织'),
              render: (uo: UserOrg) => {
                const isMutating = mutatingId === uo.id;
                return canEdit ? (
                  <button
                    type="button"
                    onClick={() => handleTogglePrimary(uo)}
                    disabled={isMutating}
                    title={uo.isPrimary ? t('ui.取消主组织','取消主组织') : t('ui.设为主组织','设为主组织')}
                    style={{
                      ...badgeButton(uo.isPrimary ? "warning" : "default"),
                      ...(isMutating ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                    }}
                  >
                    {uo.isPrimary ? (
                      <>
                        <Star size={11} style={{ fill: "currentColor" }} />
                        {t('ui.主组织','主组织')}
                      </>
                    ) : (
                      <>
                        <StarOff size={11} />
                        {t('ui.设为主','设为主')}
                      </>
                    )}
                  </button>
                ) : (
                  <span style={inlineBadge(uo.isPrimary ? "warning" : "default")}>
                    {uo.isPrimary ? t('ui.主组织','主组织') : "—"}
                  </span>
                );
              },
            },
            {
              key: "op",
              title: t('ui.操作','操作'),
              render: (uo: UserOrg) => {
                const isMutating = mutatingId === uo.id;
                return canDelete ? (
                  <button
                    type="button"
                    onClick={() => handleRemove(uo)}
                    disabled={isMutating}
                    style={{
                      ...badgeButton("danger"),
                      ...(isMutating ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                    }}
                  >
                    {isMutating ? (
                      <RefreshCw size={11} className="animate-spin" />
                    ) : (
                      <Trash2 size={11} />
                    )}
                    {t('ui.移除','移除')}
                  </button>
                ) : (
                  <span style={inlineBadge("default")}>—</span>
                );
              },
            },
          ] as ColumnV3<UserOrg>[]}
        />
      )}
    </div>
  );
}

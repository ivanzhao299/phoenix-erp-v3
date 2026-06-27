"use client";
/**
 * Phoenix ERP V3 — Organization Runtime Phase 1
 * 主数据中心 — 组织架构管理
 *
 * 功能：
 *   · 左侧组织树（树形展开/折叠，高亮选中，按类型图标区分）
 *   · 右侧详情面板（选中组织完整信息 + 操作按钮）
 *   · 新建/编辑抽屉（RightDrawer）
 *   · 启用/停用（POST /api/organizations/:code/enable|disable）
 *
 * API（Organization Runtime Phase 1）：
 *   GET  /api/organizations/tree          → 嵌套树结构
 *   GET  /api/organizations               → 平铺列表（用于上级下拉）
 *   GET  /api/organizations/:code         → 单条
 *   POST /api/organizations               → 新建
 *   PATCH /api/organizations/:code        → 更新
 *   POST /api/organizations/:code/enable  → 启用
 *   POST /api/organizations/:code/disable → 停用
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Network, Plus, RefreshCw, ChevronRight, ChevronDown,
  Building2, Layers, Globe, Leaf, Users, Warehouse,
  LayoutGrid, Info, Edit3, PowerOff, Power, Trash2,
  ArrowRight, Inbox, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { usePermission } from "@/hooks/usePermission";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { organizationConfig, companyConfig } from "@/components/master-data/detail-configs";
import { OrgMembersPanel } from "@/components/master-data/OrgMembersPanel";
import { SearchInput } from "@/components/design-system";
import { ConfirmDialogV2 } from "@/components/design-system/dialogs/ConfirmDialogV2";
import {
  cockpitCardHeader, cockpitCardHeaderTitle,
  cockpitCardHeaderHint, propCell, propLabel, propValue,
  primaryActionButton, secondaryActionButton, inputField, formLabel, pillBadge,
} from "@/components/design-system/cockpit-styles";

// ── Auth helper ───────────────────────────────────────────────────────────────

const authHdr = () => ({
  Authorization: `Bearer ${sessionStorage.getItem("phoenix_token") || ""}`,
  "Content-Type": "application/json",
});

// ── Types ─────────────────────────────────────────────────────────────────────

type OrgType =
  | "GROUP" | "BU" | "COMPANY" | "SITE" | "FACTORY"
  | "PROJECT" | "WAREHOUSE" | "STORE" | "DEPARTMENT";

type SiteBusinessType =
  | "BREEDING" | "LAYING" | "PROCESSING" | "LOGISTICS" | "SALES" | "OTHER";

interface OrgNode {
  id: number;
  orgCode: string;
  orgName: string;
  orgNameCn: string | null;
  orgShortName: string | null;
  parentId: number | null;
  parentCode: string | null;
  orgType: OrgType;
  siteCode: string | null;
  siteBusinessType: SiteBusinessType | null;
  level: number;
  path: string | null;
  status: string;
  companyCode: string | null;
  sortOrder: number;
  remark: string | null;
  managerName: string | null;
  children: OrgNode[];
}

type OrgFlat = Omit<OrgNode, "children">;

type FilterType = "" | OrgType | "ACTIVE" | "INACTIVE";

// ── Org type config ───────────────────────────────────────────────────────────

interface OrgTypeConfig {
  label: string;
  badgeCls: string;
  dotCls: string;
  Icon: React.FC<{ size?: number; className?: string }>;
}

const ORG_TYPE_CONFIG: Record<OrgType, OrgTypeConfig> = {
  GROUP:      { label: "集团",   badgeCls: "bg-brand/10     text-brand     border-brand/20",    dotCls: "bg-brand",   Icon: Globe },
  BU:         { label: "事业群", badgeCls: "bg-info/10      text-info       border-info/20",     dotCls: "bg-info",    Icon: Layers },
  COMPANY:    { label: "公司",   badgeCls: "bg-info/10      text-info       border-info/20",     dotCls: "bg-info",    Icon: Building2 },
  SITE:       { label: "场区",   badgeCls: "bg-success/10   text-success    border-success/20",  dotCls: "bg-success", Icon: Leaf },
  FACTORY:    { label: "工厂",   badgeCls: "bg-warning/10   text-warning    border-warning/20",  dotCls: "bg-warning", Icon: LayoutGrid },
  PROJECT:    { label: "项目",   badgeCls: "bg-brand/10     text-brand      border-brand/20",    dotCls: "bg-brand",   Icon: LayoutGrid },
  WAREHOUSE:  { label: "仓库",   badgeCls: "bg-warning/10   text-warning    border-warning/20",  dotCls: "bg-warning", Icon: Warehouse },
  STORE:      { label: "门店",   badgeCls: "bg-warning/10   text-warning    border-warning/20",  dotCls: "bg-warning", Icon: LayoutGrid },
  DEPARTMENT: { label: "部门",   badgeCls: "bg-danger/10    text-danger     border-danger/20",   dotCls: "bg-danger",  Icon: Users },
};

const ORG_TYPES_SELECT: { value: OrgType; label: string }[] = [
  { value: "GROUP",      label: "集团 (GROUP)" },
  { value: "BU",         label: "事业群 (BU)" },
  { value: "COMPANY",    label: "公司 (COMPANY)" },
  { value: "SITE",       label: "场区 (SITE)" },
  { value: "FACTORY",    label: "工厂 (FACTORY)" },
  { value: "PROJECT",    label: "项目 (PROJECT)" },
  { value: "WAREHOUSE",  label: "仓库 (WAREHOUSE)" },
  { value: "STORE",      label: "门店 (STORE)" },
  { value: "DEPARTMENT", label: "部门 (DEPARTMENT)" },
];

const SITE_BUSINESS_TYPES: { value: SiteBusinessType; label: string }[] = [
  { value: "BREEDING",   label: "育种 (BREEDING)" },
  { value: "LAYING",     label: "蛋鸡 (LAYING)" },
  { value: "PROCESSING", label: "加工 (PROCESSING)" },
  { value: "LOGISTICS",  label: "物流 (LOGISTICS)" },
  { value: "SALES",      label: "销售 (SALES)" },
  { value: "OTHER",      label: "其他 (OTHER)" },
];

const FILTER_BUTTONS: { value: FilterType; label: string }[] = [
  { value: "",           label: "全部" },
  { value: "GROUP",      label: "集团" },
  { value: "BU",         label: "事业群" },
  { value: "COMPANY",    label: "公司" },
  { value: "SITE",       label: "场区" },
  { value: "DEPARTMENT", label: "部门" },
  { value: "ACTIVE",     label: "启用" },
  { value: "INACTIVE",   label: "停用" },
];

// ── Form state ────────────────────────────────────────────────────────────────

interface OrgForm {
  orgCode: string;
  orgName: string;
  orgShortName: string;
  orgType: OrgType;
  parentCode: string;
  siteBusinessType: SiteBusinessType | "";
  companyCode: string;
  sortOrder: string;
  remark: string;
}

const emptyForm = (): OrgForm => ({
  orgCode: "", orgName: "", orgShortName: "", orgType: "DEPARTMENT",
  parentCode: "", siteBusinessType: "", companyCode: "", sortOrder: "0", remark: "",
});

// ── Style constants ───────────────────────────────────────────────────────────

// 输入框/标签样式：用全局 cockpit-styles token（inputField / formLabel）
// inputField + readonly 状态合并样式
const inputFieldDisabled: React.CSSProperties = { ...inputField, opacity: 0.5, cursor: 'not-allowed', background: 'var(--bg-muted)' };

// ── Helper components ─────────────────────────────────────────────────────────

function OrgTypeBadge({ type }: { type: OrgType }) {
  const cfg = ORG_TYPE_CONFIG[type] ?? ORG_TYPE_CONFIG.DEPARTMENT;
  // 用 pillBadge 全局 token 统一 padding/字号/圆角；颜色保留 className 控制（每个 type 不同 brand 色）
  return (
    <span className={cfg.badgeCls} style={pillBadge}>
      <cfg.Icon size={14} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") {
    return (
      <span className="bg-success/10 text-success border-success/20" style={pillBadge}>
        <CheckCircle2 size={14} /> 启用
      </span>
    );
  }
  if (status === "INACTIVE") {
    return (
      <span className="bg-danger/10 text-danger border-danger/20" style={pillBadge}>
        <XCircle size={14} /> 停用
      </span>
    );
  }
  return (
    <span className="bg-bg-muted text-text-muted border-border" style={pillBadge}>
      <AlertCircle size={14} /> {status}
    </span>
  );
}

// ── Tree Node ─────────────────────────────────────────────────────────────────

function TreeNode({
  node, depth, selectedCode, collapsed, filter,
  onSelect, onToggleCollapse,
}: {
  node: OrgNode;
  depth: number;
  selectedCode: string | null;
  collapsed: Set<number>;
  filter: FilterType;
  onSelect: (code: string) => void;
  onToggleCollapse: (id: number) => void;
}) {
  const cfg = ORG_TYPE_CONFIG[node.orgType] ?? ORG_TYPE_CONFIG.DEPARTMENT;
  const isSelected = selectedCode === node.orgCode;
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.children.length > 0;

  // Apply filter: dim non-matching nodes but keep visible for tree structure
  const matchesFilter =
    !filter ||
    filter === node.orgType ||
    (filter === "ACTIVE" && node.status === "ACTIVE") ||
    (filter === "INACTIVE" && node.status === "INACTIVE");

  const displayName = node.orgShortName || node.orgName;

  return (
    <div>
      <div
        onClick={() => onSelect(node.orgCode)}
        className={cn(
          "group flex items-center gap-2 py-2 pr-4 rounded-lg cursor-pointer transition-all select-none",
          isSelected
            ? "bg-brand/10 border-l-[3px] border-brand"
            : "border-l-[3px] border-transparent hover:bg-bg-muted/60",
          !matchesFilter && "opacity-40",
        )}
        style={{ paddingLeft: `${20 + depth * 14}px` }}
      >
        {/* Expand toggle */}
        <span
          className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-text-dim hover:text-text transition-colors"
          onClick={e => {
            e.stopPropagation();
            if (hasChildren) onToggleCollapse(node.id);
          }}
        >
          {hasChildren ? (
            isCollapsed
              ? <ChevronRight size={12} />
              : <ChevronDown size={12} />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-border inline-block" />
          )}
        </span>

        {/* Icon */}
        <cfg.Icon
          size={13}
          className={cn(
            "flex-shrink-0",
            isSelected ? "text-brand" : "text-text-muted",
          )}
        />

        {/* Name */}
        <span className={cn(
          "flex-1 min-w-0 truncate",
          isSelected ? "text-brand font-semibold" : "text-text",
        )} style={{ fontSize: 14 }}>
          {displayName}
        </span>

        {/* Status dot */}
        {node.status !== "ACTIVE" && (
          <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" title="已停用" />
        )}

        {/* Type badge (compact, only shown on hover or selected) */}
        <span className={cn(
          "flex-shrink-0 transition-opacity",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}>
          <OrgTypeBadge type={node.orgType} />
        </span>
      </div>

      {/* Children */}
      {!isCollapsed && hasChildren && (
        <div>
          {[...node.children]
            .sort((a, b) => a.sortOrder - b.sortOrder || a.orgCode.localeCompare(b.orgCode))
            .map(child => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedCode={selectedCode}
                collapsed={collapsed}
                filter={filter}
                onSelect={onSelect}
                onToggleCollapse={onToggleCollapse}
              />
            ))
          }
        </div>
      )}
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailRow({ label, value, mono = false }: {
  label: string; value: React.ReactNode; mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      <span className="w-28 flex-shrink-0 text-xs font-medium text-text-muted pt-0.5">{label}</span>
      <span className={cn("flex-1 text-sm text-text break-all", mono && "font-mono text-xs text-text-muted")}>
        {value ?? <span className="text-text-dim">—</span>}
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MdOrganizationsPage() {
  const toast = useToast();
  const { canView, canCreate, canEdit, canDelete } = usePermission("MENU_MD_ORG");

  // Data
  const [tree, setTree]       = useState<OrgNode[]>([]);
  const [flat, setFlat]       = useState<OrgFlat[]>([]);
  const [loading, setLoading] = useState(true);

  // Tree UI
  const [selectedCode, setSelectedCode]   = useState<string | null>(null);
  const [collapsed, setCollapsed]         = useState<Set<number>>(new Set());
  const [treeSearch, setTreeSearch]       = useState("");
  const [filter, setFilter]               = useState<FilterType>("");

  // Drawer
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [editingCode, setEditingCode]     = useState<string | null>(null); // null = new
  const [form, setForm]                   = useState<OrgForm>(emptyForm());
  const [saving, setSaving]               = useState(false);

  // Status toggle
  const [toggling, setToggling]           = useState(false);

  // UIX-9A — Detail drawer
  const [detailCode, setDetailCode]       = useState<string | null>(null);

  // ORG-MERGE — Tab 切换（组织档案 / 成员 / 预留权限&活动）
  const [activeTab, setActiveTab]         = useState<'info' | 'members'>('info');

  // UIX-PROD-2 — 响应式：窄屏（<1280）右栏折叠到顶部横排
  const [isNarrow, setIsNarrow]           = useState(false);
  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < 1280);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [treeRes, flatRes] = await Promise.all([
        fetch("/api/organizations/tree",  { headers: authHdr() }),
        fetch("/api/organizations",       { headers: authHdr() }),
      ]);

      const treeJson = await treeRes.json();
      const flatJson = await flatRes.json();

      if (treeJson.code === 200) {
        // Sort root level
        const roots: OrgNode[] = (treeJson.data ?? []);
        roots.sort((a: OrgNode, b: OrgNode) => a.sortOrder - b.sortOrder || a.orgCode.localeCompare(b.orgCode));
        setTree(roots);

        // Auto-select root
        if (!selectedCode && roots.length > 0) {
          setSelectedCode(roots[0].orgCode);
        }
      }

      if (flatJson.code === 200) {
        const list: OrgFlat[] = flatJson.data ?? [];
        list.sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder || a.orgCode.localeCompare(b.orgCode));
        setFlat(list);
      }
    } catch (e) {
      toast.error("加载组织架构失败：" + (e instanceof Error ? e.message : "网络错误"));
    } finally {
      setLoading(false);
    }
  }, [canView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Derived: selected org ───────────────────────────────────────────────────

  const selectedOrg = useMemo(
    () => flat.find(o => o.orgCode === selectedCode) ?? null,
    [flat, selectedCode],
  );

  const parentOrg = useMemo(
    () => selectedOrg?.parentCode ? flat.find(o => o.orgCode === selectedOrg.parentCode) ?? null : null,
    [flat, selectedOrg],
  );

  // ── Tree search filter ──────────────────────────────────────────────────────

  const filteredTree = useMemo(() => {
    if (!treeSearch.trim()) return tree;
    const kw = treeSearch.toLowerCase();
    function matchNode(node: OrgNode): boolean {
      return node.orgName.toLowerCase().includes(kw)
        || node.orgCode.toLowerCase().includes(kw)
        || (node.orgShortName ?? "").toLowerCase().includes(kw);
    }
    function filterTree(nodes: OrgNode[]): OrgNode[] {
      return nodes.flatMap(n => {
        const filteredChildren = filterTree(n.children);
        if (matchNode(n) || filteredChildren.length > 0) {
          return [{ ...n, children: filteredChildren }];
        }
        return [];
      });
    }
    return filterTree(tree);
  }, [tree, treeSearch]);

  // ── Collapse helpers ────────────────────────────────────────────────────────

  const toggleCollapse = (id: number) => {
    setCollapsed(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const ids = new Set(flat.filter(o => flat.some(c => c.parentId === o.id)).map(o => o.id));
    setCollapsed(ids);
  };

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditingCode(null);
    setForm({
      ...emptyForm(),
      parentCode: selectedOrg?.orgCode ?? "",
    });
    setDrawerOpen(true);
  };

  const openEdit = () => {
    if (!selectedOrg) return;
    setEditingCode(selectedOrg.orgCode);
    setForm({
      orgCode:          selectedOrg.orgCode,
      orgName:          selectedOrg.orgName,
      orgShortName:     selectedOrg.orgShortName ?? "",
      orgType:          selectedOrg.orgType,
      parentCode:       selectedOrg.parentCode ?? "",
      siteBusinessType: (selectedOrg.siteBusinessType ?? "") as SiteBusinessType | "",
      companyCode:      selectedOrg.companyCode ?? "",
      sortOrder:        String(selectedOrg.sortOrder ?? 0),
      remark:           selectedOrg.remark ?? "",
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.orgName.trim()) { toast.error("组织名称不能为空"); return; }
    if (!editingCode && !form.orgCode.trim()) { toast.error("新建时必须填写组织编码"); return; }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        orgName:          form.orgName.trim(),
        orgShortName:     form.orgShortName.trim() || undefined,
        orgType:          form.orgType,
        parentCode:       form.parentCode || undefined,
        siteBusinessType: form.siteBusinessType || undefined,
        companyCode:      form.companyCode || undefined,
        sortOrder:        parseInt(form.sortOrder, 10) || 0,
        remark:           form.remark || undefined,
      };

      let url: string;
      let method: string;

      if (editingCode) {
        url    = `/api/organizations/${editingCode}`;
        method = "PATCH";
      } else {
        url    = "/api/organizations";
        method = "POST";
        body.orgCode = form.orgCode.trim().toUpperCase();
      }

      const res  = await fetch(url, { method, headers: authHdr(), body: JSON.stringify(body) });
      const json = await res.json();

      if (json.code === 200) {
        toast.success(editingCode ? "组织信息已更新" : "组织节点已创建");
        setDrawerOpen(false);
        const newCode = editingCode ?? (json.data?.orgCode ?? form.orgCode.toUpperCase());
        await load();
        setSelectedCode(newCode);
      } else {
        throw new Error(json.message ?? json.msg ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  // ── Status toggle ───────────────────────────────────────────────────────────

  const handleToggleStatus = async () => {
    if (!selectedOrg || toggling) return;
    const isActive = selectedOrg.status === "ACTIVE";
    const action = isActive ? "disable" : "enable";
    const label  = isActive ? "停用" : "启用";

    setToggling(true);
    try {
      const res  = await fetch(`/api/organizations/${selectedOrg.orgCode}/${action}`, {
        method: "POST", headers: authHdr(),
      });
      const json = await res.json();
      if (json.code === 200) {
        toast.success(`已${label}组织「${selectedOrg.orgShortName || selectedOrg.orgName}」`);
        await load();
      } else {
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setToggling(false);
    }
  };

  // ── G88 删除组织（硬删，二次确认；后端双守卫：有子节点/有成员绑定不可删）────────
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const handleDelete = () => {
    if (!selectedOrg || deleting) return;
    setConfirmDelete(true);
  };
  const doDelete = async () => {
    setConfirmDelete(false);
    if (!selectedOrg) return;
    const name = selectedOrg.orgShortName || selectedOrg.orgName;
    setDeleting(true);
    try {
      const res  = await fetch(`/api/organizations/${selectedOrg.orgCode}`, {
        method: "DELETE", headers: authHdr(),
      });
      const json = await res.json();
      if (json.code === 200) {
        toast.success(`已删除组织「${name}」`);
        const parentCode = selectedOrg.parentCode;
        await load();
        setSelectedCode(parentCode ?? null);
      } else {
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // ── Tree count ───────────────────────────────────────────────────────────────

  const totalCount = flat.length;
  const activeCount = flat.filter(o => o.status === "ACTIVE").length;

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!canView) {
    return <div className="text-text-muted" style={{ padding: 40, textAlign: "center" }}>无权限查看组织架构</div>;
  }

  return (
    <div className="animate-fade-in flex flex-col gap-0" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="组织架构"
        subtitle={`共 ${totalCount} 个组织 · 启用 ${activeCount} · 健康度 ${totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0}% — 集团 / 公司 / 场区 / 部门（事业群已解耦为业务维度）`}
        breadcrumb={["主数据中心", "组织架构"]}
        actions={canCreate ? (
          <button type="button" onClick={openNew} style={primaryActionButton}>
            <Plus size={14} /> 新增组织
          </button>
        ) : null}
      />

      {/* ── Main layout（固定高度 calc(100vh-100px) → 3 栏 stretch 等高，左栏内部树可滚动） ──────── */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: isNarrow ? 'wrap' : 'nowrap',
        gap: 16,
        alignItems: isNarrow ? 'flex-start' : 'stretch',
        marginTop: 4,
        height: isNarrow ? 'auto' : 'calc(100vh - 100px)',
      }}>

        {/* ── Left: org tree（stretch 等高对齐右栏；窄屏自适应） ───────── */}
        <div
          className="flex flex-col rounded-2xl border border-border bg-bg-card shadow-card overflow-hidden flex-shrink-0"
          style={{ width: isNarrow ? 280 : 340 }}
        >
          {/* Tree header — 用 cockpitCardHeader token 跟右栏 4 卡 header 风格一致 */}
          <div style={cockpitCardHeader}>
            <Network size={14} style={{ color: 'var(--color-primary)' }} />
            <span style={cockpitCardHeaderTitle}>组织树</span>
            <span style={cockpitCardHeaderHint}>{activeCount}/{totalCount}</span>
            <button
              onClick={load}
              disabled={loading}
              title="刷新"
              style={{ background: 'transparent', border: 'none', padding: 4, borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex' }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Search + Filter + Expand/collapse 合并成一个工具栏，去段间 border-b */}
          <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Search */}
            <SearchInput value={treeSearch} onChange={setTreeSearch} placeholder="搜索组织名称或编码…" />

            {/* Filter pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FILTER_BUTTONS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  style={{
                    padding: '3px 10px',
                    fontSize: 11,
                    borderRadius: 100,
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                    fontWeight: filter === f.value ? 600 : 500,
                    background: filter === f.value ? 'var(--color-primary)' : 'var(--bg-muted)',
                    color: filter === f.value ? 'var(--text-on-dark, white)' : 'var(--text-secondary)',
                    border: filter === f.value ? '1px solid var(--color-primary)' : '1px solid var(--border)',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 全部展开/折叠 已去掉——树节点自带 chevron 展开按钮 */}
          </div>

          {/* Tree body */}
          <div className="flex-1 overflow-y-auto" style={{ padding: 20 }}>
            {loading ? (
              <div className="flex flex-col gap-1.5 p-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className="h-7 rounded-lg bg-bg-muted animate-pulse"
                    style={{ marginLeft: i > 1 ? (i > 3 ? 32 : 16) : 0, opacity: 1 - i * 0.1 }}
                  />
                ))}
              </div>
            ) : filteredTree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-dim">
                <Inbox size={28} className="opacity-30" />
                <span className="text-xs text-center">
                  {treeSearch ? "无匹配结果" : "暂无组织数据"}
                </span>
              </div>
            ) : filteredTree.map(node => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                selectedCode={selectedCode}
                collapsed={collapsed}
                filter={filter}
                onSelect={setSelectedCode}
                onToggleCollapse={toggleCollapse}
              />
            ))}
          </div>
        </div>

        {/* ── Right: detail panel ────────────────────────────────────────────── */}
        <div className="flex-1 rounded-2xl border border-border bg-bg-card shadow-card overflow-hidden flex flex-col min-w-0">
          {selectedOrg ? (
            <>
              {/* Detail header — 跟左栏"组织树" header 同款 cockpitCardHeader（克制不"贼眉鼠脸"） */}
              <div style={cockpitCardHeader}>
                {(() => {
                  const cfg = ORG_TYPE_CONFIG[selectedOrg.orgType] ?? ORG_TYPE_CONFIG.DEPARTMENT;
                  return <cfg.Icon size={14} className="text-brand" />;
                })()}
                <span style={cockpitCardHeaderTitle}>{selectedOrg.orgName}</span>
                <span style={cockpitCardHeaderHint}>
                  {selectedOrg.orgShortName && selectedOrg.orgShortName !== selectedOrg.orgName ? `${selectedOrg.orgShortName} · ` : ''}
                  {selectedOrg.orgCode}
                </span>
              </div>

              {/* 操作工具栏（独立一行，跟 header 风格协调） */}
              <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <OrgTypeBadge type={selectedOrg.orgType} />
                <StatusBadge status={selectedOrg.status} />
                <div style={{ flex: 1 }} />
                {flat.some(o => o.parentId === selectedOrg.id) && (
                  <button
                    onClick={() => {
                      const firstChild = flat.find(o => o.parentId === selectedOrg.id);
                      if (firstChild) setSelectedCode(firstChild.orgCode);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-muted)', cursor: 'pointer' }}
                  >
                    查看下级 <ArrowRight size={11} />
                  </button>
                )}
                <button
                  onClick={() => setDetailCode(selectedOrg.orgCode)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--bg-muted)', cursor: 'pointer' }}
                  title={selectedOrg.orgType === "COMPANY" ? "公司中心" : "组织中心"}
                >
                  <Info size={12} /> {selectedOrg.orgType === "COMPANY" ? "公司中心" : "组织中心"}
                </button>
                {canEdit && (
                  <>
                    <button
                      onClick={openEdit}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid var(--color-primary)', color: 'var(--color-primary)', background: 'transparent', cursor: 'pointer' }}
                    >
                      <Edit3 size={12} /> 编辑
                    </button>
                    <button
                      onClick={handleToggleStatus}
                      disabled={toggling}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                        border: `1px solid ${selectedOrg.status === 'ACTIVE' ? 'var(--status-danger)' : 'var(--status-success)'}`,
                        color: selectedOrg.status === 'ACTIVE' ? 'var(--status-danger)' : 'var(--status-success)',
                        background: 'transparent', cursor: 'pointer', opacity: toggling ? 0.5 : 1,
                      }}
                    >
                      {toggling
                        ? <RefreshCw size={12} className="animate-spin" />
                        : selectedOrg.status === 'ACTIVE'
                          ? <><PowerOff size={12} /> 停用</>
                          : <><Power size={12} /> 启用</>}
                    </button>
                  </>
                )}
                {canDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    title="删除组织（有子节点或成员绑定时不可删）"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                      border: '1px solid var(--status-danger)', color: 'var(--status-danger)',
                      background: 'transparent', cursor: 'pointer', opacity: deleting ? 0.5 : 1,
                    }}
                  >
                    {deleting ? <RefreshCw size={12} className="animate-spin" /> : <><Trash2 size={12} /> 删除</>}
                  </button>
                )}
              </div>

              {/* ORG-MERGE — Tab 切换 */}
              <div style={{ display: 'flex', gap: 4, padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
                {[
                  { key: 'info', label: '组织档案' },
                  { key: 'members', label: '成员管理' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as 'info' | 'members')}
                    style={{
                      padding: '10px 16px', fontSize: 13, fontWeight: 600,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--text-secondary)',
                      borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                      marginBottom: -1,
                    }}
                  >{tab.label}</button>
                ))}
              </div>

              {/* Detail body — 根据 Tab 切换 */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'members' ? (
                  <div style={{ padding: 16 }}>
                    <OrgMembersPanel orgId={selectedOrg.id} orgName={selectedOrg.orgName} />
                  </div>
                ) : (
                <div>
                  {/* Section header: 与左栏"组织树"header 风格一致（cockpitCardHeader token） */}
                  <div style={cockpitCardHeader}>
                    <Info size={14} style={{ color: 'var(--color-primary)' }} />
                    <span style={cockpitCardHeaderTitle}>组织档案</span>
                    <span style={cockpitCardHeaderHint}>
                      {ORG_TYPE_CONFIG[selectedOrg.orgType]?.label} · L{selectedOrg.level}
                    </span>
                  </div>

                  {/* 2 列属性网格 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0' }}>
                    <PropCell label="正式全称" value={selectedOrg.orgName} mono={false} />
                    <PropCell label="简称" value={selectedOrg.orgShortName || '—'} />
                    <PropCell label="组织编码" value={selectedOrg.orgCode} mono />
                    <PropCell label="组织类型" value={<OrgTypeBadge type={selectedOrg.orgType} />} />
                    <PropCell label="状态" value={<StatusBadge status={selectedOrg.status} />} />
                    <PropCell label="层级" value={
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-brand/10 text-brand text-[11px] font-bold">{selectedOrg.level}</span>
                        <span className="text-xs text-text-muted">L{selectedOrg.level}</span>
                      </span>
                    } />
                    <PropCell label="上级组织" value={
                      parentOrg
                        ? <button onClick={() => setSelectedCode(parentOrg.orgCode)}
                            className="inline-flex items-center gap-1 text-brand hover:underline" style={{ fontSize: 13, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {parentOrg.orgShortName || parentOrg.orgName}<ArrowRight size={11} />
                          </button>
                        : <span className="text-text-dim text-xs">顶级组织</span>
                    } />
                    <PropCell label="下级数量" value={
                      <span style={{ fontSize: 13 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{flat.filter(o => o.parentId === selectedOrg.id).length}</strong>
                        <span style={{ color: 'var(--text-secondary)', margin: '0 4px' }}>直属 ·</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{flat.filter(o => o.path?.includes(`/${selectedOrg.id}/`) || o.parentId === selectedOrg.id).length}</strong>
                        <span style={{ color: 'var(--text-secondary)' }}>全部</span>
                      </span>
                    } />
                    {selectedOrg.companyCode && <PropCell label="关联公司" value={selectedOrg.companyCode} mono />}
                    {selectedOrg.managerName && <PropCell label="负责人" value={selectedOrg.managerName} />}
                    <PropCell label="排序权重" value={String(selectedOrg.sortOrder ?? 0)} />
                    {selectedOrg.orgType === "SITE" && selectedOrg.siteBusinessType && (
                      <PropCell label="场区业务类型" value={SITE_BUSINESS_TYPES.find(t => t.value === selectedOrg.siteBusinessType)?.label ?? selectedOrg.siteBusinessType} />
                    )}
                  </div>

                  {/* 路径独占一行（无 borderTop，共用 propCell 风格） */}
                  {selectedOrg.path && (
                    <div style={propCell}>
                      <span style={propLabel}>组织路径</span>
                      <code style={{ ...propValue, fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedOrg.path}</code>
                    </div>
                  )}

                  {/* 备注独占一行 */}
                  {selectedOrg.remark && (
                    <div style={propCell}>
                      <span style={propLabel}>备注</span>
                      <span style={propValue}>{selectedOrg.remark}</span>
                    </div>
                  )}
                </div>
                )}
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center flex-1 gap-4 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand/8 flex items-center justify-center">
                <Network size={32} className="text-brand opacity-50" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-muted">在左侧点击组织节点</p>
                <p className="text-xs text-text-dim mt-1">查看完整组织信息和层级关系</p>
              </div>
            </div>


          )}
        </div>

      </div>

      {/* ── Drawer: new / edit ──────────────────────────────────────────────── */}
      <RightDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingCode ? `编辑组织 — ${editingCode}` : "新建组织"}
        width="480px"
        footer={
          <div className="flex gap-3 w-full">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              style={{ ...secondaryActionButton, flex: 1, justifyContent: 'center', padding: '10px 18px' }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ ...primaryActionButton, flex: 2, justifyContent: 'center', padding: '10px 18px', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  保存中…
                </>
              ) : editingCode ? "保存修改" : "创建组织"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">

          {/* Org code — required on create, read-only on edit */}
          <div>
            <label style={formLabel}>
              组织编码
              {!editingCode && <span className="text-danger ml-0.5">*</span>}
              {editingCode && <span className="ml-1 font-normal text-text-dim">（创建后不可修改）</span>}
            </label>
            <input
              style={editingCode ? inputFieldDisabled : inputField}
              value={form.orgCode}
              readOnly={!!editingCode}
              onChange={e => setForm(p => ({ ...p, orgCode: e.target.value.toUpperCase() }))}
              placeholder="如 GRP-LAODAN、CO-FHA（字母数字连字符）"
            />
          </div>

          {/* Org name */}
          <div>
            <label style={formLabel}>
              正式全称 <span className="text-danger">*</span>
            </label>
            <input
              style={inputField}
              value={form.orgName}
              autoFocus={!editingCode}
              onChange={e => setForm(p => ({ ...p, orgName: e.target.value }))}
              placeholder="例：老单农业集团有限公司"
            />
          </div>

          {/* Org short name */}
          <div>
            <label style={formLabel}>简称（展示用）</label>
            <input
              style={inputField}
              value={form.orgShortName}
              onChange={e => setForm(p => ({ ...p, orgShortName: e.target.value }))}
              placeholder="例：老单集团"
            />
          </div>

          {/* Org type */}
          <div>
            <label style={formLabel}>
              组织类型 <span className="text-danger">*</span>
            </label>
            <select
              style={inputField}
              value={form.orgType}
              onChange={e => setForm(p => ({ ...p, orgType: e.target.value as OrgType }))}
            >
              {ORG_TYPES_SELECT.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Site business type — only for SITE */}
          {form.orgType === "SITE" && (
            <div>
              <label style={formLabel}>场区业务类型</label>
              <select
                style={inputField}
                value={form.siteBusinessType}
                onChange={e => setForm(p => ({ ...p, siteBusinessType: e.target.value as SiteBusinessType | "" }))}
              >
                <option value="">请选择（可选）</option>
                {SITE_BUSINESS_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Parent org */}
          <div>
            <label style={formLabel}>上级组织</label>
            <select
              style={inputField}
              value={form.parentCode}
              onChange={e => setForm(p => ({ ...p, parentCode: e.target.value }))}
            >
              <option value="">无（顶级组织）</option>
              {flat
                .filter(o => o.orgCode !== editingCode)
                .map(o => (
                  <option key={o.id} value={o.orgCode}>
                    {"　".repeat(Math.max(0, o.level - 1))}
                    {ORG_TYPE_CONFIG[o.orgType]?.label ?? o.orgType} · {o.orgShortName || o.orgName}
                  </option>
                ))
              }
            </select>
          </div>

          {/* Company code */}
          <div>
            <label style={formLabel}>关联公司编码（可选）</label>
            <input
              style={inputField}
              value={form.companyCode}
              onChange={e => setForm(p => ({ ...p, companyCode: e.target.value }))}
              placeholder="如 CO-FHA，用于数据范围过滤"
            />
          </div>

          {/* Sort order */}
          <div>
            <label style={formLabel}>排序权重</label>
            <input
              type="number"
              style={inputField}
              value={form.sortOrder}
              onChange={e => setForm(p => ({ ...p, sortOrder: e.target.value }))}
              placeholder="数值越小越靠前，默认 0"
              min={0}
            />
          </div>

          {/* Remark */}
          <div>
            <label style={formLabel}>备注</label>
            <textarea
              style={{ ...inputField, resize: 'none' }}
              rows={2}
              value={form.remark}
              onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
              placeholder="可选"
            />
          </div>
        </div>
      </RightDrawer>

      {/* UIX-9A — 主数据中心统一详情抽屉 */}
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={selectedOrg?.orgType === "COMPANY" ? companyConfig : organizationConfig}
        onClose={() => setDetailCode(null)}
      />

      <ConfirmDialogV2
        open={confirmDelete}
        title="删除组织"
        message={selectedOrg ? `确定删除组织「${selectedOrg.orgShortName || selectedOrg.orgName}」（${selectedOrg.orgCode}）？删除不可恢复；有子节点或成员绑定时将被拒绝。` : ''}
        danger
        confirmLabel="删除"
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// ── UIX-PROD-1: 右栏驾驶舱 helpers ────────────────────────────

function RightStat({ label, value, tone = 'default' }: {
  label: string; value: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const color = tone === 'success' ? 'text-success'
              : tone === 'warning' ? 'text-warning'
              : tone === 'danger'  ? 'text-danger'
              : 'text-text';
  return (
    <div className="rounded-lg bg-bg-muted/40 p-2.5">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className={cn("text-lg font-bold leading-tight", color)}>{value}</div>
    </div>
  );
}

function KpiPair({ label, value, tone = 'default' }: {
  label: string; value: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const color = tone === 'success' ? 'var(--status-success)'
              : tone === 'warning' ? 'var(--status-warning)'
              : tone === 'danger'  ? 'var(--status-danger)'
              : 'var(--text-primary)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: 0.2 }}>{label}</div>
    </div>
  );
}

function RightRow({ label, value, tone = 'default' }: {
  label: string; value: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const color = tone === 'success' ? 'text-success'
              : tone === 'warning' ? 'text-warning'
              : tone === 'danger'  ? 'text-danger'
              : 'text-text';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={cn("text-xs font-semibold", color)}>{value}</span>
    </div>
  );
}

function RiskItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle2 size={12} className="text-success flex-shrink-0" />
      ) : (
        <AlertCircle size={12} className="text-warning flex-shrink-0" />
      )}
      <span className={ok ? "text-text-muted" : "text-warning"}>
        {ok ? label : `${label}（待补全）`}
      </span>
    </div>
  );
}

// UIX-PROD-2: 属性单元格
function PropCell({ label, value, mono = false }: {
  label: string; value: React.ReactNode; mono?: boolean;
}) {
  return (
    <div style={propCell}>
      <span style={propLabel}>{label}</span>
      <span style={{ ...propValue, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

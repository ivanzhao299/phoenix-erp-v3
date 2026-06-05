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
  LayoutGrid, Info, Edit3, PowerOff, Power, Search,
  ArrowRight, Inbox, CheckCircle2, XCircle, AlertCircle,
  Activity, BarChart3, Check,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { organizationConfig, companyConfig } from "@/components/master-data/detail-configs";
import {
  COCKPIT, cockpitCard, cockpitCardBody, cockpitCardHeader, cockpitCardHeaderTitle,
  cockpitCardHeaderHint, kpiHeroNumber, kpiHeroLabel, propCell, propLabel, propValue,
  kpiMiniNumber, kpiMiniLabel, scoreBadge, riskItem, listRow,
  primaryActionButton, secondaryActionButton, inputField, formLabel, inlineBadge, pillBadge,
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Tree count ───────────────────────────────────────────────────────────────

  const totalCount = flat.length;
  const activeCount = flat.filter(o => o.status === "ACTIVE").length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in flex flex-col gap-0" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="组织驾驶舱"
        subtitle="集团 / 事业群 / 公司 / 场区 / 部门 — 组织运营态势 · 合规风险 · 层级治理"
        breadcrumb={["主数据中心", "组织驾驶舱"]}
        actions={
          <button type="button" onClick={openNew} style={primaryActionButton}>
            <Plus size={14} /> 新增组织
          </button>
        }
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
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
              <input
                value={treeSearch}
                onChange={e => setTreeSearch(e.target.value)}
                placeholder="搜索组织名称或编码…"
                style={{
                  width: '100%', padding: '8px 12px 8px 30px',
                  fontSize: 12, borderRadius: 8,
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

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
              </div>

              {/* Detail body — 去掉内层"组织档案"圆角卡，直接 inline 在 detail panel 内 */}
              <div className="flex-1 overflow-y-auto">
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

        {/* ── UIX-PROD-1/2: 驾驶舱栏（宽屏右侧 300 / 窄屏顶部横排） ───────── */}
        <div style={{
          display: 'flex',
          flexDirection: isNarrow ? 'row' : 'column',
          flexWrap: isNarrow ? 'wrap' : 'nowrap',
          gap: 12,
          width: isNarrow ? '100%' : 300,
          flexShrink: 0,
          order: isNarrow ? -1 : 0,
        }}>
          {/* 组织态势 — Hero 卡（UIX-PROD-2 共用 cockpit-styles） */}
          <div style={{ ...cockpitCard, flex: isNarrow ? '1 1 280px' : '0 0 auto', minWidth: 0 }}>
            <div style={cockpitCardHeader}>
              <Activity size={14} style={{ color: 'var(--color-primary)' }} />
              <span style={cockpitCardHeaderTitle}>组织态势</span>
              <span style={cockpitCardHeaderHint}>实时</span>
            </div>
            <div style={cockpitCardBody}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={kpiHeroNumber}>{totalCount}</span>
                <span style={kpiHeroLabel}>个组织在管</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={12} style={{ color: 'var(--status-success)' }} />
                <span>健康度 <strong style={{ color: 'var(--status-success)', fontSize: 13 }}>{totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0}%</strong></span>
              </div>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-muted)', marginBottom: 12 }}>
                <div style={{ background: 'var(--status-success-bg, var(--status-success))', opacity: 0.85, width: `${totalCount > 0 ? (activeCount / totalCount) * 100 : 0}%`, height: '100%' }} />
                <div style={{ background: 'var(--status-warning-bg, var(--status-warning))', opacity: 0.85, width: `${totalCount > 0 ? ((totalCount - activeCount) / totalCount) * 100 : 0}%`, height: '100%' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div>
                  <div style={kpiMiniNumber('success')}>{activeCount}</div>
                  <div style={kpiMiniLabel}>已启用</div>
                </div>
                <div>
                  <div style={kpiMiniNumber(totalCount - activeCount > 0 ? 'warning' : 'default')}>{totalCount - activeCount}</div>
                  <div style={kpiMiniLabel}>已停用</div>
                </div>
                <div>
                  <div style={kpiMiniNumber()}>{tree.length}</div>
                  <div style={kpiMiniLabel}>顶级数</div>
                </div>
              </div>
            </div>
          </div>

          {/* 当前组织 KPI（共用 cockpit-styles 属性单元格风格） */}
          {selectedOrg && (
            <div style={{ ...cockpitCard, flex: isNarrow ? '1 1 260px' : '0 0 auto', minWidth: 0 }}>
              <div style={cockpitCardHeader}>
                <BarChart3 size={14} style={{ color: 'var(--status-info)' }} />
                <span style={cockpitCardHeaderTitle}>当前组织</span>
                <code style={{ ...cockpitCardHeaderHint, fontFamily: 'monospace' }}>{selectedOrg.orgCode}</code>
              </div>
              <div>
                <CockpitProp label="直属下级" value={
                  <span><strong style={{ fontSize: 14 }}>{flat.filter(o => o.parentId === selectedOrg.id).length}</strong> <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>个直属</span></span>
                } />
                <CockpitProp label="所属层级" value={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'var(--bg-muted)', color: 'var(--color-primary)', fontSize: 11, fontWeight: 700 }}>{selectedOrg.level}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>L{selectedOrg.level}</span>
                  </span>
                } />
                <CockpitProp label="负责人" value={
                  selectedOrg.managerName
                    ? <span>{selectedOrg.managerName}</span>
                    : <span style={inlineBadge('warning')}>未指定</span>
                } />
                <CockpitProp label="组织类型" value={
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: 'var(--text-primary)' }}>
                    {ORG_TYPE_CONFIG[selectedOrg.orgType]?.label ?? selectedOrg.orgType}
                  </span>
                } />
              </div>
            </div>
          )}

          {/* 合规风险 — 用 banner 风格突出问题 */}
          {selectedOrg && (() => {
            // wrapper 应用 flex 配合 isNarrow（包裹 div 由 IIFE 返回，下方 div 加 style）
            const checks = [
              { ok: !!selectedOrg.managerName, label: "负责人已指定", warn: "请指定负责人" },
              { ok: selectedOrg.status === 'ACTIVE', label: "组织已启用", warn: "组织当前停用" },
              { ok: selectedOrg.orgType !== 'COMPANY' || !!selectedOrg.companyCode, label: "公司编码完整", warn: "缺公司编码" },
              { ok: !!selectedOrg.parentCode || selectedOrg.orgType === 'GROUP', label: "层级归属清晰", warn: "未指定上级" },
            ];
            const fails = checks.filter(c => !c.ok);
            const score = Math.round((checks.length - fails.length) / checks.length * 100);
            const passing = fails.length === 0;
            return (
              <div style={{ ...cockpitCard, flex: isNarrow ? '1 1 260px' : '0 0 auto', minWidth: 0 }}>
                <div style={cockpitCardHeader}>
                  {passing
                    ? <CheckCircle2 size={14} style={{ color: 'var(--status-success)' }} />
                    : <AlertCircle size={14} style={{ color: 'var(--status-warning)' }} />}
                  <span style={cockpitCardHeaderTitle}>合规风险</span>
                  <span style={scoreBadge(passing)}>{score} 分</span>
                </div>
                <div style={{ ...cockpitCardBody, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {checks.map((c, i) => (
                    <div key={i} style={riskItem}>
                      {c.ok
                        ? <CheckCircle2 size={13} style={{ color: 'var(--status-success)', flexShrink: 0 }} />
                        : <AlertCircle size={13} style={{ color: 'var(--status-warning)', flexShrink: 0 }} />}
                      <span style={{ color: c.ok ? 'var(--text-secondary)' : 'var(--status-warning)', wordBreak: 'break-word' }}>
                        {c.ok ? c.label : c.warn}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 直属下级预览 — 第 4 卡（共用 listRow 样式） */}
          {selectedOrg && (() => {
            const children = flat
              .filter(o => o.parentId === selectedOrg.id)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.orgCode.localeCompare(b.orgCode));
            return (
              <div style={{
                ...cockpitCard,
                flex: isNarrow ? '1 1 260px' : '1 1 auto',
                minWidth: 0, minHeight: 0,
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={cockpitCardHeader}>
                  <Network size={14} style={{ color: 'var(--color-primary)' }} />
                  <span style={cockpitCardHeaderTitle}>直属下级</span>
                  <span style={cockpitCardHeaderHint}>{children.length} 个</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
                  {children.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, padding: '24px 0' }}>该组织无下级</div>
                  ) : (
                    <>
                      {children.slice(0, 12).map(c => {
                        const cfg = ORG_TYPE_CONFIG[c.orgType] ?? ORG_TYPE_CONFIG.DEPARTMENT;
                        return (
                          <button
                            key={c.id}
                            onClick={() => setSelectedCode(c.orgCode)}
                            style={listRow}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            <cfg.Icon size={13} className="text-text-muted flex-shrink-0" />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.orgShortName || c.orgName}
                            </span>
                            <span style={{
                              fontSize: 10, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                              background: c.status === 'ACTIVE' ? 'var(--status-success-bg-light)' : 'var(--bg-muted)',
                              color: c.status === 'ACTIVE' ? 'var(--status-success)' : 'var(--text-secondary)',
                            }}>{cfg.label}</span>
                          </button>
                        );
                      })}
                      {children.length > 12 && (
                        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-secondary)', padding: '6px 0' }}>
                          …还有 {children.length - 12} 个
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}
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

function CockpitProp({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={propCell}>
      <span style={propLabel}>{label}</span>
      <span style={propValue}>{value}</span>
    </div>
  );
}

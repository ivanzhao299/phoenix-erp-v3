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

const INP = [
  "w-full px-3 py-2 text-sm rounded-lg",
  "border border-border bg-bg-card text-text",
  "outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/20",
  "placeholder:text-text-dim transition-colors",
].join(" ");

const LBL = "block text-xs font-semibold text-text-muted mb-1";

// ── Helper components ─────────────────────────────────────────────────────────

function OrgTypeBadge({ type }: { type: OrgType }) {
  const cfg = ORG_TYPE_CONFIG[type] ?? ORG_TYPE_CONFIG.DEPARTMENT;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
      cfg.badgeCls,
    )}>
      <cfg.Icon size={10} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-success/10 text-success border border-success/20">
        <CheckCircle2 size={10} /> 启用
      </span>
    );
  }
  if (status === "INACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-danger/10 text-danger border border-danger/20">
        <XCircle size={10} /> 停用
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-bg-muted text-text-muted border border-border">
      <AlertCircle size={10} /> {status}
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
          "group flex items-center gap-1.5 py-1.5 pr-2 rounded-lg cursor-pointer transition-all select-none",
          isSelected
            ? "bg-brand/10 border-l-[3px] border-brand"
            : "border-l-[3px] border-transparent hover:bg-bg-muted/60",
          !matchesFilter && "opacity-40",
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
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
          "flex-1 min-w-0 truncate text-sm",
          isSelected ? "text-brand font-semibold" : "text-text",
        )}>
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
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg bg-brand text-white hover:opacity-90 active:opacity-80 transition-opacity"
          >
            <Plus size={14} /> 新建组织
          </button>
        }
      />

      {/* ── Main layout（UIX-PROD-2 响应式 flex-wrap：窄屏右栏 width 100% 自然换行到顶；宽屏 3 栏一行） ──────── */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: isNarrow ? 'wrap' : 'nowrap',
        gap: 16,
        minHeight: 600,
        marginTop: 4,
      }}>

        {/* ── Left: org tree ─────────────────────────────────────────────────── */}
        <div
          className="flex flex-col rounded-2xl border border-border bg-bg-card shadow-card overflow-hidden flex-shrink-0"
          style={{ width: isNarrow ? 240 : 280 }}
        >
          {/* Tree header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-bg-muted/30">
            <Network size={14} className="text-brand flex-shrink-0" />
            <span className="font-semibold text-sm text-text flex-1">组织树</span>
            <span className="text-xs text-text-dim">
              {activeCount}/{totalCount}
            </span>
            <button
              onClick={load}
              disabled={loading}
              title="刷新"
              className="p-1 rounded text-text-dim hover:text-text hover:bg-bg-muted transition-colors"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-border/60">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" />
              <input
                value={treeSearch}
                onChange={e => setTreeSearch(e.target.value)}
                placeholder="搜索组织名称或编码..."
                className={cn(
                  "w-full pl-7 pr-3 py-1.5 text-xs rounded-lg",
                  "bg-bg-muted border border-border/60 text-text",
                  "outline-none focus:border-brand/50 placeholder:text-text-dim transition-colors",
                )}
              />
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border/60">
            {FILTER_BUTTONS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "px-2 py-0.5 text-[11px] rounded-full border transition-colors",
                  filter === f.value
                    ? "bg-brand text-white border-brand font-semibold"
                    : "bg-bg-muted text-text-muted border-border hover:bg-bg-card",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Expand/collapse controls */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40">
            <button
              onClick={expandAll}
              className="text-[11px] text-brand hover:underline"
            >
              全部展开
            </button>
            <span className="text-border">·</span>
            <button
              onClick={collapseAll}
              className="text-[11px] text-text-muted hover:underline"
            >
              全部折叠
            </button>
          </div>

          {/* Tree body */}
          <div className="flex-1 overflow-y-auto p-2">
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
              {/* Detail header */}
              <div className="px-6 py-4 border-b border-border bg-bg-muted/20">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Icon circle */}
                    <div className="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0 border border-brand/15">
                      {(() => {
                        const cfg = ORG_TYPE_CONFIG[selectedOrg.orgType] ?? ORG_TYPE_CONFIG.DEPARTMENT;
                        return <cfg.Icon size={20} className="text-brand" />;
                      })()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-text truncate">
                          {selectedOrg.orgName}
                        </h2>
                        {selectedOrg.orgShortName && selectedOrg.orgShortName !== selectedOrg.orgName && (
                          <span className="text-sm text-text-muted">
                            （{selectedOrg.orgShortName}）
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <OrgTypeBadge type={selectedOrg.orgType} />
                        <StatusBadge status={selectedOrg.status} />
                        <span className="text-xs font-mono text-text-dim">
                          {selectedOrg.orgCode}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {/* View children */}
                    {flat.some(o => o.parentId === selectedOrg.id) && (
                      <button
                        onClick={() => {
                          const firstChild = flat.find(o => o.parentId === selectedOrg.id);
                          if (firstChild) setSelectedCode(firstChild.orgCode);
                        }}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors",
                          "border border-border text-text-muted bg-bg-page hover:bg-bg-muted",
                        )}
                      >
                        查看下级 <ArrowRight size={11} />
                      </button>
                    )}

                    {/* UIX-9A — Open in master-data center drawer */}
                    <button
                      onClick={() => setDetailCode(selectedOrg.orgCode)}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
                        "border border-border text-text bg-bg-page hover:bg-bg-muted",
                      )}
                      title={selectedOrg.orgType === "COMPANY" ? "公司中心 — 关联项目/仓库/账户" : "组织中心 — KPI/引用/审计"}
                    >
                      <Info size={12} /> {selectedOrg.orgType === "COMPANY" ? "公司中心" : "组织中心"}
                    </button>

                    {/* Edit */}
                    <button
                      onClick={openEdit}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
                        "border border-brand/30 text-brand bg-brand/5 hover:bg-brand/10",
                      )}
                    >
                      <Edit3 size={12} /> 编辑
                    </button>

                    {/* Enable / Disable */}
                    <button
                      onClick={handleToggleStatus}
                      disabled={toggling}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50",
                        selectedOrg.status === "ACTIVE"
                          ? "border border-danger/30 text-danger bg-danger/5 hover:bg-danger/10"
                          : "border border-success/30 text-success bg-success/5 hover:bg-success/10",
                      )}
                    >
                      {toggling ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : selectedOrg.status === "ACTIVE" ? (
                        <><PowerOff size={12} /> 停用</>
                      ) : (
                        <><Power size={12} /> 启用</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Detail body */}
              <div className="flex-1 overflow-y-auto px-6 py-2">
                <div className="grid gap-0">

                  {/* Basic info section */}
                  <div className="mb-4 mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Info size={13} className="text-brand" />
                      <span className="text-xs font-bold text-text-muted uppercase tracking-wider">基本信息</span>
                    </div>
                    <div className="rounded-xl border border-border bg-bg-muted/20 px-4">
                      <DetailRow label="正式全称"     value={selectedOrg.orgName} />
                      <DetailRow label="简称"         value={selectedOrg.orgShortName} />
                      <DetailRow label="组织编码"     value={<span className="font-mono text-xs">{selectedOrg.orgCode}</span>} />
                      <DetailRow label="组织类型"     value={<OrgTypeBadge type={selectedOrg.orgType} />} />
                      <DetailRow label="状态"         value={<StatusBadge status={selectedOrg.status} />} />
                      {selectedOrg.orgType === "SITE" && (
                        <DetailRow
                          label="场区业务类型"
                          value={
                            selectedOrg.siteBusinessType
                              ? SITE_BUSINESS_TYPES.find(t => t.value === selectedOrg.siteBusinessType)?.label
                                ?? selectedOrg.siteBusinessType
                              : null
                          }
                        />
                      )}
                    </div>
                  </div>

                  {/* Hierarchy section */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Network size={13} className="text-brand" />
                      <span className="text-xs font-bold text-text-muted uppercase tracking-wider">层级关系</span>
                    </div>
                    <div className="rounded-xl border border-border bg-bg-muted/20 px-4">
                      <DetailRow
                        label="上级组织"
                        value={
                          parentOrg
                            ? (
                              <button
                                onClick={() => setSelectedCode(parentOrg.orgCode)}
                                className="inline-flex items-center gap-1 text-brand hover:underline text-sm"
                              >
                                {parentOrg.orgShortName || parentOrg.orgName}
                                <ArrowRight size={11} />
                              </button>
                            )
                            : <span className="text-text-dim text-xs">顶级组织</span>
                        }
                      />
                      <DetailRow
                        label="层级"
                        value={
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-brand/10 text-brand text-[11px] font-bold flex items-center justify-center">
                              {selectedOrg.level}
                            </span>
                            <span className="text-xs text-text-muted">L{selectedOrg.level}</span>
                          </span>
                        }
                      />
                      <DetailRow
                        label="路径"
                        value={selectedOrg.path
                          ? <span className="text-xs font-mono text-text-muted break-all">{selectedOrg.path}</span>
                          : null
                        }
                      />
                      <DetailRow label="下级数量" value={
                        <span className="text-sm font-semibold text-text">
                          {flat.filter(o => o.parentId === selectedOrg.id).length} 个直属
                          {" / "}
                          {flat.filter(o => o.path?.includes(`/${selectedOrg.id}/`) || o.parentId === selectedOrg.id).length} 个全部
                        </span>
                      } />
                    </div>
                  </div>

                  {/* Extended info */}
                  {(selectedOrg.companyCode || selectedOrg.managerName || selectedOrg.remark || selectedOrg.sortOrder !== undefined) && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <LayoutGrid size={13} className="text-brand" />
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">扩展信息</span>
                      </div>
                      <div className="rounded-xl border border-border bg-bg-muted/20 px-4">
                        {selectedOrg.companyCode  && <DetailRow label="关联公司编码" value={<span className="font-mono text-xs">{selectedOrg.companyCode}</span>} />}
                        {selectedOrg.managerName  && <DetailRow label="负责人" value={selectedOrg.managerName} />}
                        <DetailRow label="排序权重" value={selectedOrg.sortOrder ?? 0} />
                        {selectedOrg.remark && <DetailRow label="备注" value={selectedOrg.remark} />}
                      </div>
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
          {/* 组织态势 — Hero 卡 */}
          <div className="rounded-xl overflow-hidden border border-border bg-bg-card" style={{ flex: isNarrow ? '1 1 280px' : 'initial', minWidth: 0 }}>
            <div className="px-4 py-2.5 border-b border-border bg-gradient-to-r from-brand/10 to-transparent flex items-center gap-2">
              <Activity size={13} className="text-brand" />
              <span className="text-xs font-bold text-text uppercase tracking-wider">组织态势</span>
              <span className="ml-auto text-[10px] text-text-dim">实时</span>
            </div>
            <div className="p-4">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-extrabold text-text leading-none">{totalCount}</span>
                <span className="text-xs text-text-muted">个组织在管</span>
              </div>
              <div className="flex items-center gap-1 mb-3 text-[11px] text-text-muted">
                <CheckCircle2 size={10} className="text-success" />
                <span>健康度 <strong className="text-success">{totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0}%</strong></span>
              </div>
              <div className="h-1.5 rounded-full bg-bg-muted overflow-hidden flex mb-3">
                <div className="bg-success h-full" style={{ width: `${totalCount > 0 ? (activeCount / totalCount) * 100 : 0}%` }} />
                <div className="bg-warning h-full" style={{ width: `${totalCount > 0 ? ((totalCount - activeCount) / totalCount) * 100 : 0}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <KpiPair label="已启用" value={activeCount} tone="success" />
                <KpiPair label="已停用" value={totalCount - activeCount} tone={totalCount - activeCount > 0 ? "warning" : "default"} />
                <KpiPair label="顶级" value={tree.length} />
              </div>
            </div>
          </div>

          {/* 当前组织 KPI */}
          {selectedOrg && (
            <div className="rounded-xl border border-border bg-bg-card overflow-hidden" style={{ flex: isNarrow ? '1 1 260px' : 'initial', minWidth: 0 }}>
              <div className="px-4 py-2.5 border-b border-border bg-gradient-to-r from-info/10 to-transparent flex items-center gap-2">
                <BarChart3 size={13} className="text-info" />
                <span className="text-xs font-bold text-text uppercase tracking-wider">当前组织</span>
                <code className="ml-auto text-[10px] text-text-dim font-mono">{selectedOrg.orgCode}</code>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2.5">
                <RightRow label="直属下级" value={
                  <span className="inline-flex items-center gap-1">
                    <strong>{flat.filter(o => o.parentId === selectedOrg.id).length}</strong>
                    <span className="text-text-dim text-[10px]">个</span>
                  </span>
                } />
                <RightRow label="所属层级" value={
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-brand/10 text-brand text-[11px] font-bold">{selectedOrg.level}</span>
                    <span className="text-[11px] text-text-muted">L{selectedOrg.level}</span>
                  </span>
                } />
                <RightRow label="负责人" value={selectedOrg.managerName ?? "未指定"} tone={selectedOrg.managerName ? 'default' : 'warning'} />
                <RightRow label="组织类型" value={
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-bg-muted text-text">
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
            return (
              <div className="rounded-xl border border-border bg-bg-card overflow-hidden" style={{ flex: isNarrow ? '1 1 260px' : 'initial', minWidth: 0 }}>
                <div className={cn(
                  "px-4 py-2.5 border-b border-border flex items-center gap-2",
                  fails.length === 0 ? "bg-gradient-to-r from-success/15 to-transparent" : "bg-gradient-to-r from-warning/15 to-transparent"
                )}>
                  {fails.length === 0 ? <CheckCircle2 size={13} className="text-success" /> : <AlertCircle size={13} className="text-warning" />}
                  <span className="text-xs font-bold text-text uppercase tracking-wider">合规风险</span>
                  <span className={cn(
                    "ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded",
                    fails.length === 0 ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                  )}>{score} 分</span>
                </div>
                <div className="px-4 py-3 flex flex-col gap-2">
                  {checks.map((c, i) => <RiskItem key={i} ok={c.ok} label={c.ok ? c.label : c.warn} />)}
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
              className={cn(
                "flex-1 py-2.5 text-sm rounded-lg transition-colors",
                "border border-border text-text-muted bg-bg-page hover:bg-bg-muted",
              )}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "flex-[2] py-2.5 text-sm font-semibold rounded-lg transition-opacity",
                "bg-brand text-white hover:opacity-90 disabled:opacity-60",
              )}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw size={13} className="animate-spin" />
                  保存中…
                </span>
              ) : editingCode ? "保存修改" : "创建组织"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">

          {/* Org code — required on create, read-only on edit */}
          <div>
            <label className={LBL}>
              组织编码
              {!editingCode && <span className="text-danger ml-0.5">*</span>}
              {editingCode && <span className="ml-1 font-normal text-text-dim">（创建后不可修改）</span>}
            </label>
            <input
              className={cn(INP, editingCode && "opacity-50 cursor-not-allowed bg-bg-muted")}
              value={form.orgCode}
              readOnly={!!editingCode}
              onChange={e => setForm(p => ({ ...p, orgCode: e.target.value.toUpperCase() }))}
              placeholder="如 GRP-LAODAN、CO-FHA（字母数字连字符）"
            />
          </div>

          {/* Org name */}
          <div>
            <label className={LBL}>
              正式全称 <span className="text-danger">*</span>
            </label>
            <input
              className={INP}
              value={form.orgName}
              autoFocus={!editingCode}
              onChange={e => setForm(p => ({ ...p, orgName: e.target.value }))}
              placeholder="例：老单农业集团有限公司"
            />
          </div>

          {/* Org short name */}
          <div>
            <label className={LBL}>简称（展示用）</label>
            <input
              className={INP}
              value={form.orgShortName}
              onChange={e => setForm(p => ({ ...p, orgShortName: e.target.value }))}
              placeholder="例：老单集团"
            />
          </div>

          {/* Org type */}
          <div>
            <label className={LBL}>
              组织类型 <span className="text-danger">*</span>
            </label>
            <select
              className={INP}
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
              <label className={LBL}>场区业务类型</label>
              <select
                className={INP}
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
            <label className={LBL}>上级组织</label>
            <select
              className={INP}
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
            <label className={LBL}>关联公司编码（可选）</label>
            <input
              className={INP}
              value={form.companyCode}
              onChange={e => setForm(p => ({ ...p, companyCode: e.target.value }))}
              placeholder="如 CO-FHA，用于数据范围过滤"
            />
          </div>

          {/* Sort order */}
          <div>
            <label className={LBL}>排序权重</label>
            <input
              type="number"
              className={INP}
              value={form.sortOrder}
              onChange={e => setForm(p => ({ ...p, sortOrder: e.target.value }))}
              placeholder="数值越小越靠前，默认 0"
              min={0}
            />
          </div>

          {/* Remark */}
          <div>
            <label className={LBL}>备注</label>
            <textarea
              className={cn(INP, "resize-none")}
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
  const color = tone === 'success' ? 'text-success'
              : tone === 'warning' ? 'text-warning'
              : tone === 'danger'  ? 'text-danger'
              : 'text-text';
  return (
    <div className="flex flex-col gap-0.5">
      <div className={cn("text-base font-bold leading-tight", color)}>{value}</div>
      <div className="text-[10px] text-text-muted">{label}</div>
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

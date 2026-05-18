"use client";
import { useState, useEffect, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Building, ChevronDown, ChevronRight, Plus, Edit2, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

interface OrgNode {
  id: number;
  org_code: string;
  org_name: string;
  parent_code?: string;
  org_type?: string;
  address?: string;
  contact?: string;
  status?: string;
  children?: OrgNode[];
}

interface DictOption { dict_code: string; dict_label_zh: string; sort_no: number; }

function buildTree(nodes: OrgNode[]): OrgNode[] {
  const map: Record<string, OrgNode> = {};
  const roots: OrgNode[] = [];
  for (const n of nodes) { map[n.org_code] = { ...n, children: [] }; }
  for (const n of Object.values(map)) {
    if (n.parent_code && map[n.parent_code]) {
      map[n.parent_code].children!.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

function OrgTreeNode({
  node, depth, onEdit, onDelete, onAddChild, inactiveLabel, addChildTitle, editTitle, deleteTitle,
}: {
  node: OrgNode; depth: number;
  onEdit: (n: OrgNode) => void;
  onDelete: (n: OrgNode) => void;
  onAddChild: (parentCode: string) => void;
  inactiveLabel: string;
  addChildTitle: string;
  editTitle: string;
  deleteTitle: string;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div style={{ marginLeft: depth * 22 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 10px",
        borderRadius: 8, cursor: "pointer", transition: "background 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-card)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <button type="button" onClick={() => setExpanded(e => !e)} style={{
          background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer",
          padding: 2, width: 18, flexShrink: 0,
        }}>
          {hasChildren ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span style={{ width: 12 }} />}
        </button>

        <Building size={13} style={{ flexShrink: 0, color: "var(--color-primary)" }} />

        <div style={{ flex: 1, minWidth: 0 }} onClick={() => setExpanded(e => !e)}>
          <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>
            {node.org_name}
          </span>
          <span style={{ marginLeft: 8, fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
            {node.org_code}
          </span>
          {node.org_type && (
            <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "var(--color-primary)",
              background: "rgba(var(--color-primary-rgb),0.08)", padding: "1px 6px", borderRadius: 10 }}>
              {node.org_type}
            </span>
          )}
          {node.status === "INACTIVE" && (
            <span style={{ marginLeft: 6, fontSize: "0.68rem", color: "#94a3b8",
              background: "rgba(148,163,184,0.12)", padding: "1px 6px", borderRadius: 10 }}>
              {inactiveLabel}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button type="button" onClick={e => { e.stopPropagation(); onAddChild(node.org_code); }}
            style={{ background: "none", border: "none", color: "#22c55e", cursor: "pointer", padding: 4, borderRadius: 4, opacity: 0.7 }} title={addChildTitle}>
            <Plus size={13} />
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onEdit(node); }}
            style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", padding: 4, borderRadius: 4, opacity: 0.7 }} title={editTitle}>
            <Edit2 size={13} />
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onDelete(node); }}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 4, borderRadius: 4, opacity: 0.7 }} title={deleteTitle}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && hasChildren && (
        <div style={{ borderLeft: "1px dashed rgba(var(--color-primary-rgb),0.2)", marginLeft: 19 }}>
          {node.children!.map(child => (
            <OrgTreeNode key={child.id} node={child} depth={depth + 1}
              onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild}
              inactiveLabel={inactiveLabel} addChildTitle={addChildTitle}
              editTitle={editTitle} deleteTitle={deleteTitle} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgsPage() {
  const { t } = useLanguage();
  const [nodes,       setNodes]      = useState<OrgNode[]>([]);
  const [tree,        setTree]       = useState<OrgNode[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [open,        setOpen]       = useState(false);
  const [editing,     setEditing]    = useState<OrgNode | null>(null);
  const [saving,      setSaving]     = useState(false);
  const [confirm,     setConfirm]    = useState(false);
  const [delTarget,   setDelTarget]  = useState<OrgNode | null>(null);
  const [initPCode,   setInitPCode]  = useState<string>("");
  const [orgTypeOpts, setOrgTypeOpts] = useState<{ value: string; label: string }[]>([]);

  // 从 sys_dict 动态加载 SYS_ORG_LEVEL 字典
  const loadOrgTypes = useCallback(async () => {
    try {
      const r = await fetch("/api/crud/sys_dict?dict_type=SYS_ORG_LEVEL&status=ACTIVE&limit=100", { headers: hdr() });
      const d = await r.json();
      const list: DictOption[] = Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : [];
      list.sort((a, b) => (a.sort_no ?? 0) - (b.sort_no ?? 0));
      setOrgTypeOpts(list.map(t => ({ value: t.dict_label_zh, label: t.dict_label_zh })));
    } catch {}
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crudApi.list<OrgNode>("sys_orgs", { limit: 500 });
      const data = res.data ?? [];
      setNodes(data);
      setTree(buildTree(data));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); loadOrgTypes(); }, []);

  const openNew = useCallback((parentCode?: string) => {
    setEditing(null); setInitPCode(parentCode ?? ""); setOpen(true);
  }, []);

  const openEdit = useCallback((node: OrgNode) => {
    setEditing(node); setInitPCode(node.parent_code ?? ""); setOpen(true);
  }, []);

  const handleDelete = useCallback((node: OrgNode) => {
    setDelTarget(node); setConfirm(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!delTarget) return;
    await crudApi.delete("sys_orgs", delTarget.id);
    setConfirm(false); reload();
  }, [delTarget, reload]);

  const handleSave = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing) { await crudApi.update("sys_orgs", editing.id, values); }
      else         { await crudApi.create("sys_orgs", values); }
      setOpen(false); reload();
    } finally { setSaving(false); }
  }, [editing, reload]);

  // 动态 FIELDS — org_type 选项来自字典 API，不再硬编码
  const FIELDS: FormField[] = [
    { key: "org_code",    label: t('ui.组织编码', '组织编码'),     type: "text",   required: true, placeholder: "如：HQ / FARM-MS-01" },
    { key: "org_name",    label: t('ui.组织名称', '组织名称'),     type: "text",   required: true },
    { key: "parent_code", label: t('ui.上级组织编码', '上级组织编码'), type: "text",   placeholder: t('ui.留空表示根节点', '留空表示根节点') },
    { key: "org_type",    label: t('ui.组织类型', '组织类型'),     type: "select", required: true,
      options: orgTypeOpts.length > 0 ? orgTypeOpts : [{ value: "", label: t('common.loading', '加载中…') }] },
    { key: "address",     label: t('ui.地址', '地址'),         type: "textarea" },
    { key: "contact",     label: t('ui.联系人', '联系人'),       type: "text" },
    { key: "status",      label: t('common.status', '状态'),         type: "select",
      options: [
        { value: "ACTIVE",   label: t('status.active',   '启用') },
        { value: "INACTIVE", label: t('status.inactive', '停用') },
      ] },
  ];

  const typeCounts = nodes.reduce((acc, n) => {
    const ty = n.org_type ?? "—";
    acc[ty] = (acc[ty] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <PageHeader
        title={t('ui.组织架构', '组织架构')}
        subtitle={t('ui.组织架构副标题', '集团层级机构树（sys_orgs）— 类型从数据字典 SYS_ORG_LEVEL 动态加载')}
      />

      {/* 统计卡片 — 动态字典驱动 */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {orgTypeOpts.map(opt => (
          <div key={opt.value} style={{
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "10px 16px", minWidth: 100,
          }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: 4 }}>{opt.label}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--color-primary)" }}>
              {typeCounts[opt.value] ?? 0}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => openNew()} style={{
          background: "var(--color-primary)", border: "none", borderRadius: 10,
          padding: "10px 20px", color: "#fff", cursor: "pointer", fontWeight: 700,
          display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", alignSelf: "center",
        }}>
          <Plus size={15} /> {t('ui.新增根节点', '新增根节点')}
        </button>
      </div>

      {/* 树形视图 */}
      <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--bg-card)", padding: 16, minHeight: 300 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>{t('ui.加载组织架构', '加载组织架构…')}</div>
        ) : tree.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
            <Building size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
            <div>{t('ui.暂无组织数据点击新增根节点开始构建', '暂无组织数据，点击「新增根节点」开始构建')}</div>
          </div>
        ) : (
          tree.map(node => (
            <OrgTreeNode key={node.id} node={node} depth={0}
              onEdit={openEdit} onDelete={handleDelete} onAddChild={pCode => openNew(pCode)}
              inactiveLabel={t('status.inactive', '已停用')}
              addChildTitle={t('ui.添加子组织', '添加子组织')}
              editTitle={t('common.edit', '编辑')}
              deleteTitle={t('common.delete', '删除')}
            />
          ))
        )}
      </div>

      <RightDrawer open={open} title={editing ? t('ui.编辑组织', '编辑组织') : t('ui.新增组织', '新增组织')} onClose={() => setOpen(false)}>
        <CrudForm
          fields={FIELDS}
          initialValues={(editing ?? (initPCode ? { parent_code: initPCode } : {})) as Record<string, unknown>}
          onSubmit={handleSave}
          onCancel={() => setOpen(false)}
          loading={saving}
        />
      </RightDrawer>

      <ConfirmDialog
        open={confirm}
        title={t('ui.确认删除', '确认删除')}
        message={`${t('ui.删除', '删除')}「${delTarget?.org_name}」${t('ui.及其所有子节点此操作不可恢复', '及其所有子节点？此操作不可恢复。')}`}
        onConfirm={confirmDelete}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

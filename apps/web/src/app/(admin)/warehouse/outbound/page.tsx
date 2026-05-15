"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// ✅ V3 表: wms_outbound
const TABLE = "wms_outbound";

const getRole = () => {
  try { return JSON.parse(sessionStorage.getItem("phoenix_user") || "{}").role || ""; }
  catch { return ""; }
};
const isManager = () => ["ROLE_ADMIN", "ROLE_WMS_MGR"].includes(getRole());

const TARGET_TYPES = ["", "SALE", "TRANSFER", "SCRAP", "RETURN"] as const;
const TARGET_LABEL: Record<string, { label: string; cls: string }> = {
  SALE:     { label: "销售出库", cls: s.badgeInfo    },
  TRANSFER: { label: "调拨出库", cls: s.badgePurple  },
  SCRAP:    { label: "报废出库", cls: s.badgeDanger   },
  RETURN:   { label: "退货出库", cls: s.badgeWarning  },
};

// ✅ 状态 → 全局 badge CSS 类
const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  PENDING:   { cls: s.badgeWarning, label: "待出库" },
  PICKING:   { cls: s.badgeInfo,    label: "拣货中" },
  DONE:      { cls: s.badgeSuccess, label: "已出库" },
  CANCELLED: { cls: s.badgeNeutral, label: "已取消" },
};

type Row = Record<string, unknown>;

const FIELDS: FormField[] = [
  { key: "outbound_no", label: "出库单号", type: "text", placeholder: "留空自动生成 WO-XXXXXX" },
  { key: "target_type", label: "出库类型", type: "select", options: [
    { label: "销售出库", value: "SALE"     },
    { label: "调拨出库", value: "TRANSFER" },
    { label: "报废出库", value: "SCRAP"    },
    { label: "退货出库", value: "RETURN"   },
  ]},
  { key: "warehouse_code", label: "出库仓库", type: "text", required: true },
  { key: "batch_no",       label: "批次号",   type: "text" },
  { key: "qty",            label: "出库数量", type: "number", required: true },
  { key: "dest",           label: "去向客户", type: "text" },
  { key: "operator",       label: "操作员",   type: "text" },
  { key: "status", label: "状态", type: "select", options: [
    { label: "待出库", value: "PENDING"   },
    { label: "拣货中", value: "PICKING"   },
    { label: "已出库", value: "DONE"      },
    { label: "已取消", value: "CANCELLED" },
  ]},
];

export default function OutboundPage() {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [editing,      setEditing]      = useState<Row | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [typeFilter,   setTypeFilter]   = useState("");

  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew     = useCallback(() => { setEditing(null); setDrawerOpen(true); }, []);
  const openEdit    = useCallback((row: Row) => { setEditing(row); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
      const payload = editing?.id
        ? values
        : { ...values, outbound_no: values.outbound_no || ("WO-" + Date.now().toString().slice(-6)), status: values.status || "PENDING", date: new Date().toISOString().slice(0, 10) };
      editing?.id
        ? await crudApi.update(TABLE, editing.id as number, payload)
        : await crudApi.create(TABLE, payload);
      setDrawerOpen(false); refresh();
    } finally { setSaving(false); }
  }, [editing, refresh]);

  const handleDelete  = useCallback((row: Row) => { setDeleteTarget(row); setConfirmOpen(true); }, []);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh]);

  const COLUMNS: Column<Row>[] = [
    { key: "outbound_no",    title: "出库单号", width: 160 },
    { key: "target_type",    title: "出库类型", width: 100,
      render: v => {
        const cfg = TARGET_LABEL[String(v)];
        return cfg
          ? <span className={`${s.badge} ${cfg.cls}`}>{cfg.label}</span>
          : <span>{String(v ?? "—")}</span>;
      }},
    { key: "dest",           title: "去向客户", width: 120 },
    { key: "batch_no",       title: "批次号",   width: 150 },
    { key: "qty",            title: "数量",     width: 80, align: "right",
      render: v => <b>{String(v ?? 0)}</b> },
    { key: "warehouse_code", title: "仓库",     width: 110 },
    { key: "operator",       title: "操作员",   width: 90  },
    { key: "status",         title: "状态",     width: 90, align: "center",
      render: v => {
        const cfg = STATUS_BADGE[String(v)] ?? { cls: s.badgeNeutral, label: String(v ?? "—") };
        return <span className={`${s.badge} ${cfg.cls}`}>{cfg.label}</span>;
      }},
    { key: "_actions",       title: "操作",     width: 100, align: "center",
      render: (_, row) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => openEdit(row)}>编辑</button>
          {isManager() && (
            <button type="button" className={`${s.btnDanger} ${s.btnSm}`} onClick={() => handleDelete(row)}>删除</button>
          )}
        </div>
      )
    },
  ];

  return (
    <div>
      <PageHeader
        title="出库管理"
        subtitle="各类出库单管理 · 门店补货 · 团购 · 报废（表：wms_outbound）"
        breadcrumb={["仓储管理", "出库管理"]}
        actions={
          <button type="button" className={s.btnPrimary} onClick={openNew}>
            <Plus size={14} />新建出库单
          </button>
        }
      />

      {/* ✅ 过滤标签 — tabPill 全局类，深色主题自适应 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {TARGET_TYPES.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`${s.tabPill} ${typeFilter === t ? s.tabPillActive : ""}`}
          >
            {t === "" ? "全部" : (TARGET_LABEL[t]?.label ?? t)}
          </button>
        ))}
      </div>

      <DataTable
        table={TABLE}
        columns={COLUMNS}
        params={typeFilter ? { target_type: typeFilter } as any : undefined}
        onNew={openNew}
        onEdit={openEdit as any}
        onDelete={handleDelete as any}
        showActions={false}
        refreshKey={refreshKey}
        emptyText="暂无出库记录"
        pageSize={30}
      />

      <RightDrawer open={drawerOpen} title={editing ? "编辑出库单" : "新建出库单"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}

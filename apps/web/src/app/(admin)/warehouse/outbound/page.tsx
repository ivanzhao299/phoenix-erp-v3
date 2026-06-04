"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
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

type Row = Record<string, unknown>;

export default function OutboundPage() {
  const { t } = useLanguage();
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [editing,      setEditing]      = useState<Row | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [typeFilter,   setTypeFilter]   = useState("");

  // Moved inside component to use t()
  const TARGET_LABEL: Record<string, { label: string; cls: string }> = {
    SALE:     { label: t("ui.销售出库", "销售出库"), cls: s.badgeInfo    },
    TRANSFER: { label: t("ui.调拨出库", "调拨出库"), cls: s.badgePurple  },
    SCRAP:    { label: t("ui.报废出库", "报废出库"), cls: s.badgeDanger   },
    RETURN:   { label: t("ui.退货出库", "退货出库"), cls: s.badgeWarning  },
  };

  // ✅ 状态 → 全局 badge CSS 类
  const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
    PENDING:   { cls: s.badgeWarning, label: t("status.pending",   "待出库") },
    PICKING:   { cls: s.badgeInfo,    label: t("status.picking",   "拣货中") },
    DONE:      { cls: s.badgeSuccess, label: t("status.done",      "已出库") },
    CANCELLED: { cls: s.badgeNeutral, label: t("status.cancelled", "已取消") },
  };

  // G4-D：出库单 — 仓库/操作员/去向客户 主数据化；出库类型 → sys_dict(INV_OUTBOUND_TYPE)；出库附件统一上传
  const FIELDS: FormField[] = [
    { key: "outbound_no",    label: t("ui.出库单号", "出库单号"), type: "text",   placeholder: t("ui.留空自动生成WO", "留空自动生成 WO-XXXXXX") },
    { key: "target_type",    label: t("ui.出库类型", "出库类型"), type: "dict",   dictType: "INV_OUTBOUND_TYPE", required: true },
    { key: "warehouse_code", label: t("ui.出库仓库", "出库仓库"), type: "warehouse", required: true },
    { key: "batch_no",       label: t("ui.批次号",   "批次号"),   type: "text" },
    { key: "qty",            label: t("ui.出库数量", "出库数量"), type: "number", required: true },
    { key: "dest",           label: t("ui.去向客户", "去向客户"), type: "customer" },
    { key: "operator",       label: t("ui.操作员",   "操作员"),   type: "user" },
    { key: "attachment_url", label: t("ui.出库附件", "出库附件"), type: "attachment" },
    { key: "status", label: t("common.status", "状态"), type: "select", options: [
      { label: t("status.pending",   "待出库"), value: "PENDING"   },
      { label: t("status.picking",   "拣货中"), value: "PICKING"   },
      { label: t("status.done",      "已出库"), value: "DONE"      },
      { label: t("status.cancelled", "已取消"), value: "CANCELLED" },
    ]},
  ];

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
    { key: "outbound_no",    title: t("ui.出库单号", "出库单号"), width: 160 },
    { key: "target_type",    title: t("ui.出库类型", "出库类型"), width: 100,
      render: v => {
        const cfg = TARGET_LABEL[String(v)];
        return cfg
          ? <span className={`${s.badge} ${cfg.cls}`}>{cfg.label}</span>
          : <span>{String(v ?? "—")}</span>;
      }},
    { key: "dest",           title: t("ui.去向客户", "去向客户"), width: 120 },
    { key: "batch_no",       title: t("ui.批次号",   "批次号"),   width: 150 },
    { key: "qty",            title: t("ui.数量",     "数量"),     width: 80, align: "right",
      render: v => <b>{String(v ?? 0)}</b> },
    { key: "warehouse_code", title: t("ui.仓库",     "仓库"),     width: 110 },
    { key: "operator",       title: t("ui.操作员",   "操作员"),   width: 90  },
    { key: "status",         title: t("common.status", "状态"),   width: 90, align: "center",
      render: v => {
        const cfg = STATUS_BADGE[String(v)] ?? { cls: s.badgeNeutral, label: String(v ?? "—") };
        return <span className={`${s.badge} ${cfg.cls}`}>{cfg.label}</span>;
      }},
    { key: "_actions",       title: t("common.operation", "操作"), width: 100, align: "center",
      render: (_, row) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => openEdit(row)}>{t("common.edit", "编辑")}</button>
          {isManager() && (
            <button type="button" className={`${s.btnDanger} ${s.btnSm}`} onClick={() => handleDelete(row)}>{t("common.delete", "删除")}</button>
          )}
        </div>
      )
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("ui.出库管理", "出库管理")}
        subtitle={t("ui.各类出库单管理门店补货团购报废", "各类出库单管理 · 门店补货 · 团购 · 报废")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.出库管理", "出库管理")]}
        actions={
          <button type="button" className={s.btnPrimary} onClick={openNew}>
            <Plus size={14} />{t("ui.新建出库单", "新建出库单")}
          </button>
        }
      />

      {/* ✅ 过滤标签 — tabPill 全局类，深色主题自适应 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {TARGET_TYPES.map(tp => (
          <button
            key={tp}
            type="button"
            onClick={() => setTypeFilter(tp)}
            className={`${s.tabPill} ${typeFilter === tp ? s.tabPillActive : ""}`}
          >
            {tp === "" ? t("ui.全部", "全部") : (TARGET_LABEL[tp]?.label ?? tp)}
          </button>
        ))}
      </div>

      <DataTable
        table={TABLE}
        columns={COLUMNS}
        params={typeFilter ? { target_type: typeFilter } as any : undefined}
        onNew={openNew}
        onEdit={openEdit}
        onDelete={handleDelete}
        showActions={false}
        refreshKey={refreshKey}
        emptyText={t("common.no_data", "暂无出库记录")}
        pageSize={30}
      />

      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑出库单", "编辑出库单") : t("ui.新建出库单", "新建出库单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}

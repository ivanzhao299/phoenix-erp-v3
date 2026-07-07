"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus } from "lucide-react";
import { primaryActionButton } from "@/components/design-system/cockpit-styles";

// ✅ V3 表: wms_zones
const TABLE = "wms_zones";
// B5: wms_zones 旧字段 warehouse 在 DB 不存在 → 改用 warehouse_code（需 DB migration 加列 — 见 generic-crud.service）
//     真实列: zone_code / zone_name / zone_type / temp_range / total_capacity / used_capacity / item_count / status
type Row = Record<string, unknown>;

function crudKey(row: Row): string | number | null {
  const key = row.id ?? row.zone_code;
  if (key === undefined || key === null || key === "") return null;
  return key as string | number;
}

export default function Page() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "zone_code",      title: t("ui.库区编码", "库区编码"), width: 120 },
    { key: "zone_name",      title: t("ui.库区名称", "库区名称"), width: 160 },
    { key: "warehouse_code", title: t("ui.所属仓库", "所属仓库"), width: 120 },
    { key: "zone_type",      title: t("ui.库区类型", "库区类型"), width: 100 },
    { key: "temp_range",     title: t("ui.温区", "温区"),     width: 100 },
    { key: "status",         title: t("common.status", "状态"),     width: 80  },
  ];
  const FIELDS: FormField[] = [
    { key: "zone_code",      label: t("ui.库区编码", "库区编码"),     type: "text", required: true, placeholder: t("ui.如Z001", "如：Z-001") },
    { key: "zone_name",      label: t("ui.库区名称", "库区名称"),     type: "text", required: true },
    { key: "warehouse_code", label: t("ui.所属仓库", "所属仓库"), type: "warehouse", required: true },
    { key: "zone_type",      label: t("ui.库区类型", "库区类型"),     type: "dict", dictType: "WMS_ZONE_TYPE" },
    { key: "temp_range",     label: t("ui.温区范围", "温区范围"),     type: "text", placeholder: t("ui.如04摄氏度", "如：0-4℃") },
    { key: "total_capacity", label: t("ui.总容量", "总容量"),       type: "number" },
    { key: "status", label: t("common.status", "状态"), type: "select", required: true, defaultValue: "ACTIVE", options: [
      { label: t("status.active", "启用"), value: "ACTIVE" },
      { label: t("status.inactive", "停用"), value: "INACTIVE" },
    ]},
  ];

  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editing, setEditing]           = useState<Row | null>(null);
  const [saving, setSaving]             = useState(false);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew     = useCallback(() => { setEditing(null); setDrawerOpen(true); }, []);
  const openEdit    = useCallback((row: Row) => { setEditing(row); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const handleSave  = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing) {
        const key = crudKey(editing);
        if (!key) throw new Error("Missing zone key");
        await crudApi.update(TABLE, key, values);
      } else {
        await crudApi.create(TABLE, values);
      }
      setDrawerOpen(false); refresh();
    } finally { setSaving(false); }
  }, [editing, refresh]);
  const handleDelete  = useCallback((row: Row) => { setDeleteTarget(row); setConfirmOpen(true); }, []);
  const confirmDelete = useCallback(async () => {
    const key = deleteTarget ? crudKey(deleteTarget) : null;
    if (!key) return;
    await crudApi.delete(TABLE, key);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh]);
  return (
    <div>
      <PageHeader
        title={t("ui.库区管理", "库区管理")}
        subtitle={t("ui.管理仓库内的库区划分", "管理仓库内的库区划分")}
        actions={
          <button type="button" style={primaryActionButton} onClick={openNew}>
            <Plus size={14} />{t("ui.新增库区", "新增库区")}
          </button>
        }
      />
      <DataTable table={TABLE} columns={COLUMNS} onNew={openNew} onEdit={openEdit}
        onDelete={handleDelete} showActions rowKey="zone_code" refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑库区管理", "编辑库区管理") : t("ui.新增库区管理", "新增库区管理")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title={t("common.confirm", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}

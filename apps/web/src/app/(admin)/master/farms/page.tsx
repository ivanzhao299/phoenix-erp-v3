"use client";
import { useState, useCallback } from "react";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermission } from "@/hooks/usePermission";
import { actionPill } from "@/components/design-system/cockpit-styles";

// g200m: status 列 ACTIVE/INACTIVE → 中文 + actionPill 色
const STATUS_CFG: Record<string, { label: string; tone: 'success' | 'default' }> = {
  ACTIVE:   { label: '运营中', tone: 'success' },
  INACTIVE: { label: '停用',   tone: 'default' },
};

// V3 表: brd_farms — 主键 farm_code (VARCHAR, 非 id)
// 实际列: farm_code, farm_name, location, houses(INT), capacity(INT), status, created_at, updated_at
// max_capacity 已于 2026-05-10 删除，province/address/contact/manager_name 从未存在于 schema
const TABLE = "brd_farms";
const PK    = "farm_code";

function getToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}

export default function Page() {
  const toast = useToast();
  const { t } = useLanguage();
  // 页面级 perm 守卫：养殖场主档按养殖主数据原子码控制，不再依赖旧 MENU_MASTER 父级权限。
  const { canView } = usePermission("MENU_FARM_MASTER");
  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
        <h3>{t("ui.无权限访问", "无权限访问")}</h3>
        <p>{t("ui.养殖场主数据权限说明", "「养殖场主数据」需要 MENU_FARM_MASTER:V 权限。请联系系统管理员。")}</p>
      </div>
    );
  }

  const COLUMNS = [
    { key: "farm_code", title: t("ui.农场编码", "农场编码"), width: 130 },
    { key: "farm_name", title: t("ui.农场名称", "农场名称"), width: 160 },
    { key: "location",  title: t("ui.所在地区", "所在地区") },
    { key: "houses",    title: t("ui.规划栋数", "规划栋数"),   width: 90 },
    { key: "capacity",  title: t("ui.设计容量羽", "设计容量（羽）"), width: 130 },
    { key: "status",    title: t("common.status", "状态"),     width: 80,
      render: (v: unknown) => {
        const cfg = STATUS_CFG[String(v ?? '')] ?? { label: String(v ?? '—'), tone: 'default' as const };
        return <span style={actionPill(cfg.tone)}>{cfg.label}</span>;
      } },
  ];

  // G4-E：场站主数据 — 公司主数据化 + 负责人 UserSelector
  const FIELDS: FormField[] = [
    { key: "farm_code", label: t("ui.农场编码", "农场编码"), type: "text",   required: true, placeholder: t("ui.如FARM-001", "如：FARM-001") },
    { key: "farm_name", label: t("ui.农场名称", "农场名称"), type: "text",   required: true },
    { key: "company_code", label: t("ui.所属公司", "所属公司"), type: "company" },
    { key: "manager", label: t("ui.负责人", "负责人"), type: "user" },
    { key: "location",  label: t("ui.所在地区", "所在地区"), type: "text",   placeholder: t("ui.省市县示例", "如：万象直辖市") },
    { key: "houses",    label: t("ui.规划栋数", "规划栋数"), type: "number", defaultValue: 0 },
    { key: "capacity",  label: t("ui.设计容量羽", "设计容量（羽）"), type: "number", defaultValue: 0 },
    { key: "status",    label: t("common.status", "状态"),   type: "select",
      options: [{ label: t("ui.运营中", "运营中"), value: "ACTIVE" }, { label: t("status.inactive", "停用"), value: "INACTIVE" }] },
  ];

  const [open,    setOpen]    = useState(false);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [refreshKey, setRefreshKey]       = useState(0);
  const [confirmOpen, setConfirmOpen]     = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting]           = useState(false);

  const refresh  = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew  = useCallback(() => { setEditRow(null); setOpen(true); }, []);
  const openEdit = useCallback((r: Record<string, unknown>) => { setEditRow(r); setOpen(true); }, []);
  const close    = useCallback(() => setOpen(false), []);

  const save = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    const token = getToken();
    const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    try {
      const pkVal = editRow?.[PK]; // farm_code 的实际值
      if (pkVal) {
        // 编辑：PUT /api/crud/brd_farms/{farm_code}
        const res = await fetch(`/api/crud/${TABLE}/${pkVal}`, {
          method: "PUT", headers: hdr, body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        toast.success(t("ui.农场信息已更新", "农场信息已更新"));
      } else {
        // 新建：POST /api/crud/brd_farms
        const res = await fetch(`/api/crud/${TABLE}`, {
          method: "POST", headers: hdr, body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        toast.success(t("ui.农场已创建", "农场已创建"));
      }
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("ui.保存失败请检查网络或登录状态", "保存失败，请检查网络或登录状态"));
    } finally {
      setSaving(false);
    }
  }, [editRow, refresh, toast, t]);

  const askDelete = useCallback((r: Record<string, unknown>) => {
    setDeleteTarget(r);
    setConfirmOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    const pkVal = deleteTarget?.[PK]; // farm_code 的实际值
    if (!pkVal) {
      toast.error(t("ui.无法获取农场编码删除失败", "无法获取农场编码，删除失败"));
      return;
    }
    setDeleting(true);
    const token = getToken();
    const hdr = { Authorization: `Bearer ${token}` };
    try {
      const res = await fetch(`/api/crud/${TABLE}/${pkVal}`, {
        method: "DELETE", headers: hdr,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      toast.success(`${t("ui.农场", "农场")}「${deleteTarget?.farm_name ?? pkVal}」${t("ui.已删除", "已删除")}`);
      setConfirmOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("ui.删除失败", "删除失败"));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, refresh, toast, t]);

  return (
    <div>
      <PageHeader
        breadcrumb={[t("ui.主数据", "主数据"), t("ui.养殖场档案", "养殖场档案")]}
        title={t("ui.农场主档", "农场主档")}
        subtitle={t("ui.管理养殖场基础信息", "管理养殖场基础信息")}
      />
      <DataTable
        table={TABLE}
        columns={COLUMNS}
        rowKey={PK}           // ← 关键：用 farm_code 作为行唯一标识
        onNew={openNew}
        onEdit={openEdit}
        onDelete={askDelete}
        showActions
        refreshKey={refreshKey}
      />
      <RightDrawer open={open} title={editRow ? t("ui.编辑农场主档", "编辑农场主档") : t("ui.新增农场主档", "新增农场主档")} onClose={close}>
        <CrudForm
          fields={FIELDS}
          initialValues={editRow ?? {}}
          onSubmit={save}
          onCancel={close}
          loading={saving}
        />
      </RightDrawer>
      <ConfirmDialog
        open={confirmOpen}
        title={t("ui.确认删除", "确认删除")}
        message={`${t("ui.确认删除农场", "确认删除农场")}「${deleteTarget?.farm_name ?? deleteTarget?.[PK] ?? ""}」？\n${t("ui.此操作不可恢复", "此操作不可恢复。")}`}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

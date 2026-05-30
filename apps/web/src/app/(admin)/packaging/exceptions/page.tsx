"use client";
import { useState, useCallback, useEffect } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

// V3 包装专用表：pkg_exceptions
// 字段: id, nc_no, issue_type, severity, batch_no, store_code, description, action_taken, status
const TABLE = "pkg_exceptions";

export default function PackagingExceptionsPage() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "nc_no",        title: t("ui.不合格品单号", "不合格品单号") },
    { key: "issue_type",   title: t("ui.异常类型",     "异常类型") },
    { key: "batch_no",     title: t("ui.关联批次",     "关联批次") },
    { key: "severity",     title: t("ui.严重级别",     "严重级别") },
    { key: "status",       title: t("ui.处置状态",     "处置状态") },
    { key: "action_taken", title: t("ui.处置措施",     "处置措施") },
    { key: "photo_url",    title: t("ui.照片",         "照片"), width: 60,
      render: (v: unknown) => v ? <span title={String(v)} style={{ color: "#3b82f6", fontSize: 18 }}>📎</span> : null,
    },
  ];

  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editing, setEditing]           = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving]             = useState(false);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [issueTypeOpts, setIssueTypeOpts] = useState<{ label: string; value: string }[]>([
    { label: t("ui.破损蛋",   "破损蛋"),   value: "BROKEN" },
    { label: t("ui.脏蛋",     "脏蛋"),     value: "DIRTY" },
    { label: t("ui.超规格",   "超规格"),   value: "OVERSIZE" },
    { label: t("ui.不足规格", "不足规格"), value: "UNDERSIZE" },
    { label: t("ui.卫生不达标","卫生不达标"),value: "HYGIENE" },
    { label: t("ui.其他",     "其他"),     value: "OTHER" },
  ]);

  useEffect(() => {
    const tok = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
    fetch("/api/crud/sys_dict?dict_type=PKG_EXCEPTION_TYPE&status=ACTIVE&limit=100", { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json()).then(j => {
        const list = ((j.data || j) as any[]).filter(d => d.dict_type === "PKG_EXCEPTION_TYPE" && d.status === "ACTIVE");
        if (list.length > 0) setIssueTypeOpts(list.map(d => ({ label: d.dict_label_zh || d.dict_code, value: d.dict_code })));
      }).catch(() => {});
  }, []);

  // 动态构建 FIELDS（依赖 issueTypeOpts）
  const FIELDS: FormField[] = [
    { key: "nc_no",        label: t("ui.异常单号",   "异常单号"),   type: "text",     required: false, placeholder: t("ui.留空自动生成", "留空自动生成") },
    { key: "issue_type",   label: t("ui.异常类型",   "异常类型"),   type: "select",   required: true, options: issueTypeOpts },
    { key: "severity",     label: t("ui.严重级别",   "严重级别"),   type: "select",   required: false,
      options: [
        { label: t("ui.低", "低"), value: "LOW" },
        { label: t("ui.中", "中"), value: "MEDIUM" },
        { label: t("ui.高", "高"), value: "HIGH" },
      ] },
    { key: "batch_no",     label: t("ui.关联批次号", "关联批次号"), type: "text",     required: false },
    { key: "store_code",   label: t("ui.发现门店",   "发现门店"),   type: "text",     required: false },
    { key: "description",  label: t("ui.异常描述",   "异常描述"),   type: "textarea", required: false, span: 2 },
    { key: "action_taken", label: t("ui.处置措施",   "处置措施"),   type: "select",   required: false,
      options: [
        { label: t("ui.报废",     "报废"),     value: "SCRAP" },
        { label: t("ui.降级使用", "降级使用"), value: "DOWNGRADE" },
        { label: t("ui.退回",     "退回"),     value: "RETURN" },
        { label: t("ui.待定",     "待定"),     value: "PENDING" },
      ] },
    { key: "status",       label: t("ui.处置状态",   "处置状态"),   type: "select",   required: false,
      options: [
        { label: t("ui.待处置", "待处置"), value: "OPEN" },
        { label: t("ui.处置中", "处置中"), value: "IN_PROGRESS" },
        { label: t("ui.已关闭", "已关闭"), value: "CLOSED" },
      ] },
    { key: "photo_url", label: t("ui.异常照片", "异常照片（PDF / 图片，≤15MB）"), type: "upload" as const, span: 2 as const },
  ];

  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew     = useCallback(() => { setEditing(null); setDrawerOpen(true); }, []);
  const openEdit    = useCallback((row: Record<string, unknown>) => { setEditing(row); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      editing?.id ? await crudApi.update(TABLE, editing.id as number, values)
                  : await crudApi.create(TABLE, values);
      setDrawerOpen(false); refresh();
    } finally { setSaving(false); }
  }, [editing, refresh]);

  const handleDelete  = useCallback((row: Record<string, unknown>) => { setDeleteTarget(row); setConfirmOpen(true); }, []);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh]);

  return (
    <div>
      <PageHeader
        title={t("ui.异常品处理", "异常品处理")}
        subtitle={t("ui.异常品处理副标题", "记录包装过程中的异常蛋品及处置措施")}
      />
      <DataTable table={TABLE} columns={COLUMNS} onNew={openNew} onEdit={openEdit}
        onDelete={handleDelete} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑异常记录", "编辑异常记录") : t("ui.新增异常记录", "新增异常记录")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title={t("common.confirmDelete", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}

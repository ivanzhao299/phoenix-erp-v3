"use client";
import { useState, useCallback, useEffect } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// V3 包装专用表：pkg_exceptions
// 字段: id, nc_no, issue_type, severity, batch_no, store_code, description, action_taken, status
const TABLE = "pkg_exceptions";


const COLUMNS = [
  { key: "nc_no",       title: "不合格品单号" },
  { key: "issue_type",  title: "异常类型" },
  { key: "batch_no",    title: "关联批次" },
  { key: "severity",    title: "严重级别" },
  { key: "status",      title: "处置状态" },
  { key: "action_taken",title: "处置措施" },
];


export default function PackagingExceptionsPage() {
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editing, setEditing]           = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving]             = useState(false);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [issueTypeOpts, setIssueTypeOpts] = useState<{ label: string; value: string }[]>([
    { label: "破损蛋", value: "BROKEN" }, { label: "脏蛋", value: "DIRTY" },
    { label: "超规格", value: "OVERSIZE" }, { label: "不足规格", value: "UNDERSIZE" },
    { label: "卫生不达标", value: "HYGIENE" }, { label: "其他", value: "OTHER" },
  ]);

  useEffect(() => {
    const tok = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
    fetch("/api/crud/sys_dict?dict_type=PKG_EXCEPTION_TYPE&status=ACTIVE&limit=100", { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json()).then(j => {
        const list = ((j.data || j) as any[]).filter((d: any) => d.dict_type === "PKG_EXCEPTION_TYPE" && d.status === "ACTIVE");
        if (list.length > 0) setIssueTypeOpts(list.map((d: any) => ({ label: d.dict_label_zh || d.dict_code, value: d.dict_code })));
      }).catch(() => {});
  }, []);

  // 动态构建 FIELDS（依赖 issueTypeOpts）
  const FIELDS: FormField[] = [
    { key: "nc_no",        label: "异常单号",     type: "text",     required: false, placeholder: "留空自动生成" },
    { key: "issue_type",   label: "异常类型",     type: "select",   required: true, options: issueTypeOpts },
    { key: "severity",     label: "严重级别",     type: "select",   required: false,
      options: [{ label: "低", value: "LOW" }, { label: "中", value: "MEDIUM" }, { label: "高", value: "HIGH" }] },
    { key: "batch_no",     label: "关联批次号",   type: "text",     required: false },
    { key: "store_code",   label: "发现门店",     type: "text",     required: false },
    { key: "description",  label: "异常描述",     type: "textarea", required: false, span: 2 },
    { key: "action_taken", label: "处置措施",     type: "select",   required: false,
      options: [{ label: "报废", value: "SCRAP" }, { label: "降级使用", value: "DOWNGRADE" },
                { label: "退回", value: "RETURN" }, { label: "待定", value: "PENDING" }] },
    { key: "status",       label: "处置状态",     type: "select",   required: false,
      options: [{ label: "待处置", value: "OPEN" }, { label: "处置中", value: "IN_PROGRESS" }, { label: "已关闭", value: "CLOSED" }] },
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
      <PageHeader title="异常品处理" subtitle="记录包装过程中的异常蛋品及处置措施（表：pkg_exceptions）" />
      <DataTable table={TABLE} columns={COLUMNS as any} onNew={openNew} onEdit={openEdit as any}
        onDelete={handleDelete as any} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? "编辑异常记录" : "新增异常记录"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}

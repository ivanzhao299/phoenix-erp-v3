"use client";
import { useState, useCallback, useEffect } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus, Download, CheckCircle, RefreshCw } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// ✅ V3 表: wms_stocktake
// 字段: take_no, warehouse_code, zone_code, book_qty, actual_qty, diff_qty, operator, status, date
// 权限: ROLE_ADMIN / ROLE_WMS_MGR / ROLE_FIN_CFO 可审批

const TABLE = "wms_stocktake";

const getRole = () => {
  try { return JSON.parse(sessionStorage.getItem("phoenix_user") || "{}").role || ""; }
  catch { return ""; }
};
const isApprover = () => ["ROLE_ADMIN", "ROLE_WMS_MGR", "ROLE_FIN_CFO"].includes(getRole());

// ✅ 状态 → 全局 badge CSS 类
const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  DRAFT:       { cls: s.badgeNeutral,  label: "草稿"   },
  IN_PROGRESS: { cls: s.badgeInfo,     label: "盘点中" },
  DONE:        { cls: s.badgeWarning,  label: "待审核" },
  APPROVED:    { cls: s.badgeSuccess,  label: "已审核" },
};

type Row = Record<string, unknown>;

// B2: wms_stocktake 真实列 stocktake_no / sys_qty / act_qty / diff_qty / item / warehouse_code / auditor
const FIELDS: FormField[] = [
  { key: "stocktake_no",   label: "盘点单号",  type: "text",   placeholder: "留空自动生成 ST-XXXXXX" },
  { key: "warehouse_code", label: "仓库编码",  type: "text",   required: true },
  { key: "item",           label: "盘点品目",  type: "text"   },
  { key: "sys_qty",        label: "账面数量",  type: "number" },
  { key: "act_qty",        label: "实际数量",  type: "number" },
  { key: "diff_qty",       label: "差异数量",  type: "number" },
  { key: "auditor",        label: "盘点员",    type: "text"   },
  { key: "status", label: "状态", type: "select", options: [
    { label: "草稿",   value: "DRAFT"       },
    { label: "盘点中", value: "IN_PROGRESS" },
    { label: "待审核", value: "DONE"        },
    { label: "已审核", value: "APPROVED"    },
  ]},
];

// CSV 导出
function exportCSV(rows: Row[]) {
  const headers = ["盘点单号", "仓库", "库区", "账面量", "实际量", "差异量", "差异率%", "状态", "盘点员"];
  const lines = rows.map(r => {
    const book   = Number(r.sys_qty ?? 0);
    const actual = Number(r.act_qty ?? 0);
    const diff   = Number(r.diff_qty ?? 0);
    const rate   = book > 0 ? (Math.abs(diff) / book * 100).toFixed(2) : "0.00";
    const status = STATUS_BADGE[String(r.status)]?.label ?? String(r.status ?? "");
    return [r.stocktake_no, r.warehouse_code, r.item ?? "", book, actual, diff, rate, status, r.auditor ?? ""].join(",");
  });
  const csv  = [headers.join(","), ...lines].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `盘点记录_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StocktakePage() {
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [editing,       setEditing]       = useState<Row | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<Row | null>(null);
  const [approveTarget, setApproveTarget] = useState<Row | null>(null);
  const [approveOpen,   setApproveOpen]   = useState(false);
  const [allRows,       setAllRows]       = useState<Row[]>([]);

  // KPI 数据：独立拉取（DataTable 分页显示，KPI 需全量）
  useEffect(() => {
    crudApi.list(TABLE, { limit: 500 } as any)
      .then(res => setAllRows((res as any).data ?? []))
      .catch(() => {});
  }, [refreshKey]);

  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew     = useCallback(() => { setEditing(null); setDrawerOpen(true); }, []);
  const openEdit    = useCallback((row: Row) => { setEditing(row); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
      const diffQty = Number(values.act_qty ?? 0) - Number(values.sys_qty ?? 0);
      const payload = editing?.id
        ? { ...values, diff_qty: String(diffQty) }
        : { ...values,
            stocktake_no: values.stocktake_no || ("ST-" + Date.now().toString().slice(-6)),
            status: values.status || "DRAFT",
            diff_qty: String(diffQty),
            date: new Date().toISOString().slice(0, 10),
          };
      editing?.id
        ? await crudApi.update(TABLE, editing.id as number, payload)
        : await crudApi.create(TABLE, payload);
      setDrawerOpen(false); refresh();
    } finally { setSaving(false); }
  }, [editing, refresh]);

  const handleDelete   = useCallback((row: Row) => { setDeleteTarget(row); setConfirmOpen(true); }, []);
  const confirmDelete  = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh]);

  const handleApprove  = useCallback((row: Row) => { setApproveTarget(row); setApproveOpen(true); }, []);
  const confirmApprove = useCallback(async () => {
    if (!approveTarget?.id) return;
    await crudApi.update(TABLE, approveTarget.id as number, { status: "APPROVED" });
    setApproveOpen(false); refresh();
  }, [approveTarget, refresh]);

  // 统计 KPI（按 wms_stocktake 真实列 sys_qty/act_qty/diff_qty）
  const pending   = allRows.filter(r => r.status === "DONE").length;
  const highRisk  = allRows.filter(r => { const b = Number(r.sys_qty ?? 0); return b > 0 && Math.abs(Number(r.diff_qty ?? 0)) / b > 0.05; }).length;
  const totalDiff = allRows.reduce((s, r) => s + Math.abs(Number(r.diff_qty ?? 0)), 0);

  const COLUMNS: Column<Row>[] = [
    { key: "stocktake_no",   title: "盘点单号", width: 160 },
    { key: "warehouse_code", title: "仓库",     width: 110 },
    { key: "item",           title: "品目",     width: 100 },
    { key: "sys_qty",        title: "账面量",   width: 80, align: "right" },
    { key: "act_qty",        title: "实际量",   width: 80, align: "right" },
    { key: "diff_qty",       title: "差异量",   width: 80, align: "right",
      render: v => {
        const n = Number(v ?? 0);
        const cls = n === 0 ? s.textSuccess : n > 0 ? s.textInfo : s.textDanger;
        return <b className={cls}>{n === 0 ? "—" : (n > 0 ? `+${n}` : String(n))}</b>;
      }},
    { key: "_rate",          title: "差异率",   width: 80, align: "center",
      render: (_, row) => {
        const book = Number(row.sys_qty ?? 0);
        const diff = Number(row.diff_qty ?? 0);
        const rate = book > 0 ? Math.abs(diff) / book * 100 : 0;
        const isHigh = rate > 5;
        // ✅ 差异率彺章也用 badge 类，不用 inline 颜色
        const cls = rate === 0 ? s.badgeSuccess : isHigh ? s.badgeDanger : s.badgeWarning;
        return <span className={`${s.badge} ${cls}`}>
          {rate.toFixed(2)}%{isHigh ? " ⚠️" : ""}
        </span>;
      }},
    { key: "status",         title: "状态",     width: 90, align: "center",
      render: v => {
        const cfg = STATUS_BADGE[String(v)] ?? { cls: s.badgeNeutral, label: String(v ?? "—") };
        return <span className={`${s.badge} ${cfg.cls}`}>{cfg.label}</span>;
      }},
    { key: "operator",       title: "盘点员",   width: 90  },
    { key: "_actions",       title: "操作",     width: 130, align: "center",
      render: (_, row) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => openEdit(row)}>编辑</button>
          {isApprover() && row.status === "DONE" && (
            <button type="button" className={`${s.btnSuccess} ${s.btnSm}`} onClick={() => handleApprove(row)}>
              <CheckCircle size={11} />审批
            </button>
          )}
          <button type="button" className={`${s.btnDanger} ${s.btnSm}`} onClick={() => handleDelete(row)}>删除</button>
        </div>
      )
    },
  ];

  return (
    <div>
      <PageHeader
        title="盘点管理"
        subtitle="库存盘点作业 · 差异追踪 · 审批确认（表：wms_stocktake）"
        breadcrumb={["仓储管理", "盘点管理"]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={() => exportCSV(allRows)} disabled={allRows.length === 0}>
              <Download size={14} />导出 CSV
            </button>
            <button type="button" className={s.btnSecondary} onClick={refresh}>
              <RefreshCw size={14} />刷新
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew}>
              <Plus size={14} />新建盘点单
            </button>
          </div>
        }
      />

      {/* KPI 统计 */}
      <div className={s.statsRow} style={{ marginBottom: 20 }}>
        <div className={`${s.statCard} ${s.statCardPrimary}`}>
          <div className={s.statValue}>—</div>
          <div className={s.statLabel}>历史盘点次数</div>
        </div>
        <div className={`${s.statCard} ${s.statCardWarning}`}>
          <div className={`${s.statValue} ${s.textWarning}`}>{pending}</div>
          <div className={s.statLabel}>待审批</div>
        </div>
        <div className={`${s.statCard} ${s.statCardDanger}`}>
          <div className={`${s.statValue} ${s.textDanger}`}>{highRisk}</div>
          <div className={s.statLabel}>高风险(&gt;5%)</div>
        </div>
        <div className={`${s.statCard} ${s.statCardInfo}`}>
          <div className={`${s.statValue} ${s.textInfo}`}>{totalDiff.toLocaleString()}</div>
          <div className={s.statLabel}>累计差异量</div>
          <div className={s.statSub}>枚</div>
        </div>
      </div>

      <DataTable
        table={TABLE}
        columns={COLUMNS}
        onNew={openNew}
        onEdit={openEdit as any}
        onDelete={handleDelete as any}
        showActions={false}
        refreshKey={refreshKey}
        emptyText="暂无盘点记录"
        pageSize={30}
      />

      <RightDrawer open={drawerOpen} title={editing ? "编辑盘点单" : "新建盘点单"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog open={approveOpen} title="确认审批通过"
        message={`确认审批盘点单「${approveTarget?.take_no ?? ""}」？可能影响账面库存数据。`}
        onConfirm={confirmApprove} onCancel={() => setApproveOpen(false)} />
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect } from "react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useMasterNames } from '@/hooks/useMasterNames';
import { masterDisplayLabel } from '@/lib/master-display';
import { MasterLabel } from '@/components/MasterNameCode';
import PageHeader from "@/components/PageHeader";
import { crudApi } from "@/lib/api-client";
import { Plus, RefreshCw, Package, Scale, Home, Calendar } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
import { HouseSelector, WarehouseSelector, UserSelector } from "@/components/shared-selectors/MasterDataSelectors"; // G4-E 主数据
import u from "@/styles/uix-utils.module.css";
import {
  primaryActionButton, secondaryActionButton, actionPill,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
} from "@/components/design-system/cockpit-styles";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";
const TABLE = "wms_inbound";
type Row = Record<string, unknown>;
interface FormState {
  inbound_no: string;
  house_code: string;
  shift_no: string;
  collect_date: string;
  qty: string;
  weight_kg: string;
  warehouse: string;
  operator: string;
  remark: string;
  status: string;
}
const EMPTY: FormState = {
  inbound_no: "",
  house_code: "",
  shift_no: "",
  collect_date: new Date().toISOString().slice(0, 10),
  qty: "",
  weight_kg: "",
  warehouse: "",
  operator: "",
  remark: "",
  status: "PENDING"
};
export default function InboundPage() {
  const {
    t, lang
  } = useLanguage();
  const houseNames = useMasterNames('house');
  const warehouseNames = useMasterNames('warehouse');
  const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
    PENDING:   { label: t("ui.待入库", "待入库"),   tone: "warning" },
    COMPLETED: { label: t("ui.已完成", "已完成"),   tone: "success" },
    CANCELLED: { label: t("ui.已取消", "已取消"),   tone: "default" },
  };
  const COLS: Column<Row>[] = [{
    key: "inbound_no",
    title: t("ui.入库单号", "入库单号"),
    width: 170
  }, {
    key: "house_code",
    title: t("ui.来源鸡舍", "来源鸡舍"),
    width: 110,
    render: (v, row) => <MasterLabel>{masterDisplayLabel(houseNames, 'house', v, lang, row)}</MasterLabel>
  }, {
    key: "shift_no",
    title: t("ui.班次号", "班次号"),
    width: 130
  }, {
    key: "collect_date",
    title: t("ui.集蛋日期", "集蛋日期"),
    width: 110,
    render: v => v ? String(v).slice(0, 10) : "—"
  }, {
    key: "qty",
    title: t("ui.数量枚", "数量(枚)"),
    width: 100,
    align: "right",
    render: v => <strong>{Number(v || 0).toLocaleString()}</strong>
  }, {
    key: "weight_kg",
    title: t("ui.重量kg", "重量(kg)"),
    width: 100,
    align: "right",
    render: v => v ? Number(v).toFixed(2) : "—"
  }, {
    key: "warehouse",
    title: t("ui.入库仓库", "入库仓库"),
    width: 110,
    render: (v, row) => <MasterLabel>{masterDisplayLabel(warehouseNames, 'warehouse', v, lang, row)}</MasterLabel>
  }, {
    key: "operator",
    title: t("ui.作业员", "作业员"),
    width: 90
  }, {
    key: "status",
    title: t("common.status", "状态"),
    width: 90,
    align: "center",
    render: v => {
      const m = STATUS_MAP[String(v)] ?? { label: String(v), tone: "default" as Tone };
      return <span style={actionPill(m.tone)}>{m.label}</span>;
    }
  }];
  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [delRow, setDelRow] = useState<Row | null>(null);
  const [rk, setRk] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [operators, setOperators] = useState<{
    username: string;
    real_name_zh: string;
  }[]>([]);
  const [stats, setStats] = useState({
    today: 0,
    pending: 0,
    houses: 0
  });

  // 加载鸡舍、仓库、操作员下拉
  useEffect(() => {
    // 操作员下拉
    const tok = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
    fetch("/api/packaging/operators", {
      headers: {
        Authorization: `Bearer ${tok}`
      }
    }).then(r => r.json()).then(j => setOperators((j.data || []) as {
      username: string;
      real_name_zh: string;
    }[])).catch(() => {});
    // 统计数据
    const today = new Date().toISOString().slice(0, 10);
    crudApi.list(TABLE, {
      limit: 500
    } as never).then((r: unknown) => {
      const rows = ((r as {
        data?: unknown[];
      }).data ?? []) as Record<string, unknown>[];
      setStats({
        today: rows.filter(x => String(x.collect_date ?? "").slice(0, 10) === today).length,
        pending: rows.filter(x => x.status === "PENDING").length,
        houses: new Set(rows.map(x => x.house_code)).size
      });
    }).catch(() => {});
  }, []);
  const refresh = useCallback(() => setRk(k => k + 1), []);
  const openNew = useCallback(() => {
    setEditRow(null);
    setForm(EMPTY);
    setErrors({});
    setOpen(true);
  }, []);
  const openEdit = useCallback((r: Row) => {
    setEditRow(r);
    setForm({
      inbound_no: String(r.inbound_no ?? ""),
      house_code: String(r.house_code ?? ""),
      shift_no: String(r.shift_no ?? ""),
      collect_date: String(r.collect_date ?? "").slice(0, 10),
      qty: String(r.qty ?? ""),
      weight_kg: String(r.weight_kg ?? ""),
      warehouse: String(r.warehouse ?? ""),
      operator: String(r.operator ?? ""),
      remark: String(r.remark ?? ""),
      status: String(r.status ?? "PENDING")
    });
    setErrors({});
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setEditRow(null);
  }, []);
  const set = (k: keyof FormState, v: string) => setForm(f => ({
    ...f,
    [k]: v
  }));
  const validate = () => {
    const e: Partial<FormState> = {};
    if (!form.house_code) e.house_code = t("ui.请选择来源鸡舍", "请选择来源鸡舍");
    if (!form.qty || isNaN(Number(form.qty)) || Number(form.qty) <= 0) e.qty = t("ui.请输入有效数量", "请输入有效数量");
    if (!form.collect_date) e.collect_date = t("ui.请选择集蛋日期", "请选择集蛋日期");
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // B5: wms_inbound 的 task_no 是 NOT NULL PK — 旧代码不传，导致新增依赖后端补默认值，
      //     CRUD 后端若无补默认逻辑就会 500。这里前端按既定模板生成。
      const payload: Record<string, unknown> = {
        ...form,
        qty: Number(form.qty),
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null
      };
      if (!editRow?.id && !payload.task_no) {
        const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
        payload.task_no = `INB-${dateKey}-${rand}`;
      }
      if (!editRow?.id && !payload.inbound_no) {
        // inbound_no 是业务可见的入库单号 — 默认等于 task_no（兼容首检"按入库单号联动"逻辑）
        payload.inbound_no = payload.task_no;
      }
      editRow?.id ? await crudApi.update(TABLE, editRow.id as number, payload) : await crudApi.create(TABLE, payload);
      close();
      refresh();
    } finally {
      setSaving(false);
    }
  }, [form, editRow, close, refresh]);
  const handleDelete = useCallback(async () => {
    if (!delRow?.id) return;
    setDeleting(true);
    try {
      await crudApi.delete(TABLE, delRow.id as number);
      setDelRow(null);
      refresh();
    } finally {
      setDeleting(false);
    }
  }, [delRow, refresh]);
  return <div>
      <PageHeader title={t("ui.集蛋入库", "集蛋入库")} subtitle={t("ui.集蛋入库副标题", "登记每批集蛋入库记录，关联鸡舍、班次和库位")} breadcrumb={[t("ui.包装中心", "包装中心"), t("ui.集蛋入库", "集蛋入库")]}
        actions={
          <button type="button" onClick={openNew} style={primaryActionButton}>
            <Plus size={14} /> {t("ui.新建入库单", "新建入库单")}
          </button>
        } />

      {/* g200f KPI 3 卡 — kpiCardCompact(tone) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 16 }}>
        {([
          { Icon: Package, label: t("ui.今日入库批次", "今日入库批次"), value: stats.today,   tone: "info"    as Tone },
          { Icon: Scale,   label: t("ui.待确认",       "待确认"),       value: stats.pending, tone: "warning" as Tone },
          { Icon: Home,    label: t("ui.来源鸡舍数",   "来源鸡舍数"),   value: stats.houses,  tone: "success" as Tone },
        ]).map(c => {
          const Icon = c.Icon;
          return (
            <div key={c.label} style={kpiCardCompact(c.tone)}>
              <div style={kpiCardCompactLabel}><Icon size={13} /> {c.label}</div>
              <div style={kpiCardCompactValue(c.tone)}>{c.value}</div>
            </div>
          );
        })}
      </div>

      <DataTable<Row> table={TABLE} columns={COLS} showActions onNew={openNew} onEdit={openEdit} onDelete={r => setDelRow(r)} refreshKey={rk} emptyText={t("ui.暂无入库记录", "暂无入库记录")} pageSize={30} />

      {/* 新建/编辑抽屉 */}
      <RightDrawer open={open} title={editRow ? t("ui.编辑入库单", "编辑入库单") : t("ui.新建入库单", "新建入库单")} onClose={close} footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={close} style={secondaryActionButton}>{t("common.cancel", "取消")}</button>
          <button type="button" onClick={handleSubmit} disabled={saving} style={{ ...primaryActionButton, opacity: saving ? 0.5 : 1 }}>
            {saving ? <><RefreshCw size={13} className="spin" /> {t("common.saving", "保存中...")}</> : t("ui.确认入库", "确认入库")}
          </button>
        </div>
      }>
        <div className={s.formSection}><Calendar size={13} /><span>{t("ui.基本信息", "基本信息")}</span></div>
        <div className={s.fieldRow}>
          <div>
            <label className={s.lbl}>{t("ui.集蛋日期", "集蛋日期")} <span style={{
              color: "var(--status-danger)"
            }}>*</span></label>
            <input type="date" className={s.inp} value={form.collect_date} onChange={e => set("collect_date", e.target.value)} />
            {errors.collect_date && <div style={{
            color: "var(--status-danger)",
            fontSize: 11,
            marginTop: 3
          }}>{errors.collect_date}</div>}
          </div>
          <div>
            <label className={s.lbl}>{t("ui.班次号", "班次号")}</label>
            <input className={s.inp} placeholder={t("ui.班次号示例", "如：SHIFT-20260512-AM")} value={form.shift_no} onChange={e => set("shift_no", e.target.value)} />
          </div>
        </div>

        <div className={s.field}>
          <label className={s.lbl}>{t("ui.来源鸡舍", "来源鸡舍")} <span style={{
            color: "var(--status-danger)"
          }}>*</span></label>
          {/* G4-E：从 brd_houses 主数据加载，禁手填 */}
          <HouseSelector value={form.house_code} onChange={v => set("house_code", v)} />
          {errors.house_code && <div style={{
          color: "var(--status-danger)",
          fontSize: 11,
          marginTop: 3
        }}>{errors.house_code}</div>}
        </div>

        <div className={s.formSection}><Scale size={13} /><span>{t("ui.数量与重量", "数量与重量")}</span></div>
        <div className={s.fieldRow}>
          <div>
            <label className={s.lbl}>{t("ui.入库数量枚", "入库数量（枚）")}<span style={{
              color: "var(--status-danger)"
            }}>*</span></label>
            <input type="number" className={s.inp} placeholder="0" min="0" value={form.qty} onChange={e => set("qty", e.target.value)} />
            {errors.qty && <div style={{
            color: "var(--status-danger)",
            fontSize: 11,
            marginTop: 3
          }}>{errors.qty}</div>}
          </div>
          <div>
            <label className={s.lbl}>{t("ui.重量kg", "重量（kg）")}</label>
            <input type="number" className={s.inp} placeholder="0.00" min="0" step="0.01" value={form.weight_kg} onChange={e => set("weight_kg", e.target.value)} />
          </div>
        </div>

        <div className={s.formSection}><Home size={13} /><span>{t("ui.仓储信息", "仓储信息")}</span></div>
        <div className={s.fieldRow}>
          <div>
            <label className={s.lbl}>{t("ui.入库仓库", "入库仓库")}</label>
            {/* G4-E：仓库主数据，仅 ACTIVE，DataScope 自动过滤 */}
            <WarehouseSelector value={form.warehouse} onChange={v => set("warehouse", v)} />
          </div>
          <div>
            <label className={s.lbl}>{t("ui.作业员", "作业员")}</label>
            {/* G4-E：用户主数据（sys_user，仅 ACTIVE） */}
            <UserSelector value={form.operator} onChange={v => set("operator", v)} />
          </div>
        </div>

        <div className={s.fieldRow}>
          <div>
            <label className={s.lbl}>{t("ui.入库单号留空自动生成", "入库单号（留空自动生成）")}</label>
            <input className={s.inp} placeholder={t("ui.系统自动生成", "系统自动生成")} value={form.inbound_no} onChange={e => set("inbound_no", e.target.value)} />
          </div>
          <div>
            <label className={s.lbl}>{t("common.status", "状态")}</label>
            <select className={s.inp} value={form.status} onChange={e => set("status", e.target.value)}>
              <option value="PENDING">{t("ui.待入库", "待入库")}</option>
              <option value="COMPLETED">{t("ui.已入库", "已入库")}</option>
              <option value="CANCELLED">{t("ui.已取消", "已取消")}</option>
            </select>
          </div>
        </div>

        <div className={s.field}>
          <label className={s.lbl}>{t("common.remark", "备注")}</label>
          <textarea className={`${s.inp} ${s.textarea}`} placeholder={t("ui.异常说明特殊情况记录", "可选：异常说明、特殊情况记录...")} value={form.remark} onChange={e => set("remark", e.target.value)} rows={3} />
        </div>
      </RightDrawer>

      <ConfirmDialog open={!!delRow} title={t("ui.确认删除入库单", "确认删除入库单")} message={`${t("ui.确定删除入库单", "确定删除入库单")}「${delRow?.inbound_no || delRow?.id}」？${t("ui.此操作不可撤销", "此操作不可撤销。")}`} confirmLabel={t("common.confirmDelete", "确认删除")} danger loading={deleting} onConfirm={handleDelete} onCancel={() => setDelRow(null)} />
    </div>;
}

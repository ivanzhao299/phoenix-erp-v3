"use client";
import { useState, useCallback, useEffect } from "react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { crudApi } from "@/lib/api-client";
import { Plus, RefreshCw, ClipboardCheck, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({ Authorization: `Bearer ${tok()}` });

const TABLE = "qa_inspections";
type Row = Record<string, unknown>;

// 检测项目（首检标准）
const CHECK_ITEMS = [
  { key: "check_shell",   label: "蛋壳完整性" },
  { key: "check_weight",  label: "重量达标" },
  { key: "check_cleanness", label: "清洁度" },
  { key: "check_grade",   label: "品级符合" },
  { key: "check_pack",    label: "包装规格" },
  { key: "check_label",   label: "标签信息" },
];

const RESULT_MAP: Record<string, { label: string; cls: string }> = {
  PASS:        { label: "合格", cls: s.badgeSuccess },
  FAIL:        { label: "不合格", cls: s.badgeDanger },
  CONDITIONAL: { label: "有条件", cls: s.badgeWarning },
  PENDING:     { label: "待检", cls: s.badgeNeutral },
};

const COLS: Column<Row>[] = [
  { key: "inspect_no",  title: "检验单号", width: 160 },
  { key: "batch_no",    title: "入库单号", width: 150 },
  { key: "house_code",  title: "鸡舍",     width: 90 },
  { key: "sku_code",    title: "品级",     width: 80, align: "center",
    render: v => v ? <span className={`${s.badge} ${s.badgePurple}`}>{String(v)}</span> : "—" },
  { key: "sample_qty",  title: "抽样量",   width: 80, align: "right" },
  { key: "result",      title: "检验结论", width: 90, align: "center",
    render: v => {
      const m = RESULT_MAP[String(v)] ?? { label: String(v), cls: s.badgeNeutral };
      return <span className={`${s.badge} ${m.cls}`}>{m.label}</span>;
    }},
  { key: "inspector",   title: "检验员",   width: 90 },
  { key: "issues",      title: "问题项",   width: 120,
    render: v => v && String(v) ? <span style={{ color: "var(--status-danger)", fontSize: 12 }}>{String(v)}</span> : <span style={{ color: "var(--status-success)", fontSize: 12 }}>无</span> },
  { key: "created_at",  title: "检验时间", width: 140,
    render: v => v ? String(v).slice(0, 16).replace("T", " ") : "—" },
];

interface FormState {
  inspect_no: string; batch_no: string; house_code: string; sku_code: string;
  sample_qty: string; result: string; inspector: string;
  issues: string; remark: string;
  check_shell: boolean; check_weight: boolean; check_cleanness: boolean;
  check_grade: boolean; check_pack: boolean; check_label: boolean;
}

const EMPTY: FormState = {
  inspect_no: "", batch_no: "", house_code: "", sku_code: "",
  sample_qty: "30", result: "PENDING", inspector: "",
  issues: "", remark: "",
  check_shell: false, check_weight: false, check_cleanness: false,
  check_grade: false, check_pack: false, check_label: false,
};

export default function FirstInspectionPage() {
  const [open, setOpen]         = useState(false);
  const [editRow, setEditRow]   = useState<Row | null>(null);
  const [delRow, setDelRow]     = useState<Row | null>(null);
  const [rk, setRk]             = useState(0);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm]         = useState<FormState>(EMPTY);
  const [errors, setErrors]     = useState<Partial<Record<keyof FormState, string>>>({});
  const [filter, setFilter]     = useState("ALL");
  const [gradeOpts, setGradeOpts] = useState<{code:string;name:string}[]>([]);
  const [houseOpts, setHouseOpts] = useState<{code:string;label:string}[]>([]);

  useEffect(() => {
    fetch("/api/packaging/grade-config", { headers: hdr() }).then(r=>r.json()).then(d => {
      setGradeOpts((d.grades||[]).map((g:any)=>({code:g.code,name:g.nameZh||g.name||g.code})));
    }).catch(()=>{});
    fetch("/api/crud/brd_houses?limit=200", { headers: hdr() }).then(r=>r.json()).then(j => {
      setHouseOpts(((j.data||j) as any[])
        .filter((h:any)=>h.house_code && h.status !== "DISABLED" && h.status !== "INACTIVE" && h.status !== "DELETED")
        .map((h:any)=>({code:h.house_code as string,label:h.house_name?`${h.house_code} · ${h.house_name}`:h.house_code as string})));
    }).catch(()=>{});
  }, []);

  const refresh  = useCallback(() => setRk(k => k + 1), []);
  const openNew  = useCallback(() => { setEditRow(null); setForm(EMPTY); setErrors({}); setOpen(true); }, []);
  const openEdit = useCallback((r: Row) => {
    setEditRow(r);
    setForm({
      inspect_no:      String(r.inspect_no ?? ""),
      batch_no:        String(r.batch_no ?? ""),
      house_code:      String(r.house_code ?? ""),
      sku_code:        String(r.sku_code ?? ""),
      sample_qty:      String(r.sample_qty ?? "30"),
      result:          String(r.result ?? "PENDING"),
      inspector:       String(r.inspector ?? ""),
      issues:          String(r.issues ?? ""),
      remark:          String(r.remark ?? ""),
      check_shell:     Boolean(r.check_shell),
      check_weight:    Boolean(r.check_weight),
      check_cleanness: Boolean(r.check_cleanness),
      check_grade:     Boolean(r.check_grade),
      check_pack:      Boolean(r.check_pack),
      check_label:     Boolean(r.check_label),
    });
    setErrors({}); setOpen(true);
  }, []);
  const close = useCallback(() => { setOpen(false); setEditRow(null); }, []);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));

  // 根据勾选项自动判断结论
  const checkedCount = CHECK_ITEMS.filter(c => form[c.key as keyof FormState]).length;
  const autoResult   = checkedCount === CHECK_ITEMS.length ? "PASS" : checkedCount >= 4 ? "CONDITIONAL" : "PENDING";

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.batch_no)   e.batch_no  = "请填写批次号";
    if (!form.inspector)  e.inspector = "请填写检验员";
    if (!form.result || form.result === "PENDING") e.result = "请选择检验结论";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { ...form, sample_qty: Number(form.sample_qty || 30) };
      editRow?.id
        ? await crudApi.update(TABLE, editRow.id as number, payload)
        : await crudApi.create(TABLE, payload);

      // A3 业务闭环：首检通过 → wms_inbound.status=INSPECTED；不合格 → HOLD
      // 注：form.batch_no 在此页语义上是"被检入库单号"（与 wms_inbound.inbound_no 对齐），
      // 历史命名为 batch_no 是 V2 残留；UI 标签已改为"入库单号"。
      // 修正：仅当后台真的存在对应 wms_inbound 行时才更新，避免静默"成功"误导用户
      if (form.batch_no && (form.result === "PASS" || form.result === "CONDITIONAL" || form.result === "FAIL")) {
        try {
          const r = await fetch(`/api/crud/wms_inbound/inbound_no/${encodeURIComponent(form.batch_no)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...hdr() },
            body: JSON.stringify({
              status: form.result === "FAIL" ? "HOLD" : "INSPECTED",
              insp_no: form.inspect_no || undefined,
            }),
          });
          if (!r.ok && r.status !== 404) {
            console.warn("[FirstInspection] 更新入库单状态非 2xx:", r.status);
          }
        } catch (e) {
          console.warn("[FirstInspection] 更新入库单状态失败:", e);
        }
      }

      close(); refresh();
    } finally { setSaving(false); }
  }, [form, editRow, close, refresh]);

  const handleDelete = useCallback(async () => {
    if (!delRow?.id) return;
    setDeleting(true);
    try { await crudApi.delete(TABLE, delRow.id as number); setDelRow(null); refresh(); }
    finally { setDeleting(false); }
  }, [delRow, refresh]);

  const resultFilters = [
    { key: "ALL", label: "全部" },
    { key: "PENDING", label: "待检" },
    { key: "PASS", label: "合格" },
    { key: "FAIL", label: "不合格" },
    { key: "CONDITIONAL", label: "有条件" },
  ];

  return (
    <div>
      <PageHeader
        title="首检录入"
        subtitle="对每批包装产品进行首件检验，记录检验项目、结论和问题描述"
        breadcrumb={["包装中心", "首检录入"]}
        actions={
          <button type="button" className={s.btnPrimaryGrad} onClick={openNew}>
            <Plus size={14} /> 新建首检记录
          </button>
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {resultFilters.map(f => (
          <button key={f.key} type="button"
            className={`${s.tabPill} ${filter === f.key ? s.tabPillActive : ""}`}
            onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <DataTable<Row>
        table={TABLE}
        columns={COLS}
        params={filter !== "ALL" ? { result: filter } as never : undefined}
        showActions
        onNew={openNew}
        onEdit={openEdit}
        onDelete={r => setDelRow(r)}
        refreshKey={rk}
        emptyText="暂无首检记录"
        pageSize={30}
      />

      {/* 新建/编辑抽屉 */}
      <RightDrawer
        open={open}
        title={editRow ? "编辑首检记录" : "新建首检记录"}
        onClose={close}
        width={540}
        footer={
          <div className={s.drawerFooter}>
            <button className={s.btnSecondary} onClick={close}>取消</button>
            <button
              className={form.result === "FAIL" ? s.btnDanger : s.btnPrimaryGrad}
              onClick={handleSubmit} disabled={saving}>
              {saving ? <><RefreshCw size={14} /> 保存中...</> : <><ClipboardCheck size={14} /> 提交检验结果</>}
            </button>
          </div>
        }
      >
        <div className={s.formSection}><ClipboardCheck size={13}/><span>检验基本信息</span></div>
        <div className={s.fieldRow}>
          <div>
            <label className={s.lbl}>入库单号 <span style={{ color: "var(--status-danger)" }}>*</span></label>
            <input className={s.inp} placeholder="如：INB-20260512-001（关联 wms_inbound）" value={form.batch_no}
              onChange={e => set("batch_no", e.target.value)} />
            {errors.batch_no && <div style={{ color: "var(--status-danger)", fontSize: 11, marginTop: 3 }}>{errors.batch_no}</div>}
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>填入库单号后，提交将自动把入库状态推进到 INSPECTED / HOLD</div>
          </div>
          <div>
            <label className={s.lbl}>来源鸡舍</label>
            <select className={s.inp} value={form.house_code} onChange={e => set("house_code", e.target.value)}>
              <option value="">— 请选择 —</option>
              {houseOpts.map(h => <option key={h.code} value={h.code}>{h.label}</option>)}
              {houseOpts.length === 0 && form.house_code && <option value={form.house_code}>{form.house_code}</option>}
            </select>
          </div>
        </div>
        <div className={s.fieldRow}>
          <div>
            <label className={s.lbl}>品级</label>
            <select className={s.inp} value={form.sku_code} onChange={e => set("sku_code", e.target.value)}>
              <option value="">— 请选择 —</option>
              {gradeOpts.map(g => <option key={g.code} value={g.code}>{g.name} ({g.code})</option>)}
              {gradeOpts.length === 0 && form.sku_code && <option value={form.sku_code}>{form.sku_code}</option>}
            </select>
          </div>
          <div>
            <label className={s.lbl}>抽样数量</label>
            <input type="number" className={s.inp} min="1" placeholder="30" value={form.sample_qty}
              onChange={e => set("sample_qty", e.target.value)} />
          </div>
        </div>

        <div className={s.formSection}><CheckCircle2 size={13}/><span>检验项目（勾选已达标项）</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginBottom: 16 }}>
          {CHECK_ITEMS.map(item => (
            <label key={item.key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: 8,
              background: form[item.key as keyof FormState] ? "rgba(34,197,94,0.08)" : "var(--bg-muted)",
              border: `1px solid ${form[item.key as keyof FormState] ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
              transition: "all 0.18s" }}>
              <input type="checkbox" checked={Boolean(form[item.key as keyof FormState])}
                onChange={e => set(item.key as keyof FormState, e.target.checked as never)}
                style={{ width: 16, height: 16, accentColor: "var(--status-success)" }} />
              <span style={{ fontSize: 13, fontWeight: 600,
                color: form[item.key as keyof FormState] ? "var(--status-success)" : "var(--text-primary)" }}>
                {form[item.key as keyof FormState] ? <CheckCircle2 size={13} style={{ display: "inline", marginRight: 4 }} /> : null}
                {item.label}
              </span>
            </label>
          ))}
        </div>

        {/* 自动推荐结论 */}
        <div className={autoResult === "PASS" ? s.successBanner : autoResult === "CONDITIONAL" ? s.warnBanner : s.infoBanner} style={{ marginBottom: 12 }}>
          {autoResult === "PASS" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          已通过 <strong>{checkedCount}</strong> / {CHECK_ITEMS.length} 项 —
          建议结论：<strong>{RESULT_MAP[autoResult].label}</strong>
        </div>

        <div className={s.formSection}><XCircle size={13}/><span>检验结论</span></div>
        <div className={s.fieldRow}>
          <div>
            <label className={s.lbl}>最终结论 <span style={{ color: "var(--status-danger)" }}>*</span></label>
            <select className={s.inp} value={form.result} onChange={e => set("result", e.target.value)}>
              <option value="PENDING">— 请选择 —</option>
              <option value="PASS">✅ 合格</option>
              <option value="CONDITIONAL">⚠️ 有条件通过</option>
              <option value="FAIL">❌ 不合格</option>
            </select>
            {errors.result && <div style={{ color: "var(--status-danger)", fontSize: 11, marginTop: 3 }}>{errors.result}</div>}
          </div>
          <div>
            <label className={s.lbl}>检验员 <span style={{ color: "var(--status-danger)" }}>*</span></label>
            <input className={s.inp} placeholder="检验员姓名" value={form.inspector}
              onChange={e => set("inspector", e.target.value)} />
            {errors.inspector && <div style={{ color: "var(--status-danger)", fontSize: 11, marginTop: 3 }}>{errors.inspector}</div>}
          </div>
        </div>

        {form.result === "FAIL" || form.result === "CONDITIONAL" ? (
          <div className={s.field}>
            <label className={s.lbl} style={{ color: "var(--status-danger)" }}>问题描述（不合格必填）</label>
            <textarea className={`${s.inp} ${s.textarea}`} rows={3}
              placeholder="描述不合格/有条件通过的具体问题..."
              value={form.issues} onChange={e => set("issues", e.target.value)} />
          </div>
        ) : null}

        <div className={s.field}>
          <label className={s.lbl}>检验单号（留空自动生成）</label>
          <input className={s.inp} placeholder="系统自动生成" value={form.inspect_no}
            onChange={e => set("inspect_no", e.target.value)} />
        </div>

        <div className={s.field}>
          <label className={s.lbl}>备注</label>
          <textarea className={`${s.inp} ${s.textarea}`} rows={2}
            placeholder="其他说明..."
            value={form.remark} onChange={e => set("remark", e.target.value)} />
        </div>
      </RightDrawer>

      <ConfirmDialog
        open={!!delRow}
        title="确认删除首检记录"
        message={`确定删除检验单「${delRow?.inspect_no || delRow?.id}」？此操作不可撤销。`}
        confirmLabel="确认删除"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDelRow(null)}
      />
    </div>
  );
}

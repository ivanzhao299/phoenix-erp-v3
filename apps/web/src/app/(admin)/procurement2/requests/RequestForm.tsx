"use client";

// G160：采购申请新建/编辑表单——从原列表页抽屉抽出为「整页表单」组件。
//   · 新建：/procurement2/requests/new        → <RequestForm />
//   · 编辑：/procurement2/requests/[id]/edit   → <RequestForm requestId={id} />
//   基础信息 + 采购属性 + 物料明细表（MaterialPicker/WarehouseSelector），不再受抽屉宽度限制。

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { DictSelect } from "@/components/shared-selectors/DictSelect"; // G2 字典
import { CompanySelector, ProjectSelector, WarehouseSelector } from "@/components/shared-selectors/MasterDataSelectors"; // G4-B 主数据选择器
import { MaterialPicker } from "@/components/shared-selectors/MaterialPicker"; // 可搜索 + 就地新建物料组合框
import { tableInputCell } from "@/components/design-system/cockpit-styles"; // G94 全局表格输入 token

// ── 类型定义 ──────────────────────────────────────────────────────────────────
interface ReqItem {
  id?: string;
  itemCode?: string;
  itemName: string;
  spec?: string;
  qty: number | string;
  unit?: string;
  estimatedUnitPrice?: number | string;
  estimatedAmount?: number | string;
  warehouseCode?: string;
  usageDesc?: string;
  projectCode?: string;
  projectName?: string;
}
interface PurchaseRequest {
  id: string;
  reqNo: string;
  subject: string;
  status: string;
  urgency: string;
  purchaseType?: string;
  companyCode: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
  currencyCode?: string;
  estimatedAmount?: number | string;
  requesterName?: string;
  deptCode?: string;
  expectedDate?: string;
  reason?: string;
  attachmentUrl?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  items?: ReqItem[];
}

// ── 常量 ──────────────────────────────────────────────────────────────────────
const API_BASE = "/api/v2/procurement/requests";
const emptyItem = (): ReqItem => ({
  itemName: "",
  qty: "",
  unit: "",
  estimatedUnitPrice: "",
  estimatedAmount: ""
});
// G95-C：新建默认空行数（申请单主体是采购明细，多给几行）
const blankRows = (n = 5): ReqItem[] => Array.from({ length: n }, emptyItem);
// G95-C：申请原因默认文本（可直接编辑，不必每次手敲）
const DEFAULT_REASON = "常规采购补货";
// G95-C：记住上次选择的公司/项目（同一用户连续建单常是同公司同项目）
const LAST_SCOPE_KEY = "prc_req_last_scope";
const readLastScope = (): { companyCode?: string; companyName?: string; projectCode?: string; projectName?: string } => {
  try { return JSON.parse(localStorage.getItem(LAST_SCOPE_KEY) || "{}"); } catch { return {}; }
};
const writeLastScope = (v: Record<string, string>) => { try { localStorage.setItem(LAST_SCOPE_KEY, JSON.stringify(v)); } catch { /* ignore */ } };

// ── 内联样式常量 ──────────────────────────────────────────────────────────────
// G94：并入全局表格输入 token（取代本页自定义 3/6·圆角4）
const cellInpStyle: React.CSSProperties = tableInputCell;
const thStyle: React.CSSProperties = {
  padding: "5px 6px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 11,
  color: "var(--text-secondary)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap"
};
const tdStyle: React.CSSProperties = {
  padding: "4px 6px",
  verticalAlign: "middle"
};

export default function RequestForm({ requestId }: { requestId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const editing = !!requestId;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  // 表单字段
  const [formSubject, setFormSubject] = useState("");
  const [formCompanyCode, setFormCompanyCode] = useState("");
  const [formCompanyName, setFormCompanyName] = useState("");
  const [formProjectCode, setFormProjectCode] = useState("");
  const [formProjectName, setFormProjectName] = useState("");
  const [formType, setFormType] = useState("MATERIAL");
  const [formUrgency, setFormUrgency] = useState("NORMAL");
  const [formCurrency, setFormCurrency] = useState("LAK");
  const [formDept, setFormDept] = useState("");
  const [formExpDate, setFormExpDate] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formRemark, setFormRemark] = useState("");
  const [formItems, setFormItems] = useState<ReqItem[]>(blankRows());

  const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "" : "";
  const hdr = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // 新建：预填上次选择的公司/项目（连续建单多为同公司同项目；可改）
  useEffect(() => {
    if (requestId) return;
    const last = readLastScope();
    setFormCompanyCode(last.companyCode ?? "");
    setFormCompanyName(last.companyName ?? "");
    setFormProjectCode(last.projectCode ?? "");
    setFormProjectName(last.projectName ?? "");
    setFormReason(DEFAULT_REASON);     // G95-C：默认原因，可直接编辑
    setFormItems(blankRows());         // G95-C：默认 5 空行（明细是主体）
  }, [requestId]);

  // 编辑模式：按 id 载入
  const loadForEdit = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/${requestId}`, { headers: hdr });
      if (!res.ok) throw new Error(await res.text());
      const row: PurchaseRequest = await res.json();
      setFormSubject(row.subject ?? "");
      setFormCompanyCode(row.companyCode ?? "");
      setFormCompanyName(row.companyName ?? "");
      setFormProjectCode(row.projectCode ?? "");
      setFormProjectName(row.projectName ?? "");
      setFormType(row.purchaseType ?? "MATERIAL");
      setFormUrgency(row.urgency ?? "NORMAL");
      setFormCurrency(row.currencyCode ?? "LAK");
      setFormDept(row.deptCode ?? "");
      setFormExpDate(row.expectedDate ?? "");
      setFormReason(row.reason ?? "");
      setFormRemark(row.remark ?? "");
      setFormItems(row.items?.length ? row.items.map(i => ({ ...i })) : [emptyItem()]);
    } catch {
      toast.error("加载采购申请失败");
    } finally {
      setLoading(false);
    }
  }, [requestId]); // eslint-disable-line

  useEffect(() => { if (requestId) loadForEdit(); }, [requestId, loadForEdit]);

  // 明细行
  function setItemField(idx: number, field: keyof ReqItem, value: string) {
    setFormItems(prev => {
      const next = prev.map((it, i) => i === idx ? {
        ...it,
        [field]: value
      } : it);
      if (field === "qty" || field === "estimatedUnitPrice") {
        const it = next[idx];
        const qty = parseFloat(String(it.qty)) || 0;
        const price = parseFloat(String(it.estimatedUnitPrice)) || 0;
        next[idx] = {
          ...it,
          estimatedAmount: String(Math.round(qty * price * 100) / 100)
        };
      }
      return next;
    });
  }
  function addItemRow() {
    setFormItems(prev => [...prev, emptyItem()]);
  }
  function removeItemRow(idx: number) {
    setFormItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }

  // 保存
  async function handleSave() {
    if (!formSubject.trim()) {
      toast.error("请填写申请主题");
      return;
    }
    if (!formCompanyCode.trim()) {
      toast.error("请填写公司代码");
      return;
    }
    if (!formCompanyName.trim()) {
      toast.error("请填写公司名称");
      return;
    }
    // G95-C：只取已填物料的行（默认多给的空行自动忽略，不卡提交）
    const filledItems = formItems.filter(it => it.itemName.trim());
    if (filledItems.length === 0) {
      toast.error("请至少填写一行物料明细");
      return;
    }
    if (filledItems.some(it => !it.qty || parseFloat(String(it.qty)) <= 0)) {
      toast.error("已填物料的数量必须大于 0");
      return;
    }
    setSaving(true);
    try {
      const body = {
        subject: formSubject.trim(),
        companyCode: formCompanyCode.trim(),
        companyName: formCompanyName.trim(),
        projectCode: formProjectCode.trim() || undefined,
        projectName: formProjectName.trim() || undefined,
        purchaseType: formType,
        urgency: formUrgency,
        currencyCode: formCurrency,
        deptCode: formDept.trim() || undefined,
        expectedDate: formExpDate || undefined,
        reason: formReason.trim() || undefined,
        remark: formRemark.trim() || undefined,
        items: filledItems.map(it => ({
          itemCode: it.itemCode?.trim() || undefined,
          itemName: it.itemName.trim(),
          spec: it.spec?.trim() || undefined,
          qty: parseFloat(String(it.qty)),
          unit: it.unit?.trim() || undefined,
          estimatedUnitPrice: parseFloat(String(it.estimatedUnitPrice)) || 0,
          estimatedAmount: parseFloat(String(it.estimatedAmount)) || 0,
          warehouseCode: it.warehouseCode?.trim() || undefined,
          usageDesc: it.usageDesc?.trim() || undefined
        }))
      };
      const url = editing ? `${API_BASE}/${requestId}` : API_BASE;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: hdr,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? "保存失败");
      }
      // G95-C：记住本次公司/项目，下次新建默认带出
      writeLastScope({ companyCode: formCompanyCode.trim(), companyName: formCompanyName.trim(), projectCode: formProjectCode.trim(), projectName: formProjectName.trim() });
      toast.success(editing ? "保存成功" : "采购申请已创建");
      router.push("/procurement2/requests");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={u.emptyCenter}>加载中…</div>;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", paddingBottom: 96 }}>{/* G164：与 OrderForm/PaymentForm 统一宽度 */}
      {/* 基础信息 */}
      <div className={s.formSection}>基础信息</div>
      <div className={s.fieldRow}>
        <div className={s.field} style={{ gridColumn: "1 / -1" }}>
          <label className={s.lbl}>申请主题 *</label>
          <input className={s.inp} value={formSubject} onChange={e => setFormSubject(e.target.value)} placeholder="请输入采购主题" />
        </div>
      </div>
      {/* G95：公司/项目并排——选择器选中即得，名称由 onPick 后台带出，去掉冗余只读名称框 */}
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>公司 *</label>
          {/* G4-B：公司主数据(org_units COMPANY)，DataScope 自动过滤 */}
          {/* G95-B：换公司清空项目（项目属于公司，避免跨公司错挂） */}
          <CompanySelector value={formCompanyCode} onChange={v => { setFormCompanyCode(v); setFormProjectCode(""); setFormProjectName(""); }} onPick={o => setFormCompanyName(o?.label ?? "")} disabled={editing} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>项目</label>
          {/* G4-B：项目主数据，仅 ACTIVE；G95-B 按所属公司过滤（先选公司） */}
          <ProjectSelector value={formProjectCode} onChange={setFormProjectCode} onPick={o => setFormProjectName(o?.raw?.project_name ?? o?.raw?.projectName ?? o?.label ?? "")} companyCode={formCompanyCode || undefined} />
        </div>
      </div>

      {/* 采购属性 */}
      <div className={s.formSection} style={{ marginTop: 20 }}>采购属性</div>
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>采购类型</label>
          {/* G4-B：采购类型枚举来自 sys_dict(PRC_PURCHASE_TYPE) */}
          <DictSelect dictType="PRC_PURCHASE_TYPE" value={formType} onChange={setFormType} allowEmpty={false} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>紧急程度</label>
          {/* G4-B：紧急程度枚举来自 sys_dict(PRC_URGENCY) */}
          <DictSelect dictType="PRC_URGENCY" value={formUrgency} onChange={setFormUrgency} allowEmpty={false} />
        </div>
      </div>
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>货币</label>
          {/* G4-B：货币枚举来自 sys_dict(SYS_CURRENCY) */}
          <DictSelect dictType="SYS_CURRENCY" value={formCurrency} onChange={setFormCurrency} allowEmpty={false} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>期望到货日</label>
          <input type="date" className={s.inp} value={formExpDate} onChange={e => setFormExpDate(e.target.value)} />
        </div>
      </div>
      {/* G95-C：原因/备注并排压缩占位（申请单主体是采购明细，不喧宾夺主）；原因带默认文本可直接编辑 */}
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>申请原因</label>
          <textarea className={s.textarea} rows={1} value={formReason} onChange={e => setFormReason(e.target.value)} placeholder="如：常规采购补货（可直接编辑）" />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>备注</label>
          <textarea className={s.textarea} rows={1} value={formRemark} onChange={e => setFormRemark(e.target.value)} placeholder="选填：补充说明" />
        </div>
      </div>

      {/* 明细行 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginTop: 20 }}>
        <span className={s.formSection} style={{ margin: 0 }}>
          采购明细（{formItems.length} 行）
        </span>
        <button type="button" className={s.btnSecondary} style={{ padding: "3px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }} onClick={addItemRow}>
          <Plus size={12} /> 添加行
        </button>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
        <table className={s.table} style={{ fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg-subtle,var(--bg-muted))" }}>
              <th style={thStyle}>物料名称 *</th>
              <th style={thStyle}>规格</th>
              <th style={thStyle}>数量 *</th>
              <th style={thStyle}>单位</th>
              <th style={thStyle}>估算单价</th>
              <th style={{ ...thStyle, textAlign: "right" }}>小计</th>
              <th style={thStyle}>仓库</th>
              <th style={{ ...thStyle, width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {formItems.map((it, idx) => <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={tdStyle}>
                {/* 物料组合框：可搜索 + 找不到就地新建，自动带出 material_code/spec/unit */}
                <MaterialPicker value={it.itemName ?? ""} onChange={name => setItemField(idx, "itemName", name)} onPickRaw={m => {
                  setItemField(idx, "itemCode", m?.material_code ?? "");
                  setItemField(idx, "spec", m?.spec ?? "");
                  setItemField(idx, "unit", m?.unit ?? "");
                }} style={{ minWidth: 200, fontSize: 12, padding: "3px 6px" }} />
              </td>
              <td style={tdStyle}>
                <input style={{ ...cellInpStyle, width: 80, background: "var(--bg-muted)" }} value={it.spec ?? ""} readOnly placeholder="由物料自动带出" />
              </td>
              <td style={tdStyle}>
                <input style={{ ...cellInpStyle, width: 70 }} type="number" min="0" value={it.qty} onChange={e => setItemField(idx, "qty", e.target.value)} />
              </td>
              <td style={tdStyle}>
                <input style={{ ...cellInpStyle, width: 50 }} value={it.unit ?? ""} onChange={e => setItemField(idx, "unit", e.target.value)} placeholder="kg" />
              </td>
              <td style={tdStyle}>
                <input style={{ ...cellInpStyle, width: 90 }} type="number" min="0" value={it.estimatedUnitPrice ?? ""} onChange={e => setItemField(idx, "estimatedUnitPrice", e.target.value)} />
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                {it.estimatedAmount ? Number(it.estimatedAmount).toLocaleString("zh-CN") : "—"}
              </td>
              <td style={tdStyle}>
                {/* G4-B：仓库主数据(wms_warehouses)，按当前公司过滤 */}
                <WarehouseSelector value={it.warehouseCode ?? ""} onChange={code => setItemField(idx, "warehouseCode", code)} companyCode={formCompanyCode} style={{ minWidth: 150, fontSize: 12, padding: "3px 6px" }} />
              </td>
              <td style={tdStyle}>
                <button type="button" style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger,var(--status-danger))", padding: "0 2px" }} onClick={() => removeItemRow(idx)} title="删除行">
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>)}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td colSpan={5} style={{ textAlign: "right", padding: "6px 8px", fontSize: 12, fontWeight: 600 }}>
                合计（{formCurrency}）
              </td>
              <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {formItems.reduce((sum, it) => sum + (parseFloat(String(it.estimatedAmount)) || 0), 0).toLocaleString("zh-CN")}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 底部固定操作条 */}
      <div style={{
        position: "sticky", bottom: 0, marginTop: 24, padding: "14px 0",
        background: "var(--bg-page,var(--bg-card))", borderTop: "1px solid var(--border)",
        display: "flex", gap: 10, justifyContent: "flex-end",
      }}>
        <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={() => router.push("/procurement2/requests")}>
          <ArrowLeft size={14} /> 返回
        </button>
        <button type="button" className={`${s.btnPrimary} ${u.flexRow}`} onClick={handleSave} disabled={saving}>
          <Save size={14} /> {saving ? "保存中…" : editing ? "保存" : "保存草稿"}
        </button>
      </div>
    </div>
  );
}

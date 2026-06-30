"use client";

// G158：采购订单新建/编辑表单——从原列表页右侧抽屉抽出为「整页表单」组件。
//   · 新建：/procurement2/orders/new        → <OrderForm />
//   · 编辑：/procurement2/orders/[id]/edit   → <OrderForm orderId={id} />
//   严格复刻付款单整页模式（PaymentForm）：分区清晰、明细录入表带合计、底部固定操作条，
//   不再受抽屉宽度限制。字段/校验/提交 body 与原抽屉完全一致。

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import { Plus, Search, Trash2, Save, ArrowLeft } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { DictSelect } from "@/components/shared-selectors/DictSelect"; // G2 字典
import { CompanySelector, ProjectSelector, SupplierSelector, WarehouseSelector } from "@/components/shared-selectors/MasterDataSelectors"; // G4-B 主数据选择器
import { MaterialPicker } from "@/components/shared-selectors/MaterialPicker"; // 可搜索 + 就地新建物料组合框
import { AttachmentUploader, DocumentAutofillPanel, type DocumentAutofillSuggestion } from "@/components/design-system"; // G4-B 合同附件
import { tableInputCell } from "@/components/design-system/cockpit-styles"; // G94 全局表格输入 token
import { useLanguage } from '@/contexts/LanguageContext';

// G134：合同附件支持多文件——contractUrl 列改存 JSON 数组字符串；兼容历史单 url 值。
function parseContractUrls(raw?: string): string[] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  if (s.startsWith("[")) { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter(Boolean) : []; } catch { return []; } }
  return [s];
}

// ── 类型 ──────────────────────────────────────────────────────────────────────
interface OrderItem {
  id?: string;
  itemCode?: string;
  itemName: string;
  spec?: string;
  productCode?: string;   // G85-C SKU 带出（成本按产品归集）
  gradeCode?: string;     // G85-C SKU 带出（成本按等级归集）
  qty: number | string;
  unit?: string;
  unitPrice: number | string;
  amount?: number | string;
  warehouseCode?: string;
  usageDesc?: string;
  projectCode?: string;
  projectName?: string;
}
interface PurchaseOrder {
  id: string;
  poNo: string;
  subject: string;
  status: string;
  approvalStatus: string;
  companyCode: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
  supplierCode: string;
  supplierName?: string;
  purchaseType?: string;
  crossBorderFlag?: boolean;
  currencyCode?: string;
  totalAmount?: number | string;
  expectedDate?: string;
  payDeadline?: string;
  sourceReqNo?: string;
  contractNo?: string;
  contractUrl?: string;
  contractNote?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  items?: OrderItem[];
}

// ── 常量 ──────────────────────────────────────────────────────────────────────
const API_ORDERS = "/api/v2/procurement/orders";
const emptyItem = (): OrderItem => ({
  itemName: "",
  qty: "",
  unit: "",
  unitPrice: "",
  amount: ""
});
// G95-D：与采购申请一致——默认多空行、记住上次公司/项目/供应商
const blankRows = (n = 3): OrderItem[] => Array.from({ length: n }, emptyItem);
const LAST_SCOPE_KEY = "prc_order_last_scope";
const readLastScope = (): { companyCode?: string; companyName?: string; projectCode?: string; projectName?: string; supplierCode?: string; supplierName?: string } => {
  try { return JSON.parse(localStorage.getItem(LAST_SCOPE_KEY) || "{}"); } catch { return {}; }
};
const writeLastScope = (v: Record<string, string>) => { try { localStorage.setItem(LAST_SCOPE_KEY, JSON.stringify(v)); } catch { /* ignore */ } };

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
// G94：并入全局表格输入 token（取代本页自定义 3/6·圆角4）
const cellInp: React.CSSProperties = tableInputCell;

interface ContractLineItemSuggestion {
  itemName?: string;
  spec?: string;
  qty?: string;
  unit?: string;
  unitPrice?: string;
  amount?: string;
}

// ── 表单 ──────────────────────────────────────────────────────────────────────
export default function OrderForm({ orderId }: { orderId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const editing = !!orderId;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  // 表单字段
  const [fSubject, setFSubject] = useState("");
  const [fCompanyCode, setFCompanyCode] = useState("");
  const [fCompanyName, setFCompanyName] = useState("");
  const [fProjectCode, setFProjectCode] = useState("");
  const [fProjectName, setFProjectName] = useState("");
  const [fSupplierCode, setFSupplierCode] = useState("");
  const [fSupplierName, setFSupplierName] = useState("");
  const [fPurchaseType, setFPurchaseType] = useState("MATERIAL");
  const [fCurrencyCode, setFCurrencyCode] = useState("LAK");
  const [fExpDate, setFExpDate] = useState("");
  const [fPayDeadline, setFPayDeadline] = useState("");
  const [fCrossBorder, setFCrossBorder] = useState(false);
  const [fOrigin, setFOrigin] = useState("");
  const [fDest, setFDest] = useState("LA");
  const [fContractNo, setFContractNo] = useState("");
  const [fContractUrls, setFContractUrls] = useState<string[]>([]);  // G134：多合同附件
  const [fContractNote, setFContractNote] = useState("");
  const [fRemark, setFRemark] = useState("");
  const [formItems, setFormItems] = useState<OrderItem[]>(() => blankRows());

  const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "" : "";
  const hdr = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // 新建模式：预填上次公司/项目/供应商（连续建单多为同一组；可改）
  useEffect(() => {
    if (orderId) return;
    const last = readLastScope();
    setFCompanyCode(last.companyCode ?? "");
    setFCompanyName(last.companyName ?? "");
    setFProjectCode(last.projectCode ?? "");
    setFProjectName(last.projectName ?? "");
    setFSupplierCode(last.supplierCode ?? "");
    setFSupplierName(last.supplierName ?? "");
    setFOrigin("CN");
  }, [orderId]);

  // 编辑模式：按 id 载入
  const loadForEdit = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_ORDERS}/${orderId}`, { headers: hdr });
      if (!res.ok) throw new Error(await res.text());
      const row: PurchaseOrder = await res.json();
      setFSubject(row.subject ?? "");
      setFCompanyCode(row.companyCode ?? "");
      setFCompanyName(row.companyName ?? "");
      setFProjectCode(row.projectCode ?? "");
      setFProjectName(row.projectName ?? "");
      setFSupplierCode(row.supplierCode ?? "");
      setFSupplierName(row.supplierName ?? "");
      setFPurchaseType(row.purchaseType ?? "MATERIAL");
      setFCurrencyCode(row.currencyCode ?? "LAK");
      setFExpDate(row.expectedDate ?? "");
      setFPayDeadline(row.payDeadline ?? "");
      setFCrossBorder(row.crossBorderFlag ?? false);
      setFContractNo(row.contractNo ?? "");
      setFContractUrls(parseContractUrls(row.contractUrl));
      setFContractNote(row.contractNote ?? "");
      setFRemark(row.remark ?? "");
      setFormItems(row.items?.length ? row.items.map(i => ({ ...i })) : [emptyItem()]);
    } catch {
      toast.error(t('prc2.load_order_failed', '加载采购订单失败'));
    } finally {
      setLoading(false);
    }
  }, [orderId]); // eslint-disable-line

  useEffect(() => { if (orderId) loadForEdit(); }, [orderId, loadForEdit]);

  function setItemField(idx: number, field: keyof OrderItem, value: string) {
    setFormItems(prev => {
      const next = prev.map((it, i) => i === idx ? {
        ...it,
        [field]: value
      } : it);
      if (field === "qty" || field === "unitPrice") {
        const it = next[idx];
        const qty = parseFloat(String(it.qty)) || 0;
        const price = parseFloat(String(it.unitPrice)) || 0;
        next[idx] = {
          ...it,
          amount: String(Math.round(qty * price * 100) / 100)
        };
      }
      return next;
    });
  }

  async function handleSave() {
    if (!fSubject.trim()) {
      toast.error(t('prc2.please_fill_subject', '请填写采购主题'));
      return;
    }
    if (!fCompanyCode.trim()) {
      toast.error(t('prc2.please_fill_company_code', '请填写公司代码'));
      return;
    }
    if (!fSupplierCode.trim()) {
      toast.error(t('prc2.please_fill_supplier_code', '请填写供应商代码'));
      return;
    }
    // G95-D：只取已填物料的行（默认多给的空行自动忽略，不卡提交）
    const filledItems = formItems.filter(it => it.itemName.trim());
    if (filledItems.length === 0) {
      toast.error(t('prc2.please_fill_one_item', '请至少填写一行物料明细'));
      return;
    }
    if (filledItems.some(it => !it.qty || parseFloat(String(it.qty)) <= 0)) {
      toast.error(t('prc2.qty_must_positive', '已填物料的数量必须大于 0'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        subject: fSubject.trim(),
        companyCode: fCompanyCode.trim(),
        companyName: fCompanyName.trim(),
        projectCode: fProjectCode.trim() || undefined,
        projectName: fProjectName.trim() || undefined,
        supplierCode: fSupplierCode.trim(),
        supplierName: fSupplierName.trim(),
        purchaseType: fPurchaseType,
        currencyCode: fCurrencyCode,
        expectedDate: fExpDate || undefined,
        payDeadline: fPayDeadline || undefined,
        crossBorderFlag: fCrossBorder,
        originCountry: fCrossBorder ? fOrigin : undefined,
        destinationCountry: fCrossBorder ? fDest : undefined,
        contractNo: fContractNo.trim() || undefined,
        contractUrl: fContractUrls.length ? JSON.stringify(fContractUrls) : undefined,
        contractNote: fContractNote.trim() || undefined,
        remark: fRemark.trim() || undefined,
        items: filledItems.map(it => ({
          itemCode: it.itemCode?.trim() || undefined,
          itemName: it.itemName.trim(),
          spec: it.spec?.trim() || undefined,
          productCode: it.productCode?.trim() || undefined,   // G85-C
          gradeCode: it.gradeCode?.trim() || undefined,       // G85-C
          qty: parseFloat(String(it.qty)),
          unit: it.unit?.trim() || undefined,
          unitPrice: parseFloat(String(it.unitPrice)) || 0,
          amount: parseFloat(String(it.amount)) || 0,
          warehouseCode: it.warehouseCode?.trim() || undefined
        }))
      };
      const url = editing ? `${API_ORDERS}/${orderId}` : API_ORDERS;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: hdr,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? t('prc2.save_failed', '保存失败'));
      }
      // G95-D：记住本次公司/项目/供应商，下次新建默认带出
      writeLastScope({ companyCode: fCompanyCode.trim(), companyName: fCompanyName.trim(), projectCode: fProjectCode.trim(), projectName: fProjectName.trim(), supplierCode: fSupplierCode.trim(), supplierName: fSupplierName.trim() });
      toast.success(editing ? t('prc2.save_success', '保存成功') : t('prc2.order_created', '采购订单已创建'));
      router.push("/procurement2/orders");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('prc2.save_failed', '保存失败'));
    } finally {
      setSaving(false);
    }
  }

  function applyContractAutofill(suggestions: DocumentAutofillSuggestion[]) {
    let applied = 0;
    for (const suggestion of suggestions) {
      if (suggestion.field === "lineItems" && suggestion.value) {
        const rows = parseLineItemSuggestions(suggestion.value);
        if (rows.length) {
          applyLineItemSuggestions(rows);
          applied += rows.length;
        }
        continue;
      }
      if (suggestion.field === "contractNo" && suggestion.value && !fContractNo.trim()) {
        setFContractNo(suggestion.value);
        applied += 1;
      }
      if (suggestion.field === "contractNote" && suggestion.value) {
        setFContractNote(prev => prev.trim() ? prev : suggestion.value);
        applied += 1;
      }
      if (suggestion.field === "subject" && suggestion.value && !fSubject.trim()) {
        setFSubject(suggestion.value);
        applied += 1;
      }
      if (suggestion.field === "currencyCode" && suggestion.value) {
        setFCurrencyCode(suggestion.value);
        applied += 1;
      }
      if (suggestion.field === "expectedDate" && suggestion.value && !fExpDate) {
        setFExpDate(suggestion.value);
        applied += 1;
      }
      if (suggestion.field === "payDeadline" && suggestion.value && !fPayDeadline) {
        setFPayDeadline(suggestion.value);
        applied += 1;
      }
    }
    toast.success(applied ? `${t('prc2.autofilled_prefix', '已回填')} ${applied} ${t('prc2.autofilled_suffix', '项合同信息')}` : t('prc2.no_autofill_fields', '当前建议未覆盖可回填字段'));
  }

  function parseLineItemSuggestions(value: string): OrderItem[] {
    try {
      const parsed = JSON.parse(value) as ContractLineItemSuggestion[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(row => {
          const qty = row.qty ? String(row.qty).replace(/,/g, "") : "";
          const unitPrice = row.unitPrice ? String(row.unitPrice).replace(/,/g, "") : "";
          const amount = row.amount ? String(row.amount).replace(/,/g, "") : "";
          return {
            itemName: String(row.itemName ?? "").trim(),
            spec: String(row.spec ?? "").trim(),
            qty,
            unit: String(row.unit ?? "").trim(),
            unitPrice,
            amount: amount || (qty && unitPrice ? String(Math.round(Number(qty) * Number(unitPrice) * 100) / 100) : ""),
          };
        })
        .filter(row => row.itemName);
    } catch {
      return [];
    }
  }

  function applyLineItemSuggestions(rows: OrderItem[]) {
    setFormItems(prev => {
      const existingFilled = prev.filter(row => row.itemName.trim());
      const blanks = prev.filter(row => !row.itemName.trim());
      const merged = [...existingFilled, ...rows].map(row => ({ ...emptyItem(), ...row }));
      const minRows = Math.max(3, merged.length + Math.max(0, blanks.length - rows.length));
      while (merged.length < minRows) merged.push(emptyItem());
      return merged;
    });
  }

  if (loading) return <div className={u.emptyCenter}>{t('prc2.loading', '加载中…')}</div>;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: 88 }}>
      <div className={s.formSection}>{t('prc2.basic_info', '基础信息')}</div>
      <div className={s.fieldRow}>
        <div className={s.field} style={{
          gridColumn: "1 / -1"
        }}>
          <label className={s.lbl}>{t('prc2.purchase_subject', '采购主题')} *</label>
          <input className={s.inp} value={fSubject} onChange={e => setFSubject(e.target.value)} placeholder={t('prc2.purchase_subject', '采购主题')} />
        </div>
      </div>
      {/* G95：公司/项目并排——选中即得，名称由 onPick 后台带出，去掉冗余只读名称框 */}
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.company', '公司')} *</label>
          {/* G4-B：公司主数据，DataScope 自动过滤 */}
          {/* G95-B：换公司清空项目（项目属于公司，避免跨公司错挂） */}
          <CompanySelector value={fCompanyCode} onChange={v => { setFCompanyCode(v); setFProjectCode(""); setFProjectName(""); }} onPick={o => setFCompanyName(o?.label ?? "")} disabled={editing} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.project', '项目')}</label>
          {/* G4-B：项目主数据；G95-B 按所属公司过滤（先选公司） */}
          <ProjectSelector value={fProjectCode} onChange={setFProjectCode} onPick={o => setFProjectName(o?.raw?.project_name ?? o?.raw?.projectName ?? o?.label ?? "")} companyCode={fCompanyCode || undefined} />
        </div>
      </div>

      <div className={s.formSection} style={{
        marginTop: 12
      }}>{t('prc2.supplier_and_attrs', '供应商 & 采购属性')}</div>
      {/* G166：紧凑化——供应商&采购属性改满 2 列 */}
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.supplier', '供应商')} *</label>
          {/* G4-B：供应商主数据(仅 ACTIVE)，自动带出名称 */}
          <SupplierSelector value={fSupplierCode} onChange={setFSupplierCode} onPick={o => setFSupplierName(o?.raw?.name ?? o?.label ?? "")} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.purchase_type', '采购类型')}</label>
          {/* G4-B：采购类型枚举来自 sys_dict(PRC_PURCHASE_TYPE) */}
          <DictSelect dictType="PRC_PURCHASE_TYPE" value={fPurchaseType} onChange={setFPurchaseType} allowEmpty={false} />
        </div>
      </div>
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.currency', '货币')}</label>
          {/* G4-B：货币枚举来自 sys_dict(SYS_CURRENCY) */}
          <DictSelect dictType="SYS_CURRENCY" value={fCurrencyCode} onChange={setFCurrencyCode} allowEmpty={false} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.expected_arrival_date', '期望到货日')}</label>
          <input type="date" className={s.inp} value={fExpDate} onChange={e => setFExpDate(e.target.value)} />
        </div>
      </div>
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.pay_deadline_date', '付款截止日')}</label>
          <input type="date" className={s.inp} value={fPayDeadline} onChange={e => setFPayDeadline(e.target.value)} />
        </div>
        <div className={s.field} />
      </div>

      <div className={s.formSection} style={{
        marginTop: 12
      }}>{t('prc2.logistics_info_optional', '物流信息（可选）')}</div>
      <div className={s.field}>
        <label style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          cursor: "pointer"
        }}>
          <input type="checkbox" checked={fCrossBorder} onChange={e => setFCrossBorder(e.target.checked)} />
          {t('prc2.cross_border_purchase', '跨境采购')}
        </label>
      </div>
      {fCrossBorder && <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.origin_country', '来源国家')}</label>
          <DictSelect dictType="SYS_COUNTRY" value={fOrigin} onChange={setFOrigin} allowEmpty />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.dest_country', '目的国家')}</label>
          <DictSelect dictType="SYS_COUNTRY" value={fDest} onChange={setFDest} allowEmpty />
        </div>
      </div>}

      <div className={s.formSection} style={{
        marginTop: 12
      }}>{t('prc2.contract_info_optional', '合同信息（可选）')}</div>
      <div className={s.fieldRow} style={{ alignItems: "start" }}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.contract_no', '合同号')}</label>
          <input className={s.inp} value={fContractNo} onChange={e => setFContractNo(e.target.value)} placeholder="CT2-..." />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.contract_attachment', '合同附件')}</label>
          {/* G4-B：禁止 URL 文本框，使用统一附件上传组件 */}
          <AttachmentUploader value={fContractUrls} onChange={setFContractUrls} label={t('prc2.upload_contract_label', '上传合同/付款申请等附件（可多个，PDF/图片 ≤15MB）')} />
          <DocumentAutofillPanel
            fileRefs={fContractUrls}
            purpose="PROCUREMENT_CONTRACT"
            fields={["subject", "supplierName", "contractNo", "currencyCode", "totalAmount", "expectedDate", "payDeadline", "contractNote", "lineItems"]}
            onApply={applyContractAutofill}
            title={t('prc2.recognize_contract', '识别合同信息')}
            helperText={t('prc2.autofill_helper', '先审核再回填到本页已有字段和采购明细；不新增文本框。')}
            reviewTitle={t('prc2.contract_recognize_result', '合同识别结果（请人工审核）')}
            applyButtonLabel={t('prc2.confirm_autofill_to_order', '确认选中结果并回填到采购单')}
          />
        </div>
      </div>
      {/* G166：合同摘要 + 备注 并排两列 */}
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.contract_summary', '合同摘要')}</label>
          <textarea className={s.textarea} rows={1} value={fContractNote} onChange={e => setFContractNote(e.target.value)} placeholder={t('prc2.contract_summary_placeholder', '选填：合同关键条款摘要（金额/账期/交付等）')} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.remark', '备注')}</label>
          <textarea className={s.textarea} rows={1} value={fRemark} onChange={e => setFRemark(e.target.value)} placeholder={t('prc2.remark_placeholder', '选填：补充说明')} />
        </div>
      </div>

      {/* 明细行 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 12,
        marginBottom: 6
      }}>
        <span className={s.formSection} style={{
          margin: 0
        }}>{t('prc2.purchase_detail', '采购明细')}（{formItems.length} {t('prc2.rows_unit_line', '行')}）</span>
        <button type="button" className={s.btnSecondary} style={{
          padding: "3px 10px",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 4
        }} onClick={() => setFormItems(p => [...p, emptyItem()])}>
          <Plus size={12} /> {t('prc2.add_row', '添加行')}
        </button>
      </div>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "var(--bg-muted)",
        color: "var(--text-secondary)",
        fontSize: 12
      }}>
        <Search size={13} />
        <span>{t('prc2.material_search_hint', '物料名称支持快速搜索；未找到可直接新建，并自动带回规格、单位。')}</span>
      </div>
      {/* G136：单位建议项（含工程/服务类单位）——datalist 仅建议、仍可自由输入 */}
      <datalist id="po-unit-options">
        {["项", "次", "套", "式", "项目", "工程", "m²", "m³", "米", "工日", "人天", "月", "批", "件", "台", "套餐", "kg", "吨", "桶", "袋", "箱", "张", "瓶", "支", "盒"].map(unit => <option key={unit} value={unit} />)}
      </datalist>
      <div style={{
        overflowX: "auto",
        border: "1px solid var(--border)",
        borderRadius: 6
      }}>
        <table className={s.table} style={{ fontSize: 12 }}>
          <thead>
            <tr style={{
              background: "var(--bg-muted)"
            }}>
              <th style={thStyle}>{t('prc2.item_name', '物料名称')} *</th>
              <th style={thStyle}>{t('prc2.spec', '规格')}</th>
              <th style={thStyle}>{t('prc2.qty', '数量')} *</th>
              <th style={thStyle}>{t('prc2.unit', '单位')}</th>
              <th style={thStyle}>{t('prc2.unit_price', '单价')} *</th>
              <th style={{
                ...thStyle,
                textAlign: "right"
              }}>{t('prc2.subtotal', '小计')}</th>
              <th style={thStyle}>{t('prc2.warehouse', '仓库')}</th>
              <th style={{
                ...thStyle,
                width: 28
              }}></th>
            </tr>
          </thead>
          <tbody>
            {formItems.map((it, idx) => <tr key={idx} style={{
              borderBottom: "1px solid var(--border)"
            }}>
              <td style={tdStyle}>
                {/* 物料组合框：可搜索 + 找不到就地新建，自动带出 material_code/spec/unit */}
                <MaterialPicker value={it.itemName ?? ""} onChange={name => setItemField(idx, "itemName", name)} onPickRaw={m => {
                  setItemField(idx, "itemCode", m?.material_code ?? "");
                  setItemField(idx, "spec", m?.spec ?? "");
                  setItemField(idx, "unit", m?.unit ?? "");
                  if (m?.material_code) toast.success(`${t('prc2.material_selected_prefix', '已选择物料：')}${m.material_name}`);
                }} style={{
                  minWidth: 200,
                  fontSize: 12,
                  padding: "3px 6px"
                }} />
              </td>
              <td style={tdStyle}><input style={{
                ...cellInp,
                width: 80,
                background: "var(--bg-muted)"
              }} value={it.spec ?? ""} readOnly placeholder={t('prc2.spec_auto_filled', '由物料自动带出')} /></td>
              <td style={tdStyle}><input style={{
                ...cellInp,
                width: 70
              }} type="number" min="0" value={it.qty} onChange={e => setItemField(idx, "qty", e.target.value)} /></td>
              <td style={tdStyle}><input list="po-unit-options" style={{
                ...cellInp,
                width: 50
              }} value={it.unit ?? ""} onChange={e => setItemField(idx, "unit", e.target.value)} placeholder={t('prc2.unit', '单位')} /></td>
              <td style={tdStyle}><input style={{
                ...cellInp,
                width: 90
              }} type="number" min="0" value={it.unitPrice} onChange={e => setItemField(idx, "unitPrice", e.target.value)} /></td>
              <td style={{
                ...tdStyle,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                color: "var(--text-secondary)"
              }}>
                {it.amount ? Number(it.amount).toLocaleString("zh-CN") : "—"}
              </td>
              <td style={tdStyle}>
                {/* G4-B：仓库主数据，按当前公司过滤 */}
                <WarehouseSelector value={it.warehouseCode ?? ""} onChange={code => setItemField(idx, "warehouseCode", code)} companyCode={fCompanyCode} style={{
                  minWidth: 150,
                  fontSize: 12,
                  padding: "3px 6px"
                }} />
              </td>
              <td style={tdStyle}>
                <button type="button" style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "var(--status-danger)",
                  padding: "0 2px"
                }} onClick={() => setFormItems(p => p.length > 1 ? p.filter((_, i) => i !== idx) : p)}>
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>)}
          </tbody>
          <tfoot>
            <tr style={{
              borderTop: "2px solid var(--border)"
            }}>
              <td colSpan={5} style={{
                textAlign: "right",
                padding: "6px 8px",
                fontSize: 12,
                fontWeight: 600
              }}>
                {t('prc2.total_label', '合计')}（{fCurrencyCode}）
              </td>
              <td style={{
                textAlign: "right",
                padding: "6px 8px",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums"
              }}>
                {formItems.reduce((sum, it) => sum + (parseFloat(String(it.amount)) || 0), 0).toLocaleString("zh-CN")}
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
        <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={() => router.push("/procurement2/orders")}>
          <ArrowLeft size={14} /> {t('prc2.back', '返回')}
        </button>
        <button type="button" className={`${s.btnPrimary} ${u.flexRow}`} onClick={handleSave} disabled={saving}>
          <Save size={14} /> {saving ? t('prc2.saving', '保存中…') : editing ? t('prc2.save', '保存') : t('prc2.save_draft', '保存草稿')}
        </button>
      </div>
    </div>
  );
}

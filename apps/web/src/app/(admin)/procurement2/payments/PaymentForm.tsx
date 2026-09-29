"use client";

// G149：付款单新建/编辑表单——从原列表页抽屉抽出为「整页表单」组件。
//   · 新建：/procurement2/payments/new        → <PaymentForm />
//   · 编辑：/procurement2/payments/[id]/edit   → <PaymentForm paymentId={id} />
//   分区清晰、明细表带合计、AP 选择浮层、股东代付，不再受抽屉宽度限制。

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ModalV2 } from "@/components/design-system/dialogs/ModalV2";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import { Plus, Trash2, CreditCard, DollarSign, Save, ArrowLeft } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from '@/contexts/LanguageContext';
import { DictSelect } from "@/components/shared-selectors/DictSelect";
import { CompanySelector, CashAccountSelector, SupplierSelector, ShareholderSelector, ProjectSelector } from "@/components/shared-selectors/MasterDataSelectors";
import { ManagedAttachmentUploader } from "@/components/design-system";
import { tableInputCell } from "@/components/design-system/cockpit-styles";
import { parseFinanceApPaymentPrefill } from "@/lib/finance-ap-payment-prefill";

// ── 类型 ──────────────────────────────────────────────────────────────────────
interface ApLedger {
  id: string;
  apNo: string;
  poNo?: string;
  supplierName?: string;
  currencyCode?: string;
  amountOriginal: number;
  paidAmountOriginal: number;
  balanceAmountOriginal: number;
  status: string;
  dueDate?: string;
  companyId?: string;
  companyCode?: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
}
interface Allocation {
  id?: string;
  poId?: string;
  poNo?: string;
  apId?: string;
  apNo?: string;
  companyCode?: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
  allocatedAmountOriginal: number | string;
  allocatedAmountBase?: number | string;
  remark?: string;
}
interface Payment {
  id: string;
  payNo: string;
  paymentDate?: string;
  companyCode?: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
  payerType: string;
  payerName: string;
  payerAccount?: string;
  payeeName?: string;
  currencyCode: string;
  amountOriginal: number | string;
  exchangeRate: number | string;
  amountBase?: number | string;
  baseCurrency?: string;
  paymentMethod?: string;
  fundNature?: string;
  isShareholderPayment?: boolean;
  shareholderId?: string;
  shareholderName?: string;
  status: string;
  voucherUrl?: string;
  remark?: string;
  allocations?: Allocation[];
}

const API_PAY = "/api/v2/procurement/payments";
const emptyAlloc = (): Allocation => ({ allocatedAmountOriginal: "", allocatedAmountBase: "", poNo: "", apId: "", apNo: "" });
function fmtDate(d?: string) { return d ? d.slice(0, 10) : "—"; }

const thStyle: React.CSSProperties = { padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "5px 8px", verticalAlign: "middle", fontSize: 12 };
const cellInp: React.CSSProperties = tableInputCell;

export default function PaymentForm({ paymentId }: { paymentId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const editing = !!paymentId;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  // 表单字段
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCompCode, setFormCompCode] = useState("");
  const [formCompName, setFormCompName] = useState("");
  const [formProjCode, setFormProjCode] = useState("");
  const [formProjName, setFormProjName] = useState("");
  const [formPayerType, setFormPayerType] = useState("COMPANY");
  const [formPayerName, setFormPayerName] = useState("");
  const [formPayerCode, setFormPayerCode] = useState("");
  const [formPayerAccount, setFormPayerAccount] = useState("");
  const [formPayeeName, setFormPayeeName] = useState("");
  const [formCurrency, setFormCurrency] = useState("CNY");
  const [formExchangeRate, setFormExchangeRate] = useState("1");
  const [formMethod, setFormMethod] = useState("BANK");
  const [formNature, setFormNature] = useState("NORMAL");
  const [formIsShareholder, setFormIsShareholder] = useState(false);
  const [formShareholderId, setFormShareholderId] = useState("");
  const [formShareholderName, setFormShareholderName] = useState("");
  const [formVoucherUrl, setFormVoucherUrl] = useState("");
  const [formRemark, setFormRemark] = useState("");
  const [formAllocs, setFormAllocs] = useState<Allocation[]>([emptyAlloc()]);
  const [prefillQuery, setPrefillQuery] = useState("");
  const [prefillNotice, setPrefillNotice] = useState("");

  // AP 选择浮层
  const [apModalOpen, setApModalOpen] = useState(false);
  const [apList, setApList] = useState<ApLedger[]>([]);
  const [apAllocIdx, setApAllocIdx] = useState(0);

  const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "" : "";
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 编辑模式：按 id 载入
  const loadForEdit = useCallback(async () => {
    if (!paymentId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_PAY}/${paymentId}`, { headers: hdr });
      if (!res.ok) throw new Error(await res.text());
      const row: Payment = await res.json();
      setFormDate(row.paymentDate?.slice(0, 10) ?? "");
      setFormCompCode(row.companyCode ?? "");
      setFormCompName(row.companyName ?? "");
      setFormProjCode(row.projectCode ?? "");
      setFormProjName(row.projectName ?? "");
      setFormPayerType(row.payerType ?? "COMPANY");
      setFormPayerName(row.payerName ?? "");
      setFormPayerCode("");
      setFormPayerAccount(row.payerAccount ?? "");
      setFormPayeeName(row.payeeName ?? "");
      setFormCurrency(row.currencyCode ?? "CNY");
      setFormExchangeRate(String(row.exchangeRate ?? "1"));
      setFormMethod(row.paymentMethod ?? "BANK");
      setFormNature(row.fundNature ?? "NORMAL");
      setFormIsShareholder(row.isShareholderPayment ?? false);
      setFormShareholderId(row.shareholderId ?? "");
      setFormShareholderName(row.shareholderName ?? "");
      setFormVoucherUrl(row.voucherUrl ?? "");
      setFormRemark(row.remark ?? "");
      setFormAllocs(row.allocations?.length ? row.allocations.map(a => ({ ...a })) : [emptyAlloc()]);
    } catch {
      toast.error(t('prc2.load_payment_failed', "加载付款单失败"));
    } finally {
      setLoading(false);
    }
  }, [paymentId]); // eslint-disable-line

  useEffect(() => { if (paymentId) loadForEdit(); }, [paymentId, loadForEdit]);

  useEffect(() => {
    if (!editing && typeof window !== "undefined") setPrefillQuery(window.location.search);
  }, [editing]);

  useEffect(() => {
    if (editing) return;
    const prefill = parseFinanceApPaymentPrefill(new URLSearchParams(prefillQuery));
    if (!prefill) return;

    setFormCompCode(prefill.companyCode);
    setFormCompName(prefill.companyName);
    setFormProjCode(prefill.projectCode);
    setFormProjName(prefill.projectName);
    setFormPayerType("COMPANY");
    setFormPayerCode(prefill.companyCode);
    setFormPayerName(prefill.companyName || prefill.companyCode);
    setFormPayerAccount("");
    setFormPayeeName(prefill.supplierName || prefill.supplierCode);
    setFormCurrency(prefill.currencyCode);
    setFormAllocs([{
      apNo: prefill.apNo,
      poNo: prefill.sourceNo,
      companyCode: prefill.companyCode,
      companyName: prefill.companyName,
      projectCode: prefill.projectCode,
      projectName: prefill.projectName,
      allocatedAmountOriginal: prefill.balanceAmountOriginal,
      allocatedAmountBase: "",
    }]);
    setFormRemark(t('prc2.prefill_from_finance_ap_remark', '由应付账款发起付款') + `：${prefill.apNo}`);
    setPrefillNotice(t('prc2.prefill_from_finance_ap', '已从应付账款带入待付发票') + `：${prefill.apNo}`);
  }, [editing, prefillQuery, t]);

  // 分摊行操作
  function setAllocField(idx: number, field: keyof Allocation, value: string) {
    setFormAllocs(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  }
  function addAllocRow() { setFormAllocs(p => [...p, emptyAlloc()]); }
  function removeAllocRow(idx: number) { setFormAllocs(p => p.length > 1 ? p.filter((_, i) => i !== idx) : p); }
  const totalAllocOriginal = formAllocs.reduce((sum, a) => sum + (parseFloat(String(a.allocatedAmountOriginal)) || 0), 0);

  // AP 选择
  async function openApModal(idx: number) {
    setApAllocIdx(idx);
    try {
      const res = await fetch(`/api/v2/procurement/ap-ledger/open`, { headers: hdr, cache: "no-store" });
      if (res.ok) setApList(await res.json());
    } catch { setApList([]); }
    setApModalOpen(true);
  }
  // G150：剔除其他分摊行已选过的应付单，避免同一张被重复分摊（选了即从可选列表移除）
  const usedApIds = new Set(formAllocs.map((a, i) => (i !== apAllocIdx && a.apId ? String(a.apId) : "")).filter(Boolean));
  const apListForPick = apList.filter(ap => !usedApIds.has(String(ap.id)));
  function selectAp(ap: ApLedger) {
    setFormAllocs(prev => prev.map((a, i) => i === apAllocIdx ? {
      ...a, apId: ap.id, apNo: ap.apNo, poNo: ap.poNo ?? "", projectCode: ap.projectCode ?? "",
      companyCode: ap.companyCode ?? a.companyCode, companyName: ap.companyName ?? a.companyName,
      projectName: ap.projectName ?? a.projectName,
      allocatedAmountOriginal: String(ap.balanceAmountOriginal),
    } : a));
    setApModalOpen(false);
  }

  // 保存
  async function handleSave() {
    if (!formDate) { toast.error(t('prc2.err_select_pay_date', "请选择付款日期")); return; }
    if (!formPayerName.trim()) { toast.error(t('prc2.err_fill_payer', "请填写付款人")); return; }
    if (!formCurrency) { toast.error(t('prc2.err_select_currency', "请选择货币")); return; }
    if (formAllocs.some(a => !a.allocatedAmountOriginal || parseFloat(String(a.allocatedAmountOriginal)) <= 0)) {
      toast.error(t('prc2.err_alloc_gt_zero', "每条分摊金额必须 > 0")); return;
    }
    setSaving(true);
    try {
      const rate = parseFloat(formExchangeRate) || 1;
      const amountOriginal = Number(totalAllocOriginal.toFixed(2));
      if (!(amountOriginal > 0)) { toast.error(t('prc2.err_amount_gt_zero', "付款金额必须大于 0，请先添加并填写分摊金额")); setSaving(false); return; }
      const body = {
        amountOriginal,
        amountBase: Number((amountOriginal * rate).toFixed(2)),
        paymentDate: formDate,
        companyCode: formCompCode.trim() || undefined,
        companyName: formCompName.trim() || undefined,
        projectCode: formProjCode.trim() || undefined,
        projectName: formProjName.trim() || undefined,
        payerType: formPayerType,
        payerName: formPayerName.trim(),
        payerAccount: formPayerAccount.trim() || undefined,
        payeeName: formPayeeName.trim() || undefined,
        currencyCode: formCurrency,
        exchangeRate: rate,
        paymentMethod: formMethod,
        fundNature: formNature,
        isShareholderPayment: formIsShareholder,
        shareholderId: formIsShareholder ? formShareholderId.trim() || undefined : undefined,
        shareholderName: formIsShareholder ? formShareholderName.trim() || undefined : undefined,
        voucherUrl: formVoucherUrl.trim() || undefined,
        remark: formRemark.trim() || undefined,
        allocations: formAllocs.map(a => ({
          poId: a.poId || undefined,
          poNo: a.poNo || undefined,
          apId: a.apId || undefined,
          apNo: a.apNo || undefined,
          companyCode: a.companyCode || undefined,
          companyName: a.companyName || undefined,
          projectCode: a.projectCode || undefined,
          projectName: a.projectName || undefined,
          allocatedAmountOriginal: parseFloat(String(a.allocatedAmountOriginal)),
          allocatedAmountBase: parseFloat(String(a.allocatedAmountOriginal)) * rate,
          remark: a.remark || undefined,
        })),
      };
      const url = editing ? `${API_PAY}/${paymentId}` : API_PAY;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: hdr, body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? t('prc2.save_failed', "保存失败"));
      }
      toast.success(editing ? t('prc2.save_success', "保存成功") : t('prc2.payment_created', "付款单已创建"));
      router.push("/procurement2/payments");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('prc2.save_failed', "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={u.emptyCenter}>{t('prc2.loading', "加载中…")}</div>;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", paddingBottom: 96 }}>
      {prefillNotice && (
        <div style={{
          marginBottom: 16,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid color-mix(in srgb, var(--status-info) 35%, var(--border))",
          background: "color-mix(in srgb, var(--status-info) 9%, var(--bg-card))",
          color: "var(--text-primary)",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <CreditCard size={14} color="var(--status-info)" />
          <span>{prefillNotice}</span>
        </div>
      )}

      {/* 基础信息 */}
      <div className={s.formSection}>{t('prc2.basic_info', "基础信息")}</div>
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.payment_date', "付款日期")} *</label>
          <input type="date" className={s.inp} value={formDate} onChange={e => setFormDate(e.target.value)} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.currency', "货币")} *</label>
          <DictSelect dictType="SYS_CURRENCY" value={formCurrency} onChange={setFormCurrency} allowEmpty={false} />
        </div>
      </div>
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.company', "公司")}</label>
          <CompanySelector value={formCompCode} onChange={v => {
            setFormCompCode(v);
            setFormShareholderId(""); setFormShareholderName("");
            if (formPayerType === "SHAREHOLDER") { setFormPayerName(""); setFormPayerCode(""); }
            setFormPayerAccount("");
          }} onPick={o => setFormCompName(o?.label ?? "")} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.project', "项目")}</label>
          <ProjectSelector
            value={formProjCode}
            onChange={setFormProjCode}
            onPick={o => setFormProjName(o?.raw?.projectName ?? o?.raw?.project_name ?? o?.label ?? "")}
            companyCode={formCompCode || undefined}
          />
        </div>
      </div>

      {/* 付款方信息 */}
      <div className={s.formSection} style={{ marginTop: 20 }}>{t('prc2.payer_info', "付款方信息")}</div>
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.payer_type', "付款方类型")}</label>
          <DictSelect dictType="FIN_PAYER_TYPE" value={formPayerType} onChange={v => {
            setFormPayerType(v);
            setFormIsShareholder(v === "SHAREHOLDER");
            setFormPayerName(""); setFormPayerCode("");
            if (v !== "SHAREHOLDER") { setFormShareholderId(""); setFormShareholderName(""); }
          }} allowEmpty={false} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.payer_name_label', "付款人")} * <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text-muted)" }}>{t('prc2.payer_name_hint', "（出资/付款主体，非经办人）")}</span></label>
          {formPayerType === "COMPANY" ? (
            <CompanySelector value={formPayerCode} onChange={setFormPayerCode} onPick={o => setFormPayerName(o?.label ?? "")} />
          ) : formPayerType === "SHAREHOLDER" ? (
            <ShareholderSelector value={formShareholderId} companyCode={formCompCode || undefined}
              onChange={v => { setFormShareholderId(v); setFormPayerCode(v); }}
              onPick={o => {
                const nm = o?.raw?.shareholderName ?? o?.raw?.shareholder_name ?? o?.raw?.name ?? o?.label ?? "";
                setFormShareholderName(nm); setFormPayerName(nm);
              }} />
          ) : (
            <input className={s.inp} value={formPayerName} onChange={e => setFormPayerName(e.target.value)} placeholder={t('prc2.payer_name_ph', "付款人姓名/账户名（借款方/内部往来）")} />
          )}
        </div>
      </div>
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.payer_account', "付款账户（按公司 + 付款币种过滤）")}</label>
          <CashAccountSelector value={formPayerAccount} onChange={setFormPayerAccount} currencyCode={formCurrency || undefined} companyCode={formCompCode || undefined} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.payee_supplier', "收款方（供应商）")}</label>
          <SupplierSelector value={formPayeeName} onChange={setFormPayeeName} />
        </div>
      </div>

      {/* 金额 & 方式 */}
      <div className={s.formSection} style={{ marginTop: 20 }}>{t('prc2.amount_and_method', "金额 & 方式")}</div>
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.rate_to_cny', "汇率（对 CNY）")}</label>
          <input type="number" step="0.0001" min="0" className={s.inp} value={formExchangeRate} onChange={e => setFormExchangeRate(e.target.value)} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.pay_method', "付款方式")}</label>
          <DictSelect dictType="PRC_PAYMENT_METHOD" value={formMethod} onChange={setFormMethod} allowEmpty={false} />
        </div>
      </div>
      <div className={s.fieldRow}>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.fund_nature', "资金性质")}</label>
          <DictSelect dictType="FIN_FUND_NATURE" value={formNature} onChange={setFormNature} allowEmpty={false} />
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.pay_voucher', "付款凭证")}</label>
          <ManagedAttachmentUploader value={formVoucherUrl} onChange={v => setFormVoucherUrl(String(v))} storage="json-string" label={t('prc2.upload_voucher_label', "上传付款凭证（PDF/图片 ≤15MB，可多个）")} />
        </div>
      </div>

      {/* 股东代付 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0" }}>
        <input type="checkbox" id="isShareholder" checked={formIsShareholder} onChange={e => setFormIsShareholder(e.target.checked)} />
        <label htmlFor="isShareholder" style={{ fontSize: 13, cursor: "pointer" }}>{t('prc2.shareholder_proxy_pay', "股东代付（自动记录股东资金池）")}</label>
      </div>
      {formIsShareholder && (formPayerType === "SHAREHOLDER" ? (
        <div className={s.field} style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {t('prc2.shareholder_picked_above', "股东已由上方「付款人」选定")}{formShareholderName ? `：${formShareholderName}` : ""}
        </div>
      ) : (
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.shareholder', "股东")}</label>
          <ShareholderSelector value={formShareholderId} companyCode={formCompCode || undefined} onChange={setFormShareholderId} onPick={o => setFormShareholderName(o?.raw?.shareholderName ?? o?.raw?.shareholder_name ?? o?.label ?? "")} />
        </div>
      ))}

      <div className={s.field}>
        <label className={s.lbl}>{t('prc2.remark', "备注")}</label>
        <textarea className={s.textarea} rows={1} value={formRemark} onChange={e => setFormRemark(e.target.value)} />
      </div>

      {/* 分摊明细 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginTop: 20 }}>
        <span className={s.formSection} style={{ margin: 0 }}>{t('prc2.ap_alloc_detail', "应付分摊明细")}（{formAllocs.length} {t('prc2.unit_rows', "行")}）</span>
        <button type="button" className={s.btnSecondary} style={{ padding: "3px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }} onClick={addAllocRow}><Plus size={12} /> {t('prc2.add_row', "添加行")}</button>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
        <table className={s.table} style={{ fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg-subtle,var(--bg-muted))" }}>
              <th style={thStyle}>{t('prc2.ap_no', "应付单号")}</th>
              <th style={thStyle}>{t('prc2.po_no', "采购订单号")}</th>
              <th style={thStyle}>{t('prc2.project', "项目")}</th>
              <th style={{ ...thStyle, textAlign: "right" }}>{t('prc2.alloc_amount', "分摊金额")}（{formCurrency}）</th>
              <th style={{ ...thStyle, textAlign: "right" }}>{t('prc2.convert_cny', "折算 CNY")}</th>
              <th style={thStyle}>{t('prc2.remark', "备注")}</th>
              <th style={{ ...thStyle, width: 50 }}>{t('prc2.ap_doc', "应付单")}</th>
              <th style={{ ...thStyle, width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {formAllocs.map((alloc, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={tdStyle}><input style={{ ...cellInp, background: "var(--bg-muted)", cursor: "default" }} value={alloc.apNo ?? ""} readOnly placeholder="—" /></td>
                <td style={tdStyle}><input style={{ ...cellInp, width: 120 }} value={alloc.poNo ?? ""} onChange={e => setAllocField(idx, "poNo", e.target.value)} placeholder="PO2-..." /></td>
                <td style={tdStyle}><input style={{ ...cellInp, width: 80 }} value={alloc.projectCode ?? ""} onChange={e => setAllocField(idx, "projectCode", e.target.value)} placeholder={t('prc2.project', "项目")} /></td>
                <td style={tdStyle}><input style={{ ...cellInp, width: 100, textAlign: "right" }} type="number" min="0" value={alloc.allocatedAmountOriginal} onChange={e => setAllocField(idx, "allocatedAmountOriginal", e.target.value)} /></td>
                <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-secondary)" }}>
                  {((parseFloat(String(alloc.allocatedAmountOriginal)) || 0) * (parseFloat(formExchangeRate) || 1)).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
                </td>
                <td style={tdStyle}><input style={{ ...cellInp, width: 80 }} value={alloc.remark ?? ""} onChange={e => setAllocField(idx, "remark", e.target.value)} placeholder={t('prc2.remark', "备注")} /></td>
                <td style={tdStyle}><button type="button" className={s.btnIcon} style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => openApModal(idx)} title={t('prc2.pick_from_open_ap', "从未核销应付账款选择")}><CreditCard size={11} /></button></td>
                <td style={tdStyle}><button type="button" style={{ border: "none", background: "none", cursor: "pointer", color: "var(--status-danger)" }} onClick={() => removeAllocRow(idx)}><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td colSpan={3} style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, fontSize: 12 }}>{t('prc2.total', "合计")}</td>
              <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {formCurrency} {totalAllocOriginal.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </td>
              <td style={{ textAlign: "right", padding: "6px 8px", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                CNY {(totalAllocOriginal * (parseFloat(formExchangeRate) || 1)).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
              </td>
              <td colSpan={3}></td>
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
        <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={() => router.push("/procurement2/payments")}>
          <ArrowLeft size={14} /> {t('prc2.back', "返回")}
        </button>
        <button type="button" className={`${s.btnPrimary} ${u.flexRow}`} onClick={handleSave} disabled={saving}>
          <Save size={14} /> {saving ? t('prc2.saving', "保存中…") : editing ? t('prc2.save', "保存") : t('prc2.save_draft', "保存草稿")}
        </button>
      </div>

      {/* AP 选择浮层 */}
      <ModalV2 open={apModalOpen} onClose={() => setApModalOpen(false)} title={t('prc2.select_open_ap', "选择未核销应付单")} width={960}>
        {apListForPick.length === 0 ? <div style={{ textAlign: "center", padding: 24, color: "var(--text-secondary)" }}>{apList.length === 0 ? t('prc2.empty_open_ap', "暂无未核销应付单") : t('prc2.rest_ap_allocated', "其余应付单已分摊完毕")}</div> : (
          <table className={s.table}>
            <thead>
              <tr>
                <th>{t('prc2.ap_no', "应付单号")}</th><th>{t('prc2.po_no', "采购订单号")}</th><th>{t('prc2.supplier', "供应商")}</th><th>{t('prc2.currency_short', "币种")}</th>
                <th className={u.tar}>{t('prc2.ap_payable', "应付")}</th><th className={u.tar}>{t('prc2.balance', "余额")}</th><th>{t('prc2.due_date', "到期日")}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {apListForPick.map(ap => (
                <tr key={ap.id}>
                  <td>{ap.apNo}</td>
                  <td>{ap.poNo ?? "—"}</td>
                  <td>{ap.supplierName ?? "—"}</td>
                  <td>{ap.currencyCode ?? "—"}</td>
                  <td className={u.tar}>{Number(ap.amountOriginal).toLocaleString()}</td>
                  <td style={{ textAlign: "right", color: "var(--status-warning)", fontWeight: 600 }}>{Number(ap.balanceAmountOriginal).toLocaleString()}</td>
                  <td>{fmtDate(ap.dueDate)}</td>
                  <td style={{ textAlign: "center" }}>
                    <button className={s.btnPrimary} style={{ padding: "5px 16px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }} onClick={() => selectAp(ap)}>{t('prc2.select_this_ap', "选择此单")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ModalV2>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  EyeOff,
  FileText,
  Lock,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { usePermission } from "@/hooks/usePermission";
import { useLanguage } from "@/contexts/LanguageContext";
import styles from "./store-payment.module.css";

const COMPANY_CODE = "COMP-LAO-AGRI";
const CANONICAL_STORE_CODE = "STORE-VTE-001";
const STORE_NAME = "万象直营店";
const LEGACY_STORE_CODE = "ST-VTE-001";

const MENU_ACCOUNT = "MENU_STORE_PAYMENT_ACCOUNT";
const MENU_RECORD = "MENU_STORE_PAYMENT";
const MENU_CONFIRM = "MENU_STORE_PAYMENT_CONFIRM";
const MENU_VOID = "MENU_STORE_PAYMENT_VOID";
const MENU_EXPORT = "MENU_STORE_PAYMENT_EXPORT";

type ListResponse<T> = {
  items?: T[];
  total?: number;
  page?: number;
  pageSize?: number;
};

type StorePaymentAccount = {
  id: string;
  accountCode: string;
  accountName: string;
  companyCode: string;
  storeCode: string;
  qrAttachmentId?: string | null;
  currency: string;
  paymentMethod: string;
  qrAttachmentBound: boolean;
  status: "ACTIVE" | "DISABLED" | string;
  isActive: boolean;
  remark?: string | null;
};

type StorePaymentRecord = {
  id: string;
  paymentNo: string;
  companyCode: string;
  storeCode: string;
  paymentAccountId: string;
  amount: string | number;
  currency: string;
  paymentMethod: string;
  paidAt: string;
  proofAttachmentId?: string | null;
  proofAttachmentBound: boolean;
  proofPreviewAllowed: boolean;
  proofPreviewStatus: string;
  proofDownloadAllowed: boolean;
  proofDownloadStatus: string;
  orderNo?: string | null;
  saleNo?: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "VOIDED" | string;
  submittedBy?: string | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  voidedBy?: string | null;
  voidedAt?: string | null;
  reason?: string | null;
  remark?: string | null;
};

type AttachmentAccess = {
  objectType?: string;
  objectId?: string;
  fileId?: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  status?: string;
  visibility?: string;
  previewAvailable?: boolean;
  downloadAvailable?: boolean;
  accessStatus?: string;
  attachmentBound?: boolean;
  previewAllowed?: boolean;
  previewStatus?: string;
  downloadAllowed?: boolean;
  downloadStatus?: string;
  rawUrl?: string | null;
  reason?: string;
};

type NewRecordForm = {
  paymentAccountId: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paidAt: string;
  proofAttachmentId: string;
  orderNo: string;
  saleNo: string;
  remark: string;
};

type Filters = {
  status: string;
  dateFrom: string;
  dateTo: string;
  submittedBy: string;
  paymentAccountId: string;
  paymentMethod: string;
};

const initialForm = (): NewRecordForm => ({
  paymentAccountId: "",
  amount: "",
  currency: "LAK",
  paymentMethod: "QR",
  paidAt: new Date().toISOString().slice(0, 16),
  proofAttachmentId: "",
  orderNo: "",
  saleNo: "",
  remark: "",
});

const blockedRawRef = (value: string) => {
  const v = value.trim().toLowerCase();
  return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/uploads/") || v.startsWith("uploads/");
};

const protectedAttachmentPath = (attachmentId: string, action: "status" | "preview" | "download") =>
  `/store-payment/attachments/${encodeURIComponent(attachmentId)}/${action}`;

const normalizeAccessStatus = (access?: AttachmentAccess | null) => {
  const value = (access?.accessStatus || access?.previewStatus || access?.downloadStatus || access?.status || "").toLowerCase();
  if (access?.rawUrl) return "unsafe_raw_url";
  if (!access?.attachmentBound && !access?.fileId) return "missing";
  if (["allowed", "active"].includes(value)) return "allowed";
  if (["denied", "forbidden"].includes(value)) return "denied";
  if (["disabled", "inactive"].includes(value)) return "disabled";
  if (["missing", "not_found"].includes(value)) return "missing";
  return value || "access_pending";
};

const accessReasonText = (status: string, reason?: string) => {
  if (reason) return reason;
  const messages: Record<string, string> = {
    allowed: "后端 ACL 已允许，可使用受控端点访问。",
    access_pending: "附件预览待安全授权开通。",
    disabled: "当前文件不可预览或下载。",
    denied: "权限不足，无法访问附件。",
    missing: "文件元数据未配置或文件不存在。",
    unsafe_raw_url: "安全策略禁止裸链接访问。",
  };
  return messages[status] || "当前仅显示受控附件状态。";
};

const getToken = () => {
  if (typeof window === "undefined") return "";
  try {
    const direct = sessionStorage.getItem("phoenix_token");
    if (direct) return direct;
    const local = localStorage.getItem("phoenix_token");
    if (local) return local;
    const user = JSON.parse(sessionStorage.getItem("phoenix_user") || "null");
    if (user?.token) return user.token;
    const localUser = JSON.parse(localStorage.getItem("phoenix_user") || "null");
    return localUser?.token || "";
  } catch {
    return "";
  }
};

async function storePaymentRequest<T = unknown>(
  path: string,
  options: RequestInit & { silent?: boolean } = {},
): Promise<T> {
  const { silent: _silent, ...fetchOptions } = options;
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...fetchOptions.headers,
  };
  const res = await fetch(path, { ...fetchOptions, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err?.message || `请求失败 (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

const fetchProtectedAttachmentStatus = async (attachmentId?: string | null): Promise<AttachmentAccess> => {
  if (!attachmentId?.trim()) {
    return {
      attachmentBound: false,
      previewAvailable: false,
      downloadAvailable: false,
      accessStatus: "missing",
      rawUrl: null,
      reason: "文件元数据未配置",
    };
  }
  if (blockedRawRef(attachmentId)) {
    return {
      fileId: attachmentId,
      attachmentBound: true,
      previewAvailable: false,
      downloadAvailable: false,
      accessStatus: "unsafe_raw_url",
      rawUrl: null,
      reason: "安全策略禁止裸链接访问",
    };
  }
  const data = await storePaymentRequest<AttachmentAccess>(protectedAttachmentPath(attachmentId, "status"), { silent: true });
  return {
    ...data,
    fileId: data.fileId || attachmentId,
    attachmentBound: true,
    rawUrl: data.rawUrl ?? null,
  };
};

const normalizeStoreDisplay = (storeCode?: string | null) => {
  if (!storeCode) return "-";
  if (storeCode === LEGACY_STORE_CODE) return `${CANONICAL_STORE_CODE} / ${STORE_NAME} (legacy alias: ${LEGACY_STORE_CODE})`;
  if (storeCode === CANONICAL_STORE_CODE) return `${CANONICAL_STORE_CODE} / ${STORE_NAME}`;
  return storeCode;
};

const money = (amount: string | number, currency?: string) =>
  `${Number(amount || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ""}`.trim();

const dateText = (value?: string | null) => {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
};

function StatusTag({ status }: { status: string }) {
  const key = (status || "").toUpperCase();
  const label: Record<string, string> = {
    ACTIVE: "启用",
    DISABLED: "停用",
    PENDING_CONFIG: "待配置",
    PENDING: "待确认",
    CONFIRMED: "已确认",
    REJECTED: "已驳回",
    VOIDED: "已作废",
    ACCESS_PENDING: "待授权",
  };
  const cls =
    key === "ACTIVE" || key === "CONFIRMED"
      ? styles.tagSuccess
      : key === "PENDING" || key === "PENDING_CONFIG" || key === "ACCESS_PENDING"
        ? styles.tagWarning
        : key === "REJECTED" || key === "VOIDED" || key === "DISABLED"
          ? styles.tagDanger
          : styles.tagInfo;
  return <span className={`${styles.tag} ${cls}`}>{label[key] || status || "-"}</span>;
}

function PermissionNote({ label, ok }: { label: string; ok: boolean }) {
  return <span className={`${styles.tag} ${ok ? styles.tagSuccess : styles.tagDanger}`}>{label}</span>;
}

export default function StorePaymentPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const accountPerm = usePermission(MENU_ACCOUNT);
  const recordPerm = usePermission(MENU_RECORD);
  const confirmPerm = usePermission(MENU_CONFIRM);
  const voidPerm = usePermission(MENU_VOID);
  const exportPerm = usePermission(MENU_EXPORT);

  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [accounts, setAccounts] = useState<StorePaymentAccount[]>([]);
  const [records, setRecords] = useState<StorePaymentRecord[]>([]);
  const [accountQrAccess, setAccountQrAccess] = useState<Record<string, AttachmentAccess>>({});
  const [accountQrLoading, setAccountQrLoading] = useState<Record<string, boolean>>({});
  const [accountTotal, setAccountTotal] = useState(0);
  const [recordTotal, setRecordTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>({ status: "", dateFrom: "", dateTo: "", submittedBy: "", paymentAccountId: "", paymentMethod: "" });
  const [form, setForm] = useState<NewRecordForm>(() => initialForm());
  const [selected, setSelected] = useState<StorePaymentRecord | null>(null);
  const [proofAccess, setProofAccess] = useState<AttachmentAccess | null>(null);
  const [proofAccessLoading, setProofAccessLoading] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState<"preview" | "download" | "status" | "">("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === "ACTIVE" && account.isActive),
    [accounts],
  );

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const visibleRecords = useMemo(() => {
    return records.filter((record) => {
      if (filters.paymentAccountId && record.paymentAccountId !== filters.paymentAccountId) return false;
      if (filters.paymentMethod && record.paymentMethod !== filters.paymentMethod) return false;
      return true;
    });
  }, [filters.paymentAccountId, filters.paymentMethod, records]);

  const totals = useMemo(() => {
    const pending = visibleRecords.filter((record) => record.status === "PENDING").length;
    const confirmed = visibleRecords.filter((record) => record.status === "CONFIRMED").length;
    const disabledAccounts = accounts.filter((account) => account.status !== "ACTIVE" || !account.isActive).length;
    const totalAmount = visibleRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    return { pending, confirmed, disabledAccounts, totalAmount };
  }, [accounts, visibleRecords]);

  const loadAccountQrAccess = useCallback(async (items: StorePaymentAccount[]) => {
    const candidates = items.filter((account) => account.qrAttachmentBound || account.qrAttachmentId);
    if (candidates.length === 0) {
      setAccountQrAccess({});
      setAccountQrLoading({});
      return;
    }
    setAccountQrLoading(Object.fromEntries(candidates.map((account) => [account.id, true])));
    const entries = await Promise.all(candidates.map(async (account) => {
      try {
        const accountAccess = await storePaymentRequest<AttachmentAccess>(`/store-payment/accounts/${account.id}/qr-attachment`, { silent: true });
        const controlledFileId = accountAccess.fileId || account.qrAttachmentId;
        const directAccess = controlledFileId
          ? await fetchProtectedAttachmentStatus(controlledFileId)
          : { ...accountAccess, rawUrl: accountAccess.rawUrl ?? null };
        return [account.id, directAccess] as const;
      } catch {
        return [account.id, {
          objectType: "STORE_PAYMENT_ACCOUNT_QR",
          objectId: account.id,
          attachmentBound: account.qrAttachmentBound,
          previewAvailable: false,
          downloadAvailable: false,
          accessStatus: account.qrAttachmentBound ? "access_pending" : "missing",
          rawUrl: null,
          reason: account.qrAttachmentBound ? "QR 附件状态待安全授权确认" : "文件元数据未配置",
        } satisfies AttachmentAccess] as const;
      }
    }));
    setAccountQrAccess(Object.fromEntries(entries));
    setAccountQrLoading({});
  }, []);

  const loadAccounts = useCallback(async () => {
    if (!accountPerm.hasAccess && !accountPerm.canView) {
      setAccounts([]);
      setAccountTotal(0);
      setAccountQrAccess({});
      setAccountQrLoading({});
      return;
    }
    const qs = new URLSearchParams({
      companyCode: COMPANY_CODE,
      storeCode: CANONICAL_STORE_CODE,
      pageSize: "100",
    });
    const data = await storePaymentRequest<ListResponse<StorePaymentAccount>>(`/store-payment/accounts?${qs.toString()}`);
    const items = data.items || [];
    setAccounts(items);
    setAccountTotal(Number(data.total || 0));
    await loadAccountQrAccess(items);
  }, [accountPerm.canView, accountPerm.hasAccess, loadAccountQrAccess]);

  const loadRecords = useCallback(async () => {
    if (!recordPerm.hasAccess && !recordPerm.canView) {
      setRecords([]);
      setRecordTotal(0);
      return;
    }
    const qs = new URLSearchParams({
      companyCode: COMPANY_CODE,
      storeCode: CANONICAL_STORE_CODE,
      pageSize: "100",
    });
    (["status", "dateFrom", "dateTo", "submittedBy"] as const).forEach((key) => {
      const value = filters[key];
      if (value.trim()) qs.set(key, value.trim());
    });
    const data = await storePaymentRequest<ListResponse<StorePaymentRecord>>(`/store-payment/records?${qs.toString()}`);
    setRecords(data.items || []);
    setRecordTotal(Number(data.total || 0));
  }, [filters, recordPerm.canView, recordPerm.hasAccess]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await Promise.all([loadAccounts(), loadRecords()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ui.加载统一收款数据失败','加载统一收款数据失败'));
    } finally {
      setLoading(false);
    }
  }, [loadAccounts, loadRecords]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthenticated(false);
      setAuthChecked(true);
      router.replace(`/login?return=${encodeURIComponent("/store-payment")}`);
      return;
    }
    setAuthenticated(true);
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authenticated) return;
    refresh();
  }, [authenticated, refresh]);

  useEffect(() => {
    const account = activeAccounts[0];
    if (!form.paymentAccountId && account) {
      setForm((current) => ({
        ...current,
        paymentAccountId: account.id,
        currency: account.currency || current.currency,
        paymentMethod: account.paymentMethod || current.paymentMethod,
      }));
    }
  }, [activeAccounts, form.paymentAccountId]);

  const setField = (key: keyof NewRecordForm, value: string) => {
    if (key === "paymentAccountId") {
      const account = accountById.get(value);
      setForm((current) => ({
        ...current,
        paymentAccountId: value,
        currency: account?.currency || current.currency,
        paymentMethod: account?.paymentMethod || current.paymentMethod,
      }));
      return;
    }
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submitRecord = async () => {
    setError("");
    setMessage("");
    if (!recordPerm.canEdit) {
      setError(t('ui.当前账号没有 MENU_STORE_PAYMENT:E，不能新增收款记录','当前账号没有 MENU_STORE_PAYMENT:E，不能新增收款记录'));
      return;
    }
    const account = accountById.get(form.paymentAccountId);
    if (!account || account.status !== "ACTIVE" || !account.isActive) {
      setError(t('ui.当前没有启用的公司收款账户，不能新增收款记录','当前没有启用的公司收款账户，不能新增收款记录'));
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setError(t('ui.请输入大于 0 的收款金额','请输入大于 0 的收款金额'));
      return;
    }
    if (!form.paidAt) {
      setError(t('ui.请选择付款时间','请选择付款时间'));
      return;
    }
    if (!form.proofAttachmentId.trim()) {
      setError(t('ui.请输入受控附件引用 proof_attachment_id','请输入受控附件引用 proof_attachment_id'));
      return;
    }
    if (blockedRawRef(form.proofAttachmentId)) {
      setError(t('ui.附件凭证只允许受控 ID，禁止填写裸 URL 或 /uploads 路径','附件凭证只允许受控 ID，禁止填写裸 URL 或 /uploads 路径'));
      return;
    }

    setSaving(true);
    try {
      await storePaymentRequest<StorePaymentRecord>("/store-payment/records", {
        method: "POST",
        body: JSON.stringify({
          storeCode: CANONICAL_STORE_CODE,
          companyCode: COMPANY_CODE,
          paymentAccountId: form.paymentAccountId,
          amount: Number(form.amount),
          currency: account.currency,
          paymentMethod: account.paymentMethod,
          paidAt: new Date(form.paidAt).toISOString(),
          proofAttachmentId: form.proofAttachmentId.trim(),
          orderNo: form.orderNo.trim() || undefined,
          saleNo: form.saleNo.trim() || undefined,
          remark: form.remark.trim() || undefined,
        }),
      });
      setForm(initialForm());
      setMessage(t('ui.收款记录已生成，当前状态为待确认','收款记录已生成，当前状态为待确认'));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ui.新增收款记录失败','新增收款记录失败'));
    } finally {
      setSaving(false);
    }
  };

  const transition = async (record: StorePaymentRecord, action: "confirm" | "reject" | "void") => {
    setError("");
    setMessage("");
    const isConfirmAction = action === "confirm" || action === "reject";
    if (isConfirmAction && !confirmPerm.canEdit) {
      setError(t('ui.当前账号没有 MENU_STORE_PAYMENT_CONFIRM:E，不能确认或驳回','当前账号没有 MENU_STORE_PAYMENT_CONFIRM:E，不能确认或驳回'));
      return;
    }
    if (action === "void" && !voidPerm.canEdit) {
      setError(t('ui.当前账号没有 MENU_STORE_PAYMENT_VOID:E，不能作废','当前账号没有 MENU_STORE_PAYMENT_VOID:E，不能作废'));
      return;
    }
    const reason =
      action === "confirm"
        ? window.prompt(t('ui.确认备注，可留空','确认备注，可留空')) || ""
        : window.prompt(action === "reject" ? t('ui.请输入驳回原因','请输入驳回原因') : t('ui.请输入作废原因','请输入作废原因')) || "";
    if (action !== "confirm" && !reason.trim()) {
      setError(t('ui.驳回或作废必须填写原因','驳回或作废必须填写原因'));
      return;
    }
    setSaving(true);
    try {
      await storePaymentRequest<StorePaymentRecord>(`/store-payment/records/${record.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "confirm" ? { comment: reason.trim() || undefined } : { reason: reason.trim() }),
      });
      setMessage(action === "confirm" ? t('ui.收款记录已确认','收款记录已确认') : action === "reject" ? t('ui.收款记录已驳回','收款记录已驳回') : t('ui.收款记录已作废','收款记录已作废'));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ui.状态操作失败','状态操作失败'));
    } finally {
      setSaving(false);
    }
  };

  const openProtectedAttachment = async (attachmentId: string | null | undefined, mode: "preview" | "download", access?: AttachmentAccess | null) => {
    setError("");
    setMessage("");
    const status = normalizeAccessStatus(access);
    const allowed = status === "allowed" && !access?.rawUrl && (mode === "preview" ? access?.previewAvailable : access?.downloadAvailable);
    if (!attachmentId?.trim() || !allowed || blockedRawRef(attachmentId)) {
      setError(accessReasonText(status, access?.reason));
      return;
    }
    setAttachmentBusy(mode);
    try {
      const token = getToken();
      const res = await fetch(protectedAttachmentPath(attachmentId, mode), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `附件${mode === "preview" ? "预览" : "下载"}失败 (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (mode === "preview") {
        window.open(objectUrl, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } else {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = access?.originalName || "store-payment-attachment";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ui.受控附件访问失败','受控附件访问失败'));
    } finally {
      setAttachmentBusy("");
    }
  };

  const openDetail = async (record: StorePaymentRecord) => {
    setSelected(record);
    setProofAccess(null);
    setProofAccessLoading(true);
    try {
      if (record.proofAttachmentId) {
        setProofAccess(await fetchProtectedAttachmentStatus(record.proofAttachmentId));
      } else {
        const access = await storePaymentRequest<AttachmentAccess>(`/store-payment/records/${record.id}/proof-attachment`, { silent: true });
        setProofAccess({ ...access, rawUrl: access.rawUrl ?? null });
      }
    } catch {
      setProofAccess({
        attachmentBound: record.proofAttachmentBound,
        previewAllowed: false,
        previewStatus: "access_pending",
        downloadAllowed: false,
        downloadStatus: "access_pending",
        rawUrl: null,
        reason: "STORE_PAYMENT_PROOF_STATUS_UNAVAILABLE",
      });
    } finally {
      setProofAccessLoading(false);
    }
  };

  const renderAttachmentControls = (params: {
    label: string;
    attachmentId?: string | null;
    access?: AttachmentAccess | null;
    loading?: boolean;
  }) => {
    const attachmentId = params.attachmentId || params.access?.fileId || "";
    const status = normalizeAccessStatus(params.access || {
      attachmentBound: !!attachmentId,
      accessStatus: attachmentId ? "access_pending" : "missing",
      rawUrl: null,
    });
    const hasUnsafeRawUrl = !!params.access?.rawUrl;
    const previewEnabled = !hasUnsafeRawUrl && status === "allowed" && params.access?.previewAvailable === true && !!attachmentId;
    const downloadEnabled = !hasUnsafeRawUrl && status === "allowed" && params.access?.downloadAvailable === true && !!attachmentId;
    return (
      <div className={styles.attachmentBox}>
        <div className={styles.attachmentHeader}>
          <span>{params.label}</span>
          <StatusTag status={status.toUpperCase()} />
        </div>
        <div className={styles.attachmentText}>
          {params.loading ? t('ui.正在查询受控附件状态...','正在查询受控附件状态...') : accessReasonText(status, params.access?.reason)}
        </div>
        <div className={styles.attachmentText}>
          rawUrl: {hasUnsafeRawUrl ? "BLOCKED" : "null"} · endpoint: protected
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={s.btnSecondary}
            disabled={!previewEnabled || attachmentBusy !== "" || params.loading}
            onClick={() => openProtectedAttachment(attachmentId, "preview", params.access)}
            title={previewEnabled ? t('ui.通过受控端点预览','通过受控端点预览') : t('ui.附件预览待配置 / 暂不可用','附件预览待配置 / 暂不可用')}
          >
            <ShieldCheck size={14} /> {attachmentBusy === "preview" ? t('ui.预览中','预览中') : t('ui.受控预览','受控预览')}
          </button>
          <button
            type="button"
            className={s.btnSecondary}
            disabled={!downloadEnabled || attachmentBusy !== "" || params.loading}
            onClick={() => openProtectedAttachment(attachmentId, "download", params.access)}
            title={downloadEnabled ? t('ui.通过受控端点下载','通过受控端点下载') : t('ui.附件下载待配置 / 暂不可用','附件下载待配置 / 暂不可用')}
          >
            <Lock size={14} /> {attachmentBusy === "download" ? t('ui.下载中','下载中') : t('ui.受控下载','受控下载')}
          </button>
        </div>
      </div>
    );
  };

  const renderActions = (record: StorePaymentRecord) => {
    const isPending = record.status === "PENDING";
    const canConfirm = confirmPerm.canEdit && isPending;
    const canReject = confirmPerm.canEdit && isPending;
    const canVoid = voidPerm.canEdit && record.status !== "VOIDED";
    return (
      <div className={styles.actions}>
        <button type="button" className={s.btnSecondary} onClick={() => openDetail(record)}>
          <FileText size={14} /> {t('ui.详情','详情')}
        </button>
        <button type="button" className={s.btnSuccess} disabled={!canConfirm || saving} onClick={() => transition(record, "confirm")}>
          <CheckCircle2 size={14} /> {t('ui.确认','确认')}
        </button>
        <button type="button" className={s.btnWarning} disabled={!canReject || saving} onClick={() => transition(record, "reject")}>
          <XCircle size={14} /> {t('ui.驳回','驳回')}
        </button>
        <button type="button" className={s.btnDanger} disabled={!canVoid || saving} onClick={() => transition(record, "void")}>
          <AlertTriangle size={14} /> {t('ui.作废','作废')}
        </button>
      </div>
    );
  };

  if (!authChecked || !authenticated) {
    return (
      <div className={styles.shell}>
        <PageHeader
          title={t('ui.统一收款管理','统一收款管理')}
          subtitle={t('ui.正在校验登录状态','正在校验登录状态')}
          breadcrumb={[t('ui.销售管理','销售管理'), t('ui.直营店','直营店'), t('ui.统一收款','统一收款')]}
        />
        <div className={styles.safeNotice}>
          <Lock size={14} /> {t('ui.正在跳转到登录页，未登录状态不会渲染统一收款业务数据。','正在跳转到登录页，未登录状态不会渲染统一收款业务数据。')}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <PageHeader
        title={t('ui.统一收款管理','统一收款管理')}
        subtitle={t('ui.公司收款码试点 · 受控附件 UAT','公司收款码试点 · 受控附件 UAT')}
        breadcrumb={[t('ui.销售管理','销售管理'), t('ui.直营店','直营店'), t('ui.统一收款','统一收款')]}
        actions={
          <>
            <button type="button" className={s.btnSecondary} onClick={refresh} disabled={loading}>
              <RefreshCw size={14} /> {t('ui.刷新','刷新')}
            </button>
            {exportPerm.canExport && (
              <button type="button" className={s.btnSecondary} disabled title={t('ui.导出预留，当前 Gate 不实现真实导出','导出预留，当前 Gate 不实现真实导出')}>
                {t('ui.导出暂未开放','导出暂未开放')}
              </button>
            )}
          </>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.actions}>
          <PermissionNote label={t('ui.账户 V/E','账户 V/E')} ok={accountPerm.canView && accountPerm.canEdit} />
          <PermissionNote label={t('ui.记录 V/E','记录 V/E')} ok={recordPerm.canView && recordPerm.canEdit} />
          <PermissionNote label={t('ui.确认 V/E','确认 V/E')} ok={confirmPerm.canView && confirmPerm.canEdit} />
          <PermissionNote label={t('ui.作废 V/E','作废 V/E')} ok={voidPerm.canView && voidPerm.canEdit} />
          <PermissionNote label={t('ui.导出 X 预留','导出 X 预留')} ok={exportPerm.canExport} />
        </div>
        <div className={styles.sectionHint}>{CANONICAL_STORE_CODE} / {STORE_NAME} · {COMPANY_CODE}</div>
      </div>

      {(message || error) && (
        <div className={styles.safeNotice}>
          {message && <div>{message}</div>}
          {error && <div><AlertTriangle size={13} /> {error}</div>}
        </div>
      )}

      <div className={styles.safeNotice}>
        <ShieldCheck size={14} /> {t('ui.附件预览/下载只允许走 Store Payment 受控端点。没有 file_metadata 或后端 ACL 未返回 allowed 时，按钮保持禁用；页面不展示 rawUrl，不拼接 /uploads，不打开裸链接。','附件预览/下载只允许走 Store Payment 受控端点。没有 file_metadata 或后端 ACL 未返回 allowed 时，按钮保持禁用；页面不展示 rawUrl，不拼接 /uploads，不打开裸链接。')}
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summary}>
          <div className={styles.summaryLabel}>{t('ui.收款账户','收款账户')}</div>
          <div className={styles.summaryValue}>{accountTotal}</div>
          <div className={styles.summaryMeta}>{t('ui.启用','启用')} {activeAccounts.length} · {t('ui.停用/待配置','停用/待配置')} {totals.disabledAccounts}</div>
        </div>
        <div className={styles.summary}>
          <div className={styles.summaryLabel}>{t('ui.收款记录','收款记录')}</div>
          <div className={styles.summaryValue}>{recordTotal}</div>
          <div className={styles.summaryMeta}>{t('ui.待确认','待确认')} {totals.pending} · {t('ui.已确认','已确认')} {totals.confirmed}</div>
        </div>
        <div className={styles.summary}>
          <div className={styles.summaryLabel}>{t('ui.记录金额','记录金额')}</div>
          <div className={styles.summaryValue}>{money(totals.totalAmount, "LAK")}</div>
          <div className={styles.summaryMeta}>{t('ui.按当前筛选结果汇总','按当前筛选结果汇总')}</div>
        </div>
        <div className={styles.summary}>
          <div className={styles.summaryLabel}>{t('ui.附件安全','附件安全')}</div>
          <div className={styles.summaryValue}>Protected</div>
          <div className={styles.summaryMeta}>{t('ui.按钮由后端 ACL 状态控制','按钮由后端 ACL 状态控制')}</div>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}><Banknote size={16} /> {t('ui.公司收款账户','公司收款账户')}</div>
            <div className={styles.sectionHint}>{t('ui.本阶段展示已初始化的账户占位状态，不伪造真实银行或二维码信息。','本阶段展示已初始化的账户占位状态，不伪造真实银行或二维码信息。')}</div>
          </div>
          <button type="button" className={s.btnSecondary} disabled={!accountPerm.canEdit} title={t('ui.账户维护需财务确认真实账户后启用','账户维护需财务确认真实账户后启用')}>
            {t('ui.维护预留','维护预留')}
          </button>
        </div>
        {!accountPerm.canView ? (
          <div className={styles.empty}>{t('ui.当前账号没有 MENU_STORE_PAYMENT_ACCOUNT:V，无法查看收款账户。','当前账号没有 MENU_STORE_PAYMENT_ACCOUNT:V，无法查看收款账户。')}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('ui.账户编码','账户编码')}</th>
                  <th>{t('ui.账户名称','账户名称')}</th>
                  <th>{t('ui.门店','门店')}</th>
                  <th>{t('ui.币种','币种')}</th>
                  <th>{t('ui.支付方式','支付方式')}</th>
                  <th>{t('ui.QR 状态','QR 状态')}</th>
                  <th>{t('ui.状态','状态')}</th>
                  <th>{t('ui.说明','说明')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className={styles.mono}>{account.accountCode}</td>
                    <td>{account.accountName}</td>
                    <td>{normalizeStoreDisplay(account.storeCode)}</td>
                    <td>{account.currency}</td>
                    <td>{account.paymentMethod}</td>
                    <td>
                      {renderAttachmentControls({
                        label: "QR",
                        attachmentId: account.qrAttachmentId,
                        access: accountQrAccess[account.id] || {
                          objectType: "STORE_PAYMENT_ACCOUNT_QR",
                          objectId: account.id,
                          attachmentBound: account.qrAttachmentBound,
                          previewAvailable: false,
                          downloadAvailable: false,
                          accessStatus: account.qrAttachmentBound ? "access_pending" : "missing",
                          rawUrl: null,
                        },
                        loading: accountQrLoading[account.id] === true,
                      })}
                    </td>
                    <td><StatusTag status={account.isActive ? account.status : "PENDING_CONFIG"} /></td>
                    <td>{account.remark || t('ui.待财务补齐真实账户信息','待财务补齐真实账户信息')}</td>
                  </tr>
                ))}
                {accounts.length === 0 && <tr><td colSpan={8} className={styles.empty}>{t('ui.暂无收款账户','暂无收款账户')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}><FileText size={16} /> {t('ui.收款记录','收款记录')}</div>
            <div className={styles.sectionHint}>{t('ui.支持门店、收款人、日期、支付方式和状态查询。','支持门店、收款人、日期、支付方式和状态查询。')}</div>
          </div>
        </div>
        <div className={styles.filterGrid}>
          <select className={s.inp} value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}>
            <option value="">{t('ui.全部状态','全部状态')}</option>
            <option value="PENDING">{t('ui.待确认','待确认')}</option>
            <option value="CONFIRMED">{t('ui.已确认','已确认')}</option>
            <option value="REJECTED">{t('ui.已驳回','已驳回')}</option>
            <option value="VOIDED">{t('ui.已作废','已作废')}</option>
          </select>
          <input className={s.inp} type="date" value={filters.dateFrom} onChange={(e) => setFilters((current) => ({ ...current, dateFrom: e.target.value }))} />
          <input className={s.inp} type="date" value={filters.dateTo} onChange={(e) => setFilters((current) => ({ ...current, dateTo: e.target.value }))} />
          <input className={s.inp} placeholder={t('ui.收款人 username','收款人 username')} value={filters.submittedBy} onChange={(e) => setFilters((current) => ({ ...current, submittedBy: e.target.value }))} />
          <select className={s.inp} value={filters.paymentAccountId} onChange={(e) => setFilters((current) => ({ ...current, paymentAccountId: e.target.value }))}>
            <option value="">{t('ui.全部账户','全部账户')}</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.accountName}</option>)}
          </select>
          <select className={s.inp} value={filters.paymentMethod} onChange={(e) => setFilters((current) => ({ ...current, paymentMethod: e.target.value }))}>
            <option value="">{t('ui.全部支付方式','全部支付方式')}</option>
            {Array.from(new Set(accounts.map((account) => account.paymentMethod).filter(Boolean))).map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
          <button type="button" className={s.btnPrimary} onClick={refresh} disabled={loading}>
            {t('ui.查询','查询')}
          </button>
        </div>

        {recordPerm.canEdit && (
          <div className={styles.formGrid}>
            <div>
              <label className={s.lbl}>{t('ui.门店','门店')}</label>
              <input className={s.inp} value={`${CANONICAL_STORE_CODE} / ${STORE_NAME}`} disabled />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.公司','公司')}</label>
              <input className={s.inp} value={COMPANY_CODE} disabled />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.收款账户','收款账户')}</label>
              <select className={s.inp} value={form.paymentAccountId} onChange={(e) => setField("paymentAccountId", e.target.value)}>
                <option value="">{t('ui.请选择启用账户','请选择启用账户')}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id} disabled={account.status !== "ACTIVE" || !account.isActive}>
                    {account.accountName} · {account.currency} · {account.paymentMethod}
                    {account.status !== "ACTIVE" || !account.isActive ? t('ui. (待配置)',' (待配置)') : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={s.lbl}>{t('ui.金额','金额')}</label>
              <input className={s.inp} type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setField("amount", e.target.value)} />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.币种','币种')}</label>
              <input className={s.inp} value={form.currency} disabled />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.支付方式','支付方式')}</label>
              <input className={s.inp} value={form.paymentMethod} disabled />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.付款时间','付款时间')}</label>
              <input className={s.inp} type="datetime-local" value={form.paidAt} onChange={(e) => setField("paidAt", e.target.value)} />
            </div>
            <div>
              <label className={s.lbl}>proof_attachment_id</label>
              <input className={s.inp} placeholder={t('ui.受控附件 ID，禁止 URL','受控附件 ID，禁止 URL')} value={form.proofAttachmentId} onChange={(e) => setField("proofAttachmentId", e.target.value)} />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.订单号','订单号')}</label>
              <input className={s.inp} value={form.orderNo} onChange={(e) => setField("orderNo", e.target.value)} />
            </div>
            <div>
              <label className={s.lbl}>{t('ui.销售小票','销售小票')}</label>
              <input className={s.inp} value={form.saleNo} onChange={(e) => setField("saleNo", e.target.value)} />
            </div>
            <div className={styles.wide}>
              <label className={s.lbl}>{t('ui.备注','备注')}</label>
              <input className={s.inp} value={form.remark} onChange={(e) => setField("remark", e.target.value)} />
            </div>
            <div className={styles.full}>
              <button type="button" className={s.btnPrimary} onClick={submitRecord} disabled={saving || activeAccounts.length === 0}>
                {t('ui.新增待确认收款记录','新增待确认收款记录')}
              </button>
              {activeAccounts.length === 0 && <span className={styles.sectionHint}> {t('ui.当前无启用公司收款账户，表单保持安全禁用。','当前无启用公司收款账户，表单保持安全禁用。')}</span>}
            </div>
          </div>
        )}

        {!recordPerm.canView ? (
          <div className={styles.empty}>{t('ui.当前账号没有 MENU_STORE_PAYMENT:V，无法查看收款记录。','当前账号没有 MENU_STORE_PAYMENT:V，无法查看收款记录。')}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('ui.收款单号','收款单号')}</th>
                  <th>{t('ui.门店','门店')}</th>
                  <th>{t('ui.账户','账户')}</th>
                  <th>{t('ui.金额','金额')}</th>
                  <th>{t('ui.付款时间','付款时间')}</th>
                  <th>{t('ui.收款人','收款人')}</th>
                  <th>{t('ui.附件','附件')}</th>
                  <th>{t('ui.状态','状态')}</th>
                  <th>{t('ui.操作','操作')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr key={record.id}>
                    <td className={styles.mono}>{record.paymentNo}</td>
                    <td>{normalizeStoreDisplay(record.storeCode)}</td>
                    <td>{accountById.get(record.paymentAccountId)?.accountName || record.paymentAccountId}</td>
                    <td>{money(record.amount, record.currency)}</td>
                    <td>{dateText(record.paidAt)}</td>
                    <td>{record.submittedBy || "-"}</td>
                    <td>
                      <div className={styles.attachmentInline}>
                        <span className={`${styles.tag} ${record.proofAttachmentId ? styles.tagWarning : styles.tagInfo}`}>
                          <Lock size={12} /> {record.proofAttachmentId ? "status pending" : "metadata missing"}
                        </span>
                        <span className={styles.attachmentText}>{t('ui.受控端点决定按钮状态','受控端点决定按钮状态')}</span>
                      </div>
                    </td>
                    <td><StatusTag status={record.status} /></td>
                    <td>{renderActions(record)}</td>
                  </tr>
                ))}
                {visibleRecords.length === 0 && <tr><td colSpan={9} className={styles.empty}>{t('ui.暂无收款记录','暂无收款记录')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}><ShieldCheck size={16} /> {t('ui.UAT smoke 路径','UAT smoke 路径')}</div>
        </div>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <div className={styles.detailLabel}>{t('ui.权限路径','权限路径')}</div>
            <div className={styles.detailValue}>{t('ui.账户 V/E、记录 V/E、确认 V/E、作废 V/E、导出 X 预留逐项验证按钮可见性。','账户 V/E、记录 V/E、确认 V/E、作废 V/E、导出 X 预留逐项验证按钮可见性。')}</div>
          </div>
          <div className={styles.detailItem}>
            <div className={styles.detailLabel}>{t('ui.附件路径','附件路径')}</div>
            <div className={styles.detailValue}>{t('ui.proof/QR 只调用 `/store-payment/attachments/:fileId/status|preview|download`；无 metadata 时稳定显示待配置，不展示 rawUrl。','proof/QR 只调用 `/store-payment/attachments/:fileId/status|preview|download`；无 metadata 时稳定显示待配置，不展示 rawUrl。')}</div>
          </div>
          <div className={styles.detailItem}>
            <div className={styles.detailLabel}>{t('ui.DataScope 路径','DataScope 路径')}</div>
            <div className={styles.detailValue}>{t('ui.新增记录固定使用','新增记录固定使用')} {CANONICAL_STORE_CODE}；{LEGACY_STORE_CODE} {t('ui.只作为 legacy alias 展示。','只作为 legacy alias 展示。')}</div>
          </div>
          <div className={styles.detailItem}>
            <div className={styles.detailLabel}>{t('ui.业务路径','业务路径')}</div>
            <div className={styles.detailValue}>{t('ui.列表查询、新增待确认、确认、驳回、作废、详情抽屉和空状态。','列表查询、新增待确认、确认、驳回、作废、详情抽屉和空状态。')}</div>
          </div>
        </div>
      </section>

      {selected && (
        <div className={styles.drawerMask} onClick={() => setSelected(null)}>
          <aside className={styles.drawer} onClick={(event) => event.stopPropagation()}>
            <div className={styles.toolbar}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: "var(--color-primary)" }}>{t('ui.收款记录详情','收款记录详情')}</h2>
                <div className={styles.sectionHint}>{selected.paymentNo}</div>
              </div>
              <button type="button" className={s.btnSecondary} onClick={() => setSelected(null)}>{t('ui.关闭','关闭')}</button>
            </div>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}><div className={styles.detailLabel}>{t('ui.状态','状态')}</div><div className={styles.detailValue}><StatusTag status={selected.status} /></div></div>
              <div className={styles.detailItem}><div className={styles.detailLabel}>{t('ui.金额','金额')}</div><div className={styles.detailValue}>{money(selected.amount, selected.currency)}</div></div>
              <div className={styles.detailItem}><div className={styles.detailLabel}>{t('ui.门店','门店')}</div><div className={styles.detailValue}>{normalizeStoreDisplay(selected.storeCode)}</div></div>
              <div className={styles.detailItem}><div className={styles.detailLabel}>{t('ui.付款方式','付款方式')}</div><div className={styles.detailValue}>{selected.paymentMethod}</div></div>
              <div className={styles.detailItem}><div className={styles.detailLabel}>{t('ui.订单/小票','订单/小票')}</div><div className={styles.detailValue}>{selected.orderNo || "-"} / {selected.saleNo || "-"}</div></div>
              <div className={styles.detailItem}><div className={styles.detailLabel}>{t('ui.付款时间','付款时间')}</div><div className={styles.detailValue}>{dateText(selected.paidAt)}</div></div>
              <div className={styles.detailItem}><div className={styles.detailLabel}>{t('ui.确认/驳回/作废原因','确认/驳回/作废原因')}</div><div className={styles.detailValue}>{selected.reason || "-"}</div></div>
              <div className={styles.detailItem}><div className={styles.detailLabel}>{t('ui.备注','备注')}</div><div className={styles.detailValue}>{selected.remark || "-"}</div></div>
              <div className={`${styles.detailItem} ${styles.full}`}>
                <div className={styles.detailLabel}>{t('ui.附件受控状态','附件受控状态')}</div>
                <div className={styles.detailValue}>
                  {renderAttachmentControls({
                    label: t('ui.付款截图 proof','付款截图 proof'),
                    attachmentId: selected.proofAttachmentId,
                    access: proofAccess || {
                      attachmentBound: selected.proofAttachmentBound,
                      previewAvailable: selected.proofPreviewAllowed,
                      downloadAvailable: selected.proofDownloadAllowed,
                      accessStatus: selected.proofPreviewStatus || "access_pending",
                      rawUrl: null,
                    },
                    loading: proofAccessLoading,
                  })}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

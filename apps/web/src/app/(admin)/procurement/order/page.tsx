"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, RefreshCw, Upload, CheckCircle, X, FileText, Image as ImageIcon } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { crudApi } from "@/lib/api-client";
import s from "@/components/ui/admin-ui.module.css";

// ── 常量 ────────────────���─────────────────────────���──────────────────────────

const STATUS_CLS: Record<string, string> = {
  DRAFT: "badgeNeutral", PENDING: "badgeWarning", PENDING_APPROVAL: "badgeWarning",
  CONFIRMED: "badgeWarning", APPROVED: "badgeInfo", PAID: "badgeSuccess",
  ARRIVING: "badgeInfo", RECEIVED: "badgeSuccess", CANCELLED: "badgeDanger",
};

// CONFIRMED/PENDING_APPROVAL 由提交审核 drawer 处理；APPROVED→PAID 由财务付款页处理
const STATUS_FLOW: Record<string, string> = {
  DRAFT: "SUBMIT",   // 特殊标记：开提交审核 drawer
  PAID: "ARRIVING",
  ARRIVING: "RECEIVED",
};

const APPROVER_KEY = "phoenix_prc_approver_id";

// ── 类型 ───────────────────────────────────────────────────��─────────────────

interface PO {
  id: number; po_no: string; supplier_code?: string; supplier_name?: string;
  subject?: string; total_amount?: number; currency_code?: string;
  status: string; plan_qty?: number; received_qty?: number;
  store_code?: string; expected_date?: string; remark?: string;
  contract_no?: string; contract_note?: string; pay_deadline?: string;
  contract_url?: string; approver_id?: number; approver_name?: string;
  created_by?: number; approved_by?: number; created_at?: string; updated_at?: string;
}
interface Supplier { id: number; supplier_code: string; supplier_name: string; }
interface Approver { user_id: number; username: string; real_name?: string; store_code?: string; role_code?: string; }

interface CreateForm {
  supplier_code: string; supplier_name: string; subject: string;
  total_amount: string; currency_code: string; plan_qty: string;
  expected_date: string; pay_deadline: string; contract_note: string; remark: string;
}

const DEF_CREATE: CreateForm = {
  supplier_code: "", supplier_name: "", subject: "",
  total_amount: "0", currency_code: "LAK", plan_qty: "0",
  expected_date: "", pay_deadline: "", contract_note: "", remark: "",
};

// ── 图片压缩工具 ───────────────────────────────────────────────���──────────────

async function compressImage(file: File, maxMB = 3): Promise<File> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas  = document.createElement("canvas");
      const MAX_DIM = 1920;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const r = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * r); height = Math.round(height * r);
      }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      const maxBytes = maxMB * 1024 * 1024;
      let quality = 0.88;
      const tryQ = () => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          if (blob.size <= maxBytes || quality <= 0.4) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          } else { quality -= 0.1; tryQ(); }
        }, "image/jpeg", quality);
      };
      tryQ();
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

// ── 带进度上传 ─────────────────────────────────────────────────��──────────────

function uploadWithProgress(
  file: File, token: string,
  onProgress: (pct: number) => void,
): Promise<{ url: string; originalName: string }> {
  return new Promise((resolve, reject) => {
    const xhr  = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        const msg = (() => { try { return JSON.parse(xhr.responseText)?.message || "上传失败"; } catch { return "上传失败"; } })();
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("网络错误"));
    xhr.open("POST", "/api/upload/contract");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  });
}

// ── UploadBox 组件 ───────────��──────────────────��─────────────────────────────

interface UploadState {
  stage: "idle" | "compressing" | "uploading" | "done" | "error";
  progress: number; url: string; fileName: string; error: string;
}
const IDLE_UPLOAD: UploadState = { stage: "idle", progress: 0, url: "", fileName: "", error: "" };

function UploadBox({ token, onUploaded }: { token: string; onUploaded: (url: string) => void }) {
  const [st, setSt] = useState<UploadState>(IDLE_UPLOAD);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setSt({ ...IDLE_UPLOAD, stage: "compressing", fileName: file.name });
    const MAX_PDF  = 15 * 1024 * 1024;
    const MAX_IMG  = 15 * 1024 * 1024;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isPDF = ext === "pdf";

    // 格式检查
    if (!["pdf","jpg","jpeg","png","webp"].includes(ext)) {
      setSt({ ...IDLE_UPLOAD, stage: "error", error: "仅支持 PDF、JPG、PNG、WebP 格式", fileName: "" });
      return;
    }
    // 大小检查
    if (isPDF && file.size > MAX_PDF) {
      setSt({ ...IDLE_UPLOAD, stage: "error", error: `PDF 文件不能超过 15MB（当前 ${(file.size/1024/1024).toFixed(1)} MB），请压缩后上传`, fileName: "" });
      return;
    }
    if (!isPDF && file.size > MAX_IMG) {
      setSt({ ...IDLE_UPLOAD, stage: "error", error: `图片不能超过 15MB（当前 ${(file.size/1024/1024).toFixed(1)} MB）`, fileName: "" });
      return;
    }

    let finalFile = file;
    // 图片 > 3MB：压缩
    if (!isPDF && file.size > 3 * 1024 * 1024) {
      setSt(p => ({ ...p, stage: "compressing" }));
      finalFile = await compressImage(file);
    }

    setSt(p => ({ ...p, stage: "uploading", progress: 0, fileName: finalFile.name }));
    try {
      const result = await uploadWithProgress(finalFile, token, (pct) =>
        setSt(p => ({ ...p, progress: pct })),
      );
      setSt({ stage: "done", progress: 100, url: result.url, fileName: result.originalName, error: "" });
      onUploaded(result.url);
    } catch (e: unknown) {
      setSt({ ...IDLE_UPLOAD, stage: "error", error: e instanceof Error ? e.message : "上传失败", fileName: "" });
    }
  }, [token, onUploaded]);

  const reset = () => { setSt(IDLE_UPLOAD); onUploaded(""); };

  const dropProps = {
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); },
  };

  const boxStyle: React.CSSProperties = {
    border: "2px dashed var(--border)", borderRadius: "var(--radius-md)",
    padding: "20px 16px", textAlign: "center", cursor: "pointer",
    background: "var(--bg-page)", transition: "border-color 0.2s",
  };

  if (st.stage === "done") {
    return (
      <div style={{ ...boxStyle, borderStyle: "solid", borderColor: "#10b981", cursor: "default" }}>
        <CheckCircle size={24} color="#10b981" style={{ margin: "0 auto 6px", display: "block" }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>上传成功</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{st.fileName}</div>
        <button type="button" onClick={reset}
          style={{ marginTop: 8, fontSize: 12, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
          更换文件
        </button>
      </div>
    );
  }

  if (st.stage === "compressing") {
    return (
      <div style={{ ...boxStyle, cursor: "default" }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>正在压缩图片…</div>
        <div style={{ margin: "8px auto 0", width: 100, height: 6, background: "var(--border)", borderRadius: 4 }}>
          <div style={{ width: "60%", height: "100%", background: "var(--color-primary)", borderRadius: 4, animation: "pulse 1s infinite" }} />
        </div>
      </div>
    );
  }

  if (st.stage === "uploading") {
    return (
      <div style={{ ...boxStyle, cursor: "default" }}>
        <Upload size={20} color="var(--color-primary)" style={{ margin: "0 auto 6px", display: "block" }} />
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>上传中 {st.progress}%…</div>
        <div style={{ margin: "8px 0 0", height: 6, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${st.progress}%`, height: "100%", background: "var(--color-primary)", borderRadius: 4, transition: "width 0.2s" }} />
        </div>
      </div>
    );
  }

  if (st.stage === "error") {
    return (
      <div style={{ ...boxStyle, borderColor: "#ef4444", cursor: "default" }}>
        <div style={{ fontSize: 13, color: "#ef4444", marginBottom: 8 }}>❌ {st.error}</div>
        <button type="button" onClick={reset}
          style={{ fontSize: 13, color: "var(--color-primary)", background: "none", border: "1px solid var(--color-primary)", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>
          重新选择
        </button>
      </div>
    );
  }

  // idle
  return (
    <div {...dropProps} style={boxStyle} onClick={() => inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
        style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 6 }}>
        <FileText size={20} color="var(--text-secondary)" />
        <ImageIcon size={20} color="var(--text-secondary)" />
      </div>
      <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>点击或拖放文件到此处</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
        支持 PDF / JPG / PNG / WebP · 最大 15MB · 图片超过 3MB 自动压缩
      </div>
    </div>
  );
}

// ── 主页面 ───────────────��────────────────────���───────────────────────────────

export default function ProcurementOrderPage() {
  const toast = useToast();
  const { t } = useLanguage();

  const STATUS_LABEL: Record<string, string> = {
    DRAFT:           t("ui.草稿", "草稿"),
    PENDING:         t("ui.待审批", "待审批"),
    PENDING_APPROVAL:t("ui.待审批", "待审批"),
    CONFIRMED:       t("ui.待审批","待审批"),
    APPROVED:        t("ui.已批准待付款", "已批准·待付款"),
    PAID:            t("ui.已付款", "已付款"),
    ARRIVING:        t("ui.在途中", "在途中"),
    RECEIVED:        t("ui.已收货", "已收货"),
    CANCELLED:       t("status.cancelled", "已取消"),
  };
  const STATUS_NEXT_LABEL: Record<string, string> = {
    DRAFT:    "提交审核",
    PAID:     "标记发货在途",
    ARRIVING: "确认收货",
  };

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [orders,    setOrders]    = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // 新建 / 编辑 drawer
  const [createOpen, setCreateOpen] = useState(false);
  const [editing,    setEditing]    = useState<PO | null>(null);
  const [detailRow,  setDetailRow]  = useState<PO | null>(null);
  const [form,       setForm]       = useState<CreateForm>(DEF_CREATE);
  const [saving,     setSaving]     = useState(false);

  // 提交审核 drawer
  const [submitOpen,    setSubmitOpen]    = useState(false);
  const [submitPO,      setSubmitPO]      = useState<PO | null>(null);
  const [approvers,     setApprovers]     = useState<Approver[]>([]);
  const [approverLoading, setApproverLoading] = useState(false);
  const [selectedApprover, setSelectedApprover] = useState("");
  const [contractUrl,   setContractUrl]   = useState("");
  const [submitting,    setSubmitting]    = useState(false);

  // ── 加载 ──────────────���───────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      crudApi.list<PO>("prc_purchase_orders", { limit: 300 }),
      crudApi.list<Supplier>("prc_suppliers", { limit: 200 }),
    ]).then(([od, sd]) => {
      setOrders(od.data || []);
      setSuppliers(sd.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── 打开提交审核 drawer ───────────��──────────────────────────────────────

  const openSubmit = useCallback(async (po: PO) => {
    setSubmitPO(po);
    setContractUrl("");
    setSubmitOpen(true);
    setApproverLoading(true);
    try {
      const res = await fetch("/api/procurement/approvers", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      const list: Approver[] = json.data || [];
      setApprovers(list);
      // 从 localStorage 恢复上次选择
      const saved = localStorage.getItem(APPROVER_KEY);
      if (saved && list.some(a => String(a.user_id) === saved)) {
        setSelectedApprover(saved);
      } else if (list.length > 0) {
        setSelectedApprover(String(list[0].user_id));
      }
    } catch {/**/} finally { setApproverLoading(false); }
  }, [token]);

  // 选择审批人时保存到 localStorage
  const onApproverChange = (id: string) => {
    setSelectedApprover(id);
    if (id) localStorage.setItem(APPROVER_KEY, id);
  };

  // 确认提交审核
  const doSubmit = async () => {
    if (!submitPO) return;
    if (!selectedApprover) { toast.error("请选择审批人"); return; }
    if (!contractUrl)      { toast.error("请上传采购合同或单据后再提交"); return; }
    setSubmitting(true);
    try {
      const approver = approvers.find(a => String(a.user_id) === selectedApprover);
      const res = await fetch(`/api/procurement/${submitPO.po_no}/submit`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({
          approver_id:   Number(selectedApprover),
          approver_name: approver?.real_name || approver?.username || "",
          contract_url:  contractUrl,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.msg || "已提交审批");
        setSubmitOpen(false); setSubmitPO(null); load();
      } else { toast.error(json.msg || "提交失败"); }
    } catch { toast.error("网络错误，请重试"); }
    finally { setSubmitting(false); }
  };

  // ── 状态推进（非提交审核） ────────────────���───────────────────────────────

  const advance = async (row: PO) => {
    const next = STATUS_FLOW[row.status?.toUpperCase() || ""];
    if (!next) return;
    if (next === "SUBMIT") { openSubmit(row); return; }
    if (next === "APPROVED") {
      const res = await fetch(`/api/procurement/${row.po_no}/approve`, { method: "POST", headers: hdr });
      const json = await res.json().catch(() => ({}));
      res.ok ? toast.success(json.msg || "采购单已批准") : toast.error(json.msg || "批准失败");
    } else {
      await fetch(`/api/crud/prc_purchase_orders/${row.id}`, {
        method: "PUT", headers: hdr,
        body: JSON.stringify({ status: next, ...(next === "RECEIVED" ? { received_qty: row.plan_qty } : {}) }),
      });
      toast.success(`状态已推进为：${STATUS_LABEL[next] || next}`);
    }
    load();
  };

  // ── 创建 / 编辑 ─────────────────��───────────────────────────��─────────────

  function openNew() {
    setEditing(null); setDetailRow(null);
    setForm(DEF_CREATE);
    setCreateOpen(true);
  }
  function openEdit(row: PO) {
    setEditing(row); setDetailRow(null);
    setForm({
      supplier_code: row.supplier_code || "", supplier_name: row.supplier_name || "",
      subject: row.subject || "", total_amount: String(row.total_amount || 0),
      currency_code: row.currency_code || "LAK", plan_qty: String(row.plan_qty || 0),
      expected_date: row.expected_date?.slice(0, 10) || "",
      pay_deadline:  row.pay_deadline?.slice(0, 10)  || "",
      contract_note: row.contract_note || "", remark: row.remark || "",
    });
    setCreateOpen(true);
  }
  function openDetail(row: PO) { setDetailRow(row); setEditing(null); setCreateOpen(true); }

  function onSupplierSelect(code: string) {
    const sup = suppliers.find(s => s.supplier_code === code);
    setForm(p => ({ ...p, supplier_code: code, supplier_name: sup?.supplier_name || "" }));
  }

  const saveCreate = async () => {
    if (!form.supplier_code || !form.subject) { toast.error("供应商和采购主题为必填项"); return; }
    setSaving(true);
    try {
      if (editing?.id) {
        // 编辑：使用 generic-crud PUT（保留原合同号）
        const payload = {
          supplier_code: form.supplier_code, supplier_name: form.supplier_name,
          subject: form.subject, total_amount: Number(form.total_amount) || 0,
          currency_code: form.currency_code, plan_qty: Number(form.plan_qty) || 0,
          expected_date: form.expected_date, pay_deadline: form.pay_deadline,
          contract_note: form.contract_note, remark: form.remark,
        };
        await fetch(`/api/crud/prc_purchase_orders/${editing.id}`, { method: "PUT", headers: hdr, body: JSON.stringify(payload) });
        toast.success("采购订单已更新");
      } else {
        // 新建：使用 procurement/create，后端自动生成合同号
        const payload = {
          supplier_code: form.supplier_code, supplier_name: form.supplier_name,
          subject: form.subject, total_amount: Number(form.total_amount) || 0,
          currency_code: form.currency_code, plan_qty: Number(form.plan_qty) || 0,
          expected_date: form.expected_date, pay_deadline: form.pay_deadline,
          contract_note: form.contract_note, remark: form.remark,
        };
        await fetch("/api/procurement/create", { method: "POST", headers: hdr, body: JSON.stringify(payload) });
        toast.success("采购订单已创建，合同编号已自动生成");
      }
      setCreateOpen(false); setEditing(null); load();
    } catch { toast.error("操作失败"); }
    finally { setSaving(false); }
  };

  const setF = (k: keyof CreateForm, v: string) => setForm(p => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { padding: "8px 10px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };

  const filtered = useMemo(() => orders.filter(o =>
    (!search || (o.po_no || "").includes(search) || (o.supplier_name || "").includes(search) || (o.subject || "").includes(search)) &&
    (!statusFilter || o.status?.toUpperCase() === statusFilter)
  ), [orders, search, statusFilter]);

  const monthlyAmt   = useMemo(() => orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0), [orders]);
  const inTransitCnt = orders.filter(o => ["PENDING_APPROVAL", "CONFIRMED", "APPROVED"].includes(o.status?.toUpperCase() || "")).length;
  const receivedCnt  = orders.filter(o => o.status?.toUpperCase() === "RECEIVED").length;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("ui.采购订单", "采购订单")}
        subtitle={`管理全部采购订单·状态机流转·${orders.length} 笔`}
        breadcrumb={[t("ui.采购管理", "采购管理"), t("ui.采购订单", "采购订单")]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} /> {t("common.refresh", "刷新")}
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> 新建采购单
            </button>
          </div>
        } />

      {/* KPI */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "采购总额",   value: `¥${monthlyAmt.toLocaleString()}`,       accent: "var(--color-primary)" },
          { label: "审批/在途",  value: `${inTransitCnt} 单`,                    accent: "#3b82f6" },
          { label: "已收货",     value: `${receivedCnt} 单`,                     accent: "#10b981" },
        ].map(k => (
          <div key={k.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: `3px solid ${k.accent}`, borderRadius: "var(--radius-md)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: k.accent }}>{k.value}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* 搜索 + 状态过滤 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索订单号 / 供应商 / 主题…"
          style={{ flex: 1, padding: "9px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontSize: 14, outline: "none" }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "9px 12px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontSize: 14, outline: "none" }}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* 表格 */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-page)", borderBottom: "1px solid var(--border)" }}>
              {["合同编号", "供应商", "采购主题", "金额", "计划/收货", "到货日", "审批人", "状态", "操作"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: "var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: "var(--text-secondary)" }}>暂无采购订单</td></tr>}
            {!loading && filtered.map((row, i) => {
              const st    = row.status?.toUpperCase() || "DRAFT";
              const nextSt = STATUS_FLOW[st];
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-page)" }}>
                  <td style={{ padding: "9px 12px" }}>
                    <button type="button" onClick={() => openDetail(row)}
                      style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontWeight: 700, fontFamily: "monospace", fontSize: 11, padding: 0 }}>
                      {row.contract_no || row.po_no}
                    </button>
                    {row.contract_url && <span title="已上传合同" style={{ marginLeft: 4, color: "#10b981", fontSize: 10 }}>📎</span>}
                  </td>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{row.supplier_name || row.supplier_code || "—"}</td>
                  <td style={{ padding: "9px 12px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.subject || "—"}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "var(--color-primary)" }}>
                    {row.currency_code || "LAK"} {Number(row.total_amount || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "9px 12px" }}>{row.plan_qty || 0} / <span style={{ color: (row.received_qty || 0) >= (row.plan_qty || 1) ? "#10b981" : undefined }}>{row.received_qty || 0}</span></td>
                  <td style={{ padding: "9px 12px", fontSize: 11 }}>{row.expected_date?.slice(0, 10) || "—"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12 }}>{row.approver_name || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span className={`${s.badge} ${s[STATUS_CLS[st] || "badgeNeutral"]}`}>{STATUS_LABEL[st] || st}</span>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {st === "DRAFT" && <button type="button" className={s.btnSecondary} style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => openEdit(row)}>编辑</button>}
                      {nextSt && <button type="button" className={s.btnSuccess} style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => advance(row)}>{STATUS_NEXT_LABEL[st] || nextSt}</button>}
                      <button type="button" className={s.btnSecondary} style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => openDetail(row)}>详情</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 新建 / 编辑 / 详情 Drawer ── */}
      <RightDrawer open={createOpen}
        title={detailRow ? "采购单详情" : editing ? "编辑采购单" : "新建采购单"}
        onClose={() => { setCreateOpen(false); setEditing(null); setDetailRow(null); }}>
        {detailRow ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "合同编号", value: detailRow.contract_no, mono: true },
              { label: "采购单号", value: detailRow.po_no, mono: true },
              { label: "供应商",   value: detailRow.supplier_name || detailRow.supplier_code },
              { label: "采购主题", value: detailRow.subject },
              { label: "金额",     value: `${detailRow.currency_code || "LAK"} ${Number(detailRow.total_amount || 0).toLocaleString()}` },
              { label: "计划数量", value: String(detailRow.plan_qty || 0) },
              { label: "已收数量", value: String(detailRow.received_qty || 0) },
              { label: "期望到货", value: detailRow.expected_date?.slice(0, 10) || "—" },
              { label: "付款截止", value: detailRow.pay_deadline?.slice(0, 10) || "—" },
              { label: "合同摘要", value: detailRow.contract_note || "—" },
              { label: "审批人",   value: detailRow.approver_name || "—" },
              { label: "创建时间", value: detailRow.created_at?.slice(0, 16) || "—" },
              { label: "备注",     value: detailRow.remark || "—" },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", gap: 10 }}>
                <span style={{ width: 72, fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: r.mono ? "monospace" : "inherit" }}>{r.value || "—"}</span>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <span style={{ width: 72, fontSize: 12, color: "var(--text-secondary)" }}>当前状态 </span>
              <span className={`${s.badge} ${s[STATUS_CLS[(detailRow.status || "DRAFT").toUpperCase()] || "badgeNeutral"]}`}>
                {STATUS_LABEL[(detailRow.status || "DRAFT").toUpperCase()] || detailRow.status}
              </span>
            </div>
            {detailRow.contract_url && (
              <a href={detailRow.contract_url} target="_blank" rel="noreferrer"
                style={{ color: "var(--color-primary)", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                <Upload size={14} /> 查看已上传合同
              </a>
            )}
            {STATUS_FLOW[detailRow.status?.toUpperCase() || ""] && (
              <button type="button" className={s.btnPrimary} style={{ marginTop: 8 }}
                onClick={() => { setCreateOpen(false); advance(detailRow); }}>
                {STATUS_NEXT_LABEL[detailRow.status?.toUpperCase() || ""] || STATUS_FLOW[detailRow.status?.toUpperCase() || ""]}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {editing && (
              <div style={{ background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "8px 12px", fontSize: 12 }}>
                <span style={{ color: "var(--text-secondary)" }}>合同编号：</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--color-primary)" }}>{editing.contract_no || "(草稿，保存时已生成)"}</span>
              </div>
            )}
            {!editing && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "var(--radius-md)", padding: "8px 12px", fontSize: 12, color: "#166534" }}>
                💡 合同编号将在保存时自动生成（HT-YYYY-NNNNN 格式）
              </div>
            )}
            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>供应商 <span className={s.textDanger}>*</span></label>
              <select value={form.supplier_code} onChange={e => onSupplierSelect(e.target.value)} style={inp}>
                <option value="">— 请选择供应商 —</option>
                {suppliers.map(sp => <option key={sp.supplier_code} value={sp.supplier_code}>{sp.supplier_name} ({sp.supplier_code})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>采购主题 <span className={s.textDanger}>*</span></label>
              <input value={form.subject} onChange={e => setF("subject", e.target.value)} placeholder="例：2026年5月饲料采购" style={inp} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>采购金额</label>
                <input type="number" value={form.total_amount} onChange={e => setF("total_amount", e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>结算币种</label>
                <select value={form.currency_code} onChange={e => setF("currency_code", e.target.value)} style={inp}>
                  {["LAK", "CNY", "THB", "USD"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>计划数量</label>
                <input type="number" value={form.plan_qty} onChange={e => setF("plan_qty", e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>期望到货日期</label>
                <input type="date" value={form.expected_date} onChange={e => setF("expected_date", e.target.value)} style={inp} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>付款截止日</label>
              <input type="date" value={form.pay_deadline} onChange={e => setF("pay_deadline", e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>合同关键条款摘要</label>
              <textarea value={form.contract_note} onChange={e => setF("contract_note", e.target.value)} rows={2}
                placeholder="价格条款、交货方式、付款期限等" style={{ ...inp, resize: "vertical" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>备注</label>
              <textarea value={form.remark} onChange={e => setF("remark", e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
              <button type="button" className={s.btnSecondary} style={{ flex: 1 }} onClick={() => { setCreateOpen(false); setEditing(null); }}>取消</button>
              <button type="button" className={s.btnPrimary} style={{ flex: 2 }} disabled={saving} onClick={saveCreate}>
                {saving ? "保存中…" : "保存草稿"}
              </button>
            </div>
          </div>
        )}
      </RightDrawer>

      {/* ── 提交审核 Drawer ── */}
      <RightDrawer open={submitOpen} title="提交审核" onClose={() => { setSubmitOpen(false); setSubmitPO(null); }}>
        {submitPO && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* PO 摘要 */}
            <div style={{ background: "var(--bg-page)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--color-primary)", fontWeight: 700 }}>{submitPO.contract_no}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", margin: "4px 0 2px" }}>{submitPO.subject}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {submitPO.supplier_name || submitPO.supplier_code} · {submitPO.currency_code || "LAK"} {Number(submitPO.total_amount || 0).toLocaleString()}
              </div>
            </div>

            {/* 审批人选择 */}
            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6, fontWeight: 600 }}>
                审批人 <span className={s.textDanger}>*</span>
                <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>（下次默认此选项）</span>
              </label>
              {approverLoading ? (
                <div style={{ padding: "10px 0", color: "var(--text-secondary)", fontSize: 13 }}>加载审批人列表…</div>
              ) : approvers.length === 0 ? (
                <div style={{ color: "#ef4444", fontSize: 13 }}>未找到有审批权限的用户，请联系管理员</div>
              ) : (
                <select value={selectedApprover} onChange={e => onApproverChange(e.target.value)}
                  style={{ ...inp, border: "1px solid var(--color-primary)" }}>
                  <option value="">— ��选择审批人 —</option>
                  {approvers.map(a => (
                    <option key={a.user_id} value={String(a.user_id)}>
                      {a.real_name || a.username}
                      {a.role_code ? ` (${a.role_code.replace("ROLE_", "")})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 文件上传 */}
            <div>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6, fontWeight: 600 }}>
                采购合同 / 单据 <span className={s.textDanger}>*</span>
                <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>上传成功后才能提交</span>
              </label>
              <UploadBox token={token} onUploaded={setContractUrl} />
            </div>

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button type="button" className={s.btnSecondary} style={{ flex: 1 }}
                onClick={() => { setSubmitOpen(false); setSubmitPO(null); }}>取消</button>
              <button type="button" className={s.btnPrimary} style={{ flex: 2 }}
                disabled={submitting || !contractUrl || !selectedApprover}
                onClick={doSubmit}>
                {submitting ? "提交中…" : "确认提交审核"}
              </button>
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}

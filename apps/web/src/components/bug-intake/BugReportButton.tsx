"use client";

import { useMemo, useRef, useState } from "react";
import type { ClipboardEvent, MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { Bug, Camera, CheckCircle2, Clipboard, Crop, Loader2, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getBugIntakePageSnapshot, getBugIntakeSnapshot } from "@/lib/bug-intake-telemetry";
import styles from "./bug-intake.module.css";

type SubmitResult = { bugNo?: string; bug_no?: string };
type CaptureMode = "viewport" | "area";
type SelectionBox = { left: number; top: number; width: number; height: number };

type SelectionState = {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

function currentToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}

function userCompany(user: Record<string, unknown> | null) {
  return String(user?.companyCode ?? user?.company_code ?? user?.company ?? "");
}

function userProject(user: Record<string, unknown> | null) {
  return String(user?.projectCode ?? user?.project_code ?? user?.project ?? "");
}

export function BugReportButton() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [files, setFiles] = useState<File[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [hideForCapture, setHideForCapture] = useState(false);
  const [selecting, setSelecting] = useState<SelectionState | null>(null);
  const [pasteActive, setPasteActive] = useState(false);
  const selectionRef = useRef<CaptureMode>("viewport");
  const [submitting, setSubmitting] = useState(false);
  const [resultNo, setResultNo] = useState("");
  const [error, setError] = useState("");

  const userRecord = user as Record<string, unknown> | null;
  const roles = useMemo(() => {
    if (Array.isArray(userRecord?.roles)) return userRecord.roles.map(String);
    return userRecord?.role ? [String(userRecord.role)] : [];
  }, [userRecord]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setSeverity("MEDIUM");
    setFiles([]);
    setCapturing(false);
    setHideForCapture(false);
    setResultNo("");
    setError("");
  };

  const appendFiles = (nextFiles: File[]) => {
    if (nextFiles.length === 0) return;
    setError("");
    setFiles(prev => {
      const merged = [...prev, ...nextFiles].slice(0, 5);
      if (prev.length + nextFiles.length > 5) {
        window.setTimeout(() => setError(t("system.bugIntake.attachmentLimit", "最多只能附加 5 个截图/文件。")), 0);
      }
      return merged;
    });
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const waitForHiddenModal = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const captureDom = async (mode: CaptureMode, box?: SelectionBox) => {
    if (files.length >= 5) {
      setError(t("system.bugIntake.attachmentLimit", "最多只能附加 5 个截图/文件。"));
      return;
    }
    setCapturing(true);
    setError("");
    setHideForCapture(true);
    try {
      await waitForHiddenModal();
      const { default: html2canvas } = await import("html2canvas");
      const crop = box && box.width > 8 && box.height > 8
        ? box
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const canvas = await html2canvas(document.body, {
        backgroundColor: null,
        useCORS: true,
        logging: false,
        scale: Math.min(2, window.devicePixelRatio || 1),
        x: crop.left + window.scrollX,
        y: crop.top + window.scrollY,
        width: crop.width,
        height: crop.height,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        ignoreElements: (element) => element instanceof HTMLElement && element.dataset.bugIntakeIgnore === "true",
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png", 0.92));
      if (!blob) throw new Error(t("system.bugIntake.captureFailed", "截图失败，请重试。"));
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      appendFiles([new File([blob], `${mode}-screenshot-${stamp}.png`, { type: "image/png" })]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("system.bugIntake.captureFailed", "截图失败，请重试。"));
    } finally {
      setHideForCapture(false);
      setCapturing(false);
      setSelecting(null);
    }
  };

  const captureCurrentPage = async () => captureDom("viewport");

  const startAreaCapture = () => {
    if (files.length >= 5) {
      setError(t("system.bugIntake.attachmentLimit", "最多只能附加 5 个截图/文件。"));
      return;
    }
    selectionRef.current = "area";
    setError("");
    setHideForCapture(true);
    setSelecting({ active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  };

  const selectionBox = selecting
    ? {
        left: Math.min(selecting.startX, selecting.currentX),
        top: Math.min(selecting.startY, selecting.currentY),
        width: Math.abs(selecting.currentX - selecting.startX),
        height: Math.abs(selecting.currentY - selecting.startY),
      }
    : null;

  const onSelectionMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    setSelecting({ active: true, startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY });
  };

  const onSelectionMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    setSelecting(prev => prev?.active ? { ...prev, currentX: e.clientX, currentY: e.clientY } : prev);
  };

  const finishSelection = async () => {
    const box = selectionBox;
    if (!box) return;
    if (box.width < 12 || box.height < 12) {
      setHideForCapture(false);
      setSelecting(null);
      return;
    }
    await captureDom(selectionRef.current, box);
  };

  const onPasteFiles = (e: ClipboardEvent<HTMLElement>) => {
    const imageFiles = Array.from(e.clipboardData?.items || [])
      .filter(item => item.kind === "file" && item.type.startsWith("image/"))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file))
      .map((file, index) => {
        const ext = file.type.includes("jpeg") ? "jpg" : file.type.split("/")[1] || "png";
        return new File([file], `pasted-screenshot-${Date.now()}-${index + 1}.${ext}`, { type: file.type || "image/png" });
      });
    if (imageFiles.length > 0) {
      e.preventDefault();
      appendFiles(imageFiles);
      setPasteActive(false);
    }
  };

  const submit = async () => {
    if (!title.trim()) {
      setError(t("system.bugIntake.titleRequired", "请先填写问题标题"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const snapshot = getBugIntakeSnapshot();
      const payload = {
        title: title.trim(),
        description: description.trim(),
        severity,
        route: pathname,
        url: window.location.href,
        roles,
        companyCode: userCompany(userRecord),
        projectCode: userProject(userRecord),
        consoleErrors: snapshot.consoleErrors,
        failedRequests: snapshot.failedRequests,
        clientContext: {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          devicePixelRatio: window.devicePixelRatio,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          pageSnapshot: getBugIntakePageSnapshot(),
        },
      };
      const form = new FormData();
      form.append("payload", JSON.stringify(payload));
      files.forEach(file => form.append("screenshots", file));
      const res = await fetch("/api/bug-intake/reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${currentToken()}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string; msg?: string } | null;
        throw new Error(body?.message || body?.msg || `${t("system.bugIntake.submitFailed", "提交失败")} HTTP ${res.status}`);
      }
      const data = await res.json() as SubmitResult;
      setResultNo(data.bugNo || data.bug_no || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("system.bugIntake.submitFailed", "提交失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" className={styles.feedbackButton} onClick={() => { reset(); setOpen(true); }}>
        <Bug size={15} />
        <span>{t("system.bugIntake.feedbackButton", "反馈问题")}</span>
      </button>
      {selecting && (
        <div
          className={styles.selectionOverlay}
          onMouseDown={onSelectionMouseDown}
          onMouseMove={onSelectionMouseMove}
          onMouseUp={() => void finishSelection()}
          data-bug-intake-ignore="true"
        >
          <div className={styles.selectionHint}>{t("system.bugIntake.selectionHint", "拖动框选要截取的问题区域，松开完成")}</div>
          {selectionBox && selectionBox.width > 0 && selectionBox.height > 0 && (
            <div
              className={styles.selectionBox}
              style={{ left: selectionBox.left, top: selectionBox.top, width: selectionBox.width, height: selectionBox.height }}
            />
          )}
        </div>
      )}
      {open && (
        <div className={`${styles.overlay} ${hideForCapture ? styles.captureHidden : ""}`} onMouseDown={() => setOpen(false)} data-bug-intake-ignore="true">
          <div className={styles.modal} onMouseDown={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.eyebrow}>Bug Intake</div>
                <h3>{t("system.bugIntake.modalTitle", "反馈页面问题")}</h3>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setOpen(false)} aria-label={t("common.close", "关闭")}>
                <X size={18} />
              </button>
            </div>

            {resultNo ? (
              <div className={styles.success}>
                <CheckCircle2 size={28} />
                <strong>{t("system.bugIntake.createdNo", "已生成问题编号：")}{resultNo}</strong>
                <span>{t("system.bugIntake.recordedContext", "我们已记录当前页面、用户角色、最近错误日志和失败接口。")}</span>
                <button type="button" className={styles.primaryButton} onClick={() => setOpen(false)}>{t("common.done", "完成")}</button>
              </div>
            ) : (
              <>
                <div className={styles.contextGrid}>
                  <span>{t("system.bugIntake.page", "页面")}</span><strong>{pathname}</strong>
                  <span>{t("system.bugIntake.user", "用户")}</span><strong>{String(userRecord?.name ?? userRecord?.username ?? "—")}</strong>
                  <span>{t("system.bugIntake.roles", "角色")}</span><strong>{roles.join(", ") || "—"}</strong>
                </div>

                <label className={styles.field}>
                  <span>{t("system.bugIntake.titleLabel", "问题标题 *")}</span>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("system.bugIntake.titlePlaceholder", "例如：采购付款单项目下拉为空")} maxLength={160} />
                </label>
                <label className={styles.field}>
                  <span>{t("system.bugIntake.severity", "严重程度")}</span>
                  <select value={severity} onChange={e => setSeverity(e.target.value)}>
                    <option value="LOW">{t("system.bugIntake.severityLow", "低：样式/文案问题")}</option>
                    <option value="MEDIUM">{t("system.bugIntake.severityMedium", "中：影响局部流程")}</option>
                    <option value="HIGH">{t("system.bugIntake.severityHigh", "高：阻断业务操作")}</option>
                    <option value="CRITICAL">{t("system.bugIntake.severityCritical", "紧急：系统不可用/数据风险")}</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t("system.bugIntake.description", "问题说明")}</span>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} onPaste={onPasteFiles} placeholder={t("system.bugIntake.descriptionPlaceholder", "请描述你刚才做了什么、期望结果、实际结果。可直接 Ctrl/Cmd+V 粘贴截图。")} rows={4} />
                </label>
                <label className={styles.field}>
                  <span>{t("system.bugIntake.attachmentsLabel", "截图 / PDF（最多 5 个，单个 ≤15MB）")}</span>
                  <div className={styles.attachmentTools}>
                    <button type="button" className={styles.captureButton} onClick={captureCurrentPage} disabled={capturing || files.length >= 5}>
                      {capturing ? <Loader2 size={15} className={styles.spin} /> : <Camera size={15} />}
                      {capturing ? t("system.bugIntake.capturing", "正在截图…") : t("system.bugIntake.captureViewport", "全屏截图")}
                    </button>
                    <button type="button" className={styles.captureButton} onClick={startAreaCapture} disabled={capturing || files.length >= 5}>
                      <Crop size={15} />
                      {t("system.bugIntake.captureArea", "框选区域截图")}
                    </button>
                  </div>
                  <div
                    className={`${styles.pasteZone} ${pasteActive ? styles.pasteZoneActive : ""}`}
                    tabIndex={0}
                    onPaste={onPasteFiles}
                    onFocus={() => setPasteActive(true)}
                    onBlur={() => setPasteActive(false)}
                  >
                    <Clipboard size={17} />
                    <div>
                      <strong>{t("system.bugIntake.pasteTitle", "直接粘贴截图")}</strong>
                      <span>{t("system.bugIntake.pasteHint", "复制图片后点这里按 Ctrl/Cmd+V，或在说明框里直接粘贴。")}</span>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                    multiple
                    onChange={e => appendFiles(Array.from(e.target.files ?? []).slice(0, 5))}
                  />
                </label>
                {files.length > 0 && (
                  <div className={styles.fileList}>{files.map((file, index) => (
                    <span key={`${file.name}-${file.size}-${index}`}>
                      {file.name}
                      <button type="button" onClick={() => removeFile(index)} aria-label={t("system.bugIntake.removeAttachment", "移除附件")}>
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ))}</div>
                )}
                {error && <div className={styles.error}>{error}</div>}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setOpen(false)}>{t("common.cancel", "取消")}</button>
                  <button type="button" className={styles.primaryButton} onClick={submit} disabled={submitting}>
                    {submitting ? <Loader2 size={15} className={styles.spin} /> : null}
                    {t("system.bugIntake.submit", "提交问题")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

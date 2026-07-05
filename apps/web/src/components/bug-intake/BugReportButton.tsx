"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, Camera, CheckCircle2, Loader2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getBugIntakeSnapshot } from "@/lib/bug-intake-telemetry";
import styles from "./bug-intake.module.css";

type SubmitResult = { bugNo?: string; bug_no?: string };

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

  const captureCurrentPage = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(t("system.bugIntake.captureUnsupported", "当前浏览器不支持直接截图，请继续使用上传截图。"));
      return;
    }
    if (files.length >= 5) {
      setError(t("system.bugIntake.attachmentLimit", "最多只能附加 5 个截图/文件。"));
      return;
    }

    setCapturing(true);
    setError("");
    setHideForCapture(true);
    let stream: MediaStream | null = null;
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" } as MediaTrackConstraints,
        audio: false,
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise<void>(resolve => {
        if (video.videoWidth > 0) resolve();
        else video.onloadedmetadata = () => resolve();
      });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || window.innerWidth;
      canvas.height = video.videoHeight || window.innerHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(t("system.bugIntake.captureFailed", "截图失败，请重试。"));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png", 0.92));
      if (!blob) throw new Error(t("system.bugIntake.captureFailed", "截图失败，请重试。"));
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const screenshot = new File([blob], `page-screenshot-${stamp}.png`, { type: "image/png" });
      setFiles(prev => [...prev, screenshot].slice(0, 5));
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name !== "NotAllowedError") {
        setError(e instanceof Error ? e.message : t("system.bugIntake.captureFailed", "截图失败，请重试。"));
      }
    } finally {
      stream?.getTracks().forEach(track => track.stop());
      setHideForCapture(false);
      setCapturing(false);
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
      {open && (
        <div className={`${styles.overlay} ${hideForCapture ? styles.captureHidden : ""}`} onMouseDown={() => setOpen(false)}>
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
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t("system.bugIntake.descriptionPlaceholder", "请描述你刚才做了什么、期望结果、实际结果。")} rows={4} />
                </label>
                <label className={styles.field}>
                  <span>{t("system.bugIntake.attachmentsLabel", "截图 / PDF（最多 5 个，单个 ≤15MB）")}</span>
                  <button type="button" className={styles.captureButton} onClick={captureCurrentPage} disabled={capturing || files.length >= 5}>
                    {capturing ? <Loader2 size={15} className={styles.spin} /> : <Camera size={15} />}
                    {capturing ? t("system.bugIntake.capturing", "正在截图…") : t("system.bugIntake.capturePage", "截取当前页面")}
                  </button>
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                    multiple
                    onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
                  />
                </label>
                {files.length > 0 && (
                  <div className={styles.fileList}>{files.map(file => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>
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

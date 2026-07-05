"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, CheckCircle2, Loader2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [files, setFiles] = useState<File[]>([]);
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
    setResultNo("");
    setError("");
  };

  const submit = async () => {
    if (!title.trim()) {
      setError("请先填写问题标题");
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
        throw new Error(body?.message || body?.msg || `提交失败 HTTP ${res.status}`);
      }
      const data = await res.json() as SubmitResult;
      setResultNo(data.bugNo || data.bug_no || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" className={styles.feedbackButton} onClick={() => { reset(); setOpen(true); }}>
        <Bug size={15} />
        <span>反馈问题</span>
      </button>
      {open && (
        <div className={styles.overlay} onMouseDown={() => setOpen(false)}>
          <div className={styles.modal} onMouseDown={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.eyebrow}>Bug Intake</div>
                <h3>反馈页面问题</h3>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            {resultNo ? (
              <div className={styles.success}>
                <CheckCircle2 size={28} />
                <strong>已生成问题编号：{resultNo}</strong>
                <span>我们已记录当前页面、用户角色、最近错误日志和失败接口。</span>
                <button type="button" className={styles.primaryButton} onClick={() => setOpen(false)}>完成</button>
              </div>
            ) : (
              <>
                <div className={styles.contextGrid}>
                  <span>页面</span><strong>{pathname}</strong>
                  <span>用户</span><strong>{String(userRecord?.name ?? userRecord?.username ?? "—")}</strong>
                  <span>角色</span><strong>{roles.join(", ") || "—"}</strong>
                </div>

                <label className={styles.field}>
                  <span>问题标题 *</span>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：采购付款单项目下拉为空" maxLength={160} />
                </label>
                <label className={styles.field}>
                  <span>严重程度</span>
                  <select value={severity} onChange={e => setSeverity(e.target.value)}>
                    <option value="LOW">低：样式/文案问题</option>
                    <option value="MEDIUM">中：影响局部流程</option>
                    <option value="HIGH">高：阻断业务操作</option>
                    <option value="CRITICAL">紧急：系统不可用/数据风险</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>问题说明</span>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="请描述你刚才做了什么、期望结果、实际结果。" rows={4} />
                </label>
                <label className={styles.field}>
                  <span>截图 / PDF（最多 5 个，单个 ≤15MB）</span>
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
                  <button type="button" className={styles.secondaryButton} onClick={() => setOpen(false)}>取消</button>
                  <button type="button" className={styles.primaryButton} onClick={submit} disabled={submitting}>
                    {submitting ? <Loader2 size={15} className={styles.spin} /> : null}
                    提交问题
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

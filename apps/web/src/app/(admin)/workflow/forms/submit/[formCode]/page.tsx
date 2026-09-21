'use client';

import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useParams, useRouter } from 'next/navigation';
import { Send, CheckCircle, FileText, ArrowLeft, AlertCircle, Copy, PlayCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader'; // G28：全局化 + 业务用户感受一致
import { useLanguage } from "@/contexts/LanguageContext";
import { WorkflowFormRenderer } from '@/components/workflow/WorkflowFormRenderer';
import type { FormSchema, UiSchema } from '@/components/workflow/WorkflowFormRenderer';

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface FormDetail {
  form: {
    id: number;
    code: string;
    name: string;
    biz_type: string | null;
    module_code: string | null;
    remark: string | null;
    status: string;
    current_version_id: number | null;
  };
  currentVersion: {
    id: number;
    version_no: number;
    status: string;
    schema_json: FormSchema;
    ui_schema_json: UiSchema;
  } | null;
}
interface SubmitResult {
  submissionNo: string;
  submissionId: number;
  formCode: string;
  formVersionId: number;
  versionNo: number;
  status: string;
}
interface StartApprovalResult {
  submissionId: number;
  submissionNo: string;
  instanceId: string | null;
  instanceNo: string | null;
  autoApproved: boolean;
  status: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {})
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body?.errors) throw Object.assign(new Error(body.message ?? 'validation'), {
      fieldErrors: body.errors
    });
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function FormSubmitPage() {
  const { t } = useLanguage();
  const params = useParams();
  const router = useRouter();
  const formCode = (params?.formCode as string ?? '').toUpperCase();
  const [detail, setDetail] = useState<FormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [approvalResult, setApprovalResult] = useState<StartApprovalResult | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState('');

  // ── 加载表单定义 ──────────────────────────────────────────────────────────

  const loadForm = useCallback(async () => {
    if (!formCode) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<FormDetail>(`/api/workflow/forms/${formCode}`);
      setDetail(res);
      // 用默认值初始化 formData
      if (res.currentVersion?.schema_json?.properties) {
        const defaults: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(res.currentVersion.schema_json.properties)) {
          if (prop.default !== undefined) defaults[key] = prop.default;
        }
        setFormData(defaults);
      }
    } catch (e: any) {
      setLoadError(e.message ?? t('ui.加载失败','加载失败'));
    } finally {
      setLoading(false);
    }
  }, [formCode]);
  useEffect(() => {
    loadForm();
  }, [loadForm]);

  // ── 提交 ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!detail?.currentVersion) return;
    setSubmitting(true);
    setSubmitError('');
    setFieldErrors({});
    try {
      const res = await apiFetch<SubmitResult>(`/api/workflow/forms/${formCode}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          data: formData
        })
      });
      setResult(res);
    } catch (e: any) {
      if ((e as any).fieldErrors) {
        setFieldErrors((e as any).fieldErrors);
        setSubmitError(t('ui.请修正表单中的错误后重新提交','请修正表单中的错误后重新提交'));
      } else {
        setSubmitError(e.message ?? t('ui.提交失败，请重试','提交失败，请重试'));
      }
    } finally {
      setSubmitting(false);
    }
  };
  const handleFieldChange = (key: string, val: unknown) => {
    setFormData(prev => ({
      ...prev,
      [key]: val
    }));
    if (fieldErrors[key]) {
      setFieldErrors(prev => {
        const next = {
          ...prev
        };
        delete next[key];
        return next;
      });
    }
  };
  const copyNo = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.submissionNo).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleStartApproval = async () => {
    if (!result) return;
    setApproving(true);
    setApprovalError('');
    try {
      const res = await apiFetch<StartApprovalResult>(`/api/workflow/forms/submissions/${result.submissionId}/start-approval`, {
        method: 'POST'
      });
      setApprovalResult(res);
    } catch (e: any) {
      setApprovalError(e.message ?? t('ui.启动审批失败，请重试','启动审批失败，请重试'));
    } finally {
      setApproving(false);
    }
  };

  // ── 渲染 ─────────────────────────────────────────────────────────────────

  // 加载中
  if (loading) return <div style={{
    padding: '60px 32px',
    textAlign: 'center',
    color: 'var(--text-disabled)'
  }}>
      <div className={u.fs16}>{t('ui.加载表单中…','加载表单中…')}</div>
    </div>;

  // 加载错误
  if (loadError) return <div style={{
    padding: '40px 32px',
    maxWidth: 600,
    margin: '0 auto'
  }}>
      <div style={{
      background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
      border: '1px solid var(--status-danger)',
      borderRadius: 14,
      padding: '24px 28px'
    }}>
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10
      }}>
          <AlertCircle size={20} color="var(--status-danger)" />
          <span style={{
          fontWeight: 700,
          color: 'var(--status-danger)',
          fontSize: 16
        }}>{t('ui.加载失败','加载失败')}</span>
        </div>
        <div style={{
        fontSize: 14,
        color: 'var(--text-secondary)',
        marginBottom: 16
      }}>{loadError}</div>
        <button onClick={() => router.back()} style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        borderRadius: 8,
        border: '1.5px solid var(--border)',
        background: 'var(--bg-card)',
        color: 'var(--text-secondary)',
        fontSize: 13,
        cursor: 'pointer'
      }}>
          <ArrowLeft size={14} /> {t('ui.返回','返回')}
        </button>
      </div>
    </div>;

  // 表单不存在或无版本
  if (!detail || !detail.currentVersion) return <div style={{
    padding: '40px 32px',
    maxWidth: 600,
    margin: '0 auto'
  }}>
      <div style={{
      background: 'color-mix(in srgb, var(--status-warning) 12%, transparent)',
      border: '1px solid color-mix(in srgb, var(--status-warning) 16%, transparent)',
      borderRadius: 14,
      padding: '24px 28px',
      textAlign: 'center'
    }}>
        <FileText size={36} color="var(--status-warning)" className={u.mb12} />
        <div style={{
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--status-warning)',
        marginBottom: 8
      }}>{t('ui.表单暂无可用版本','表单暂无可用版本')}</div>
        <div style={{
        fontSize: 13,
        color: 'var(--text-secondary)',
        marginBottom: 16
      }}>{t('ui.表单','表单')} &quot;{formCode}&quot; {t('ui.尚未发布任何版本，无法提交','尚未发布任何版本，无法提交')}</div>
        <button onClick={() => router.push('/workflow/forms/runtime')} style={{
        padding: '8px 18px',
        borderRadius: 8,
        border: 'none',
        background: 'var(--status-warning)',
        color: 'var(--text-on-dark)',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer'
      }}>{t('ui.前往表单管理','前往表单管理')}</button>
      </div>
    </div>;
  const {
    form,
    currentVersion
  } = detail;

  // 提交成功
  if (result) return <div style={{
    padding: '40px 32px',
    maxWidth: 560,
    margin: '0 auto'
  }}>
      <div style={{
      background: 'color-mix(in srgb, var(--status-success) 12%, transparent)',
      border: '1.5px solid var(--status-success)',
      borderRadius: 18,
      padding: '36px 32px',
      textAlign: 'center'
    }}>
        <div style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: 'var(--status-success)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 20px'
      }}>
          <CheckCircle size={32} color="var(--bg-card)" />
        </div>
        <h2 style={{
        margin: '0 0 8px',
        fontSize: 22,
        fontWeight: 800,
        color: 'var(--status-success)'
      }}>{t('ui.提交成功','提交成功')}</h2>
        <p style={{
        margin: '0 0 24px',
        fontSize: 14,
        color: 'var(--status-success)'
      }}>
          {form.name} {t('ui.表单已成功提交','表单已成功提交')}
        </p>

        {/* 提交编号 */}
        <div style={{
        background: 'var(--bg-card)',
        borderRadius: 12,
        padding: '16px 20px',
        border: '1.5px solid var(--status-success)',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12
      }}>
          <div style={{
          textAlign: 'left'
        }}>
            <div style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            fontWeight: 600,
            marginBottom: 4
          }}>{t('ui.提交编号','提交编号')}</div>
            <div style={{
            fontSize: 18,
            fontWeight: 800,
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            letterSpacing: 1
          }}>
              {result.submissionNo}
            </div>
          </div>
          <button onClick={copyNo} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '7px 14px',
          borderRadius: 8,
          border: '1.5px solid var(--status-success)',
          background: copied ? 'var(--status-success)' : 'var(--bg-card)',
          color: copied ? 'var(--bg-card)' : 'var(--status-success)',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}>
            <Copy size={12} /> {copied ? t('ui.已复制','已复制') : t('ui.复制','复制')}
          </button>
        </div>

        <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px 16px',
        fontSize: 13,
        color: 'var(--status-success)',
        marginBottom: 24,
        textAlign: 'left'
      }}>
          <span>{t('ui.表单版本：','表单版本：')}v{result.versionNo}</span>
          <span>{t('ui.状态：','状态：')}{result.status}</span>
          <span>{t('ui.表单代码：','表单代码：')}{result.formCode}</span>
        </div>

        {/* 审批错误 */}
        {approvalError && <div style={{
        background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
        border: '1px solid var(--status-danger)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'var(--status-danger)'
      }}>
            <AlertCircle size={14} />
            {approvalError}
          </div>}

        {/* 审批已启动 */}
        {approvalResult && <div style={{
        background: approvalResult.autoApproved ? 'color-mix(in srgb, var(--status-success) 12%, transparent)' : 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
        border: `1px solid ${approvalResult.autoApproved ? 'var(--status-success)' : 'color-mix(in srgb, var(--color-accent) 16%, transparent)'}`,
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 16,
        fontSize: 13
      }}>
            {approvalResult.autoApproved ? <span style={{
          color: 'var(--status-success)',
          fontWeight: 600
        }}>
                ✓ {t('ui.无需审批，已自动通过','无需审批，已自动通过')}
              </span> : <span style={{
          color: 'var(--color-accent)',
          fontWeight: 600
        }}>
                ✓ {t('ui.审批流已启动','审批流已启动')}
                {approvalResult.instanceNo && <span style={{
            marginLeft: 8,
            fontFamily: 'monospace',
            fontWeight: 400
          }}>
                    {approvalResult.instanceNo}
                  </span>}
              </span>}
          </div>}

        <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap'
      }}>
          {/* 启动审批按钮（仅在未启动时显示） */}
          {!approvalResult && <button onClick={handleStartApproval} disabled={approving} style={{
          flex: 1,
          minWidth: 120,
          padding: '11px',
          borderRadius: 10,
          border: 'none',
          background: approving ? 'var(--text-disabled)' : 'var(--status-special)',
          color: 'var(--text-on-dark)',
          fontSize: 14,
          fontWeight: 700,
          cursor: approving ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7
        }}>
              <PlayCircle size={15} />
              {approving ? t('ui.启动中…','启动中…') : t('ui.启动审批流','启动审批流')}
            </button>}
          <button onClick={() => {
          setResult(null);
          setApprovalResult(null);
          setApprovalError('');
          setFormData({});
          setFieldErrors({});
        }} style={{
          flex: 1,
          minWidth: 100,
          padding: '11px',
          borderRadius: 10,
          border: '1.5px solid var(--status-success)',
          background: 'var(--bg-card)',
          color: 'var(--status-success)',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer'
        }}>
            {t('ui.继续提交','继续提交')}
          </button>
          <button onClick={() => router.push('/workflow/forms/runtime')} style={{
          flex: 1,
          minWidth: 100,
          padding: '11px',
          borderRadius: 10,
          border: 'none',
          background: 'var(--status-success)',
          color: 'var(--text-on-dark)',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer'
        }}>
            {t('ui.返回表单列表','返回表单列表')}
          </button>
        </div>
      </div>
    </div>;

  // 表单渲染
  return <div>
      {/* G28：全局 PageHeader 替换自定义标题 */}
      <PageHeader
        title={form.name}
        subtitle={`${form.code} · v${currentVersion.version_no}${form.biz_type ? ` · ${form.biz_type}` : ''}`}
        breadcrumb={[t('ui.工作流','工作流'), t('ui.表单列表','表单列表'), form.name]}
        actions={
          <button onClick={() => router.push('/workflow/forms/runtime')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            border: '1.5px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            fontSize: 13, cursor: 'pointer',
          }}>
            <ArrowLeft size={13} /> {t('ui.返回列表','返回列表')}
          </button>
        }
      />

      <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* 表单卡片 */}
      <div style={{
      background: 'var(--bg-card)',
      borderRadius: 18,
      border: '1.5px solid var(--bg-muted)',
      padding: '28px 32px',
      boxShadow: '0 1px 6px var(--overlay-black-06)'
    }}>

        {submitError && <div style={{
        background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
        border: '1px solid var(--status-danger)',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 20,
        color: 'var(--status-danger)',
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
            <AlertCircle size={16} />
            {submitError}
          </div>}

        <WorkflowFormRenderer schema={currentVersion.schema_json} uiSchema={currentVersion.ui_schema_json} value={formData} onChange={handleFieldChange} errors={fieldErrors} disabled={submitting} />

        <div style={{
        marginTop: 28,
        paddingTop: 20,
        borderTop: '1px solid var(--bg-muted)',
        display: 'flex',
        gap: 12
      }}>
          <button onClick={() => {
          setFormData({});
          setFieldErrors({});
          setSubmitError('');
        }} disabled={submitting} style={{
          padding: '11px 24px',
          borderRadius: 10,
          border: '1.5px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--text-secondary)',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer'
        }}>
            {t('ui.重置','重置')}
          </button>
          <button onClick={handleSubmit} disabled={submitting} style={{
          flex: 1,
          padding: '11px 24px',
          borderRadius: 10,
          border: 'none',
          background: submitting ? 'var(--text-disabled)' : 'var(--status-special)',
          color: 'var(--text-on-dark)',
          fontSize: 14,
          fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transition: 'background 0.2s'
        }}>
            <Send size={16} />
            {submitting ? t('ui.提交中…','提交中…') : t('ui.提交表单','提交表单')}
          </button>
        </div>
      </div>

      {/* 说明 */}
      <div style={{
      marginTop: 16,
      fontSize: 12,
      color: 'var(--text-disabled)',
      textAlign: 'center'
    }}>
        {t('ui.提交后数据将保存为快照（版本','提交后数据将保存为快照（版本')} v{currentVersion.version_no}{t('ui.），不受后续版本变更影响','），不受后续版本变更影响')}
      </div>
      </div> {/* G28：关闭 maxWidth 容器 */}
    </div>;
}

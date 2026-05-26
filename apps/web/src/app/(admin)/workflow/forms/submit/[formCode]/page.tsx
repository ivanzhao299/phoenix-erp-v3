'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Send, CheckCircle, FileText, ArrowLeft, AlertCircle, Copy,
} from 'lucide-react';
import { WorkflowFormRenderer } from '@/components/workflow/WorkflowFormRenderer';
import type { FormSchema, UiSchema } from '@/components/workflow/WorkflowFormRenderer';

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface FormDetail {
  form: {
    id:                 number;
    code:               string;
    name:               string;
    biz_type:           string | null;
    module_code:        string | null;
    remark:             string | null;
    status:             string;
    current_version_id: number | null;
  };
  currentVersion: {
    id:             number;
    version_no:     number;
    status:         string;
    schema_json:    FormSchema;
    ui_schema_json: UiSchema;
  } | null;
}

interface SubmitResult {
  submissionNo:  string;
  submissionId:  number;
  formCode:      string;
  formVersionId: number;
  versionNo:     number;
  status:        string;
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
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body?.errors) throw Object.assign(new Error(body.message ?? 'validation'), { fieldErrors: body.errors });
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function FormSubmitPage() {
  const params  = useParams();
  const router  = useRouter();
  const formCode = (params?.formCode as string ?? '').toUpperCase();

  const [detail,       setDetail]       = useState<FormDetail | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState('');
  const [formData,     setFormData]     = useState<Record<string, unknown>>({});
  const [fieldErrors,  setFieldErrors]  = useState<Record<string, string>>({});
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState('');
  const [result,       setResult]       = useState<SubmitResult | null>(null);
  const [copied,       setCopied]       = useState(false);

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
      setLoadError(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [formCode]);

  useEffect(() => { loadForm(); }, [loadForm]);

  // ── 提交 ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!detail?.currentVersion) return;
    setSubmitting(true);
    setSubmitError('');
    setFieldErrors({});
    try {
      const res = await apiFetch<SubmitResult>(`/api/workflow/forms/${formCode}/submit`, {
        method: 'POST',
        body: JSON.stringify({ data: formData }),
      });
      setResult(res);
    } catch (e: any) {
      if ((e as any).fieldErrors) {
        setFieldErrors((e as any).fieldErrors);
        setSubmitError('请修正表单中的错误后重新提交');
      } else {
        setSubmitError(e.message ?? '提交失败，请重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleFieldChange = (key: string, val: unknown) => {
    setFormData(prev => ({ ...prev, [key]: val }));
    if (fieldErrors[key]) {
      setFieldErrors(prev => {
        const next = { ...prev };
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

  // ── 渲染 ─────────────────────────────────────────────────────────────────

  // 加载中
  if (loading) return (
    <div style={{ padding: '60px 32px', textAlign: 'center', color: '#94a3b8' }}>
      <div style={{ fontSize: 16 }}>加载表单中…</div>
    </div>
  );

  // 加载错误
  if (loadError) return (
    <div style={{ padding: '40px 32px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <AlertCircle size={20} color="#ef4444" />
          <span style={{ fontWeight: 700, color: '#ef4444', fontSize: 16 }}>加载失败</span>
        </div>
        <div style={{ fontSize: 14, color: '#475569', marginBottom: 16 }}>{loadError}</div>
        <button onClick={() => router.back()} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 8,
          border: '1.5px solid #e2e8f0', background: '#fff',
          color: '#475569', fontSize: 13, cursor: 'pointer',
        }}>
          <ArrowLeft size={14} /> 返回
        </button>
      </div>
    </div>
  );

  // 表单不存在或无版本
  if (!detail || !detail.currentVersion) return (
    <div style={{ padding: '40px 32px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, padding: '24px 28px', textAlign: 'center' }}>
        <FileText size={36} color="#f59e0b" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>表单暂无可用版本</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>表单 "{formCode}" 尚未发布任何版本，无法提交</div>
        <button onClick={() => router.push('/workflow/forms/runtime')} style={{
          padding: '8px 18px', borderRadius: 8, border: 'none',
          background: '#f59e0b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>前往表单管理</button>
      </div>
    </div>
  );

  const { form, currentVersion } = detail;

  // 提交成功
  if (result) return (
    <div style={{ padding: '40px 32px', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 18, padding: '36px 32px', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <CheckCircle size={32} color="#fff" />
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#064e3b' }}>提交成功</h2>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: '#065f46' }}>
          {form.name} 表单已成功提交
        </p>

        {/* 提交编号 */}
        <div style={{
          background: '#fff', borderRadius: 12, padding: '16px 20px',
          border: '1.5px solid #bbf7d0', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>提交编号</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', letterSpacing: 1 }}>
              {result.submissionNo}
            </div>
          </div>
          <button onClick={copyNo} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 14px', borderRadius: 8,
            border: '1.5px solid #10b981', background: copied ? '#10b981' : '#fff',
            color: copied ? '#fff' : '#10b981', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.2s',
          }}>
            <Copy size={12} /> {copied ? '已复制' : '复制'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13, color: '#065f46', marginBottom: 24, textAlign: 'left' }}>
          <span>表单版本：v{result.versionNo}</span>
          <span>状态：{result.status}</span>
          <span>表单代码：{result.formCode}</span>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => { setResult(null); setFormData({}); setFieldErrors({}); }}
            style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid #10b981', background: '#fff', color: '#10b981', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            继续提交
          </button>
          <button
            onClick={() => router.push('/workflow/forms/runtime')}
            style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            返回表单列表
          </button>
        </div>
      </div>
    </div>
  );

  // 表单渲染
  return (
    <div style={{ padding: '28px 32px', maxWidth: 680, margin: '0 auto' }}>

      {/* 返回 + 标题 */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push('/workflow/forms/runtime')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            border: '1.5px solid #e2e8f0', background: '#fff',
            color: '#64748b', fontSize: 13, cursor: 'pointer', marginBottom: 16,
          }}
        >
          <ArrowLeft size={13} /> 返回表单列表
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: '#7c3aed18', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={22} color="#7c3aed" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{form.name}</h1>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              <span style={{ fontFamily: 'monospace' }}>{form.code}</span>
              {' · v'}{currentVersion.version_no}
              {form.biz_type && ` · ${form.biz_type}`}
            </div>
          </div>
        </div>
      </div>

      {/* 表单卡片 */}
      <div style={{ background: '#fff', borderRadius: 18, border: '1.5px solid #f1f5f9', padding: '28px 32px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>

        {submitError && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, color: '#ef4444', fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertCircle size={16} />
            {submitError}
          </div>
        )}

        <WorkflowFormRenderer
          schema={currentVersion.schema_json}
          uiSchema={currentVersion.ui_schema_json}
          value={formData}
          onChange={handleFieldChange}
          errors={fieldErrors}
          disabled={submitting}
        />

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 12 }}>
          <button
            onClick={() => { setFormData({}); setFieldErrors({}); setSubmitError(''); }}
            disabled={submitting}
            style={{
              padding: '11px 24px', borderRadius: 10,
              border: '1.5px solid #e2e8f0', background: '#fff',
              color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            重置
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              flex: 1, padding: '11px 24px', borderRadius: 10,
              border: 'none', background: submitting ? '#94a3b8' : '#7c3aed',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.2s',
            }}
          >
            <Send size={16} />
            {submitting ? '提交中…' : '提交表单'}
          </button>
        </div>
      </div>

      {/* 说明 */}
      <div style={{ marginTop: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
        提交后数据将保存为快照（版本 v{currentVersion.version_no}），不受后续版本变更影响
      </div>
    </div>
  );
}

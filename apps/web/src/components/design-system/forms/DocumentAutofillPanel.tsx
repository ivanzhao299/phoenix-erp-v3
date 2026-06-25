'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
import { parseAttachmentRefs } from '@/lib/attachments';

export interface DocumentAutofillSuggestion {
  field: string;
  label?: string;
  value: string;
  confidence?: number;
  source?: string;
}

export interface DocumentAutofillPanelProps {
  fileRefs: unknown;
  purpose: 'PROCUREMENT_CONTRACT' | 'GENERIC_DOCUMENT';
  fields: string[];
  onApply: (suggestions: DocumentAutofillSuggestion[]) => void;
  disabled?: boolean;
  title?: string;
  helperText?: string;
}

export function DocumentAutofillPanel({
  fileRefs,
  purpose,
  fields,
  onApply,
  disabled,
  title = '识别附件并回填',
  helperText = '仅调用受控附件识别接口，不读取裸链接。',
}: DocumentAutofillPanelProps) {
  const refs = parseAttachmentRefs(fileRefs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<DocumentAutofillSuggestion[]>([]);
  const [status, setStatus] = useState('');

  const canExtract = refs.length > 0 && !disabled;

  async function extract() {
    if (!canExtract) {
      setError('请先上传需要识别的合同或图片附件');
      return;
    }
    setLoading(true);
    setError('');
    setWarnings([]);
    setSuggestions([]);
    try {
      const token = sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
      const res = await fetch('/api/document-intelligence/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fileIds: refs, purpose, fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `识别失败（HTTP ${res.status}）`);
      setStatus(String(data?.status ?? ''));
      setWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
      setSuggestions(Array.isArray(data?.fieldSuggestions) ? data.fieldSuggestions : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '识别失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      marginTop: 8,
      padding: 10,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-muted)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Sparkles size={14} /> {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            {helperText}
          </div>
        </div>
        <button
          type="button"
          onClick={extract}
          disabled={!canExtract || loading}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: canExtract ? 'var(--bg-card)' : 'var(--bg-muted)',
            color: canExtract ? 'var(--text-primary)' : 'var(--text-disabled)',
            padding: '6px 10px',
            cursor: canExtract && !loading ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? '识别中…' : '开始识别'}
        </button>
      </div>

      {status && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          识别状态：{status === 'PARTIAL_METADATA_EXTRACTED' ? '已生成部分可回填建议' : '等待 OCR/AI 引擎'}
        </div>
      )}
      {error && <InfoLine tone="danger" text={error} />}
      {warnings.map((w, i) => <InfoLine key={i} tone="warning" text={w} />)}

      {suggestions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>可回填建议</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {suggestions.map(s => (
              <div key={s.field} style={{
                display: 'grid',
                gridTemplateColumns: '90px 1fr auto',
                gap: 8,
                alignItems: 'center',
                fontSize: 12,
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-card)',
              }}>
                <strong>{s.label ?? s.field}</strong>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>{Math.round((s.confidence ?? 0) * 100)}%</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onApply(suggestions)}
            style={{
              marginTop: 8,
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-primary)',
              color: 'var(--text-on-dark)',
              padding: '7px 12px',
              cursor: 'pointer',
            }}
          >
            应用建议到表单
          </button>
        </div>
      )}
    </div>
  );
}

function InfoLine({ text, tone }: { text: string; tone: 'warning' | 'danger' }) {
  const color = tone === 'danger' ? 'var(--status-danger)' : 'var(--status-warning)';
  const Icon = tone === 'danger' ? AlertCircle : CheckCircle;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8, fontSize: 12, color }}>
      <Icon size={13} style={{ marginTop: 1, flex: '0 0 auto' }} />
      <span>{text}</span>
    </div>
  );
}

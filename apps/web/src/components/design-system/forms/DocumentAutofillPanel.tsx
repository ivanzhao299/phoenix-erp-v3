'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, ClipboardCheck, ImageIcon, Sparkles } from 'lucide-react';
import { parseAttachmentRefs } from '@/lib/attachments';
import { useLanguage } from "@/contexts/LanguageContext";

export interface DocumentAutofillSuggestion {
  field: string;
  label?: string;
  value: string;
  displayValue?: string;
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
  reviewTitle?: string;
  applyButtonLabel?: string;
}

export function DocumentAutofillPanel({
  fileRefs,
  purpose,
  fields,
  onApply,
  disabled,
  title,
  helperText,
  reviewTitle,
  applyButtonLabel,
}: DocumentAutofillPanelProps) {
  const { t } = useLanguage();
  const resolvedTitle = title ?? t('ui.识别附件并回填', '识别附件并回填');
  const resolvedHelperText = helperText ?? t('ui.仅调用受控附件识别接口，不读取裸链接。识别结果需人工审核确认后才会回填。', '仅调用受控附件识别接口，不读取裸链接。识别结果需人工审核确认后才会回填。');
  const resolvedReviewTitle = reviewTitle ?? t('ui.待人工审核的识别结果', '待人工审核的识别结果');
  const resolvedApplyButtonLabel = applyButtonLabel ?? t('ui.确认无误并回填选中字段', '确认无误并回填选中字段');
  const refs = parseAttachmentRefs(fileRefs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<DocumentAutofillSuggestion[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');
  const [applied, setApplied] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [qualityText, setQualityText] = useState('');
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearProgressTimers() {
    progressTimers.current.forEach(timer => clearTimeout(timer));
    progressTimers.current = [];
  }

  const canExtract = refs.length > 0 && !disabled;
  const selectedSuggestions = useMemo(
    () => suggestions.filter(s => selectedFields.has(s.field)),
    [selectedFields, suggestions],
  );

  useEffect(() => () => clearProgressTimers(), []);

  function scheduleProgress() {
    clearProgressTimers();
    const stages = [
      [80, 12, '校验附件'],
      [500, 28, '提取正文'],
      [1400, 52, '匹配表单字段'],
      [2600, 76, '生成回填建议'],
      [5200, 88, '仍在识别，请稍候'],
    ] as const;
    for (const [delay, value, text] of stages) {
      progressTimers.current.push(setTimeout(() => {
        setProgress(prev => Math.max(prev, value));
        setProgressText(text);
      }, delay));
    }
  }

  function describeQuality(data: Record<string, unknown>, warningList: string[]) {
    const textExtraction = data?.textExtraction as { extractedChars?: number; status?: string } | undefined;
    const chars = Number(textExtraction?.extractedChars ?? 0);
    if (chars >= 500) return `${t('ui.图片/合同可读性较好，已提取约','图片/合同可读性较好，已提取约')} ${chars} ${t('ui.字','字')}`;
    if (chars >= 80) return `${t('ui.图片/合同可读性一般，已提取约','图片/合同可读性一般，已提取约')} ${chars} ${t('ui.字，建议人工重点核对','字，建议人工重点核对')}`;
    if (warningList.length) return t('ui.图片或 PDF 正文不可稳定识别，请检查清晰度、方向、反光和完整性','图片或 PDF 正文不可稳定识别，请检查清晰度、方向、反光和完整性');
    return t('ui.建议使用清晰原图或可复制文字的 PDF，避免截图过小、倾斜、反光','建议使用清晰原图或可复制文字的 PDF，避免截图过小、倾斜、反光');
  }

  async function extract() {
    if (!canExtract) {
      setError(t('ui.请先上传需要识别的合同或图片附件','请先上传需要识别的合同或图片附件'));
      return;
    }
    setLoading(true);
    setError('');
    setWarnings([]);
    setSuggestions([]);
    setSelectedFields(new Set());
    setApplied(false);
    setProgress(6);
    setProgressText(t('ui.准备识别','准备识别'));
    setQualityText('');
    scheduleProgress();
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
      if (!res.ok) throw new Error(data?.message ?? `${t('ui.识别失败（HTTP','识别失败（HTTP')} ${res.status}）`);
      const warningList = Array.isArray(data?.warnings) ? data.warnings : [];
      setStatus(String(data?.status ?? ''));
      setWarnings(warningList);
      const nextSuggestions: DocumentAutofillSuggestion[] = Array.isArray(data?.fieldSuggestions) ? data.fieldSuggestions : [];
      setSuggestions(nextSuggestions);
      setSelectedFields(new Set(nextSuggestions.map(s => s.field)));
      setApplied(false);
      setQualityText(describeQuality(data, warningList));
      setProgress(100);
      setProgressText(Array.isArray(data?.fieldSuggestions) && data.fieldSuggestions.length ? t('ui.识别完成，等待人工确认','识别完成，等待人工确认') : t('ui.识别完成，未找到可直接回填字段','识别完成，未找到可直接回填字段'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('ui.识别失败','识别失败'));
      setProgress(prev => Math.max(prev, 100));
      setProgressText(t('ui.识别失败','识别失败'));
    } finally {
      clearProgressTimers();
      setLoading(false);
    }
  }

  function toggleField(field: string) {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  function applySelected() {
    if (!selectedSuggestions.length) {
      setError(t('ui.请至少选择一项已人工确认的识别结果','请至少选择一项已人工确认的识别结果'));
      return;
    }
    setError('');
    onApply(selectedSuggestions);
    setApplied(true);
  }

  return (
    <div style={{
      marginTop: 6,
      padding: 8,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-muted)',
      maxHeight: suggestions.length ? 360 : 170,
      overflow: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Sparkles size={14} /> {resolvedTitle}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {resolvedHelperText}
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
          {loading ? t('ui.识别中…','识别中…') : t('ui.开始识别','开始识别')}
        </button>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        marginTop: 6,
        fontSize: 11,
        color: 'var(--text-secondary)',
      }}>
        <ClipboardCheck size={13} style={{ marginTop: 1, flex: '0 0 auto' }} />
        <span>{t('ui.流程：上传 → 识别 → 勾选审核 → 回填原字段 → 人工保存。','流程：上传 → 识别 → 勾选审核 → 回填原字段 → 人工保存。')}</span>
      </div>

      {(loading || progress > 0) && (
        <div style={{ marginTop: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span>{progressText || t('ui.等待识别','等待识别')}</span>
            <span>{Math.min(100, Math.max(0, progress))}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: 'var(--bg-card)', overflow: 'hidden', marginTop: 4 }}>
            <span style={{
              display: 'block',
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: '100%',
              borderRadius: 999,
              background: error ? 'var(--status-danger)' : 'var(--color-primary)',
              transition: 'width 220ms ease',
            }} />
          </div>
        </div>
      )}

      {(qualityText || loading) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 7,
          fontSize: 11,
          color: 'var(--text-secondary)',
        }}>
          <ImageIcon size={12} />
          <span>{qualityText || t('ui.建议上传清晰原图或文字型 PDF，避免倾斜、反光、截断。','建议上传清晰原图或文字型 PDF，避免倾斜、反光、截断。')}</span>
        </div>
      )}

      {status && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          {t('ui.状态：','状态：')}{status === 'PARTIAL_METADATA_EXTRACTED' ? t('ui.已生成建议','已生成建议') : t('ui.未提取到可回填字段','未提取到可回填字段')}
        </div>
      )}
      {error && <InfoLine tone="danger" text={error} />}
      {warnings.slice(0, 2).map((w, i) => <InfoLine key={i} tone="warning" text={w} />)}
      {warnings.length > 2 && <InfoLine tone="warning" text={`${t('ui.还有','还有')} ${warnings.length - 2} ${t('ui.条识别提示，建议人工核对附件质量。','条识别提示，建议人工核对附件质量。')}`} />}

      {suggestions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {resolvedReviewTitle}
          </div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 118, overflow: 'auto', paddingRight: 2 }}>
            {suggestions.map(s => (
              <div key={s.field} style={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(76px, 110px) minmax(0, 1fr) auto',
                gap: 8,
                alignItems: 'center',
                fontSize: 12,
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-card)',
              }}>
                <input
                  type="checkbox"
                  checked={selectedFields.has(s.field)}
                  onChange={() => toggleField(s.field)}
                  aria-label={`${t('ui.选择回填','选择回填')} ${s.label ?? s.field}`}
                />
                <strong>{s.label ?? s.field}</strong>
                <span
                  title={s.value}
                  style={{
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.displayValue ?? s.value}
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>{Math.round((s.confidence ?? 0) * 100)}%</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 7, fontSize: 11, color: 'var(--text-secondary)' }}>
            {t('ui.已选','已选')} {selectedSuggestions.length}/{suggestions.length} {t('ui.项；未选不回填，高风险字段需人工核对。','项；未选不回填，高风险字段需人工核对。')}
          </div>
          <button
            type="button"
            onClick={applySelected}
            disabled={!selectedSuggestions.length}
            style={{
              marginTop: 8,
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: selectedSuggestions.length ? 'var(--color-primary)' : 'var(--bg-muted)',
              color: 'var(--text-on-dark)',
              padding: '7px 12px',
              cursor: selectedSuggestions.length ? 'pointer' : 'not-allowed',
            }}
          >
            {resolvedApplyButtonLabel}
          </button>
          {applied && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--status-success)' }}>
              {t('ui.已按人工勾选结果回填，请继续核对表单字段后再保存。','已按人工勾选结果回填，请继续核对表单字段后再保存。')}
            </div>
          )}
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

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { usePermission } from '@/hooks/usePermission';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  FileText,
  GitCompareArrows,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

type TabKey = 'mappings' | 'reconciliation' | 'drafts' | 'fields' | 'jobs';

interface Overview {
  accountBooks: number;
  enabledBooks: number;
  fields: number;
  mappings: number;
  pendingMappings: number;
  approvedMappings: number;
  jobs: number;
  failedJobs: number;
  voucherDrafts: number;
  pushReadyDrafts: number;
  openReconciliationIssues: number;
  pushEnabled: boolean;
  boundary: string;
}

interface AccountBook {
  bookId: string;
  bookName: string;
  companyCode: string | null;
  companyName: string | null;
  enabled: boolean;
}

interface Mapping {
  id: string;
  mappingType: string;
  bookId: string;
  erpCode: string;
  erpName: string;
  chanjetId: string;
  chanjetCode: string;
  chanjetName: string;
  matchStatus: string;
  confidence: string;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface FieldCatalog {
  id: string;
  apiDomain: string;
  apiPath: string;
  method: string;
  fieldPath: string;
  sampleType: string;
  sampleValueMasked: string | null;
  observedCount: number;
}

interface SyncJob {
  id: string;
  jobType: string;
  bookId: string;
  period: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface VoucherDraft {
  id: string;
  sourceBizType: string;
  sourceBizId: string;
  companyCode: string;
  bookId: string;
  period: string;
  title: string;
  status: 'DRAFT' | 'REVIEWED' | 'PUSH_READY' | 'REJECTED';
  pushAllowed: boolean;
  pushStatus: string;
  createdBy: string;
  createdAt: string;
  voucherLines: Array<Record<string, unknown>>;
}

interface ReconciliationResult {
  id: string;
  reconciliationType: string;
  bookId: string;
  status: 'OK' | 'WARN' | 'MISMATCH' | 'HOLD';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  subjectType: string;
  subjectKey: string;
  subjectName: string;
  diffSummary: string;
  actionRequired: string;
  resolved: boolean;
  createdAt: string;
}

const cardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  padding: 16,
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const cellStyle: CSSProperties = {
  borderBottom: '1px solid var(--border)',
  padding: '10px 8px',
  verticalAlign: 'top',
};

function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'green' | 'red' | 'amber' | 'blue' | 'muted' }) {
  const colors = {
    green: ['#dcfce7', '#166534'],
    red: ['#fee2e2', '#991b1b'],
    amber: ['#fef3c7', '#92400e'],
    blue: ['#dbeafe', '#1d4ed8'],
    muted: ['var(--bg-muted)', 'var(--text-secondary)'],
  }[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '2px 8px', background: colors[0], color: colors[1], fontSize: 12, fontWeight: 600 }}>
      {children}
    </span>
  );
}

function statusTone(status: string): 'green' | 'red' | 'amber' | 'blue' | 'muted' {
  if (['SUCCESS', 'APPROVED', 'OK', 'REVIEWED', 'PUSH_READY'].includes(status)) return 'green';
  if (['FAIL', 'REJECTED', 'HOLD', 'CRITICAL'].includes(status)) return 'red';
  if (['WARN', 'MISMATCH', 'PENDING', 'DRAFT'].includes(status)) return 'amber';
  return 'muted';
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export default function ChanjetIntegrationPage() {
  const { canView, canEdit } = usePermission('MENU_FIN2_AR_LEDGER');
  const [tab, setTab] = useState<TabKey>('mappings');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [books, setBooks] = useState<AccountBook[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [fields, setFields] = useState<FieldCatalog[]>([]);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [drafts, setDrafts] = useState<VoucherDraft[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult[]>([]);
  const [draftSourceType, setDraftSourceType] = useState('MANUAL');
  const [draftSourceId, setDraftSourceId] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftLines, setDraftLines] = useState('[{"summary":"示例摘要","debitSubject":"","creditSubject":"","amount":0}]');

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const [ov, bookResp, mapResp, fieldResp, jobResp, draftResp, reconResp] = await Promise.all([
        request<{ success: boolean; overview: Overview; error?: string }>('/chanjet/integration/overview'),
        request<{ success: boolean; books: AccountBook[]; error?: string }>('/chanjet/integration/account-books'),
        request<{ success: boolean; mappings: Mapping[]; error?: string }>('/chanjet/integration/master-mappings'),
        request<{ success: boolean; fields: FieldCatalog[]; error?: string }>('/chanjet/integration/field-catalog?limit=200'),
        request<{ success: boolean; jobs: SyncJob[]; error?: string }>('/chanjet/integration/sync-jobs?limit=80'),
        request<{ success: boolean; drafts: VoucherDraft[]; error?: string }>('/chanjet/integration/voucher-drafts?limit=80'),
        request<{ success: boolean; results: ReconciliationResult[]; error?: string }>('/chanjet/integration/reconciliation-results?limit=120'),
      ]);
      if (!ov.success) throw new Error(ov.error || '总览加载失败');
      setOverview(ov.overview);
      setBooks(bookResp.books || []);
      setMappings(mapResp.mappings || []);
      setFields(fieldResp.fields || []);
      setJobs(jobResp.jobs || []);
      setDrafts(draftResp.drafts || []);
      setReconciliation(reconResp.results || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => [
    { label: '账套缓存', value: overview?.accountBooks ?? 0, sub: `${overview?.enabledBooks ?? 0} 个启用`, icon: BookOpen },
    { label: '字段目录', value: overview?.fields ?? 0, sub: '脱敏字段样本', icon: Database },
    { label: '映射候选', value: overview?.mappings ?? 0, sub: `${overview?.pendingMappings ?? 0} 待审 / ${overview?.approvedMappings ?? 0} 已批`, icon: GitCompareArrows },
    { label: '凭证草稿', value: overview?.voucherDrafts ?? 0, sub: `${overview?.pushReadyDrafts ?? 0} 可申请推送`, icon: FileText },
    { label: '开放差异', value: overview?.openReconciliationIssues ?? 0, sub: `${overview?.failedJobs ?? 0} 个失败作业`, icon: AlertTriangle },
  ], [overview]);

  async function runAction(label: string, action: () => Promise<unknown>) {
    if (!canEdit) return;
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await action();
      setMessage(`${label} 已完成`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function reviewMapping(id: string, reviewStatus: Mapping['reviewStatus']) {
    await runAction('映射审核', () => request(`/chanjet/integration/master-mappings/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ reviewStatus }),
    }));
  }

  async function updateDraftStatus(id: string, status: VoucherDraft['status']) {
    await runAction('凭证草稿审核', () => request(`/chanjet/integration/voucher-drafts/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }));
  }

  async function createDraft() {
    let lines: Array<Record<string, unknown>>;
    try {
      const parsed = JSON.parse(draftLines);
      if (!Array.isArray(parsed)) throw new Error('凭证分录必须为数组');
      lines = parsed;
    } catch (e) {
      setError(`凭证分录 JSON 不合法: ${(e as Error).message}`);
      return;
    }
    await runAction('凭证草稿创建', () => request('/chanjet/integration/voucher-drafts', {
      method: 'POST',
      body: JSON.stringify({
        sourceBizType: draftSourceType,
        sourceBizId: draftSourceId || `MANUAL-${Date.now()}`,
        title: draftTitle || '人工凭证草稿',
        voucherLines: lines,
      }),
    }));
    setDraftSourceId('');
    setDraftTitle('');
  }

  if (!canView) {
    return (
      <div style={{ padding: 32 }}>
        <PageHeader title="好业财中间层" subtitle="无权限访问，需 MENU_FIN2_AR_LEDGER:V" />
        <div style={{ color: 'var(--status-danger)' }}>无权限访问。</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1800 }}>
      <PageHeader
        title="好业财中间层"
        subtitle="账套 · 字段目录 · 主数据映射 · 对账差异 · 凭证草稿"
        breadcrumb={['财务管理', '好业财中间层']}
        actions={(
          <>
            <Button variant="outline" onClick={load} disabled={loading}><RefreshCw size={16} />刷新</Button>
            <Button variant="outline" disabled={!canEdit || loading} onClick={() => runAction('账套刷新', () => request('/chanjet/integration/account-books/refresh', { method: 'POST' }))}>刷新账套</Button>
            <Button disabled={!canEdit || loading} onClick={() => runAction('字段探针', () => request('/chanjet/integration/probe', { method: 'POST', body: JSON.stringify({ scope: ['ACCOUNT_BOOKS', 'DEPARTMENT', 'CUSTOMER_SUPPLIER', 'SUBJECT', 'PROJECT', 'FIN_ACCOUNT'] }) }))}>运行探针</Button>
          </>
        )}
      />

      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, borderColor: '#bfdbfe', background: '#eff6ff' }}>
        <ShieldCheck size={18} color="#1d4ed8" />
        <div style={{ color: '#1e3a8a', fontSize: 13 }}>
          中间层边界：只读好业财、写 ERP 中间层；凭证草稿不自动推送；业务主数据仍以 ERP 为权威源。
        </div>
      </div>

      {(error || message) && (
        <div style={{ marginBottom: 14, color: error ? 'var(--status-danger)' : 'var(--status-success)', fontSize: 13 }}>
          {error || message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                {item.label}<Icon size={18} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 10, color: 'var(--text-primary)' }}>{item.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{item.sub}</div>
            </div>
          );
        })}
      </div>

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>账套缓存</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
          {books.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>暂无账套缓存，请先刷新账套。</div>}
          {books.map((b) => (
            <div key={b.bookId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{b.bookName || b.bookId}</strong>
                <Badge tone={b.enabled ? 'green' : 'muted'}>{b.enabled ? '启用' : '未启用'}</Badge>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>{b.bookId}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{b.companyCode || '未映射公司'} {b.companyName ? `· ${b.companyName}` : ''}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          ['mappings', '主数据映射'],
          ['reconciliation', '对账差异'],
          ['drafts', '凭证草稿'],
          ['fields', '字段目录'],
          ['jobs', '作业审计'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as TabKey)}
            style={{
              border: 0,
              background: tab === key ? 'var(--brand)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--text-secondary)',
              padding: '9px 14px',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'mappings' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong>ERP ↔ 好业财主数据映射</strong>
            <Button size="sm" variant="outline" disabled={!canEdit || loading} onClick={() => runAction('映射对账', () => request('/chanjet/integration/reconciliation/run', { method: 'POST' }))}>
              <GitCompareArrows size={14} />生成映射对账
            </Button>
          </div>
          <table style={tableStyle}>
            <thead><tr>{['类型', 'ERP', '好业财', '匹配', '审核', '操作'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {mappings.slice(0, 80).map((m) => (
                <tr key={m.id}>
                  <td style={cellStyle}>{m.mappingType}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.bookId || '全局'}</div></td>
                  <td style={cellStyle}>{m.erpName || '—'}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.erpCode || '未绑定'}</div></td>
                  <td style={cellStyle}>{m.chanjetName || '—'}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.chanjetCode || m.chanjetId || '—'}</div></td>
                  <td style={cellStyle}><Badge tone={statusTone(m.matchStatus)}>{m.matchStatus}</Badge><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{m.confidence}%</div></td>
                  <td style={cellStyle}><Badge tone={statusTone(m.reviewStatus)}>{m.reviewStatus}</Badge></td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => reviewMapping(m.id, 'APPROVED')}>批准</Button>
                      <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => reviewMapping(m.id, 'REJECTED')}>拒绝</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {mappings.length === 0 && <tr><td style={cellStyle} colSpan={6}>暂无映射候选。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'reconciliation' && (
        <section style={cardStyle}>
          <strong>中间层对账差异</strong>
          <table style={{ ...tableStyle, marginTop: 10 }}>
            <thead><tr>{['状态', '对象', '差异', '建议动作', '时间'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {reconciliation.map((r) => (
                <tr key={r.id}>
                  <td style={cellStyle}><Badge tone={statusTone(r.status)}>{r.status}</Badge><div style={{ marginTop: 4 }}><Badge tone={statusTone(r.severity)}>{r.severity}</Badge></div></td>
                  <td style={cellStyle}>{r.subjectType}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.subjectName || r.subjectKey}</div></td>
                  <td style={cellStyle}>{r.diffSummary || '—'}</td>
                  <td style={cellStyle}>{r.actionRequired || '—'}</td>
                  <td style={cellStyle}>{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
              {reconciliation.length === 0 && <tr><td style={cellStyle} colSpan={5}>暂无对账差异。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'drafts' && (
        <section style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <strong>创建凭证草稿</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>只写中间层，不推送好业财。</div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <input value={draftSourceType} onChange={e => setDraftSourceType(e.target.value)} placeholder="来源类型，如 PROCUREMENT_PAYMENT" style={{ padding: 9, border: '1px solid var(--border)', borderRadius: 6 }} />
              <input value={draftSourceId} onChange={e => setDraftSourceId(e.target.value)} placeholder="来源单号/ID" style={{ padding: 9, border: '1px solid var(--border)', borderRadius: 6 }} />
              <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="凭证摘要" style={{ padding: 9, border: '1px solid var(--border)', borderRadius: 6 }} />
              <textarea value={draftLines} onChange={e => setDraftLines(e.target.value)} rows={4} style={{ padding: 9, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-mono, monospace)' }} />
              <Button disabled={!canEdit || loading} onClick={createDraft}><FileText size={16} />保存草稿</Button>
            </div>
          </div>
          <table style={tableStyle}>
            <thead><tr>{['草稿', '来源', '状态', '分录', '操作'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td style={cellStyle}>{d.title || `草稿 #${d.id}`}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDate(d.createdAt)}</div></td>
                  <td style={cellStyle}>{d.sourceBizType}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{d.sourceBizId}</div></td>
                  <td style={cellStyle}><Badge tone={statusTone(d.status)}>{d.status}</Badge><div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>push: {d.pushAllowed ? '待另行 Gate' : '禁用'}</div></td>
                  <td style={cellStyle}>{d.voucherLines?.length ?? 0} 行</td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => updateDraftStatus(d.id, 'REVIEWED')}>复核</Button>
                      <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => updateDraftStatus(d.id, 'PUSH_READY')}>可申请推送</Button>
                      <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => updateDraftStatus(d.id, 'REJECTED')}>拒绝</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {drafts.length === 0 && <tr><td style={cellStyle} colSpan={5}>暂无凭证草稿。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'fields' && (
        <section style={cardStyle}>
          <strong>好业财 API 字段目录</strong>
          <table style={{ ...tableStyle, marginTop: 10 }}>
            <thead><tr>{['接口', '字段', '类型', '脱敏样本', '次数'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.id}>
                  <td style={cellStyle}>{f.apiDomain}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{f.method} {f.apiPath}</div></td>
                  <td style={cellStyle}>{f.fieldPath}</td>
                  <td style={cellStyle}><Badge tone="blue">{f.sampleType}</Badge></td>
                  <td style={cellStyle}>{f.sampleValueMasked || '—'}</td>
                  <td style={cellStyle}>{f.observedCount}</td>
                </tr>
              ))}
              {fields.length === 0 && <tr><td style={cellStyle} colSpan={5}>暂无字段样本。运行探针后生成。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'jobs' && (
        <section style={cardStyle}>
          <strong>同步 / 探针 / 对账作业审计</strong>
          <table style={{ ...tableStyle, marginTop: 10 }}>
            <thead><tr>{['类型', '状态', '账套/期间', '错误', '时间'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td style={cellStyle}>{j.jobType}</td>
                  <td style={cellStyle}><Badge tone={statusTone(j.status)}>{j.status}</Badge></td>
                  <td style={cellStyle}>{j.bookId || '—'}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{j.period || '—'}</div></td>
                  <td style={cellStyle}>{j.errorMessage || '—'}</td>
                  <td style={cellStyle}>{fmtDate(j.createdAt)}</td>
                </tr>
              ))}
              {jobs.length === 0 && <tr><td style={cellStyle} colSpan={5}>暂无作业。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12, marginTop: 16 }}>
        <CheckCircle2 size={14} />
        当前页面不执行好业财写入、不执行生产外发；后续推送凭证必须另走独立 Gate。
      </div>
    </div>
  );
}

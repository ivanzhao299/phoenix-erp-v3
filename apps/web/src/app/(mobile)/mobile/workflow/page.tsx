'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, RefreshCw, ClipboardCheck, X, CheckCircle,
  XCircle, Sun, Moon, Clock, Building2, FolderOpen, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { MobilePageSkeleton, SkeletonCard, MobileEmptyState } from '@/components/mobile/MobileSkeleton';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/lib/haptic';
import {
  approvalApi,
  type WorkflowTask,
  type WorkflowTaskPage,
  type InstanceDetail,
} from '@/lib/mobile-api';
import { WorkflowFormRenderer } from '@/components/workflow/WorkflowFormRenderer';

// ── 常量 ─────────────────────────────────────────────────────────────────────

const BIZ_TYPE_LABEL: Record<string, string> = {
  PURCHASE_REQUEST: '采购申请',
  PURCHASE_ORDER:   '采购订单',
  PAYMENT:          '付款申请',
  SHAREHOLDER_FUND: '股东资金',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING:   'var(--status-warning)',
  APPROVED:  'var(--status-success)',
  REJECTED:  'var(--status-danger)',
  CANCELLED: '#94a3b8',
  TODO:      'var(--status-warning)',
  DONE:      'var(--status-success)',
};

// ── 安全摘要：股东资金不暴露金额/银行字段 ─────────────────────────────────────
function safeSubject(task: WorkflowTask): string {
  if (task.bizType === 'SHAREHOLDER_FUND') return '股东资金审批待处理';
  return task.subject ?? task.bizNo ?? task.bizType ?? '—';
}

function safeAmount(task: WorkflowTask): string | null {
  if (task.bizType === 'SHAREHOLDER_FUND') return null;
  if (task.amount == null) return null;
  return `${task.currencyCode ?? ''} ${Number(task.amount).toLocaleString()}`;
}

// ── 任务卡片 ──────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onApprove,
  onReject,
  onDetail,
}: {
  task: WorkflowTask;
  onApprove: (t: WorkflowTask) => void;
  onReject:  (t: WorkflowTask) => void;
  onDetail:  (t: WorkflowTask) => void;
}) {
  const { t, isDark } = useMobileTheme();
  const [expanded, setExpanded] = useState(false);

  const bizLabel = BIZ_TYPE_LABEL[task.bizType ?? ''] ?? task.bizType ?? '工作流';
  const amountStr = safeAmount(task);
  const subjectStr = safeSubject(task);
  const stepLabel = task.totalSteps
    ? `第 ${task.stepNo ?? task.currentStepNo ?? 1} / ${task.totalSteps} 步`
    : null;

  return (
    <div style={{
      background: t.cardBg,
      borderRadius: 16,
      border: `1px solid ${t.cardBorder}`,
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      {/* 卡片主体 */}
      <div
        style={{ padding: '14px 16px', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* 顶行：来源 badge + 状态 badge + 时间 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: task.taskSource === 'APPROVAL_ENGINE' ? '#7c3aed22' : '#0891b222',
              color:      task.taskSource === 'APPROVAL_ENGINE' ? '#7c3aed'   : '#0891b2',
            }}>
              {task.taskSource === 'APPROVAL_ENGINE' ? '审批引擎' : '工作流'}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: `${STATUS_COLOR[task.status] ?? '#94a3b8'}22`,
              color: STATUS_COLOR[task.status] ?? '#94a3b8',
            }}>
              {bizLabel}
            </span>
            {/* ── Phase F: SLA 标签 ── */}
            {task.isOverdue && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: '#fef2f2', color: 'var(--status-danger)', border: '1px solid #fecaca',
              }}>⏰ 已超期</span>
            )}
            {(task.escalationLevel ?? 0) > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa',
              }}>🔺 已升级</span>
            )}
          </div>
          <span style={{ fontSize: 11, color: t.textFaint }}>
            {task.createdAt ? new Date(task.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '—'}
          </span>
        </div>

        {/* 主题 */}
        <div style={{ fontWeight: 700, fontSize: 15, color: t.text, marginBottom: 6, lineHeight: 1.4 }}>
          {subjectStr}
        </div>

        {/* 金额 */}
        {amountStr && (
          <div style={{ fontSize: 18, fontWeight: 800, color: '#7c3aed', marginBottom: 6 }}>
            {amountStr}
          </div>
        )}

        {/* 公司 / 项目 / 步骤 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 4 }}>
          {task.companyName && (
            <span style={{ fontSize: 12, color: t.textSub, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Building2 size={11} /> {task.companyName}
            </span>
          )}
          {task.projectName && (
            <span style={{ fontSize: 12, color: t.textSub, display: 'flex', alignItems: 'center', gap: 4 }}>
              <FolderOpen size={11} /> {task.projectName}
            </span>
          )}
          {stepLabel && (
            <span style={{ fontSize: 12, color: t.textSub, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} /> {stepLabel}
            </span>
          )}
        </div>

        {/* 单据号 */}
        {task.bizNo && (
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: t.textFaint }}>{task.bizNo}</div>
        )}

        {/* ── Phase F: SLA 倒计时 / 超期提示 ── */}
        {task.dueAt && (() => {
          const msLeft = new Date(task.dueAt).getTime() - Date.now();
          const hLeft  = Math.floor(msLeft / 3600000);
          if (task.isOverdue) {
            const hOver = Math.abs(hLeft);
            return (
              <div style={{ fontSize: 11, color: 'var(--status-danger)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                ⏰ 已超期 {hOver >= 24 ? `${Math.floor(hOver / 24)}天` : `${hOver}小时`}
              </div>
            );
          }
          if (hLeft < 24) {
            return (
              <div style={{ fontSize: 11, color: 'var(--status-warning)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                ⚡ 剩余 {hLeft}小时截止
              </div>
            );
          }
          const dLeft = Math.floor(hLeft / 24);
          return (
            <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              ⏱ 剩余 {dLeft}天
            </div>
          );
        })()}
      </div>

      {/* 展开：操作按钮 */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${t.cardBorder}`,
          padding: '12px 16px',
          display: 'flex',
          gap: 10,
        }}>
          <button
            onClick={e => { e.stopPropagation(); onDetail(task); }}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              border: `1px solid ${t.cardBorder}`, background: 'transparent',
              color: t.textSub, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <ChevronDown size={14} /> 详情
          </button>
          <button
            onClick={e => { e.stopPropagation(); onApprove(task); }}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              background: 'var(--status-success)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <CheckCircle size={14} /> 通过
          </button>
          <button
            onClick={e => { e.stopPropagation(); onReject(task); }}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              border: '1.5px solid #ef4444', background: 'transparent',
              color: 'var(--status-danger)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <XCircle size={14} /> 拒绝
          </button>
        </div>
      )}
    </div>
  );
}

// ── 审批确认底栏（通过 / 拒绝） ────────────────────────────────────────────────

function ActionSheet({
  task,
  mode,
  onClose,
  onDone,
}: {
  task: WorkflowTask;
  mode: 'approve' | 'reject';
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, isDark } = useMobileTheme();
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (mode === 'reject' && !comment.trim()) {
      setErr('拒绝原因不能为空'); return;
    }
    setSubmitting(true); setErr('');
    try {
      if (mode === 'approve') {
        await approvalApi.approveInstance(task.instanceId, comment.trim() || undefined);
        haptic('success');
        toast.success('审批已通过');
      } else {
        await approvalApi.rejectInstance(task.instanceId, comment.trim());
        haptic('success');
        toast.success('已拒绝');
      }
      onDone();
    } catch (e: unknown) {
      haptic('error');
      const msg = e instanceof Error ? e.message : '操作失败，请重试';
      setErr(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const isApprove = mode === 'approve';
  const accentColor = isApprove ? 'var(--status-success)' : 'var(--status-danger)';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', background: isDark ? '#111827' : '#fff',
        borderRadius: '20px 20px 0 0',
        padding: '24px 16px calc(24px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: isApprove ? 'var(--status-success)' : 'var(--status-danger)' }}>
              {isApprove ? '✓ 确认审批通过' : '✗ 拒绝审批'}
            </div>
            <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>
              {safeSubject(task)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div>
          <label style={{ fontSize: 13, color: t.textSub, display: 'block', marginBottom: 6 }}>
            {isApprove ? '审批意见（可选）' : '拒绝原因 *'}
          </label>
          <textarea
            value={comment}
            onChange={e => { setComment(e.target.value); setErr(''); }}
            placeholder={isApprove ? '填写审批意见（可不填）' : '请填写拒绝原因…'}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', borderRadius: 10,
              border: `1.5px solid ${err ? 'var(--status-danger)' : isDark ? '#374151' : '#d1d5db'}`,
              background: isDark ? '#1f2937' : '#f9fafb',
              color: t.text, fontSize: 14, outline: 'none', resize: 'none', height: 88,
            }}
          />
        </div>

        {err && (
          <div style={{ color: 'var(--status-danger)', fontSize: 13, marginTop: 8, padding: '6px 10px', background: '#fef2f2', borderRadius: 8 }}>
            {err}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          style={{
            marginTop: 16, width: '100%', padding: '14px 0',
            background: submitting ? '#9ca3af' : accentColor,
            border: 'none', borderRadius: 12, color: '#fff',
            fontWeight: 700, fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '提交中…' : (isApprove ? '确认通过' : '确认拒绝')}
        </button>
      </div>
    </div>
  );
}

// ── 详情底栏 ──────────────────────────────────────────────────────────────────

function DetailSheet({
  task,
  onClose,
  onApprove,
  onReject,
}: {
  task: WorkflowTask;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t, isDark } = useMobileTheme();
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    approvalApi.getInstance(task.instanceId)
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(e => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [task.instanceId]);

  const stepStatusColor = (s: string) => s === 'APPROVED' ? 'var(--status-success)' : s === 'REJECTED' ? 'var(--status-danger)' : s === 'PENDING' ? 'var(--status-warning)' : '#94a3b8';
  const stepStatusLabel = (s: string) => s === 'APPROVED' ? '已通过' : s === 'REJECTED' ? '已拒绝' : s === 'PENDING' ? '待审批' : s;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxHeight: '85vh', overflowY: 'auto',
        background: isDark ? '#111827' : '#fff',
        borderRadius: '20px 20px 0 0',
        padding: '20px 16px calc(24px + env(safe-area-inset-bottom))',
      }}>
        {/* 头 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: t.text }}>审批详情</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* 业务摘要 */}
        <div style={{ background: isDark ? '#1f2937' : '#f9fafb', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.text, marginBottom: 8 }}>
            {safeSubject(task)}
          </div>
          {[
            { label: '单据编号', value: task.bizNo ?? task.instanceNo },
            { label: '业务类型', value: BIZ_TYPE_LABEL[task.bizType ?? ''] ?? task.bizType },
            { label: '金额',     value: safeAmount(task) },
            { label: '公司',     value: task.companyName },
            { label: '项目',     value: task.projectName },
            { label: '当前步骤', value: task.totalSteps ? `${task.stepNo ?? 1} / ${task.totalSteps}` : null },
          ].filter(r => r.value).map(r => (
            <div key={r.label} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: t.textSub, width: 64, flexShrink: 0 }}>{r.label}</span>
              <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub, marginBottom: 10 }}>审批流程</div>
          {loading && <div style={{ color: t.textFaint, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>加载中…</div>}
          {err && <div style={{ color: 'var(--status-danger)', fontSize: 13, padding: '8px 0' }}>{err}</div>}
          {detail?.steps?.map((step, idx) => (
            <div key={step.id} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: stepStatusColor(step.status),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 10, fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {idx + 1}
                </div>
                {idx < (detail.steps.length - 1) && (
                  <div style={{ width: 1, flex: 1, background: isDark ? '#374151' : '#e5e7eb', marginTop: 2 }} />
                )}
              </div>
              <div style={{ flex: 1, paddingBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
                    {step.approverName ?? step.approverRole ?? `步骤 ${step.stepNo}`}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                    background: `${stepStatusColor(step.status)}22`,
                    color: stepStatusColor(step.status),
                  }}>
                    {stepStatusLabel(step.status)}
                  </span>
                </div>
                {step.comment && (
                  <div style={{ fontSize: 12, color: t.textSub, marginTop: 3, lineHeight: 1.5 }}>
                    {step.comment}
                  </div>
                )}
                {step.actedAt && (
                  <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>
                    {new Date(step.actedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!loading && !err && (!detail?.steps || detail.steps.length === 0) && (
            <div style={{ fontSize: 13, color: t.textFaint, textAlign: 'center', padding: '10px 0' }}>暂无步骤记录</div>
          )}
        </div>

        {/* Phase I: 关联表单数据（只读展示） */}
        {detail?.formSubmission && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub, marginBottom: 10 }}>
              表单数据
              <span style={{
                marginLeft: 8, fontSize: 10, fontWeight: 500, fontFamily: 'monospace',
                background: isDark ? '#374151' : '#f1f5f9',
                color: isDark ? '#9ca3af' : '#64748b',
                padding: '1px 6px', borderRadius: 4,
              }}>
                {detail.formSubmission.formCode}
              </span>
            </div>
            <div style={{
              background: isDark ? '#1f2937' : '#f9fafb',
              borderRadius: 10, padding: '14px 16px',
              border: `1px solid ${t.cardBorder}`,
            }}>
              <WorkflowFormRenderer
                schema={detail.formSubmission.schemaJson as any}
                uiSchema={detail.formSubmission.uiSchemaJson as any}
                value={detail.formSubmission.dataJson as Record<string, unknown>}
                onChange={() => {}}
                disabled={true}
              />
            </div>
            <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4, textAlign: 'right' }}>
              提交编号：{detail.formSubmission.submissionNo}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => { onClose(); setTimeout(onApprove, 150); }}
            style={{
              flex: 1, padding: '13px 0', borderRadius: 12, border: 'none',
              background: 'var(--status-success)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            ✓ 通过
          </button>
          <button
            onClick={() => { onClose(); setTimeout(onReject, 150); }}
            style={{
              flex: 1, padding: '13px 0', borderRadius: 12,
              border: '1.5px solid #ef4444', background: 'transparent',
              color: 'var(--status-danger)', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            ✗ 拒绝
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 历史任务卡片 ───────────────────────────────────────────────────────────────

function HistoryCard({ task }: { task: WorkflowTask }) {
  const { t } = useMobileTheme();
  const statusColor = STATUS_COLOR[task.status] ?? '#94a3b8';
  const statusLabel = task.status === 'APPROVED' ? '已通过' : task.status === 'REJECTED' ? '已拒绝' : task.status;

  return (
    <div style={{
      background: t.cardBg, borderRadius: 14, padding: '12px 16px',
      border: `1px solid ${t.cardBorder}`, marginBottom: 10, opacity: 0.85,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: t.textFaint, marginBottom: 2 }}>
            {task.bizNo ?? task.instanceNo ?? '—'}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, color: t.text, lineHeight: 1.4 }}>
            {safeSubject(task)}
          </div>
          {task.companyName && (
            <div style={{ fontSize: 12, color: t.textSub, marginTop: 3 }}>{task.companyName}</div>
          )}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, flexShrink: 0,
          background: `${statusColor}22`, color: statusColor,
        }}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

type Tab = 'todos' | 'history';

export default function WorkflowPage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const toast = useToast();

  const [tab,       setTab]       = useState<Tab>('todos');
  const [todos,     setTodos]     = useState<WorkflowTask[]>([]);
  const [history,   setHistory]   = useState<WorkflowTask[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState('');

  // Drawers
  const [actionTask, setActionTask] = useState<WorkflowTask | null>(null);
  const [actionMode, setActionMode] = useState<'approve' | 'reject'>('approve');
  const [detailTask, setDetailTask] = useState<WorkflowTask | null>(null);

  const loadTodos = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await approvalApi.getMyTasks({ page: 1, pageSize: 50 });
      setTodos(r.items);
      setTotal(r.total);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await approvalApi.getHistory({ page: 1, pageSize: 50 });
      setHistory(r.items);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'todos') loadTodos();
    else loadHistory();
  }, [tab, loadTodos, loadHistory]);

  function openApprove(task: WorkflowTask) {
    setActionTask(task); setActionMode('approve');
  }
  function openReject(task: WorkflowTask) {
    setActionTask(task); setActionMode('reject');
  }
  function handleActionDone() {
    setActionTask(null); setDetailTask(null);
    loadTodos();
  }

  return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
        background: t.appBarBg, borderBottom: `1px solid ${t.barBorder}`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.push('/mobile/home')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ChevronLeft size={20} />
          <span style={{ fontSize: 14 }}>返回</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClipboardCheck size={18} color="#7c3aed" />
          <span style={{ fontWeight: 700, fontSize: 16, color: t.text }}>审批中心</span>
          {tab === 'todos' && total > 0 && (
            <span style={{
              background: 'var(--status-danger)', color: '#fff', borderRadius: 12,
              padding: '1px 7px', fontSize: 11, fontWeight: 700,
            }}>{total}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => { haptic('light'); tab === 'todos' ? loadTodos() : loadHistory(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 6 }}
          >
            <RefreshCw size={18} />
          </button>
          <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 6 }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* Tab */}
      <div style={{ display: 'flex', margin: '12px 16px 0', background: t.inputBg, borderRadius: 12, padding: 4 }}>
        {([['todos', '待办', todos.length], ['history', '已办', 0]] as const).map(([key, label, cnt]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              background: tab === key ? '#7c3aed' : 'transparent',
              color: tab === key ? '#fff' : t.textSub,
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {label}
            {key === 'todos' && cnt > 0 && (
              <span style={{
                background: tab === 'todos' ? 'rgba(255,255,255,0.3)' : 'var(--status-danger)',
                color: '#fff', fontSize: 10, fontWeight: 800,
                padding: '1px 5px', borderRadius: 10, lineHeight: 1.4,
              }}>{cnt}</span>
            )}
          </button>
        ))}
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, padding: '12px 16px calc(24px + env(safe-area-inset-bottom))' }}>
        {loading && [1, 2, 3].map(i => <SkeletonCard key={i} lines={3} />)}
        {!loading && err && (
          <div style={{ color: 'var(--status-danger)', background: '#fef2f2', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
            {err}
          </div>
        )}
        {!loading && !err && tab === 'todos' && (
          todos.length === 0
            ? <MobileEmptyState icon="✅" title="暂无待办审批" desc="当前没有需要您处理的审批任务" />
            : todos.map(task => (
              <TaskCard
                key={`${task.taskSource}-${task.taskId}`}
                task={task}
                onApprove={openApprove}
                onReject={openReject}
                onDetail={t => setDetailTask(t)}
              />
            ))
        )}
        {!loading && !err && tab === 'history' && (
          history.length === 0
            ? <MobileEmptyState icon="📋" title="暂无已办记录" desc="审批完成的任务会出现在这里" />
            : history.map(task => (
              <HistoryCard key={`${task.taskSource}-${task.taskId}`} task={task} />
            ))
        )}
      </div>

      {/* 操作底栏 */}
      {actionTask && (
        <ActionSheet
          task={actionTask}
          mode={actionMode}
          onClose={() => setActionTask(null)}
          onDone={handleActionDone}
        />
      )}

      {/* 详情底栏 */}
      {detailTask && (
        <DetailSheet
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onApprove={() => { setDetailTask(null); setTimeout(() => openApprove(detailTask), 150); }}
          onReject={() => { setDetailTask(null); setTimeout(() => openReject(detailTask), 150); }}
        />
      )}
    </div>
  );
}

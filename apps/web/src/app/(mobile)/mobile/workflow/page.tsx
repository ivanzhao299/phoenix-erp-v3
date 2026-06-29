'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, ClipboardCheck, X, CheckCircle, XCircle, Sun, Moon, Clock, Building2, FolderOpen, ChevronDown, ChevronUp, Forward } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { MobilePageSkeleton, SkeletonCard, MobileEmptyState } from '@/components/mobile/MobileSkeleton';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/lib/haptic';
import { approvalApi, type WorkflowTask, type WorkflowTaskPage, type InstanceDetail, type ApprovalReassignCandidate } from '@/lib/mobile-api';
import { WorkflowFormRenderer } from '@/components/workflow/WorkflowFormRenderer';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';

// ── 常量 ─────────────────────────────────────────────────────────────────────

type TFn = (key: string, fallback: string) => string;
const buildBizTypeLabel = (tr: TFn): Record<string, string> => ({
  PURCHASE_REQUEST: tr('mob.sys.biz_purchase_request', '采购申请'),
  PURCHASE_ORDER: tr('mob.sys.biz_purchase_order', '采购订单'),
  PAYMENT: tr('mob.sys.biz_payment', '付款申请'),
  SHAREHOLDER_FUND: tr('mob.sys.biz_shareholder_fund', '股东资金')
});
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'var(--status-warning)',
  APPROVED: 'var(--status-success)',
  REJECTED: 'var(--status-danger)',
  CANCELLED: 'var(--slate-400)',
  TODO: 'var(--status-warning)',
  DONE: 'var(--status-success)'
};

type ApprovalActionMode = 'approve' | 'reject' | 'transfer';

function MobileSheetPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

// ── 安全摘要：股东资金不暴露金额/银行字段 ─────────────────────────────────────
function safeSubject(task: WorkflowTask, tr: TFn): string {
  if (task.bizType === 'SHAREHOLDER_FUND') return tr('mob.sys.shareholder_fund_pending', '股东资金审批待处理');
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
  onTransfer,
  onDetail
}: {
  task: WorkflowTask;
  onApprove: (t: WorkflowTask) => void;
  onReject: (t: WorkflowTask) => void;
  onTransfer: (t: WorkflowTask) => void;
  onDetail: (t: WorkflowTask) => void;
}) {
  const {
    t,
    isDark
  } = useMobileTheme();
  const {
    t: tr
  } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const bizLabel = buildBizTypeLabel(tr)[task.bizType ?? ''] ?? task.bizType ?? tr('mob.sys.workflow', '工作流');
  const amountStr = safeAmount(task);
  const subjectStr = safeSubject(task, tr);
  const stepLabel = task.totalSteps ? `${tr('mob.sys.step_prefix', '第')} ${task.stepNo ?? task.currentStepNo ?? 1} / ${task.totalSteps} ${tr('mob.sys.step_suffix', '步')}` : null;
  return <div style={{
    background: t.cardBg,
    borderRadius: 16,
    border: `1px solid ${t.cardBorder}`,
    marginBottom: 12,
    overflow: 'hidden'
  }}>
      {/* 卡片主体 */}
      <div style={{
      padding: '14px 16px',
      cursor: 'pointer'
    }} onClick={() => setExpanded(v => !v)}>
        {/* 顶行：来源 badge + 状态 badge + 时间 */}
        <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
      }}>
          <div style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap'
        }}>
            <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 20,
            background: task.taskSource === 'APPROVAL_ENGINE' ? '#7c3aed22' : '#0891b222',
            color: task.taskSource === 'APPROVAL_ENGINE' ? 'var(--color-purple-600)' : 'var(--status-info)'
          }}>
              {task.taskSource === 'APPROVAL_ENGINE' ? tr('mob.sys.approval_engine', '审批引擎') : tr('mob.sys.workflow', '工作流')}
            </span>
            <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 20,
            background: `${STATUS_COLOR[task.status] ?? 'var(--slate-400)'}22`,
            color: STATUS_COLOR[task.status] ?? 'var(--slate-400)'
          }}>
              {bizLabel}
            </span>
            {/* ── Phase F: SLA 标签 ── */}
            {task.isOverdue && <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 20,
            background: 'var(--status-danger-bg-faint)',
            color: 'var(--status-danger)',
            border: '1px solid var(--status-danger-bg-light)'
          }}>⏰ {tr('mob.sys.overdue', '已超期')}</span>}
            {(task.escalationLevel ?? 0) > 0 && <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 20,
            background: 'var(--status-warning-bg-page)',
            color: 'var(--status-warning)',
            border: '1px solid var(--status-warning-bg-medium)'
          }}>🔺 {tr('mob.sys.escalated', '已升级')}</span>}
          </div>
          <span style={{
          fontSize: 11,
          color: t.textFaint
        }}>
            {task.createdAt ? new Date(task.createdAt).toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric'
          }) : '—'}
          </span>
        </div>

        {/* 主题 */}
        <div style={{
        fontWeight: 700,
        fontSize: 15,
        color: t.text,
        marginBottom: 6,
        lineHeight: 1.4
      }}>
          {subjectStr}
        </div>

        {/* 金额 */}
        {amountStr && <div style={{
        fontSize: 18,
        fontWeight: 800,
        color: 'var(--color-purple-600)',
        marginBottom: 6
      }}>
            {amountStr}
          </div>}

        {/* 公司 / 项目 / 步骤 */}
        <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 12px',
        marginBottom: 4
      }}>
          {task.companyName && <span style={{
          fontSize: 12,
          color: t.textSub,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
              <Building2 size={11} /> {task.companyName}
            </span>}
          {task.projectName && <span style={{
          fontSize: 12,
          color: t.textSub,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
              <FolderOpen size={11} /> {task.projectName}
            </span>}
          {stepLabel && <span style={{
          fontSize: 12,
          color: t.textSub,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
              <Clock size={11} /> {stepLabel}
            </span>}
        </div>

        {/* 单据号 */}
        {task.bizNo && <div style={{
        fontSize: 11,
        fontFamily: 'monospace',
        color: t.textFaint
      }}>{task.bizNo}</div>}

        {/* ── Phase F: SLA 倒计时 / 超期提示 ── */}
        {task.dueAt && (() => {
        const msLeft = new Date(task.dueAt).getTime() - Date.now();
        const hLeft = Math.floor(msLeft / 3600000);
        if (task.isOverdue) {
          const hOver = Math.abs(hLeft);
          return <div style={{
            fontSize: 11,
            color: 'var(--status-danger)',
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
                ⏰ {tr('mob.sys.overdue', '已超期')} {hOver >= 24 ? `${Math.floor(hOver / 24)}${tr('mob.sys.days_unit', '天')}` : `${hOver}${tr('mob.sys.hours_unit', '小时')}`}
              </div>;
        }
        if (hLeft < 24) {
          return <div style={{
            fontSize: 11,
            color: 'var(--status-warning)',
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
                ⚡ {tr('mob.sys.remaining', '剩余')} {hLeft}{tr('mob.sys.hours_until_due', '小时截止')}
              </div>;
        }
        const dLeft = Math.floor(hLeft / 24);
        return <div style={{
          fontSize: 11,
          color: t.textFaint,
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
              ⏱ {tr('mob.sys.remaining', '剩余')} {dLeft}{tr('mob.sys.days_unit', '天')}
            </div>;
      })()}
      </div>

      {/* 展开：操作按钮 */}
      {expanded && <div style={{
      borderTop: `1px solid ${t.cardBorder}`,
      padding: '12px 16px',
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap'
    }}>
          <button onClick={e => {
        e.stopPropagation();
        onDetail(task);
      }} style={{
        flex: 1,
        minWidth: 'calc(50% - 5px)',
        padding: '10px 0',
        borderRadius: 10,
        border: `1px solid ${t.cardBorder}`,
        background: 'transparent',
        color: t.textSub,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4
      }}>
            <ChevronDown size={14} /> {tr('mob.sys.detail', '详情')}
          </button>
          <button onClick={e => {
        e.stopPropagation();
        onApprove(task);
      }} style={{
        flex: 1,
        minWidth: 'calc(50% - 5px)',
        padding: '10px 0',
        borderRadius: 10,
        border: 'none',
        background: 'var(--status-success)',
        color: 'var(--bg-card)',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4
      }}>
            <CheckCircle size={14} /> {tr('mob.sys.approve', '同意')}
          </button>
          <button onClick={e => {
        e.stopPropagation();
        onTransfer(task);
      }} style={{
        flex: 1,
        minWidth: 'calc(50% - 5px)',
        padding: '10px 0',
        borderRadius: 10,
        border: `1px solid ${t.cardBorder}`,
        background: 'transparent',
        color: 'var(--status-info)',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4
      }}>
            <Forward size={14} /> {tr('mob.sys.transfer', '转交')}
          </button>
          <button onClick={e => {
        e.stopPropagation();
        onReject(task);
      }} style={{
        flex: 1,
        minWidth: 'calc(50% - 5px)',
        padding: '10px 0',
        borderRadius: 10,
        border: '1.5px solid var(--status-danger)',
        background: 'transparent',
        color: 'var(--status-danger)',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4
      }}>
            <XCircle size={14} /> {tr('mob.sys.reject', '不同意')}
          </button>
        </div>}
    </div>;
}

// ── 审批处理底栏（同意 / 不同意 / 转交） ──────────────────────────────────────

function ActionSheet({
  task,
  mode,
  onClose,
  onDone
}: {
  task: WorkflowTask;
  mode: ApprovalActionMode;
  onClose: () => void;
  onDone: () => void;
}) {
  const {
    t,
    isDark
  } = useMobileTheme();
  const {
    t: tr
  } = useLanguage();
  const toast = useToast();
  const [selectedMode, setSelectedMode] = useState<ApprovalActionMode>(mode);
  const [comment, setComment] = useState('');
  const [candidates, setCandidates] = useState<ApprovalReassignCandidate[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setSelectedMode(mode);
    setComment('');
    setSelectedUserId('');
    setErr('');
  }, [mode, task.instanceId]);

  useEffect(() => {
    if (selectedMode !== 'transfer') return;
    let cancelled = false;
    setCandidateLoading(true);
    setErr('');
    approvalApi.getReassignCandidates(task.instanceId)
      .then(rows => {
        if (!cancelled) {
          setCandidates(rows ?? []);
          setSelectedUserId(rows?.[0]?.userId ?? '');
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : tr('mob.sys.load_candidates_failed', '加载转交候选人失败'));
      })
      .finally(() => {
        if (!cancelled) setCandidateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMode, task.instanceId]);

  async function submit() {
    if (selectedMode === 'reject' && !comment.trim()) {
      setErr(tr('mob.sys.reject_reason_required', '不同意原因不能为空'));
      return;
    }
    if (selectedMode === 'transfer' && !selectedUserId) {
      setErr(tr('mob.sys.select_transfer_approver', '请选择转交审批人'));
      return;
    }
    setSubmitting(true);
    setErr('');
    try {
      if (selectedMode === 'approve') {
        await approvalApi.approveInstance(task.instanceId, comment.trim() || undefined);
        haptic('success');
        toast.success(tr('mob.sys.approved_ok', '审批已通过'));
      } else if (selectedMode === 'reject') {
        await approvalApi.rejectInstance(task.instanceId, comment.trim());
        haptic('success');
        toast.success(tr('mob.sys.marked_rejected', '已标记为不同意'));
      } else {
        await approvalApi.reassignInstance(task.instanceId, selectedUserId);
        haptic('success');
        const picked = candidates.find(c => c.userId === selectedUserId);
        toast.success(picked ? `${tr('mob.sys.transferred_to', '已转交给')} ${picked.displayName}` : tr('mob.sys.transferred', '已转交审批'));
      }
      onDone();
    } catch (e: unknown) {
      haptic('error');
      const msg = e instanceof Error ? e.message : tr('mob.sys.op_failed_retry', '操作失败，请重试');
      setErr(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }
  const accentColor = selectedMode === 'approve' ? 'var(--status-success)' : selectedMode === 'reject' ? 'var(--status-danger)' : 'var(--status-info)';
  const submitText = selectedMode === 'approve' ? tr('mob.sys.submit_approve', '提交同意') : selectedMode === 'reject' ? tr('mob.sys.submit_reject', '提交不同意') : tr('mob.sys.confirm_transfer', '确认转交审批');
  const commentLabel = selectedMode === 'approve' ? tr('mob.sys.approve_comment_optional', '审批意见（可选）') : selectedMode === 'reject' ? tr('mob.sys.reject_reason_label', '不同意原因 *') : tr('mob.sys.transfer_note_optional', '转交说明（可选）');
  const commentPlaceholder = selectedMode === 'approve' ? tr('mob.sys.approve_comment_ph', '填写审批意见（可不填）') : selectedMode === 'reject' ? tr('mob.sys.reject_reason_ph', '请填写不同意原因…') : tr('mob.sys.transfer_note_ph', '填写转交说明，便于接收人理解背景（可不填）');
  return <MobileSheetPortal><div style={{
    position: 'fixed',
    inset: 0,
    zIndex: 300,
    background: 'var(--overlay-black-50)',
    display: 'flex',
    alignItems: 'flex-end'
  }} onClick={e => {
    if (e.target === e.currentTarget) onClose();
  }}>
      <div style={{
      width: '100%',
      maxHeight: '86svh',
      overflowY: 'auto',
      background: isDark ? 'var(--gray-900)' : 'var(--bg-card)',
      borderRadius: '20px 20px 0 0',
      padding: '24px 16px calc(24px + env(safe-area-inset-bottom))'
    }}>
        <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
      }}>
          <div>
            <div style={{
            fontWeight: 700,
            fontSize: 16,
            color: accentColor
          }}>
              {tr('mob.sys.approval_action', '审批处理')}
            </div>
            <div style={{
            fontSize: 12,
            color: t.textSub,
            marginTop: 2
          }}>
              {safeSubject(task, tr)}
            </div>
          </div>
          <button onClick={onClose} style={{
          background: 'none',
          border: 'none',
          color: t.textSub,
          cursor: 'pointer',
          padding: 4
        }}>
            <X size={20} />
          </button>
        </div>

        <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 8,
        marginBottom: 14
      }}>
          {([
          ['approve', tr('mob.sys.approve', '同意'), CheckCircle, 'var(--status-success)'],
          ['reject', tr('mob.sys.reject', '不同意'), XCircle, 'var(--status-danger)'],
          ['transfer', tr('mob.sys.transfer_approval', '转交审批'), Forward, 'var(--status-info)']
        ] as const).map(([key, label, Icon, color]) => {
          const active = selectedMode === key;
          return <button key={key} type="button" onClick={() => {
            setSelectedMode(key);
            setErr('');
          }} style={{
            minHeight: 42,
            borderRadius: 12,
            border: `1.5px solid ${active ? color : t.cardBorder}`,
            background: active ? `${color}22` : 'transparent',
            color: active ? color : t.textSub,
            fontSize: 13,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            cursor: 'pointer'
          }}>
              <Icon size={15} /> {label}
            </button>;
        })}
        </div>

        {selectedMode === 'transfer' && <div style={{
        marginBottom: 12
      }}>
            <label style={{
          fontSize: 13,
          color: t.textSub,
          display: 'block',
          marginBottom: 6
        }}>
              {tr('mob.sys.transfer_approver_label', '转交审批人 *')}
            </label>
            <select value={selectedUserId} onChange={e => {
          setSelectedUserId(e.target.value);
          setErr('');
        }} disabled={candidateLoading || candidates.length === 0} style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '11px 12px',
          borderRadius: 10,
          border: `1.5px solid ${err && !selectedUserId ? 'var(--status-danger)' : isDark ? 'var(--gray-700)' : 'var(--gray-300)'}`,
          background: isDark ? 'var(--gray-800)' : 'var(--gray-50)',
          color: t.text,
          fontSize: 14,
          outline: 'none'
        }}>
              {candidateLoading && <option value="">{tr('mob.sys.candidates_loading', '候选人加载中…')}</option>}
              {!candidateLoading && candidates.length === 0 && <option value="">{tr('mob.sys.no_transfer_approver', '暂无可转交审批人')}</option>}
              {!candidateLoading && candidates.map(c => <option key={c.userId} value={c.userId}>
                  {c.displayName}{c.roleNameZh ? ` · ${c.roleNameZh}` : ''}
                </option>)}
            </select>
            <div style={{
          fontSize: 11,
          color: t.textFaint,
          marginTop: 5,
          lineHeight: 1.5
        }}>
              {tr('mob.sys.candidate_filter_note', '候选人由后端按角色权限和数据域过滤，不能手工指定越权人员。')}
            </div>
          </div>}

        <div>
          <label style={{
          fontSize: 13,
          color: t.textSub,
          display: 'block',
          marginBottom: 6
        }}>
            {commentLabel}
          </label>
          <textarea value={comment} onChange={e => {
          setComment(e.target.value);
          setErr('');
        }} placeholder={commentPlaceholder} style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 12px',
          borderRadius: 10,
          border: `1.5px solid ${err ? 'var(--status-danger)' : isDark ? 'var(--gray-700)' : 'var(--gray-300)'}`,
          background: isDark ? 'var(--gray-800)' : 'var(--gray-50)',
          color: t.text,
          fontSize: 14,
          outline: 'none',
          resize: 'none',
          height: 88
        }} />
        </div>

        {err && <div style={{
        color: 'var(--status-danger)',
        fontSize: 13,
        marginTop: 8,
        padding: '6px 10px',
        background: 'var(--status-danger-bg-faint)',
        borderRadius: 8
      }}>
            {err}
          </div>}

        <button onClick={submit} disabled={submitting || (selectedMode === 'transfer' && (candidateLoading || candidates.length === 0))} style={{
        marginTop: 16,
        width: '100%',
        padding: '14px 0',
        background: submitting || (selectedMode === 'transfer' && (candidateLoading || candidates.length === 0)) ? 'var(--gray-400)' : accentColor,
        border: 'none',
        borderRadius: 12,
        color: 'var(--bg-card)',
        fontWeight: 700,
        fontSize: 15,
        cursor: submitting || (selectedMode === 'transfer' && (candidateLoading || candidates.length === 0)) ? 'not-allowed' : 'pointer'
      }}>
          {submitting ? tr('mob.sys.submitting', '提交中…') : submitText}
        </button>
      </div>
    </div></MobileSheetPortal>;
}

// ── 详情底栏 ──────────────────────────────────────────────────────────────────

function DetailSheet({
  task,
  onClose,
  onApprove,
  onReject,
  onTransfer
}: {
  task: WorkflowTask;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onTransfer: () => void;
}) {
  const {
    t,
    isDark
  } = useMobileTheme();
  const {
    t: tr
  } = useLanguage();
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    let cancelled = false;
    approvalApi.getInstance(task.instanceId).then(d => {
      if (!cancelled) setDetail(d);
    }).catch(e => {
      if (!cancelled) setErr(e.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [task.instanceId]);
  const stepStatusColor = (s: string) => s === 'APPROVED' ? 'var(--status-success)' : s === 'REJECTED' ? 'var(--status-danger)' : s === 'PENDING' ? 'var(--status-warning)' : 'var(--slate-400)';
  const stepStatusLabel = (s: string) => s === 'APPROVED' ? tr('mob.sys.step_approved', '已通过') : s === 'REJECTED' ? tr('mob.sys.step_rejected', '已拒绝') : s === 'PENDING' ? tr('mob.sys.step_pending', '待审批') : s;
  return <MobileSheetPortal><div style={{
    position: 'fixed',
    inset: 0,
    zIndex: 300,
    background: 'var(--overlay-black-50)',
    display: 'flex',
    alignItems: 'flex-end'
  }} onClick={e => {
    if (e.target === e.currentTarget) onClose();
  }}>
      <div style={{
      width: '100%',
      maxHeight: '85vh',
      overflowY: 'auto',
      background: isDark ? 'var(--gray-900)' : 'var(--bg-card)',
      borderRadius: '20px 20px 0 0',
      padding: '20px 16px calc(24px + env(safe-area-inset-bottom))'
    }}>
        {/* 头 */}
        <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
      }}>
          <span style={{
          fontWeight: 700,
          fontSize: 16,
          color: t.text
        }}>{tr('mob.sys.approval_detail', '审批详情')}</span>
          <button onClick={onClose} style={{
          background: 'none',
          border: 'none',
          color: t.textSub,
          cursor: 'pointer',
          padding: 4
        }}>
            <X size={20} />
          </button>
        </div>

        {/* 业务摘要 */}
        <div style={{
        background: isDark ? 'var(--gray-800)' : 'var(--gray-50)',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 16
      }}>
          <div style={{
          fontWeight: 700,
          fontSize: 15,
          color: t.text,
          marginBottom: 8
        }}>
            {safeSubject(task, tr)}
          </div>
          {[{
          label: tr('mob.sys.doc_no', '单据编号'),
          value: task.bizNo ?? task.instanceNo
        }, {
          label: tr('mob.sys.biz_type', '业务类型'),
          value: buildBizTypeLabel(tr)[task.bizType ?? ''] ?? task.bizType
        }, {
          label: tr('mob.sys.amount', '金额'),
          value: safeAmount(task)
        }, {
          label: tr('mob.sys.company', '公司'),
          value: task.companyName
        }, {
          label: tr('mob.sys.project', '项目'),
          value: task.projectName
        }, {
          label: tr('mob.sys.current_step', '当前步骤'),
          value: task.totalSteps ? `${task.stepNo ?? 1} / ${task.totalSteps}` : null
        }].filter(r => r.value).map(r => <div key={r.label} style={{
          display: 'flex',
          gap: 8,
          marginBottom: 4
        }}>
              <span style={{
            fontSize: 12,
            color: t.textSub,
            width: 64,
            flexShrink: 0
          }}>{r.label}</span>
              <span style={{
            fontSize: 13,
            color: t.text,
            fontWeight: 500
          }}>{r.value}</span>
            </div>)}
        </div>

        {/* Timeline */}
        <div className={u.mb16}>
          <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: t.textSub,
          marginBottom: 10
        }}>{tr('mob.sys.approval_flow', '审批流程')}</div>
          {loading && <div style={{
          color: t.textFaint,
          fontSize: 13,
          textAlign: 'center',
          padding: '20px 0'
        }}>{tr('mob.sys.loading', '加载中…')}</div>}
          {err && <div style={{
          color: 'var(--status-danger)',
          fontSize: 13,
          padding: '8px 0'
        }}>{err}</div>}
          {detail?.steps?.map((step, idx) => <div key={step.id} style={{
          display: 'flex',
          gap: 12,
          marginBottom: 12
        }}>
              <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: 24,
            flexShrink: 0
          }}>
                <div style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: stepStatusColor(step.status),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--bg-card)',
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0
            }}>
                  {idx + 1}
                </div>
                {idx < detail.steps.length - 1 && <div style={{
              width: 1,
              flex: 1,
              background: isDark ? 'var(--gray-700)' : 'var(--gray-200)',
              marginTop: 2
            }} />}
              </div>
              <div style={{
            flex: 1,
            paddingBottom: 4
          }}>
                <div className={u.flexBetween}>
                  <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: t.text
              }}>
                    {step.approverName ?? step.approverRole ?? `${tr('mob.sys.step', '步骤')} ${step.stepNo}`}
                  </span>
                  <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 20,
                background: `${stepStatusColor(step.status)}22`,
                color: stepStatusColor(step.status)
              }}>
                    {stepStatusLabel(step.status)}
                  </span>
                </div>
                {step.comment && <div style={{
              fontSize: 12,
              color: t.textSub,
              marginTop: 3,
              lineHeight: 1.5
            }}>
                    {step.comment}
                  </div>}
                {step.actedAt && <div style={{
              fontSize: 11,
              color: t.textFaint,
              marginTop: 2
            }}>
                    {new Date(step.actedAt).toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
                  </div>}
              </div>
            </div>)}
          {!loading && !err && (!detail?.steps || detail.steps.length === 0) && <div style={{
          fontSize: 13,
          color: t.textFaint,
          textAlign: 'center',
          padding: '10px 0'
        }}>{tr('mob.sys.no_step_records', '暂无步骤记录')}</div>}
        </div>

        {/* Phase I: 关联表单数据（只读展示） */}
        {detail?.formSubmission && <div className={u.mb16}>
            <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: t.textSub,
          marginBottom: 10
        }}>
              {tr('mob.sys.form_data', '表单数据')}
              <span style={{
            marginLeft: 8,
            fontSize: 10,
            fontWeight: 500,
            fontFamily: 'monospace',
            background: isDark ? 'var(--gray-700)' : 'var(--slate-100)',
            color: isDark ? 'var(--gray-400)' : 'var(--slate-500)',
            padding: '1px 6px',
            borderRadius: 4
          }}>
                {detail.formSubmission.formCode}
              </span>
            </div>
            <div style={{
          background: isDark ? 'var(--gray-800)' : 'var(--gray-50)',
          borderRadius: 10,
          padding: '14px 16px',
          border: `1px solid ${t.cardBorder}`
        }}>
              <WorkflowFormRenderer schema={detail.formSubmission.schemaJson as any} uiSchema={detail.formSubmission.uiSchemaJson as any} value={detail.formSubmission.dataJson as Record<string, unknown>} onChange={() => {}} disabled={true} />
            </div>
            <div style={{
          fontSize: 11,
          color: t.textFaint,
          marginTop: 4,
          textAlign: 'right'
        }}>
              {tr('mob.sys.submission_no', '提交编号')}：{detail.formSubmission.submissionNo}
            </div>
          </div>}

        {/* 操作按钮 */}
        <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap'
      }}>
          <button onClick={() => {
          onClose();
          setTimeout(onApprove, 150);
        }} style={{
          flex: 1,
          minWidth: 'calc(50% - 5px)',
          padding: '13px 0',
          borderRadius: 12,
          border: 'none',
          background: 'var(--status-success)',
          color: 'var(--bg-card)',
          fontWeight: 700,
          fontSize: 15,
          cursor: 'pointer'
        }}>
            ✓ {tr('mob.sys.approve', '同意')}
          </button>
          <button onClick={() => {
          onClose();
          setTimeout(onTransfer, 150);
        }} style={{
          flex: 1,
          minWidth: 'calc(50% - 5px)',
          padding: '13px 0',
          borderRadius: 12,
          border: `1.5px solid var(--status-info)`,
          background: 'transparent',
          color: 'var(--status-info)',
          fontWeight: 700,
          fontSize: 15,
          cursor: 'pointer'
        }}>
            ↪ {tr('mob.sys.transfer_approval', '转交审批')}
          </button>
          <button onClick={() => {
          onClose();
          setTimeout(onReject, 150);
        }} style={{
          flex: 1,
          minWidth: 'calc(50% - 5px)',
          padding: '13px 0',
          borderRadius: 12,
          border: '1.5px solid var(--status-danger)',
          background: 'transparent',
          color: 'var(--status-danger)',
          fontWeight: 700,
          fontSize: 15,
          cursor: 'pointer'
        }}>
            ✗ {tr('mob.sys.reject', '不同意')}
          </button>
        </div>
      </div>
    </div></MobileSheetPortal>;
}

// ── 历史任务卡片 ───────────────────────────────────────────────────────────────

function HistoryCard({
  task
}: {
  task: WorkflowTask;
}) {
  const {
    t
  } = useMobileTheme();
  const {
    t: tr
  } = useLanguage();
  const statusColor = STATUS_COLOR[task.status] ?? 'var(--slate-400)';
  const statusLabel = task.status === 'APPROVED' ? tr('mob.sys.step_approved', '已通过') : task.status === 'REJECTED' ? tr('mob.sys.step_rejected', '已拒绝') : task.status;
  return <div style={{
    background: t.cardBg,
    borderRadius: 14,
    padding: '12px 16px',
    border: `1px solid ${t.cardBorder}`,
    marginBottom: 10,
    opacity: 0.85
  }}>
      <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start'
    }}>
        <div style={{
        flex: 1,
        minWidth: 0,
        marginRight: 8
      }}>
          <div style={{
          fontSize: 11,
          fontFamily: 'monospace',
          color: t.textFaint,
          marginBottom: 2
        }}>
            {task.bizNo ?? task.instanceNo ?? '—'}
          </div>
          <div style={{
          fontWeight: 600,
          fontSize: 14,
          color: t.text,
          lineHeight: 1.4
        }}>
            {safeSubject(task, tr)}
          </div>
          {task.companyName && <div style={{
          fontSize: 12,
          color: t.textSub,
          marginTop: 3
        }}>{task.companyName}</div>}
        </div>
        <span style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 20,
        flexShrink: 0,
        background: `${statusColor}22`,
        color: statusColor
      }}>
          {statusLabel}
        </span>
      </div>
    </div>;
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

type Tab = 'todos' | 'history';
export default function WorkflowPage() {
  const router = useRouter();
  const {
    isDark,
    toggle,
    t
  } = useMobileTheme();
  const {
    t: tr
  } = useLanguage();
  const toast = useToast();
  const { allowed, loading: permLoading } = useMobilePermission('workflow');  // F10 加固：页面级门禁
  const [tab, setTab] = useState<Tab>('todos');
  const [todos, setTodos] = useState<WorkflowTask[]>([]);
  const [history, setHistory] = useState<WorkflowTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Drawers
  const [actionTask, setActionTask] = useState<WorkflowTask | null>(null);
  const [actionMode, setActionMode] = useState<ApprovalActionMode>('approve');
  const [detailTask, setDetailTask] = useState<WorkflowTask | null>(null);
  const loadTodos = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await approvalApi.getMyTasks({
        page: 1,
        pageSize: 50
      });
      setTodos(r.items);
      setTotal(r.total);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : tr('mob.sys.load_failed', '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [tr]);
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await approvalApi.getHistory({
        page: 1,
        pageSize: 50
      });
      setHistory(r.items);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : tr('mob.sys.load_failed', '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [tr]);
  useEffect(() => {
    if (tab === 'todos') loadTodos();else loadHistory();
  }, [tab, loadTodos, loadHistory]);
  function openApprove(task: WorkflowTask) {
    setActionTask(task);
    setActionMode('approve');
  }
  function openReject(task: WorkflowTask) {
    setActionTask(task);
    setActionMode('reject');
  }
  function openTransfer(task: WorkflowTask) {
    setActionTask(task);
    setActionMode('transfer');
  }
  function handleActionDone() {
    setActionTask(null);
    setDetailTask(null);
    loadTodos();
  }
  if (permLoading || !allowed) return null;  // F10：无权限不渲染（后端 @RequireMenu 兜底）
  return <div style={{
    minHeight: '100svh',
    background: t.pageBg,
    display: 'flex',
    flexDirection: 'column'
  }}>
      {/* AppBar */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
      background: t.appBarBg,
      borderBottom: `1px solid ${t.barBorder}`,
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
        <button onClick={() => router.push('/mobile/home')} style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: t.textSub,
        display: 'flex',
        alignItems: 'center',
        gap: 4
      }}>
          <ChevronLeft size={20} />
          <span className={u.fs14}>{tr('mob.sys.back', '返回')}</span>
        </button>

        <div className={u.flexRow8}>
          <ClipboardCheck size={18} color="var(--color-purple-600)" />
          <span style={{
          fontWeight: 700,
          fontSize: 16,
          color: t.text
        }}>{tr('mob.sys.approval_center', '审批中心')}</span>
          {tab === 'todos' && total > 0 && <span style={{
          background: 'var(--status-danger)',
          color: 'var(--bg-card)',
          borderRadius: 12,
          padding: '1px 7px',
          fontSize: 11,
          fontWeight: 700
        }}>{total}</span>}
        </div>

        <div style={{
        display: 'flex',
        gap: 4
      }}>
          <button onClick={() => {
          haptic('light');
          tab === 'todos' ? loadTodos() : loadHistory();
        }} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: t.textSub,
          padding: 6
        }}>
            <RefreshCw size={18} />
          </button>
          <button onClick={toggle} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: t.textSub,
          padding: 6
        }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* Tab */}
      <div style={{
      display: 'flex',
      margin: '12px 16px 0',
      background: t.inputBg,
      borderRadius: 12,
      padding: 4
    }}>
        {([['todos', tr('mob.sys.todo', '待办'), todos.length], ['history', tr('mob.sys.done', '已办'), 0]] as const).map(([key, label, cnt]) => <button key={key} onClick={() => setTab(key)} style={{
        flex: 1,
        padding: '9px 0',
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        background: tab === key ? 'var(--color-purple-600)' : 'transparent',
        color: tab === key ? 'var(--bg-card)' : t.textSub,
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6
      }}>
            {label}
            {key === 'todos' && cnt > 0 && <span style={{
          background: tab === 'todos' ? 'var(--overlay-white-10)' : 'var(--status-danger)',
          color: 'var(--bg-card)',
          fontSize: 10,
          fontWeight: 800,
          padding: '1px 5px',
          borderRadius: 10,
          lineHeight: 1.4
        }}>{cnt}</span>}
          </button>)}
      </div>

      {/* 内容 */}
      <div style={{
      flex: 1,
      padding: '12px 16px calc(24px + env(safe-area-inset-bottom))'
    }}>
        {loading && [1, 2, 3].map(i => <SkeletonCard key={i} lines={3} />)}
        {!loading && err && <div style={{
        color: 'var(--status-danger)',
        background: 'var(--status-danger-bg-faint)',
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 13,
        marginBottom: 12
      }}>
            {err}
          </div>}
        {!loading && !err && tab === 'todos' && (todos.length === 0 ? <MobileEmptyState icon="✅" title={tr('mob.sys.no_todo_approval', '暂无待办审批')} desc={tr('mob.sys.no_todo_approval_desc', '当前没有需要您处理的审批任务')} /> : todos.map(task => <TaskCard key={`${task.taskSource}-${task.taskId}`} task={task} onApprove={openApprove} onReject={openReject} onTransfer={openTransfer} onDetail={t => setDetailTask(t)} />))}
        {!loading && !err && tab === 'history' && (history.length === 0 ? <MobileEmptyState icon="📋" title={tr('mob.sys.no_done_records', '暂无已办记录')} desc={tr('mob.sys.no_done_records_desc', '审批完成的任务会出现在这里')} /> : history.map(task => <HistoryCard key={`${task.taskSource}-${task.taskId}`} task={task} />))}
      </div>

      {/* 操作底栏 */}
      {actionTask && <ActionSheet task={actionTask} mode={actionMode} onClose={() => setActionTask(null)} onDone={handleActionDone} />}

      {/* 详情底栏 */}
      {detailTask && <DetailSheet task={detailTask} onClose={() => setDetailTask(null)} onApprove={() => {
      setDetailTask(null);
      setTimeout(() => openApprove(detailTask), 150);
    }} onReject={() => {
      setDetailTask(null);
      setTimeout(() => openReject(detailTask), 150);
    }} onTransfer={() => {
      setDetailTask(null);
      setTimeout(() => openTransfer(detailTask), 150);
    }} />}
    </div>;
}

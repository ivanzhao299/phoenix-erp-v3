'use client';
import React from 'react';

/**
 * WorkflowTimeline — 审批流时间轴（步骤 + 审批人 + 时间 + 结果）。
 * 比 AuditTimeline 更贴审批场景（含审批人/动作/意见）。暗色经 CSS 变量适配。
 */
export interface WorkflowStep {
  step: string;            // 步骤名（如 财务审核）
  approver?: string;       // 审批人
  time?: string | null;
  result?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CURRENT';
  comment?: string;
}
const RESULT_COLOR: Record<string, string> = {
  APPROVED: 'var(--status-success)',
  REJECTED: 'var(--status-danger)',
  CURRENT:  'var(--status-warning)',
  PENDING:  'var(--text-disabled)',
};

export function WorkflowTimeline({ steps, title = '审批流程' }: { steps: WorkflowStep[]; title?: string }) {
  return (
    <div>
      {title && <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: 14, fontSize: 14 }}>{title}</div>}
      <div style={{ position: 'relative', paddingLeft: 20 }}>
        {steps.map((s, i) => {
          const c = RESULT_COLOR[s.result || 'PENDING'];
          return (
            <div key={i} style={{ position: 'relative', paddingBottom: i === steps.length - 1 ? 0 : 18 }}>
              {i !== steps.length - 1 && <div style={{ position: 'absolute', left: -13, top: 14, bottom: 0, width: 2, background: 'var(--border)' }} />}
              <div style={{ position: 'absolute', left: -18, top: 2, width: 12, height: 12, borderRadius: '50%', background: c, border: '2px solid var(--bg-card)', boxShadow: `0 0 0 1px ${c}` }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{s.step}</span>
                {s.approver && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>· {s.approver}</span>}
              </div>
              {s.time && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{s.time}</div>}
              {s.comment && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic' }}>"{s.comment}"</div>}
            </div>
          );
        })}
        {steps.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-disabled)' }}>暂无审批记录</div>}
      </div>
    </div>
  );
}

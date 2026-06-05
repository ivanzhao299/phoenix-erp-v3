'use client';

/**
 * WorkflowMetricsStrip — UIX-7 审批工作台化
 * 在工作流主页顶部展示运营级指标：
 *   · 通过率（最近 7 天）
 *   · 平均审批时长
 *   · 超时数 / 升级数
 *   · 瓶颈节点 top 3
 *
 * 数据源：
 *   GET /api/workflow/metrics/overview
 *   GET /api/workflow/metrics/overdue-tasks
 *   GET /api/workflow/metrics/escalated-tasks
 *   GET /api/workflow/metrics/bottlenecks
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, AlertTriangle, ArrowUpCircle, Activity } from 'lucide-react';
import request from '@/lib/api-client';

interface Overview {
  total?: number;
  approved?: number;
  rejected?: number;
  running?: number;
  approvalRate?: number;
  avgDurationMinutes?: number;
}

interface OverdueTask { id: number; instance_no?: string; node_name?: string; overdue_hours?: number; }
interface EscalatedTask { id: number; instance_no?: string; node_name?: string; escalation_count?: number; }
interface BottleneckNode { node_name: string; avg_minutes: number; count: number; }

export function WorkflowMetricsStrip() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overdue, setOverdue] = useState<OverdueTask[]>([]);
  const [escalated, setEscalated] = useState<EscalatedTask[]>([]);
  const [bottlenecks, setBottlenecks] = useState<BottleneckNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    const safe = async <T,>(p: string, def: T): Promise<T> => {
      try {
        const r = await request<{ data?: T; code?: number } | T>(p);
        const anyR = r as any;
        return (anyR && anyR.data !== undefined) ? anyR.data : (anyR as T);
      } catch (e) {
        if (!error) setError(e instanceof Error ? e.message : '加载部分指标失败');
        return def;
      }
    };
    Promise.all([
      safe<Overview>('/workflow/metrics/overview', {}),
      safe<OverdueTask[]>('/workflow/metrics/overdue-tasks', []),
      safe<EscalatedTask[]>('/workflow/metrics/escalated-tasks', []),
      safe<BottleneckNode[]>('/workflow/metrics/bottlenecks', []),
    ]).then(([o, ov, es, bn]) => {
      setOverview(o || {});
      setOverdue(Array.isArray(ov) ? ov : []);
      setEscalated(Array.isArray(es) ? es : []);
      setBottlenecks(Array.isArray(bn) ? bn.slice(0, 3) : []);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <section style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        审批运营 · 运行态势
      </h3>

      {error && (
        <div style={{ padding: 8, marginBottom: 8, fontSize: 12, color: 'var(--status-warning)', background: 'var(--status-warning-bg-faint)', borderRadius: 4 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <Kpi
          icon={<CheckCircle2 size={18} />}
          label="通过率"
          value={overview?.approvalRate !== undefined ? `${Math.round((overview.approvalRate ?? 0) * 100)}%` : '—'}
          sub={`总 ${overview?.total ?? '—'} / 已通过 ${overview?.approved ?? '—'}`}
          tone="success"
        />
        <Kpi
          icon={<Clock size={18} />}
          label="平均时长"
          value={overview?.avgDurationMinutes !== undefined ? `${overview.avgDurationMinutes} 分钟` : '—'}
          sub={overview?.running !== undefined ? `进行中 ${overview.running}` : ''}
        />
        <Kpi
          icon={<AlertTriangle size={18} />}
          label="超时任务"
          value={overdue.length}
          sub={overdue[0]?.node_name ? `最久：${overdue[0].node_name}` : '暂无超时'}
          tone={overdue.length > 0 ? 'warning' : 'default'}
        />
        <Kpi
          icon={<ArrowUpCircle size={18} />}
          label="升级审批"
          value={escalated.length}
          sub={escalated.length > 0 ? '需运营介入' : '暂无升级'}
          tone={escalated.length > 0 ? 'danger' : 'default'}
        />
      </div>

      {bottlenecks.length > 0 && (
        <div style={{
          marginTop: 12, padding: 12,
          background: 'var(--bg-muted)', borderRadius: 'var(--radius-card)',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <Activity size={14} />
            <span style={{ fontSize: 12 }}>瓶颈节点 TOP {bottlenecks.length}：</span>
          </div>
          {bottlenecks.map((b, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-primary)' }}>
              <strong>{b.node_name}</strong>
              <span style={{ color: 'var(--text-secondary)' }}> · {b.avg_minutes} min · {b.count} 条</span>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>加载中…</div>
      )}
    </section>
  );
}

function Kpi({ icon, label, value, sub, tone = 'default' }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'success' ? 'var(--status-success)' :
    tone === 'warning' ? 'var(--status-warning)' :
    tone === 'danger'  ? 'var(--status-danger)'  :
    'var(--text-primary)';
  return (
    <div style={{
      padding: 12, background: 'var(--bg-card)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        {icon}<span style={{ fontSize: 11 }}>{label}</span>
      </div>
      <strong style={{ fontSize: 20, color, fontWeight: 700 }}>{value}</strong>
      {sub && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{sub}</span>}
    </div>
  );
}

export default WorkflowMetricsStrip;

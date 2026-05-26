'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Activity, AlertTriangle, CheckCircle, Clock, TrendingUp,
  Users, RefreshCw, BarChart3, ArrowUpCircle,
} from 'lucide-react';

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface Overview {
  pendingTasks:       number;
  overdueTasks:       number;
  completedToday:     number;
  escalatedTasks:     number;
  avgApprovalHours:   number | null;
  avgCompletionHours: number | null;
}

interface Bottleneck {
  role:         string;
  pendingCount: number;
  overdueCount: number;
  avgHours:     number | null;
}

// ── API ───────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function fetchOverview(): Promise<Overview> {
  const res = await fetch('/api/workflow/metrics/overview', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function fetchBottlenecks(): Promise<Bottleneck[]> {
  const res = await fetch('/api/workflow/metrics/bottlenecks', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── KPI 卡片 ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color, alert,
}: {
  label:  string;
  value:  string | number;
  sub?:   string;
  icon:   React.ElementType;
  color:  string;
  alert?: boolean;
}) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      padding: '20px 22px',
      border: `1.5px solid ${alert ? '#fecaca' : '#f1f5f9'}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      boxShadow: alert ? '0 0 0 3px #fef2f2' : '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{label}</span>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} color={color} />
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: alert ? '#ef4444' : '#0f172a' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function WorkflowMetricsPage() {
  const [overview,     setOverview]     = useState<Overview | null>(null);
  const [bottlenecks,  setBottlenecks]  = useState<Bottleneck[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [refreshingAt, setRefreshingAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ov, bn] = await Promise.all([fetchOverview(), fetchBottlenecks()]);
      setOverview(ov);
      setBottlenecks(bn);
      setRefreshingAt(new Date());
    } catch (e) {
      setError('数据加载失败，请检查权限后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const overdueRate = overview && overview.pendingTasks > 0
    ? Math.round((overview.overdueTasks / overview.pendingTasks) * 100)
    : 0;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: '#7c3aed18',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BarChart3 size={22} color="#7c3aed" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Workflow 健康指标</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              实时 SLA 监控 · 超期检测 · 瓶颈分析
              {refreshingAt && ` · 更新于 ${refreshingAt.toLocaleTimeString('zh-CN')}`}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 18px', borderRadius: 10,
            border: '1.5px solid #e2e8f0', background: loading ? '#f8fafc' : '#fff',
            color: '#475569', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 18px', marginBottom: 24, color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* ── KPI 概览 ── */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <KpiCard
            label="待审批任务"
            value={overview.pendingTasks}
            sub="当前未完成"
            icon={Clock}
            color="#7c3aed"
          />
          <KpiCard
            label="超期任务"
            value={overview.overdueTasks}
            sub={`超期率 ${overdueRate}%`}
            icon={AlertTriangle}
            color="#ef4444"
            alert={overview.overdueTasks > 0}
          />
          <KpiCard
            label="今日完成"
            value={overview.completedToday}
            sub="含通过/拒绝"
            icon={CheckCircle}
            color="#10b981"
          />
          <KpiCard
            label="升级任务"
            value={overview.escalatedTasks}
            sub="待升级审批人处理"
            icon={ArrowUpCircle}
            color="#ea580c"
            alert={overview.escalatedTasks > 0}
          />
          <KpiCard
            label="平均处理时长"
            value={overview.avgApprovalHours != null ? `${overview.avgApprovalHours}h` : '—'}
            sub="含进行中"
            icon={TrendingUp}
            color="#0891b2"
          />
          <KpiCard
            label="平均完成时长"
            value={overview.avgCompletionHours != null ? `${overview.avgCompletionHours}h` : '—'}
            sub="仅已完结实例"
            icon={Activity}
            color="#059669"
          />
        </div>
      )}

      {/* ── 瓶颈角色 ── */}
      <div style={{
        background: '#fff', borderRadius: 18, border: '1.5px solid #f1f5f9',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Users size={18} color="#7c3aed" />
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>瓶颈角色分析</span>
          <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>按超期量排序</span>
        </div>

        {loading && !bottlenecks.length ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94a3b8' }}>加载中…</div>
        ) : bottlenecks.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94a3b8' }}>
            暂无数据（尚无审批实例）
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['审批角色', '待办量', '超期量', '平均处理时长'].map(h => (
                  <th key={h} style={{
                    padding: '12px 20px', textAlign: 'left',
                    fontSize: 12, fontWeight: 700, color: '#64748b',
                    borderBottom: '1px solid #f1f5f9',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bottlenecks.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                    {row.role}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#475569' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                      background: '#7c3aed18', color: '#7c3aed', fontWeight: 700,
                    }}>{row.pendingCount}</span>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 14 }}>
                    {row.overdueCount > 0 ? (
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                        background: '#fef2f2', color: '#ef4444', fontWeight: 700,
                        border: '1px solid #fecaca',
                      }}>{row.overdueCount}</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#475569' }}>
                    {row.avgHours != null ? `${row.avgHours}h` : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

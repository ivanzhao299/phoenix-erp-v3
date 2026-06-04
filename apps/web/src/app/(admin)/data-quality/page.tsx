'use client';
import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { RefreshCw, AlertTriangle, CheckCircle, AlertCircle, ShieldCheck, Database, BookOpen, Link2, Boxes, GitPullRequestArrow, Code2 } from 'lucide-react';

/**
 * G5 · 数据质量驾驶舱
 *
 * 总评分（加权） + 7 个子维度评分卡 + 实时告警列表
 *
 * API：
 *   GET /api/data-quality/scores  ── 总评分 + 7 个子评分
 *   GET /api/data-quality/alerts  ── 聚合告警列表
 */

interface Scores {
  overall: number;
  masterData: number;
  dict: number;
  dataScope: number;
  traceability: number;
  inventory: number;
  workflow: number;
  code: number;
  alertCount: number;
  highAlertCount: number;
  asOf: string;
  weights: Record<string, number>;
}

interface Alert {
  source: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  count: number;
  message: string;
  recommendation: string;
}

function scoreColor(s: number): { bg: string; fg: string; label: string } {
  if (s >= 90) return { bg: 'rgba(34,197,94,0.12)',  fg: '#16a34a', label: '优秀' };
  if (s >= 75) return { bg: 'rgba(59,130,246,0.12)', fg: '#2563eb', label: '良好' };
  if (s >= 60) return { bg: 'rgba(245,158,11,0.12)', fg: '#d97706', label: '及格' };
  return         { bg: 'rgba(239,68,68,0.12)',   fg: '#dc2626', label: '需整改' };
}

function severityColor(s: 'LOW'|'MEDIUM'|'HIGH'): string {
  return s === 'HIGH' ? '#dc2626' : s === 'MEDIUM' ? '#d97706' : '#2563eb';
}

export default function DataQualityPage() {
  const [scores, setScores] = useState<Scores | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [s, a] = await Promise.all([
        request<Scores>('/data-quality/scores'),
        request<Alert[]>('/data-quality/alerts'),
      ]);
      setScores(s);
      setAlerts(Array.isArray(a) ? a : []);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cards = scores ? [
    { key: 'masterData',   label: '主数据健康', icon: Database,           score: scores.masterData,   weight: scores.weights.masterData,   path: '/data-quality/master-data' },
    { key: 'traceability', label: '追溯完整率', icon: Link2,              score: scores.traceability, weight: scores.weights.traceability, path: '/data-quality/traceability' },
    { key: 'inventory',    label: '库存健康',   icon: Boxes,              score: scores.inventory,    weight: scores.weights.inventory,    path: '/data-quality/inventory' },
    { key: 'dataScope',    label: '权限审计',   icon: ShieldCheck,        score: scores.dataScope,    weight: scores.weights.dataScope,    path: '/data-quality/datascope' },
    { key: 'dict',         label: '字典覆盖',   icon: BookOpen,           score: scores.dict,         weight: scores.weights.dict,         path: '/data-quality/dict' },
    { key: 'workflow',     label: '审批健康',   icon: GitPullRequestArrow, score: scores.workflow,    weight: scores.weights.workflow,     path: '/data-quality/workflow' },
    { key: 'code',         label: '编码规范',   icon: Code2,              score: scores.code,         weight: scores.weights.code,         path: '/data-quality/code' },
  ] : [];

  return (
    <div>
      <PageHeader
        title="数据质量驾驶舱"
        subtitle="集团级 7 维度数据治理 · 解决「数据是否可信」问题"
        breadcrumb={['治理', '数据质量']}
        actions={
          <button onClick={() => void load()} disabled={loading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> 刷新
          </button>
        }
      />

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#dc2626', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* 总评分 + 告警计数 */}
      {scores && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* 总评分大卡 */}
          <div style={{
            padding: 24, borderRadius: 16,
            background: scoreColor(scores.overall).bg,
            border: `1px solid ${scoreColor(scores.overall).fg}33`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <CheckCircle size={20} style={{ color: scoreColor(scores.overall).fg }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>总质量评分</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 56, fontWeight: 800, color: scoreColor(scores.overall).fg, lineHeight: 1 }}>
                {scores.overall}
              </div>
              <div style={{ fontSize: 14, color: scoreColor(scores.overall).fg, fontWeight: 600 }}>
                / 100 · {scoreColor(scores.overall).label}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              7 维度加权（主数据 25 / 追溯 20 / 库存 15 / 权限 12 / 字典 10 / 审批 10 / 编码 8）
            </div>
          </div>

          {/* 告警计数大卡 */}
          <div style={{
            padding: 24, borderRadius: 16,
            background: scores.highAlertCount > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
            border: `1px solid ${scores.highAlertCount > 0 ? '#dc262633' : '#16a34a33'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <AlertTriangle size={20} style={{ color: scores.highAlertCount > 0 ? '#dc2626' : '#16a34a' }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>实时告警</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 56, fontWeight: 800, color: scores.highAlertCount > 0 ? '#dc2626' : '#16a34a', lineHeight: 1 }}>
                {scores.alertCount}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {scores.highAlertCount > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>{scores.highAlertCount} 高危 · </span>}
                总告警条数
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              最近更新：{new Date(scores.asOf).toLocaleString('zh-CN')}
            </div>
          </div>
        </div>
      )}

      {/* 7 维度评分卡 */}
      {scores && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
          {cards.map(c => {
            const sc = scoreColor(c.score);
            const Icon = c.icon;
            return (
              <div key={c.key} style={{
                padding: 16, borderRadius: 12, background: 'var(--bg-card)',
                border: `1px solid var(--border)`, borderLeft: `4px solid ${sc.fg}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Icon size={15} style={{ color: sc.fg }} />
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{c.label}</div>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-secondary)' }}>权重 {c.weight}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: sc.fg, lineHeight: 1 }}>{c.score}</div>
                  <div style={{ fontSize: 12, color: sc.fg, fontWeight: 600 }}>{sc.label}</div>
                </div>
                <div style={{ marginTop: 10, height: 4, background: 'var(--bg-muted)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${c.score}%`, background: sc.fg }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 告警列表 */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <AlertTriangle size={16} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>实时告警列表</h2>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
            共 {alerts.length} 条
          </span>
        </div>

        {loading && <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>加载中…</div>}
        {!loading && alerts.length === 0 && (
          <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
            🎉 暂无告警，数据质量良好
          </div>
        )}
        {!loading && alerts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((a, i) => {
              const sev = severityColor(a.severity);
              return (
                <div key={i} style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: a.severity === 'HIGH' ? 'rgba(239,68,68,0.05)' : 'var(--bg-muted)',
                  border: `1px solid ${sev}22`,
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  <div style={{
                    minWidth: 56, padding: '2px 8px', borderRadius: 6,
                    background: `${sev}1a`, color: sev, fontSize: 11, fontWeight: 700, textAlign: 'center',
                  }}>
                    {a.severity}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{a.source}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>·</span>
                      <span style={{ fontSize: 11, color: sev, fontWeight: 600 }}>{a.type}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
                        影响 {a.count} 条
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>{a.message}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      ▸ {a.recommendation}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

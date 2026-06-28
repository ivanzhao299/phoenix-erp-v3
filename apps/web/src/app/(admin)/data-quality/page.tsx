'use client';
import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
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
  if (s >= 90) return { bg: 'var(--status-success-bg-light)',  fg: 'var(--status-success)', label: '优秀' };
  if (s >= 75) return { bg: 'var(--status-info-bg)', fg: 'var(--color-accent)', label: '良好' };
  if (s >= 60) return { bg: 'var(--status-warning-bg-light)', fg: 'var(--status-warning)', label: '及格' };
  return         { bg: 'var(--status-danger-bg-light)',   fg: 'var(--status-danger)', label: '需整改' };
}

function severityColor(s: 'LOW'|'MEDIUM'|'HIGH'): string {
  return s === 'HIGH' ? 'var(--status-danger)' : s === 'MEDIUM' ? 'var(--status-warning)' : 'var(--color-accent)';
}

// g200n: 告警 DB enum → 中文([[feedback-hardcoded-english-to-chinese]])
const SEVERITY_LABEL: Record<string, string> = {
  HIGH:   '高',
  MEDIUM: '中',
  LOW:    '低',
};
const SOURCE_LABEL: Record<string, string> = {
  'master-data':  '主数据',
  'master_data':  '主数据',
  'MASTER-DATA':  '主数据',
  'MASTER_DATA':  '主数据',
  traceability:   '追溯',
  inventory:      '库存',
  datascope:      '权限',
  dict:           '字典',
  workflow:       '审批',
  code:           '编码',
  TRACEABILITY:   '追溯',
  INVENTORY:      '库存',
  DATASCOPE:      '权限',
  DICT:           '字典',
  WORKFLOW:       '审批',
  CODE:           '编码',
};
const TYPE_LABEL: Record<string, string> = {
  DUPLICATE_NAME:    '名称重复',
  DUPLICATE_CODE:    '编码重复',
  MISSING_REQUIRED:  '必填缺失',
  ORPHAN_REFERENCE:  '孤立引用',
  STATUS_INVALID:    '状态异常',
  NULL_REFERENCE:    '空引用',
  STALE_RECORD:      '陈旧记录',
};

export default function DataQualityPage() {
  const { t } = useLanguage();
  const qualityPerm = usePermission('MENU_MD_QUALITY');
  const canView = qualityPerm.canView || qualityPerm.isSuper;
  const [scores, setScores] = useState<Scores | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const SCORE_LABEL_KEY: Record<string, string> = { '优秀': 'dq.excellent', '良好': 'dq.good', '及格': 'dq.pass', '需整改': 'dq.needFix' };
  const tScoreLabel = (label: string) => t(SCORE_LABEL_KEY[label] ?? 'dq.unknown', label);

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
      setError(e?.message || t('dq.loadFailed', '加载失败'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) void load(); }, [canView, load]);

  const cards = scores ? [
    { key: 'masterData',   label: t('dq.dim.masterData', '主数据健康'), icon: Database,           score: scores.masterData,   weight: scores.weights.masterData,   path: '/data-quality/master-data' },
    { key: 'traceability', label: t('dq.dim.traceability', '追溯完整率'), icon: Link2,              score: scores.traceability, weight: scores.weights.traceability, path: '/data-quality/traceability' },
    { key: 'inventory',    label: t('dq.dim.inventory', '库存健康'),   icon: Boxes,              score: scores.inventory,    weight: scores.weights.inventory,    path: '/data-quality/inventory' },
    { key: 'dataScope',    label: t('dq.dim.dataScope', '权限审计'),   icon: ShieldCheck,        score: scores.dataScope,    weight: scores.weights.dataScope,    path: '/data-quality/datascope' },
    { key: 'dict',         label: t('dq.dim.dict', '字典覆盖'),   icon: BookOpen,           score: scores.dict,         weight: scores.weights.dict,         path: '/data-quality/dict' },
    { key: 'workflow',     label: t('dq.dim.workflow', '审批健康'),   icon: GitPullRequestArrow, score: scores.workflow,    weight: scores.weights.workflow,     path: '/data-quality/workflow' },
    { key: 'code',         label: t('dq.dim.code', '编码规范'),   icon: Code2,              score: scores.code,         weight: scores.weights.code,         path: '/data-quality/code' },
  ] : [];

  if (!canView) return <div className={u.emptyPad40}>{t('dq.noPerm', '无权限访问数据质量驾驶舱')}</div>;

  return (
    <div>
      <PageHeader
        title={t('dq.title', '数据质量驾驶舱')}
        subtitle={t('dq.subtitle', '集团 7 维数据治理态势 · 决策可信度 · 异常风险 · 整改优先级')}
        breadcrumb={[t('dq.governance', '治理'), t('dq.breadcrumb', '数据质量')]}
        actions={
          <button onClick={() => void load()} disabled={loading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> {t('dq.refresh', '刷新')}
          </button>
        }
      />

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--status-danger-bg-faint)', color: 'var(--status-danger)', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
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
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{t('dq.overallScore', '总质量评分')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 56, fontWeight: 800, color: scoreColor(scores.overall).fg, lineHeight: 1 }}>
                {scores.overall}
              </div>
              <div style={{ fontSize: 14, color: scoreColor(scores.overall).fg, fontWeight: 600 }}>
                / 100 · {tScoreLabel(scoreColor(scores.overall).label)}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('dq.weightFormula', '7 维度加权（主数据 25 / 追溯 20 / 库存 15 / 权限 12 / 字典 10 / 审批 10 / 编码 8）')}
            </div>
          </div>

          {/* 告警计数大卡 */}
          <div style={{
            padding: 24, borderRadius: 16,
            background: scores.highAlertCount > 0 ? 'var(--status-danger-bg-faint)' : 'var(--status-success-bg-faint)',
            border: `1px solid ${scores.highAlertCount > 0 ? '#dc262633' : '#16a34a33'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <AlertTriangle size={20} style={{ color: scores.highAlertCount > 0 ? 'var(--status-danger)' : 'var(--status-success)' }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{t('dq.realtimeAlert', '实时告警')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 56, fontWeight: 800, color: scores.highAlertCount > 0 ? 'var(--status-danger)' : 'var(--status-success)', lineHeight: 1 }}>
                {scores.alertCount}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {scores.highAlertCount > 0 && <span style={{ color: 'var(--status-danger)', fontWeight: 700 }}>{scores.highAlertCount} {t('dq.highRisk', '高危')} · </span>}
                {t('dq.totalAlerts', '总告警条数')}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('dq.lastUpdated', '最近更新：')}{new Date(scores.asOf).toLocaleString('zh-CN')}
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
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-secondary)' }}>{t('dq.weight', '权重')} {c.weight}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: sc.fg, lineHeight: 1 }}>{c.score}</div>
                  <div style={{ fontSize: 12, color: sc.fg, fontWeight: 600 }}>{tScoreLabel(sc.label)}</div>
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
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('dq.alertList', '实时告警列表')}</h2>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
            {t('dq.total', '共')} {alerts.length} {t('dq.items', '条')}
          </span>
        </div>

        {loading && <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>{t('dq.loading', '加载中…')}</div>}
        {!loading && alerts.length === 0 && (
          <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
            {t('dq.noAlerts', '🎉 暂无告警，数据质量良好')}
          </div>
        )}
        {!loading && alerts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((a, i) => {
              const sev = severityColor(a.severity);
              return (
                <div key={i} style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: a.severity === 'HIGH' ? 'var(--status-danger-bg-faint)' : 'var(--bg-muted)',
                  border: `1px solid ${sev}22`,
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  <div style={{
                    minWidth: 56, padding: '2px 8px', borderRadius: 6,
                    background: `${sev}1a`, color: sev, fontSize: 11, fontWeight: 700, textAlign: 'center',
                  }}>
                    {t(`dq.severity.${a.severity}`, SEVERITY_LABEL[a.severity] ?? a.severity)}
                  </div>
                  <div className={u.flex1}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t(`dq.source.${a.source}`, SOURCE_LABEL[a.source] ?? a.source)}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>·</span>
                      <span style={{ fontSize: 11, color: sev, fontWeight: 600 }}>{t(`dq.type.${a.type}`, TYPE_LABEL[a.type] ?? a.type)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {t('dq.affects', '影响')} {a.count} {t('dq.items', '条')}
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

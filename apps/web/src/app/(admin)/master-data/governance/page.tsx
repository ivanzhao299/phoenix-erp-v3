'use client';
import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { usePermission } from '@/hooks/usePermission';
import { dictTypeLabel } from '@/lib/dict-type-labels';
import { Panel } from '@/components/design-system';
import { secondaryActionButton } from '@/components/design-system/cockpit-styles';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  RefreshCw, AlertTriangle, CheckCircle, Network, Building, BookOpen,
  ShieldCheck, Link2, GitPullRequestArrow, ExternalLink,
} from 'lucide-react';

/**
 * G5.5-D · 主数据治理驾驶舱
 *
 * 5 评分卡 + 总评分 + 字典覆盖率明细 + 用户权限统计
 *
 * API：
 *   GET /api/master-data/governance/scores
 *   GET /api/master-data/governance/dict-coverage
 */

interface Scores {
  overall: number;
  org_score: number;
  company_score: number;
  dict_score: number;
  user_org_score: number;
  reference_score: number;
  workflow_score: number;
  alertCount: number;
  highAlertCount: number;
  asOf: string;
  details: {
    orgs: { total: number; active: number; pending: number; frozen: number; archived: number };
    dicts: { total: number; active: number; missing: number; empty: number };
    references: { totalReferenceable: number; orphanReferences: number };
    workflow: { pendingApprovals: number; overdue3d: number };
    userOrgs: { totalUsers: number; usersWithOrg: number; usersWithExtraScope: number };
  };
}

interface DictCoverage {
  totalKnownDictTypes: number;
  activeDictTypes: number;
  missingDictTypes: string[];
  emptyDictTypes: string[];
  coverageRate: number;
  score: number;
  details: Array<{ dictType: string; status: string; entryCount: number; activeCount: number }>;
}

function scoreColor(s: number): { bg: string; fg: string; label: string } {
  if (s >= 90) return { bg: 'var(--status-success-bg-light)',  fg: 'var(--status-success)', label: '优秀' };
  if (s >= 75) return { bg: 'var(--status-info-bg)', fg: 'var(--color-accent)', label: '良好' };
  if (s >= 60) return { bg: 'var(--status-warning-bg-light)', fg: 'var(--status-warning)', label: '及格' };
  return         { bg: 'var(--status-danger-bg-light)',   fg: 'var(--status-danger)', label: '需整改' };
}

export default function GovernanceDashboardPage() {
  const { t, translateLiteral } = useLanguage();
  const qualityPerm = usePermission('MENU_MD_QUALITY');
  const canView = qualityPerm.canView || qualityPerm.isSuper;
  const [scores, setScores] = useState<Scores | null>(null);
  const [dict, setDict] = useState<DictCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [s, d] = await Promise.all([
        request<Scores>('/master-data/governance/scores'),
        request<DictCoverage>('/master-data/governance/dict-coverage'),
      ]);
      setScores(s);
      setDict(d);
    } catch (e: any) {
      setError(e?.message || t('md.loadFailed', '加载失败'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) void load(); }, [canView, load]);

  const cards = scores ? [
    { key: 'org_score',       label: t('md.govOrg', '组织治理'), icon: Network,    score: scores.org_score,       weight: 20, hint: `${scores.details.orgs.active}/${scores.details.orgs.total} ${t('md.active', '活跃')}` },
    { key: 'company_score',   label: t('md.govCompany', '公司治理'), icon: Building,   score: scores.company_score,   weight: 20, hint: 'sys_organizations.org_type=COMPANY' },
    { key: 'dict_score',      label: t('md.govDict', '字典治理'), icon: BookOpen,   score: scores.dict_score,      weight: 20, hint: `${scores.details.dicts.active}/${scores.details.dicts.total} ${t('md.active', '活跃')}；${t('md.missing', '缺')} ${scores.details.dicts.missing} ${t('md.unitCategory', '类')}` },
    { key: 'user_org_score',  label: t('md.govPerm', '权限治理'), icon: ShieldCheck,score: scores.user_org_score,  weight: 15, hint: `${scores.details.userOrgs.usersWithOrg}/${scores.details.userOrgs.totalUsers} ${t('md.scopeConfigured', '已配 scope')}` },
    { key: 'reference_score', label: t('md.govReference', '引用治理'), icon: Link2,      score: scores.reference_score, weight: 15, hint: `${t('md.refTableCoverage', '25+ 业务表覆盖；近期阻断')} ${scores.details.references.orphanReferences}` },
    { key: 'workflow_score',  label: t('md.govWorkflow', '审批治理'), icon: GitPullRequestArrow, score: scores.workflow_score, weight: 10, hint: `${t('md.inProgress', '进行中')} ${scores.details.workflow.pendingApprovals}；${t('md.overdue', '超时')} ${scores.details.workflow.overdue3d}` },
  ] : [];

  if (!canView) return <div className={u.emptyPad40}>{t('md.noPermGovernance', '无权限访问主数据治理驾驶舱')}</div>;
  return (
    <div>
      <PageHeader
        title={t('md.governanceTitle', '主数据治理驾驶舱')}
        subtitle={t('md.governanceSub', '6 维度治理评分 · 字典覆盖率 · 权限统计 · 引用阻断事件')}
        breadcrumb={[t('md.center', '主数据中心'), t('md.governanceCockpit', '治理驾驶舱')]}
        actions={
          <button onClick={() => void load()} disabled={loading} style={secondaryActionButton}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> {t('md.refresh', '刷新')}
          </button>
        }
      />

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--status-danger-bg-faint)', color: 'var(--status-danger)', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* 顶部总评分 */}
      {scores && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{
            padding: 24, borderRadius: 16,
            background: scoreColor(scores.overall).bg,
            border: `1px solid ${scoreColor(scores.overall).fg}33`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <CheckCircle size={20} style={{ color: scoreColor(scores.overall).fg }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{t('md.govOverallScore', '主数据治理总评分')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 56, fontWeight: 800, color: scoreColor(scores.overall).fg, lineHeight: 1 }}>
                {scores.overall}
              </div>
              <div style={{ fontSize: 14, color: scoreColor(scores.overall).fg, fontWeight: 600 }}>
                / 100 · {t('md.scoreLevel.' + scoreColor(scores.overall).label, scoreColor(scores.overall).label)}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('md.govWeightNote', '加权（org 20 / company 20 / dict 20 / user-org 15 / reference 15 / workflow 10）')}
            </div>
          </div>

          <div style={{
            padding: 24, borderRadius: 16,
            background: scores.highAlertCount > 0 ? 'var(--status-danger-bg-faint)' : 'var(--status-success-bg-faint)',
            border: `1px solid ${scores.highAlertCount > 0 ? '#dc262633' : '#16a34a33'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <AlertTriangle size={20} style={{ color: scores.highAlertCount > 0 ? 'var(--status-danger)' : 'var(--status-success)' }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{t('md.govEvents7d', '近 7 天治理事件')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 56, fontWeight: 800, color: scores.highAlertCount > 0 ? 'var(--status-danger)' : 'var(--status-success)', lineHeight: 1 }}>
                {scores.alertCount}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {scores.highAlertCount > 0 && <span style={{ color: 'var(--status-danger)', fontWeight: 700 }}>{scores.highAlertCount} {t('md.highRisk', '高危')} · </span>}
                {t('md.unresolved', '未解决')}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('md.govEventsSource', '来源：md_governance_events（归档阻断 / 冻结引用 / 字典缺失 / 审批超时）')}
            </div>
          </div>
        </div>
      )}

      {/* 6 评分卡 */}
      {scores && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
          {cards.map(c => {
            const sc = scoreColor(c.score);
            const Icon = c.icon;
            return (
              <div key={c.key} style={{
                padding: 16, borderRadius: 12, background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderLeft: `4px solid ${sc.fg}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Icon size={15} style={{ color: sc.fg }} />
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{c.label}</div>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-secondary)' }}>{t('md.weight', '权重')} {c.weight}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: sc.fg, lineHeight: 1 }}>{c.score}</div>
                  <div style={{ fontSize: 12, color: sc.fg, fontWeight: 600 }}>{t('md.scoreLevel.' + sc.label, sc.label)}</div>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>{c.hint}</div>
                <div style={{ marginTop: 8, height: 4, background: 'var(--bg-muted)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${c.score}%`, background: sc.fg }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 字典覆盖率明细 */}
      {dict && (
        <Panel
          title={t('md.dictCoverageDetail', '字典覆盖率明细')}
          icon={<BookOpen size={16} />}
          extra={
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {dict.activeDictTypes} / {dict.totalKnownDictTypes} {t('md.seededActive', '已植入活跃')} ·
              {t('md.coverageRate', '覆盖率')} {Math.round(dict.coverageRate * 100)}%
            </span>
          }
          bodyPadding={20}
          style={{ marginBottom: 16 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            {dict.details.map(d => {
              const color = d.status === 'ACTIVE' ? 'var(--status-success)' : d.status === 'EMPTY' ? 'var(--status-warning)' : 'var(--status-danger)';
              return (
                <div key={d.dictType} style={{
                  padding: '8px 12px', borderRadius: 6,
                  background: `${color}0a`, border: `1px solid ${color}33`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{translateLiteral(dictTypeLabel(d.dictType))}<span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6, fontFamily: 'monospace' }}>{d.dictType}</span></span>
                  <span style={{ fontSize: 11, color, fontWeight: 600 }}>
                    {d.status === 'MISSING' ? t('md.missingStatus', '缺失') : d.status === 'EMPTY' ? t('md.emptyStatus', '失效') : `${d.activeCount} ${t('md.unitItem', '条')}`}
                  </span>
                </div>
              );
            })}
          </div>
          {dict.missingDictTypes.length > 0 && (
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'var(--status-danger-bg-faint)', fontSize: 12, color: 'var(--status-danger)' }}>
              <strong>{t('md.missingDict', '缺失字典')}（{dict.missingDictTypes.length}）：</strong> {dict.missingDictTypes.map(tp => translateLiteral(dictTypeLabel(tp))).join('、')}
            </div>
          )}
        </Panel>
      )}

      {/* 入口链接 */}
      <Panel title={t('md.relatedGovEntries', '相关治理入口')} bodyPadding={20}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          {[
            { href: '/master-data/organizations', label: t('md.orgStructure', '组织架构'), icon: Network },
            { href: '/master-data/companies', label: t('md.companyArchive', '公司档案'), icon: Building },
            { href: '/master-data/dictionaries', label: t('md.dataDict', '数据字典'), icon: BookOpen },
            { href: '/master-data/pending', label: t('md.mdPending', '主数据待审批'), icon: GitPullRequestArrow },
            { href: '/data-quality', label: t('md.g5DataQuality', 'G5 数据质量中心'), icon: CheckCircle },
          ].map(l => {
            const Icon = l.icon;
            return (
              <a key={l.href} href={l.href} style={{
                padding: '10px 14px', borderRadius: 8, background: 'var(--bg-muted)',
                border: '1px solid var(--border)', color: 'var(--text-primary)',
                textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Icon size={14} style={{ color: 'var(--color-accent)' }} />
                <span className={u.flex1}>{l.label}</span>
                <ExternalLink size={11} style={{ color: 'var(--text-disabled)' }} />
              </a>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

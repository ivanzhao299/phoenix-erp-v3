'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DatabaseZap, GitCompareArrows, Landmark, RefreshCw, Scale, ShieldCheck, WalletCards } from 'lucide-react';
import { KpiCard, PageHeaderV2, StatusBadge } from '@/components/design-system';
import { KPI_GRID } from '@/lib/design-tokens';
import {
  ChanjetShareholderInboundLatest, ChanjetShareholderInboundPlan,
  ShareholderAccountingOverview, shareholderApi,
} from '@/lib/shareholder-api';
import { useLanguage } from '@/contexts/LanguageContext';
import u from '@/styles/uix-utils.module.css';
import styles from './reconciliation.module.css';

const money = (value: number) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ShareholderReconciliationPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<ShareholderAccountingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('');
  const [inboundPlan, setInboundPlan] = useState<ChanjetShareholderInboundPlan | null>(null);
  const [inboundLatest, setInboundLatest] = useState<ChanjetShareholderInboundLatest | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const normalizedPeriod = period.replace('-', '');
      const [overview, plan, latest] = await Promise.all([
        shareholderApi.accountingOverview(normalizedPeriod),
        shareholderApi.accountingInboundPlan(normalizedPeriod),
        shareholderApi.accountingInboundLatest(),
      ]);
      setData(overview);
      setInboundPlan(plan);
      setInboundLatest(latest);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : t('ui.加载股权财务对账失败', '加载股权财务对账失败'));
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  useEffect(() => {
    let active = true;
    const normalizedPeriod = period.replace('-', '');
    Promise.all([
      shareholderApi.accountingOverview(normalizedPeriod),
      shareholderApi.accountingInboundPlan(normalizedPeriod),
      shareholderApi.accountingInboundLatest(),
    ])
      .then(([response, plan, latest]) => {
        if (!active) return;
        setData(response);
        setInboundPlan(plan);
        setInboundLatest(latest);
        setError('');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setError(error instanceof Error ? error.message : t('ui.加载股权财务对账失败', '加载股权财务对账失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [period, t]);

  const coverage = useMemo(() => {
    if (!data?.companies.length) return 0;
    return data.companies.reduce((sum, row) => sum + row.mappingCoverage, 0) / data.companies.length;
  }, [data]);
  const pendingMappings = data?.shareholders.filter((row) => row.mappingStatus !== 'APPROVED') || [];
  const debtRows = data?.contributionClassification.filter((row) => row.accountingClass === 'DEBT_OR_ADVANCE') || [];

  const applyInboundPlan = async () => {
    if (!inboundPlan || inboundPlan.decision === 'HOLD') return;
    const approved = window.confirm(t(
      'ui.确认将当前好业财4001会计事实同步到ERP会计镜像？不会写好业财，也不会覆盖法定股权或出资台账。',
      '确认将当前好业财4001会计事实同步到ERP会计镜像？不会写好业财，也不会覆盖法定股权或出资台账。',
    ));
    if (!approved) return;
    setSyncing(true);
    setError('');
    try {
      await shareholderApi.applyAccountingInboundPlan(inboundPlan.period, inboundPlan.planHash);
      await load();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : t('ui.同步ERP会计镜像失败', '同步ERP会计镜像失败'));
    } finally {
      setSyncing(false);
    }
  };

  return <div className={u.p24}>
    <PageHeaderV2
      title={t('ui.股权财务对账', '股权财务对账')}
      subtitle={t('ui.ERP法定股权、逐笔出资与好业财已记账实收资本的只读勾稽', 'ERP法定股权、逐笔出资与好业财已记账实收资本的只读勾稽')}
      breadcrumb={[{ label: t('ui.股东权益中心', '股东权益中心') }, { label: t('ui.股权财务对账', '股权财务对账') }]}
      actions={<div className={styles.actions}>
        <input aria-label={t('ui.会计期间', '会计期间')} type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className={styles.period} />
        <button type="button" onClick={() => void load()} className={styles.refresh} disabled={loading}>
          <RefreshCw size={16} /> {t('ui.刷新', '刷新')}
        </button>
      </div>}
    />

    <section className={styles.authorityBand}>
      <ShieldCheck size={20} />
      <div>
        <strong>{t('ui.权威口径已锁定', '权威口径已锁定')}</strong>
        <p>{t('ui.ERP管理法定股权与业务出资；好业财管理已记账会计事实。差异只展示和勾稽，不静默覆盖；借款、垫资、代付不计入实收资本。', 'ERP管理法定股权与业务出资；好业财管理已记账会计事实。差异只展示和勾稽，不静默覆盖；借款、垫资、代付不计入实收资本。')}</p>
      </div>
      <span className={styles.readonly}>{t('ui.好业财只读', '好业财只读')}</span>
    </section>

    {error && <div className={styles.error}>{error}</div>}
    {loading && !data && <div className={styles.loading}>{t('ui.正在加载对账证据…', '正在加载对账证据…')}</div>}
    {data && <>
      <div style={{ ...KPI_GRID, marginBottom: 18 }}>
        <KpiCard title={t('ui.ERP法定实缴', 'ERP法定实缴')} value={money(data.totals.erpPaidIn)} subValue={t('ui.股权结构口径', '股权结构口径')} icon={WalletCards} accentColor="blue" />
        <KpiCard title={t('ui.好业财已记账实收资本', '好业财已记账实收资本')} value={money(data.totals.chanjetPaidIn)} subValue={t('ui.4001科目本位币口径', '4001科目本位币口径')} icon={Landmark} accentColor="green" />
        <KpiCard title={t('ui.会计差异', '会计差异')} value={money(data.totals.difference)} subValue={t('ui.保留差异，不覆盖', '保留差异，不覆盖')} icon={GitCompareArrows} accentColor={Math.abs(data.totals.difference) <= 0.01 ? 'teal' : 'amber'} />
        <KpiCard title={t('ui.科目映射覆盖率', '科目映射覆盖率')} value={`${coverage.toFixed(1)}%`} subValue={`${pendingMappings.length} ${t('ui.项待确认', '项待确认')}`} icon={Scale} accentColor={coverage === 100 ? 'green' : 'violet'} />
      </div>

      {inboundPlan && <section className={styles.syncPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>{t('ui.好业财会计事实入站核对', '好业财会计事实入站核对')}</h2>
            <p>{t('ui.逐项核对4001子科目名称后写入ERP会计镜像；未知账户完整保留但不绑定股东，冲突时禁止同步。', '逐项核对4001子科目名称后写入ERP会计镜像；未知账户完整保留但不绑定股东，冲突时禁止同步。')}</p>
          </div>
          <div className={styles.syncActions}>
            <StatusBadge
              status={inboundPlan.decision === 'HOLD' ? 'WARNING' : 'ACTIVE'}
              label={inboundPlan.decision === 'READY' ? t('ui.核对通过', '核对通过') : inboundPlan.decision === 'READY_WITH_CONDITIONS' ? t('ui.有条件可同步', '有条件可同步') : t('ui.禁止同步', '禁止同步')}
            />
            <button type="button" className={styles.syncButton} onClick={() => void applyInboundPlan()} disabled={syncing || inboundPlan.decision === 'HOLD'}>
              <DatabaseZap size={16} /> {syncing ? t('ui.同步中…', '同步中…') : t('ui.同步到ERP会计镜像', '同步到ERP会计镜像')}
            </button>
          </div>
        </div>
        <div className={styles.syncMeta}>
          <span>{t('ui.源明细', '源明细')} <strong>{inboundPlan.counts.source}</strong></span>
          <span>{t('ui.已匹配', '已匹配')} <strong>{inboundPlan.counts.mapped}</strong></span>
          <span>{t('ui.仅保留源', '仅保留源')} <strong>{inboundPlan.counts.sourceOnly}</strong></span>
          <span>{t('ui.冲突', '冲突')} <strong>{inboundPlan.counts.conflicts}</strong></span>
          <span>{t('ui.源新鲜度', '源新鲜度')} <strong>{inboundPlan.sourceFreshnessHours.toFixed(2)}h</strong></span>
          <span>{t('ui.最近批次', '最近批次')} <strong>{inboundLatest?.run?.status || t('ui.尚未同步', '尚未同步')}</strong></span>
        </div>
        {inboundPlan.blockers.length > 0 && <div className={styles.blockers}>{inboundPlan.blockers.join('；')}</div>}
        {inboundPlan.conditions.length > 0 && (
          <div className={styles.conditions}>{inboundPlan.conditions.join('；')}</div>
        )}
        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>{t('ui.公司 / 账套', '公司 / 账套')}</th><th>{t('ui.好业财科目', '好业财科目')}</th><th>{t('ui.金额（本位币）', '金额（本位币）')}</th><th>{t('ui.ERP对应', 'ERP对应')}</th><th>{t('ui.核对结果', '核对结果')}</th><th>{t('ui.核对依据', '核对依据')}</th></tr></thead>
          <tbody>{inboundPlan.rows.map((row) => <tr key={`${row.bookId}:${row.period}:${row.subjectId}`}>
            <td><strong>{row.companyCode}</strong><small>{row.bookId} · {row.period}</small></td>
            <td><strong>{row.subjectName}</strong><small>{row.subjectCode} · {row.currency || '—'}</small></td>
            <td>{money(row.amountBase)}</td>
            <td>{row.shareholderName ? <><strong>{row.shareholderName}</strong><small>{row.shareholderCode}</small></> : t('ui.不绑定股东，仅保留会计源项', '不绑定股东，仅保留会计源项')}</td>
            <td><StatusBadge status={row.mappingStatus === 'CONFLICT' ? 'ERROR' : row.mappingStatus === 'SOURCE_ONLY' ? 'WARNING' : 'ACTIVE'} label={`${row.mappingStatus} · ${row.confidence}%`} /></td>
            <td>{row.reason}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><h2>{t('ui.公司与账套对账', '公司与账套对账')}</h2><p>{t('ui.每家公司独立账套、期间和本位币口径，禁止跨账套合并推断。', '每家公司独立账套、期间和本位币口径，禁止跨账套合并推断。')}</p></div>
          <StatusBadge status={data.decision === 'HOLD' ? 'WARNING' : 'ACTIVE'} label={data.decision === 'HOLD' ? t('ui.存在待处理差异', '存在待处理差异') : t('ui.对账通过（有条件）', '对账通过（有条件）')} />
        </div>
        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>{t('ui.公司 / 账套', '公司 / 账套')}</th><th>{t('ui.期间', '期间')}</th><th>{t('ui.ERP实缴', 'ERP实缴')}</th><th>{t('ui.好业财4001', '好业财4001')}</th><th>{t('ui.差异', '差异')}</th><th>{t('ui.内部差异', '内部差异')}</th><th>{t('ui.映射', '映射')}</th><th>{t('ui.逐笔勾稽', '逐笔勾稽')}</th></tr></thead>
          <tbody>{data.companies.map((row) => <tr key={row.bookId}>
            <td><strong>{row.companyName || row.companyCode}</strong><small>{row.companyCode} · {row.bookName}</small></td>
            <td>{row.period || '—'}</td><td>{money(row.erpPaidIn)}</td><td>{money(row.chanjetPaidIn)}</td>
            <td className={Math.abs(row.difference) > 0.01 ? styles.warn : styles.ok}>{money(row.difference)}</td>
            <td className={Math.abs(row.internalDifference) > 0.01 ? styles.warn : styles.ok}>{money(row.internalDifference)}</td>
            <td>{row.approvedMappingCount}/{row.shareholderCount}<small>{row.mappingCoverage.toFixed(1)}%</small></td>
            <td>{row.matchedContributionCount}/{row.eligibleContributionCount}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><h2>{t('ui.股东与4001子科目', '股东与4001子科目')}</h2><p>{t('ui.候选仅用于核验；只有显式批准的映射才参与逐笔勾稽与月结。', '候选仅用于核验；只有显式批准的映射才参与逐笔勾稽与月结。')}</p></div>
        </div>
        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>{t('ui.项目', '项目')}</th><th>{t('ui.股东', '股东')}</th><th>{t('ui.ERP实缴', 'ERP实缴')}</th><th>{t('ui.映射状态', '映射状态')}</th><th>{t('ui.好业财科目', '好业财科目')}</th></tr></thead>
          <tbody>{data.shareholders.map((row) => <tr key={`${row.projectCode}:${row.shareholderCode}`}>
            <td><strong>{row.projectName}</strong><small>{row.companyCode}</small></td>
            <td><strong>{row.shareholderName}</strong><small>{row.shareholderCode}</small></td>
            <td>{money(row.erpPaidIn)}</td>
            <td><StatusBadge status={row.mappingStatus === 'APPROVED' ? 'ACTIVE' : 'WARNING'} label={row.mappingStatus === 'APPROVED' ? t('ui.已批准', '已批准') : row.mappingStatus === 'CANDIDATE' ? t('ui.唯一候选待确认', '唯一候选待确认') : row.mappingStatus === 'NEED_REVIEW' ? t('ui.多候选待复核', '多候选待复核') : t('ui.未映射', '未映射')} /></td>
            <td>{(row.approvedMappings.length ? row.approvedMappings : row.candidates).map((item) => `${item.subjectCode} ${item.subjectName}`).join('；') || '—'}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className={styles.debtBand}>
        <div><strong>{t('ui.借款 / 垫资已隔离', '借款 / 垫资已隔离')}</strong><p>{t('ui.这些记录进入股东往来和清偿台账，不计入股权实缴或好业财4001对账。', '这些记录进入股东往来和清偿台账，不计入股权实缴或好业财4001对账。')}</p></div>
        <div className={styles.debtMetric}>{money(data.totals.debtOrAdvance)}<small>{debtRows.length} {t('ui.笔', '笔')}</small></div>
        <Link href="/finance2/shareholder-funds">{t('ui.查看股东资金往来', '查看股东资金往来')} →</Link>
      </section>
    </>}
  </div>;
}

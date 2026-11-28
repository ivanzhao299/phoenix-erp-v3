'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import { packagingApi, type PackagingWorkQueueBucket, type PackagingWorkQueueItem, type PackagingWorkQueueSite } from '@/lib/packaging-api';
import { queueProductionHref } from '@/lib/packaging-queue-navigation';

const BUCKETS: { id: PackagingWorkQueueBucket; label: string }[] = [
  { id: 'CURRENT', label: '本班待办' },
  { id: 'CARRYOVER', label: '跨班待办' },
  { id: 'REVIEW', label: '待复核' },
];

export default function PackagingWorkQueue({ shiftId, defaultSiteCode, identityKey }: { shiftId?: string; defaultSiteCode?: string; identityKey: string }) {
  const { t } = useLanguage();
  const { canView: canViewProductionInbound } = usePermission('MENU_PROD_INBOUND');
  const [selectedSiteCode, setSelectedSiteCode] = useState('');
  const [bucket, setBucket] = useState<PackagingWorkQueueBucket>(shiftId ? 'CURRENT' : 'CARRYOVER');
  const [reload, setReload] = useState(0);
  const [sitesReload, setSitesReload] = useState(0);
  const [sitesResult, setSitesResult] = useState<{ key: string; sites: PackagingWorkQueueSite[]; error: string }>({ key: '', sites: [], error: '' });
  const [queueResult, setQueueResult] = useState<{ key: string; items: PackagingWorkQueueItem[]; counts: Record<string, number>; nextCursor: string | null; error: string }>({ key: '', items: [], counts: {}, nextCursor: null, error: '' });
  const [loadingMoreGeneration, setLoadingMoreGeneration] = useState<number | null>(null);
  const siteRequestKey = JSON.stringify([identityKey, defaultSiteCode, sitesReload]);
  const sitesReady = Boolean(shiftId) || sitesResult.key === siteRequestKey;
  const sites = shiftId ? [] : sitesReady ? sitesResult.sites : [];
  const sitesError = !shiftId && sitesReady ? sitesResult.error : '';
  const siteCode = shiftId ? defaultSiteCode ?? '' : selectedSiteCode;
  const requestKey = JSON.stringify([identityKey, siteCode, bucket, shiftId, reload]);
  const queueReady = queueResult.key === requestKey;
  const items = queueReady ? queueResult.items : [];
  const counts = queueReady ? queueResult.counts : {};
  const nextCursor = queueReady ? queueResult.nextCursor : null;
  const error = queueReady ? queueResult.error : '';
  const loading = Boolean(siteCode && (bucket !== 'CURRENT' || shiftId) && !queueReady);
  const latestKey = useRef('');
  const pageGeneration = useRef(0);

  useLayoutEffect(() => {
    latestKey.current = requestKey;
    pageGeneration.current += 1;
  }, [requestKey]);

  useEffect(() => {
    let active = true;
    if (shiftId) return () => { active = false; };
    packagingApi.getWorkQueueSites().then(rows => {
      if (!active) return;
      const safeRows = Array.isArray(rows) ? rows.filter(x => x.siteCode && x.siteName) : [];
      setSitesResult({ key: siteRequestKey, sites: safeRows, error: '' });
    }).catch(e => { if (active) setSitesResult({ key: siteRequestKey, sites: [], error: e instanceof Error ? e.message : t('terminal.queueSitesFailed', '授权场站读取失败') }); });
    return () => { active = false; };
  }, [shiftId, defaultSiteCode, identityKey, siteRequestKey, t]);

  useEffect(() => {
    let active = true;
    if (!siteCode || (bucket === 'CURRENT' && !shiftId)) {
      return () => { active = false; };
    }
    packagingApi.getWorkQueue({ bucket, siteCode, ...(bucket === 'CURRENT' && shiftId ? { shiftId } : {}), pageSize: 25 })
      .then(data => {
        if (!active) return;
        setQueueResult({ key: requestKey, items: data.items ?? [], counts: data.counts ?? {}, nextCursor: data.nextCursor ?? null, error: '' });
      })
      .catch(e => { if (active) setQueueResult({ key: requestKey, items: [], counts: {}, nextCursor: null, error: e instanceof Error ? e.message : t('terminal.queueFailed', '队列加载失败') }); });
    return () => { active = false; };
  }, [siteCode, shiftId, bucket, requestKey, t]);

  const loadMore = async () => {
    if (!siteCode || !nextCursor || loading) return;
    const capturedKey = requestKey;
    const generation = pageGeneration.current;
    setLoadingMoreGeneration(generation);
    try {
      const data = await packagingApi.getWorkQueue({ bucket, siteCode, ...(bucket === 'CURRENT' && shiftId ? { shiftId } : {}), pageSize: 25, cursor: nextCursor });
      if (generation !== pageGeneration.current || latestKey.current !== capturedKey) return;
      setQueueResult(prev => prev.key === capturedKey ? { ...prev, items: [...prev.items, ...(data.items ?? [])], counts: data.counts ?? prev.counts, nextCursor: data.nextCursor ?? null, error: '' } : prev);
    } catch (e) { if (generation === pageGeneration.current && latestKey.current === capturedKey) setQueueResult(prev => prev.key === capturedKey ? { ...prev, error: e instanceof Error ? e.message : t('terminal.queueFailed', '队列加载失败') } : prev); }
    finally { if (generation === pageGeneration.current && latestKey.current === capturedKey) setLoadingMoreGeneration(null); }
  };
  const loadingMore = loadingMoreGeneration === pageGeneration.current && queueReady;

  const kindLabel = (kind: string) => kind === 'SOURCE' ? t('terminal.queueSource', '来源批次') : kind === 'GRADING' ? t('terminal.queueGrading', '分级原单') : t('terminal.queuePacking', '包装原单');
  const actionLabel = (action: string) => {
    switch (action) {
      case 'GRADE': return t('terminal.grading', '分级');
      case 'PACK': return t('terminal.packing', '包装');
      case 'VIEW': return t('terminal.queueView', '查看');
      case 'LEGACY_TEMP_INBOUND': return t('terminal.queueLegacyInbound', '查看临时生产入库');
      case 'FORMAL_INSTALLMENTS': return t('terminal.queueInstallments', '打开正式分次入库');
      case 'FORMAL_RAW': return t('terminal.queueRaw', '打开正式原始收蛋');
      case 'REVIEW':
      case 'CUTOVER_REVIEW':
      case 'SOURCE_ALLOCATION_REVIEW':
      case 'PARTIAL_HANDOVER': return t('terminal.queueReviewAction', '复核');
      default: return t('terminal.queuePending', '待处理');
    }
  };
  const reasonLabel = (item: PackagingWorkQueueItem) => {
    switch (item.reason) {
      case 'Awaiting grading': return t('terminal.queueReasonGrading', '等待分级');
      case 'Available for packing': return t('terminal.queueReasonPacking', '可进入包装');
      case 'Awaiting handover': return t('terminal.queueReasonHandover', '等待交库');
      case 'Closed shift carryover': return t('terminal.queueReasonCarryover', '已跨班待处理');
      case 'Existing packing allocation requires review': return t('terminal.queueReasonAllocation', '已有包装分配，需要复核');
      case 'Uncertain or over-allocated grading source quantity': return t('terminal.queueReasonAllocation', '来源分配需要复核');
      case 'Formal raw collection requires signed handover': return t('terminal.queueRawSourceInstruction', '请选择有权限的交库仓库，再核对这条原始收蛋来源。');
      case 'Use formal installment production inbound': return t('terminal.queueInstallments', '正式分次入库');
      case 'Use temporary production inbound': return t('terminal.queueLegacyInbound', '临时生产入库');
      case 'Partial handover or inventory evidence needs review': return t('terminal.queueReasonPartial', '交接或库存凭据不完整');
      case 'The production day already has an initial inventory route': return t('terminal.queueReasonExistingInbound', '该舍日已有入账路线或历史凭据');
      case 'Existing source evidence prevents formal raw collection': return t('terminal.queueReasonExistingSource', '核对已有来源凭据后再办理原始收蛋');
      case 'Formal production cutover is not active':
      case 'Production date precedes formal cutover': return t('terminal.queueReasonCutover', '该产蛋日或场站当前需核对切换状态');
      default:
        return item.action === 'CUTOVER_REVIEW' ? t('terminal.queueReasonCutover', '该产蛋日或场站当前需核对切换状态')
          : item.action === 'REVIEW' ? t('terminal.queueReasonReview', '需要复核') : item.reason;
    }
  };
  const itemHref = (item: PackagingWorkQueueItem) => {
    if (!item.href) return undefined;
    if (item.kind === 'PACKING' && (item.action === 'VIEW' || item.action === 'PARTIAL_HANDOVER')) {
      return `/terminal/packaging/history/${encodeURIComponent(item.code)}`;
    }
    if (item.action === 'GRADE' && item.href === '/terminal/packaging/grading') return item.href;
    if (item.action === 'PACK' && item.href === '/terminal/packaging/packing') return item.href;
    return canViewProductionInbound ? queueProductionHref(item.href, item.action) : undefined;
  };

  return <section aria-label="包装待办队列" style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 180 }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-primary)' }}>{t('terminal.queueTitle', '包装作业队列')}</div>
      {!shiftId && <div style={{ width: 260 }}><select aria-label={t('terminal.queueSite', '场站')} value={siteCode} onChange={e => setSelectedSiteCode(e.target.value)} disabled={!sitesReady || !!sitesError} style={{ width: '100%', minHeight: 38 }}><option value="">{!sitesReady ? t('terminal.queueSitesLoading', '正在读取授权场站…') : t('terminal.queueSelectSite', '选择授权场站')}</option>{sites.map(s => <option key={s.siteCode} value={s.siteCode}>{s.siteName}（{s.siteCode}）</option>)}</select></div>}
      {shiftId && <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t('terminal.queueOpenShiftReadOnly', '当前开放班次 · 只读查看')}</span>}
      <button type="button" onClick={() => setReload(v => v + 1)} disabled={!siteCode || loading || loadingMore} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>{t('terminal.queueRefresh', '刷新')}</button>
    </header>
    <nav aria-label="队列分类" style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border, #e5e7eb)' }}>
      {BUCKETS.map(tab => <button key={tab.id} type="button" onClick={() => setBucket(tab.id)} aria-pressed={bucket === tab.id} disabled={tab.id === 'CURRENT' && !shiftId} style={{ padding: '8px 12px', border: 0, borderBottom: bucket === tab.id ? '3px solid var(--color-accent, #0f766e)' : '3px solid transparent', background: 'transparent', color: bucket === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: bucket === tab.id ? 700 : 500, cursor: tab.id === 'CURRENT' && !shiftId ? 'not-allowed' : 'pointer', opacity: tab.id === 'CURRENT' && !shiftId ? .45 : 1 }}>{t(`terminal.queue.${tab.id}`, tab.label)}</button>)}
    </nav>
    {!shiftId && sitesError ? <p role="alert">{sitesError} <button type="button" onClick={() => setSitesReload(x => x + 1)}>{t('terminal.queueRetry', '重试')}</button></p>
      : !shiftId && sitesReady && sites.length === 0 ? <p>{t('terminal.queueNoAuthorizedSites', '当前账号没有可查看的场站。')}</p>
      : !siteCode ? <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{t('terminal.queueChooseSiteHelp', '当前没有开放班次。选择有权限的场站后，可只读查看跨班待办和待复核项目。')}</p>
      : loading && items.length === 0 ? <p role="status" style={{ margin: 0 }}>{t('terminal.queueLoading', '正在读取队列…')}</p>
      : error && items.length === 0 ? <div role="alert" style={{ color: 'var(--status-danger, #b91c1c)' }}>{error} <button type="button" onClick={() => setReload(v => v + 1)}>{t('terminal.queueRetry', '重试')}</button></div>
      : items.length === 0 ? <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{t('terminal.queueEmpty', '此分类暂无待办。')}</p>
      : <div style={{ overflow: 'auto', maxHeight: 230 }}>{error && <div role="alert" style={{ color: 'var(--status-danger, #b91c1c)', padding: 6 }}>{error} <button type="button" onClick={() => setReload(v => v + 1)}>{t('terminal.queueRetry', '重新加载')}</button></div>}<div style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '2px 10px 8px' }}>{['SOURCE','GRADING','PACKING'].map(k => `${kindLabel(k)} ${counts[k] ?? 0}`).join(' · ')}</div><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
        <thead><tr>{[t('terminal.queueCode', '类别 / 单号'), t('terminal.queueDate', '生产日期'), t('terminal.queueQuantity', '数量'), t('terminal.queueReason', '处理提示'), t('terminal.queueAction', '操作')].map(label => <th key={label} style={{ padding: '8px 10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{label}</th>)}</tr></thead>
        <tbody>{items.map((item, index) => {
          const href = itemHref(item);
          const routeUnavailable = !href && ['FORMAL_RAW','FORMAL_INSTALLMENTS','LEGACY_TEMP_INBOUND','FORMAL_ROUTE_READ_ONLY'].includes(item.action);
          return <tr key={`${item.kind}:${item.code}:${item.shiftId}:${index}`}>
          <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)' }}><strong>{item.code}</strong><div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{kindLabel(item.kind)}</div></td>
          <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)' }}>{item.productionDate || t('terminal.queueUnknown', '待核')}</td>
          <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{item.quantity === null ? t('terminal.queueUnknown', '待核') : `${Number(item.quantity).toLocaleString()} ${item.unit === 'eggs' ? t('ui.枚', '枚') : item.unit}`}</td>
          <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)' }}>{reasonLabel(item) || '—'}</td>
          <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)' }}>{href ? <Link href={href}>{actionLabel(item.action)}</Link>
            : routeUnavailable ? t('terminal.queueRouteUnavailable', '办理入口当前不可用') : actionLabel(item.action)}</td>
        </tr>;
        })}</tbody>
      </table>{nextCursor && <button type="button" onClick={loadMore} disabled={loadingMore} style={{ margin: 10, padding: '8px 14px' }}>{loadingMore ? t('terminal.queueLoadingMore', '加载中…') : t('terminal.queueLoadMore', '加载更多')}</button>}</div>}
  </section>;
}

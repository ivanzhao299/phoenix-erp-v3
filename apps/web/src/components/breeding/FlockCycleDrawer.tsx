'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { DrawerV2 } from '@/components/design-system';
import MasterNameCode from '@/components/MasterNameCode';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictOptions } from '@/hooks/useDictOptions';
import { usePermission } from '@/hooks/usePermission';
import request, { type ApiError } from '@/lib/api-client';
import { flockArchiveAge, flockArchiveDate, flockArchiveFormatNumber, flockArchiveNumber, flockArchiveTransferUrl } from './flock-archive';
import { isLifecycleKind, lifecycleApi, sectionForKind, type LifecycleDocument, type LifecyclePage } from './flock-lifecycle-workspace';
import styles from './FlockCycleDrawer.module.css';

type Cycle = {
  breed_code: string | null; strain: string | null; breed_type: string | null;
  status: string; placement_date: string | null; placement_age: number | null; age_as_of: string | null;
  house_code: string; house_name: string | null; farm_code: string; farm_name: string | null;
  current_qty: number | null; baseline_on: string | null; closed_on: string | null;
  active_balance: boolean; occupancy_id: string | null;
  admission_id: string | null; source_kind: string | null; source_code: string | null;
  receipt_reference: string | null; admitted_quantity: number | null; legacy_source: string | null;
  mortality: string | null; culled: string | null;
  report_days: number; recorded_eggs_for_admitted: string | null;
  production: { date: string; eggs: number | null; closing_qty: number | null; admitted_quantity: number | null; report_houses: string[] | null }[];
};

type Occupancy = { occupancy_id: string; house_code: string; began_on: string; ended_on: string | null };
type CareEvent = { activity_type: string; activity_id: string; house_code: string; business_date: string };

function useCycleResource<T>(path: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: number }>();
  const key = JSON.stringify([path, revision]);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    request<{ data: T }>(path, { cache: 'no-store', signal: controller.signal, silent: true }).then(
      ({ data }) => { if (!controller.signal.aborted) setState({ key, data }); },
      (error: ApiError) => { if (!controller.signal.aborted) setState({ key, error: error.status ?? 500 }); },
    );
    return () => controller.abort();
  }, [key, path]);
  const current = state?.key === key ? state : undefined;
  return { ...current, loading: Boolean(path && !current), retry: () => setRevision(previous => previous + 1) };
}

function Progress({ loading, error, retry }: { loading: boolean; error?: number; retry: () => void }) {
  const { t } = useLanguage();
  if (loading) return <p role="status">{t('common.loading', '加载中…')}</p>;
  if (!error) return null;
  if (error === 403 || error === 404) return <p role="alert">{t('flockArchive.unavailable', '此档案或记录不存在，或不在当前权限范围内。')}</p>;
  return <p role="alert">{t('flockArchive.loadError', '读取记录失败。')} <button type="button" onClick={retry}>{t('common.retry', '重试')}</button></p>;
}

function PageControls({ next, cursor, setCursor }: { next: string | null; cursor: string; setCursor: (value: string) => void }) {
  const { t } = useLanguage();
  return <div className={styles.paging}>
    {cursor && <button type="button" onClick={() => setCursor('')}>{t('flockArchive.latest', '回到最新记录')}</button>}
    {next && <button type="button" onClick={() => setCursor(next)}>{t('breeding.lifecycleWorkspace.nextPage', '下一页')}</button>}
  </div>;
}

function DocumentList({ flockNo, pending = false }: { flockNo: string; pending?: boolean }) {
  const { t, lang } = useLanguage();
  const { optionPairs } = useDictOptions('BRD_LIFECYCLE_KIND');
  const [cursor, setCursor] = useState('');
  const query = new URLSearchParams({ flockNo, statuses: pending ? 'DRAFT,SUBMITTED,APPROVED' : 'POSTED', limit: '10' });
  if (cursor) query.set('cursor', cursor);
  const result = useCycleResource<LifecyclePage<LifecycleDocument>>(`${lifecycleApi}/documents/search?${query}`);
  return <section className={styles.section}>
    <h3>{pending ? t('flockArchive.pending', '未完单据') : t('flockArchive.posted', '已过账单据')}</h3>
    <Progress {...result} />
    {result.data && <>
      {result.data.items.length === 0 ? <p>{t('flockArchive.noRecords', '当前范围没有记录。')}</p> : <ul className={styles.records}>
        {result.data.items.map(doc => <li key={doc.id}>
          <time dateTime={doc.business_date}>{flockArchiveDate(doc.business_date, lang)}</time>
          <span>{optionPairs.find(option => option.value === doc.kind)?.label ?? t(`breeding.lifecycleWorkspace.${doc.kind}`, doc.kind)} · {doc.house_code}</span>
          {pending && <span>{t(`breeding.lifecycleWorkspace.${doc.status}`, doc.status)}</span>}
          {isLifecycleKind(doc.kind) && <Link href={`/breeding/flock-lifecycle/${sectionForKind(doc.kind)}?doc=${encodeURIComponent(doc.id)}`}>{doc.id}</Link>}
        </li>)}
      </ul>}
      <PageControls next={result.data.nextCursor} cursor={cursor} setCursor={setCursor} />
    </>}
  </section>;
}

function OccupancyList({ flockNo }: { flockNo: string }) {
  const { t, lang } = useLanguage();
  const [cursor, setCursor] = useState('');
  const query = new URLSearchParams({ flockNo, limit: '10' });
  if (cursor) query.set('cursor', cursor);
  const result = useCycleResource<LifecyclePage<Occupancy>>(`${lifecycleApi}/occupancies/search?${query}`);
  return <section className={styles.section}>
    <h3>{t('flockArchive.occupancy', '占栏历史')}</h3>
    <Progress {...result} />
    {result.data && <>
      {result.data.items.length === 0 ? <p>{t('flockArchive.noRecords', '当前范围没有记录。')}</p> : <ul className={styles.records}>
        {result.data.items.map(item => <li key={item.occupancy_id}>
          <strong>{item.house_code}</strong>
          <time dateTime={item.began_on}>{flockArchiveDate(item.began_on, lang)}</time>
          <span aria-hidden="true">→</span>
          {item.ended_on ? <time dateTime={item.ended_on}>{flockArchiveDate(item.ended_on, lang)}</time> : <span>{t('flockArchive.inHouse', '在栏')}</span>}
        </li>)}
      </ul>}
      <PageControls next={result.data.nextCursor} cursor={cursor} setCursor={setCursor} />
    </>}
  </section>;
}

function CareList({ path }: { path: string }) {
  const { t, lang } = useLanguage();
  const result = useCycleResource<CareEvent[]>(path);
  return <section className={styles.section}>
    <h3>{t('flockArchive.care', '养护来源记录')}</h3>
    <Progress {...result} />
    {result.data && (result.data.length === 0 ? <p>{t('flockArchive.noRecords', '当前范围没有记录。')}</p> : <>
      <p>{t('flockArchive.careBasis', '最近 30 条已关联原占栏的免疫与用药记录。')}</p>
      <ul className={styles.records}>{result.data.map(event => <li key={`${event.activity_type}:${event.activity_id}`}>
        <time dateTime={event.business_date}>{flockArchiveDate(event.business_date, lang)}</time>
        <span>{t(`flockArchive.care.${event.activity_type}`, event.activity_type)} · {event.house_code} · #{event.activity_id}</span>
      </li>)}</ul>
    </>)}
  </section>;
}

function Production({ data }: { data: Cycle }) {
  const { t, lang } = useLanguage();
  const { canView: canViewReports } = usePermission('MENU_FARM_DAILY');
  const admitted = flockArchiveNumber(data.admitted_quantity);
  const recordedEggs = flockArchiveNumber(data.recorded_eggs_for_admitted);
  const perHoused = admitted && recordedEggs !== null ? flockArchiveFormatNumber(recordedEggs / admitted, lang) : t('flockArchive.insufficient', '资料不足');
  return <section className={styles.section}>
    <h3>{t('flockArchive.production', '生产趋势')}</h3>
    <p>{t('flockArchive.housedCumulative', '累计已报蛋数／原始入栏羽数')} <strong>{perHoused}</strong></p>
    <p>{t('flockArchive.productionBasis', '日报覆盖 {days} 个业务日。下表展示最近 30 个有日报的业务日。百分比以业务日日末在栏为分母，累计值按实际已报数量计算。').replace('{days}', flockArchiveFormatNumber(data.report_days, lang))}</p>
    {data.production.length === 0 ? <p>{t('flockArchive.noRecords', '当前范围没有记录。')}</p> :
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={t('flockArchive.production', '生产趋势')}>
      <table className={styles.table}>
        <thead><tr>
          <th scope="col">{t('flockArchive.businessDay', '业务日')}</th>
          <th scope="col">{t('flockArchive.reportedEggs', '已报蛋数')}</th>
          <th scope="col">{t('flockArchive.endOfDayStock', '日末在栏')}</th>
          <th scope="col">{t('flockArchive.layRate', '已报蛋数／日末在栏')}</th>
          <th scope="col">{t('flockArchive.perHoused', '已报蛋数／原始入栏羽数')}</th>
          {canViewReports && <th scope="col">{t('flockArchive.sourceReports', '舍日报')}</th>}
        </tr></thead>
        <tbody>{data.production.map(report => <tr key={report.date}>
          <th scope="row"><time dateTime={report.date}>{flockArchiveDate(report.date, lang)}</time></th>
          <td>{flockArchiveFormatNumber(report.eggs, lang)}</td>
          <td>{flockArchiveFormatNumber(report.closing_qty, lang)}</td>
          <td>{report.eggs !== null && report.closing_qty && report.closing_qty > 0 ? `${flockArchiveFormatNumber(report.eggs * 100 / report.closing_qty, lang)}%` : '—'}</td>
          <td>{report.eggs !== null && report.admitted_quantity && report.admitted_quantity > 0
            ? flockArchiveFormatNumber(report.eggs / report.admitted_quantity, lang, 4) : '—'}</td>
          {canViewReports && <td>{report.report_houses?.length ? <ul className={styles.records}>
            {report.report_houses.map(house => <li key={house}><Link href={`/breeding/daily?${new URLSearchParams({ historyHouse: house, historyDate: report.date })}`}>{house}</Link></li>)}
          </ul> : '—'}</td>}
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

export default function FlockCycleDrawer({ flockNo, canTransfer, onClose }: { flockNo: string; canTransfer: boolean; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const { canView: canViewCare } = usePermission('MENU_FARM_VET');
  const { optionPairs } = useDictOptions('BRD_BREED');
  const path = `${lifecycleApi}/flocks/${encodeURIComponent(flockNo)}/cycle`;
  const result = useCycleResource<Cycle>(path);
  const data = result.data;
  const age = data && flockArchiveAge(data.placement_date, data.placement_age, data.age_as_of);
  const stock = flockArchiveNumber(data?.current_qty);
  return <DrawerV2 open onClose={onClose} width={760} title={`${t('flockArchive.cycle', '鸡群周期')} · ${flockNo}`}>
    <Progress {...result} />
    {data && <>
      <dl className={styles.facts}>
        <Fact label={t('ui.品种', '品种')}>{optionPairs.find(option => option.value === data.breed_code)?.label ?? data.strain ?? data.breed_type ?? data.breed_code ?? '—'}</Fact>
        <Fact label={t('ui.进雏入栏日期', '进雏入栏日期')}>{flockArchiveDate(data.placement_date, lang)}</Fact>
        <Fact label={t('flockArchive.ageDays', '日龄')}>{age ? `${flockArchiveFormatNumber(age.days, lang)}${t('flockArchive.dayUnit', '天')}` : '—'}</Fact>
        <Fact label={data.status === 'RETIRED' ? t('flockArchive.lastHouse', '最后在栏鸡舍') : t('flockArchive.currentHouse', '当前鸡舍')}>
          <MasterNameCode name={data.house_name ?? undefined} code={data.house_code ?? undefined} />
        </Fact>
        <Fact label={t('ui.养殖场', '养殖场')}><MasterNameCode name={data.farm_name ?? undefined} code={data.farm_code ?? undefined} /></Fact>
        <Fact label={t('ui.存栏量', '存栏量')}>{stock === null ? '—' : `${flockArchiveFormatNumber(stock, lang)}${t('ui.羽', '羽')}`}</Fact>
        <Fact label={t('flockArchive.source', '入栏来源')}>
          {data.admission_id ? <>{t(`flockArchive.source.${data.source_kind}`, data.source_kind ?? '—')} · {data.source_code ?? '—'}<br />
            <Link href={`/breeding/flock-lifecycle/admissions?doc=${encodeURIComponent(data.admission_id)}`}>{data.receipt_reference ?? data.admission_id}</Link></> : data.legacy_source ?? '—'}
        </Fact>
        <Fact label={t('flockArchive.admitted', '原始入栏羽数')}>{flockArchiveFormatNumber(data.admitted_quantity, lang)}</Fact>
        <Fact label={t('flockArchive.baseline', '事件账开始日期')}>{flockArchiveDate(data.baseline_on, lang)}</Fact>
        <Fact label={t('flockArchive.closedOn', '关群业务日')}>{flockArchiveDate(data.closed_on, lang)}</Fact>
        <Fact label={t('flockArchive.recordedMortality', '范围内累计死亡（羽）')}>{flockArchiveFormatNumber(data.mortality, lang)}</Fact>
        <Fact label={t('flockArchive.recordedCulls', '范围内累计淘汰移出（羽）')}>{flockArchiveFormatNumber(data.culled, lang)}</Fact>
      </dl>
      {canTransfer && data.active_balance && data.occupancy_id && <Link className={styles.transfer} href={flockArchiveTransferUrl(flockNo, data.house_code, data.occupancy_id)}>{t('flockArchive.transfer', '办理整群转舍')}</Link>}
      <DocumentList flockNo={flockNo} pending />
      <OccupancyList flockNo={flockNo} />
      <DocumentList flockNo={flockNo} />
      <Production data={data} />
      {canViewCare && <CareList path={`${path}/care`} />}
    </>}
  </DrawerV2>;
}

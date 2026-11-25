'use client';

import { useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import request from '@/lib/api-client';
import { primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';
import styles from './ScopedFeedLedger.module.css';

type Farm = { farm_code: string; farm_name: string; company_code: string; status: string };
type Movement = { houseCode: string; batchNo: string; outboundNo: string; quantity: number };
type Item = {
  materialCode: string; name: string; unit: string;
  opening: string | null; issued: string | null; consumed: string | null; counted: string | null;
  note: string; movements: Movement[];
};
type Day = { date: string; farm_code: string; company_code: string; version: number; rows: Item[]; warehouseCoverage: 'ALL' | 'AUTHORIZED' | 'NONE' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
const keyOf = (farm: Farm) => farm.company_code + ':' + farm.farm_code;

async function feedRequest<T>(path: string, options?: Parameters<typeof request>[1]) {
  const response = await request<{ code: number; data: T }>('/farm/feed/' + path, options);
  if (response?.code !== 200 || response.data == null) throw new Error('饲料台账响应无效，请重新查询');
  return response.data;
}

export default function ScopedFeedLedger() {
  const { user, canEdit } = usePermission('MENU_BREEDING');
  return <FeedDayForm key={String(user.userId ?? user.id ?? user.username ?? '')} editable={canEdit} />;
}

function FeedDayForm({ editable }: { editable: boolean }) {
  const { t } = useLanguage();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selection, setSelection] = useState('');
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<Day>();
  const [loaded, setLoaded] = useState('');
  const [draft, setDraft] = useState<Record<string, Item>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');
  const [saveFailure, setSaveFailure] = useState('');
  const [receipt, setReceipt] = useState('');
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const writing = useRef(false);
  const farm = farms.find(item => keyOf(item) === selection);
  const farmCode = farm?.farm_code ?? '';
  const companyCode = farm?.company_code ?? '';
  const range = selection + ':' + date;

  useEffect(() => {
    const controller = new AbortController();
    void feedRequest<Farm[]>('scoped/farms', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(result)) throw new Error('授权农场候选无效');
      setFarms(result);
      if (result.length === 1) setSelection(existing => existing || keyOf(result[0]));
      setLoading(false);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setFailure(String(error.message));
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!farmCode || !companyCode || !date) return;
    const controller = new AbortController();
    const id = ++generation.current;
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setFailure('');
      setSaveFailure('');
      setReceipt('');
      setLoaded('');
      setDraft({});
      try {
        const query = new URLSearchParams({ farmCode, companyCode, date });
        const result = await feedRequest<Day>('scoped/day?' + query, { signal: controller.signal });
        if (id !== generation.current) return;
        if (result.date !== date || result.farm_code !== farmCode || result.company_code !== companyCode || !Array.isArray(result.rows)) {
          throw new Error('返回的台账范围与查询不符');
        }
        setDay(result);
        setLoaded(range);
      } catch (error) {
        if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : '读取失败');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => { generation.current++; controller.abort(); };
  }, [companyCode, farmCode, date, range, reload]);

  const ready = !loading && loaded === range && !!day;
  const writable = ready && editable && farm?.status === 'ACTIVE' && !saving;
  const rowKey = (row: Item) => JSON.stringify([row.materialCode, row.unit]);
  const update = (row: Item, patch: Partial<Item>) => {
    setDraft(old => ({ ...old, [rowKey(row)]: { ...row, ...old[rowKey(row)], ...patch } }));
    setReceipt('');
  };
  const quantity = (value: string | null) => value == null || value === '' ? null : Number(value);

  async function save() {
    if (!writable || !day || writing.current || !Object.keys(draft).length) return;
    writing.current = true;
    setSaving(true);
    setSaveFailure('');
    try {
      const items = Object.values(draft).map(row => ({
        materialCode: row.materialCode, unit: row.unit,
        consumed: quantity(row.consumed), counted: quantity(row.counted), note: row.note,
      }));
      const restored = await feedRequest<Day>('scoped/day', {
        method: 'POST', bindSession: true, body: JSON.stringify({ farmCode, companyCode, date, version: day.version, items }),
      });
      if (restored.date !== date || restored.farm_code !== farmCode || restored.company_code !== companyCode || !Array.isArray(restored.rows)) {
        throw new Error('保存回执待核');
      }
      setDay(restored);
      setDraft({});
      setReceipt(t('ui.饲料台账已保存', '台账已保存') + ' · ' + date + ' · v' + restored.version);
    } catch (error) {
      setSaveFailure(error instanceof Error ? error.message : '保存失败');
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  return <div>
    <PageHeader title={t('ui.饲料台账','饲料台账')}
      subtitle={t('ui.饲料台账定义','发放按 WMS 已过账单据的业务日显示。现场实际耗用与盘余独立登记。')}
      breadcrumb={[t('ui.养殖生产','养殖生产'), t('ui.饲料台账','饲料台账')]} />
    <div className={styles.filters}>
      <label>{t('ui.所属农场','所属农场')}
        <select value={selection} disabled={saving} onChange={event => { setLoaded(''); setSelection(event.target.value); }}>
          <option value="">{t('common.select','请选择')}</option>
          {farms.map(row => <option key={keyOf(row)} value={keyOf(row)}>{row.farm_name || row.farm_code} · {row.company_code}</option>)}
        </select>
      </label>
      <label>{t('common.date','日期')}
        <input type="date" value={date} disabled={saving} onChange={event => { setLoaded(''); setDate(event.target.value); }} />
      </label>
      <button type="button" style={secondaryActionButton} disabled={saving || !farm} onClick={() => setReload(value => value + 1)}>{t('common.refresh','刷新')}</button>
      {editable && <button type="button" style={primaryActionButton} disabled={!writable || !Object.keys(draft).length} onClick={save}>{t('common.save','保存')}</button>}
    </div>
    {failure && <p role="alert">{t('ui.feed加载失败','读取失败：')}{failure}</p>}
    {saveFailure && <p role="alert">{t('ui.feed保存失败','保存失败：')}{saveFailure}</p>}
    {receipt && <p role="status">{receipt}</p>}
    {loading && <p role="status">{t('common.loading','加载中…')}</p>}
    {!loading && !farm && !failure && <p>{t('ui.请选择农场','请选择农场')}</p>}
    {ready && day && <>
      {day.warehouseCoverage !== 'ALL' && <p role="status">
        {day.warehouseCoverage === 'NONE' ? t('ui.无仓范围','当前账号无可用仓储范围，发放量待核。')
          : t('ui.发放仓范围','发放量仅合计已授权仓库。')}
      </p>}
      <div className={styles.tableViewport}>
        <table className={styles.feedTable}>
          <thead><tr>{['物料', '昨日盘余', '仓储发放', '实际耗用', '现场盘余', '备注'].map(label => <th key={label}>{t('ui.' + label,label)}</th>)}</tr></thead>
          <tbody>{day.rows.map(row => {
            const entry = draft[rowKey(row)] ?? row;
            return <tr key={rowKey(row)}>
              <th scope="row">{row.name}<small>{row.materialCode} · {row.unit}</small></th>
              <td>{row.opening ?? '—'}</td>
              <td>{row.issued ?? '—'}{row.movements.length > 0 && <details>
                <summary>{t('ui.查看发放分段','发放分段')}</summary>
                <ul>{row.movements.map((move, index) => <li key={index}>{move.houseCode} · {move.outboundNo} · {move.batchNo} · {move.quantity} {row.unit}</li>)}</ul>
              </details>}</td>
              <td>{writable ? <input type="number" min="0" step=".001" aria-label={row.name + ' · ' + t('ui.实际耗用','实际耗用')}
                value={entry.consumed ?? ''} onChange={event => update(entry, { consumed: event.target.value })} /> : entry.consumed ?? '—'}</td>
              <td>{writable ? <input type="number" min="0" step=".001" aria-label={row.name + ' · ' + t('ui.现场盘余','现场盘余')}
                value={entry.counted ?? ''} onChange={event => update(entry, { counted: event.target.value })} /> : entry.counted ?? '—'}</td>
              <td>{writable ? <input maxLength={200} aria-label={row.name + ' · ' + t('common.remark','备注')} value={entry.note}
                onChange={event => update(entry, { note: event.target.value })} /> : entry.note}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </>}
  </div>;
}

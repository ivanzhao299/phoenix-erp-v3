'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { formatBusinessEnum, formatMasterData } from '@/lib/business-display';
import { invalidateBatchLookups } from '@/lib/request-cache';
import { inputField, primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';

type LoadingLine = {
  allocation_id: string; order_line_id: string; order_no?: string; sku_code?: string;
  batch_no: string; qty: string; unit?: string; ledger_id?: string;
};
type LoadingTask = { id: string; delivery_no: string; fulfillment_warehouse_code: string; status: string };
const endpoint = '/v2/sales/delivery/warehouse-loading';

export default function WarehouseLoadingTerminal() {
  const { t, lang } = useLanguage();
  const { canEdit } = useAuth();
  const [tasks, setTasks] = useState<LoadingTask[]>([]);
  const [selected, setSelected] = useState<(LoadingTask & { items: LoadingLine[] }) | null>(null);
  const [input, setInput] = useState<Record<string, { batch_no: string; qty: string }>>({});
  const [scan, setScan] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<LoadingLine[] | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request<LoadingTask[]>(endpoint, { signal: controller.signal })
      .then(rows => { if (!controller.signal.aborted) setTasks(rows); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [refresh]);

  const open = async (no: string) => {
    if (!no.trim() || pending) return;
    setPending(true);
    setError('');
    try {
      const task = await request<LoadingTask & { items: LoadingLine[] }>(
        endpoint + '?' + new URLSearchParams({ delivery_no: no.trim() }),
      );
      setSelected(task);
      setInput({});
      setReceipt(task.status === 'LOADING' ? null : task.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ui.加载失败', '加载失败'));
    } finally {
      setPending(false);
    }
  };

  const update = (id: string, field: 'batch_no' | 'qty', value: string) => {
    setInput(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const finish = async () => {
    if (!selected || selected.status !== 'LOADING' || pending || receipt) return;
    const items = selected.items.map(line => ({
      allocation_id: line.allocation_id, order_line_id: line.order_line_id,
      batch_no: input[line.allocation_id]?.batch_no?.trim() ?? '', qty: input[line.allocation_id]?.qty ?? '',
    }));
    if (!items.length || items.some((item, index) =>
      item.batch_no !== selected.items[index].batch_no || !/^\d+(?:\.\d{1,3})?$/.test(item.qty)
      || Number(item.qty) !== Number(selected.items[index].qty))) {
      setError(t('ui.请逐行核对批次及实装数量', '请逐行核对批次及实装数量'));
      return;
    }
    setPending(true);
    setError('');
    try {
      const result = await request<{ delivery_no: string; items: LoadingLine[] }>(endpoint + '/' + selected.id, {
        method: 'POST', body: JSON.stringify({ items }),
      });
      setReceipt(result.items);
      invalidateBatchLookups();
      setRefresh(n => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ui.装车确认失败', '装车确认失败'));
    } finally {
      setPending(false);
    }
  };

  return <main style={{ padding: 16, width: '100%', overflowY: 'auto' }}>
    <PageHeader title={t('ui.配送装车', '配送装车')} />
    <form style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBlock: 16 }}
      onSubmit={e => { e.preventDefault(); void open(scan); }}>
      <input style={inputField} aria-label={t('ui.配送单号', '配送单号')}
        placeholder={t('ui.扫描配送单号', '扫描配送单号')} value={scan}
        onChange={e => setScan(e.target.value)} disabled={pending} />
      <button type="submit" style={secondaryActionButton} disabled={pending || !scan.trim()}>{t('ui.打开', '打开')}</button>
      <button type="button" style={secondaryActionButton} disabled={pending}
        onClick={() => setRefresh(n => n + 1)}>{t('ui.刷新', '刷新')}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
      {tasks.map(task => <button type="button" key={task.id} disabled={pending}
        style={secondaryActionButton} onClick={() => void open(task.delivery_no)}>
        {task.delivery_no} · {task.fulfillment_warehouse_code}
      </button>)}
    </div>
    {selected && <section>
      <h2>{selected.delivery_no} · {formatMasterData(selected, 'warehouse_name', selected.fulfillment_warehouse_code, lang)}</h2>
      <p>{formatBusinessEnum('delivery', selected.status, lang)}</p>
      {receipt ? <div>
        <p>{receipt.length ? t('ui.装车过账已确认', '装车过账已确认') : t('ui.该单暂无装车回执', '该单暂无装车回执')}</p>
        <ul>{receipt.map(row => <li key={row.allocation_id}>{row.order_line_id} · {row.batch_no} · {row.qty} {row.unit} · {row.ledger_id}</li>)}</ul>
      </div> : <>
        <div style={{ display: 'grid', gap: 12 }}>
          {selected.items.map(line => <div key={line.allocation_id}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <p>{line.order_no} · {line.sku_code} · {line.batch_no} · {line.qty} {line.unit}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <label>{t('ui.扫码核对批次', '扫码核对批次')}
                <input style={inputField} value={input[line.allocation_id]?.batch_no ?? ''} disabled={pending}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  onChange={e => update(line.allocation_id, 'batch_no', e.target.value)} />
              </label>
              <label>{t('ui.实装数量', '实装数量')}
                <input style={inputField} inputMode={line.unit === '枚' ? 'numeric' : 'decimal'}
                  value={input[line.allocation_id]?.qty ?? ''} disabled={pending}
                  onChange={e => update(line.allocation_id, 'qty', e.target.value)} />
              </label>
            </div>
          </div>)}
        </div>
        {canEdit('MENU_WMS_INOUT') && <button type="button" style={{ ...primaryActionButton, marginTop: 16 }}
          disabled={pending || !selected.items.length} onClick={finish}>{t('ui.确认完成装车', '确认完成装车')}</button>}
      </>}
    </section>}
  </main>;
}

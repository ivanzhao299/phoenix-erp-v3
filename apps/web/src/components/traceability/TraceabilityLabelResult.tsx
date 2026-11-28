import { Package, Tag, Warehouse } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

type TraceabilityLabelResultData = {
  key?: string;
  label?: { label_no?: string; batch_no?: string; qty?: number; status?: string; printed_at?: string };
  identity?: { normalizedCode?: string; kind?: string; boxId?: string; boxOrdinal?: number };
  packaging?: { packingCode?: string; outputOrdinal?: number; receiptState?: string; precision?: string };
  outputGroup?: { skuCode?: string; specCode?: string; productCode?: string; qty?: number; batchNo?: string; ledgerId?: string } | null;
  inventory?: {
    mappingPrecision?: string;
    batch?: { batch_no?: string; qty?: number; qty_available?: number; warehouse_code?: string; location_code?: string };
    ledger?: { id?: string; change_type?: string; qty_change?: number; ref_no?: string };
    batches?: Array<{ batch_no?: string; qty?: number }>;
    receiptState?: string;
  };
  downstream?: {
    precision?: string;
    reason?: string;
    trace?: {
      sales?: {
        salesOrders?: Array<Record<string, unknown>>;
        storeSales?: Array<Record<string, unknown>>;
      };
    };
  };
};

function Field({ label, value }: { label: string; value: unknown }) {
  return <div style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
    <span style={{ color: 'var(--text-disabled)', minWidth: 104 }}>{label}</span>
    <span style={{ color: 'var(--text-primary)', fontFamily: typeof value === 'string' && /^[A-Z]/.test(value) ? 'monospace' : undefined }}>
      {value == null || value === '' ? '—' : String(value)}
    </span>
  </div>;
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section style={{ marginBottom: 14, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)' }}>
    <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, padding: '10px 14px', background: 'var(--bg-muted)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
      {icon}{title}
    </h2>
    <div style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text-secondary)', overflowX: 'auto' }}>{children}</div>
  </section>;
}

export default function TraceabilityLabelResult({ data }: { data: TraceabilityLabelResultData }) {
  const { t } = useLanguage();
  const legacy = data.packaging?.precision === 'LEGACY_BATCH_ONLY' || !data.identity;
  if (legacy) {
    return <Card title={t('ui.标签', '标签')} icon={<Tag size={14} />}>
      <Field label={t('ui.标签号', '标签号')} value={data.label?.label_no ?? data.key} />
      <Field label={t('ui.库存批次', '库存批次')} value={data.label?.batch_no} />
      <Field label={t('ui.数量', '数量')} value={data.label?.qty} />
      <Field label={t('ui.状态', '状态')} value={data.label?.status} />
      <Field label={t('ui.打印时间', '打印时间')} value={data.label?.printed_at} />
      <Field label={t('ui.追溯精度', '追溯精度')} value={t('ui.旧标签批次级', '旧标签批次级')} />
    </Card>;
  }

  const batch = data.inventory?.batch;
  const ledger = data.inventory?.ledger;
  return <>
    <Card title={t('ui.包装箱码', '包装箱码')} icon={<Tag size={14} />}>
      <Field label={t('ui.箱码', '箱码')} value={data.identity?.normalizedCode ?? data.key} />
      <Field label={t('ui.箱码类型', '箱码类型')} value={data.identity?.kind} />
      <Field label={t('ui.箱序号', '箱序号')} value={data.identity?.boxOrdinal} />
      <Field label={t('ui.包装原单', '包装原单')} value={data.packaging?.packingCode} />
      <Field label={t('ui.产出序号', '产出序号')} value={data.packaging?.outputOrdinal} />
      <Field label={t('ui.回执状态', '回执状态')} value={data.packaging?.receiptState} />
    </Card>
    {data.outputGroup && <Card title={t('ui.回执产出组', '回执产出组')} icon={<Package size={14} />}>
      <Field label="SKU" value={data.outputGroup.skuCode} />
      <Field label={t('ui.品目', '品目')} value={data.outputGroup.productCode} />
      <Field label={t('ui.规格', '规格')} value={data.outputGroup.specCode} />
      <Field label={t('ui.组内数量', '组内数量')} value={data.outputGroup.qty} />
      <Field label={t('ui.入库批次', '入库批次')} value={data.outputGroup.batchNo} />
      <Field label={t('ui.入库流水', '入库流水')} value={data.outputGroup.ledgerId} />
    </Card>}
    {batch && <Card title={t('ui.库存入账', '库存入账')} icon={<Warehouse size={14} />}>
      <Field label={t('ui.库存批次', '库存批次')} value={batch.batch_no} />
      <Field label={t('ui.实存数量', '实存数量')} value={batch.qty} />
      <Field label={t('ui.可用数量', '可用数量')} value={batch.qty_available} />
      <Field label={t('ui.仓库', '仓库')} value={batch.warehouse_code} />
      <Field label={t('ui.库位', '库位')} value={batch.location_code} />
      <Field label={t('ui.流水类型', '流水类型')} value={ledger?.change_type} />
      <Field label={t('ui.流水数量', '流水数量')} value={ledger?.qty_change} />
      <Field label={t('ui.库存来源单', '库存来源单')} value={ledger?.ref_no} />
    </Card>}
    {!batch && <Card title={t('ui.追溯证据', '追溯证据')} icon={<Warehouse size={14} />}>
      <Field label={t('ui.追溯精度', '追溯精度')} value={t('ui.仅到包装原单', '仅到包装原单')} />
      <Field label={t('ui.回执状态', '回执状态')} value={data.inventory?.receiptState ?? data.packaging?.receiptState} />
    </Card>}
    <Card title={t('ui.下游关联', '下游关联')} icon={<Package size={14} />}>
      <Field label={t('ui.关联精度', '关联精度')} value={data.downstream?.precision === 'BATCH_ALLOCATION'
        ? t('ui.按批次出库分配追溯', '按批次出库分配追溯')
        : t('ui.不能归属到单箱', '不能归属到单箱')} />
      {data.downstream?.reason && <Field label={t('ui.说明', '说明')} value={data.downstream.reason} />}
      {data.downstream?.precision === 'BATCH_ALLOCATION' && <>
        <p style={{ margin: '8px 0 4px', color: 'var(--text-disabled)' }}>
          {t('ui.下游归属说明', '下游记录按批次分配展示，不能归属到单箱或客户。')}
        </p>
        <div style={{ marginTop: 6 }}>
          <strong>{t('ui.下游配送出库', '销售配送出库')}</strong>
          <table style={{ width: '100%', fontSize: 12, textAlign: 'left' }}>
            <thead><tr>
              <th>{t('ui.订单', '订单')}</th><th>{t('ui.出库单', '出库单')}</th>
              <th>{t('ui.仓库', '仓库')}</th><th>{t('ui.批次分配数量', '批次分配数量')}</th>
            </tr></thead>
            <tbody>{(data.downstream.trace?.sales?.salesOrders ?? []).map((row, index) => <tr key={String(row.event_id ?? index)}>
              <td>{String(row.order_no ?? '—')}</td><td>{String(row.delivery_no ?? '—')}</td>
              <td>{String(row.warehouse_code ?? '—')}</td><td>{String(row.allocated_qty ?? '—')} {String(row.unit ?? '')}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div style={{ marginTop: 8 }}>
          <strong>{t('ui.下游POS出库', 'POS 销售分配')}</strong>
          <table style={{ width: '100%', fontSize: 12, textAlign: 'left' }}>
            <thead><tr>
              <th>{t('ui.POS单', 'POS单')}</th><th>{t('ui.门店', '门店')}</th><th>{t('ui.仓库', '仓库')}</th>
              <th>{t('ui.批次分配数量', '批次分配数量')}</th><th>{t('ui.退回数量', '退回数量')}</th>
              <th>{t('ui.净销售数量', '净销售数量')}</th>
            </tr></thead>
            <tbody>{(data.downstream.trace?.sales?.storeSales ?? []).map((row, index) => <tr key={String(row.id ?? index)}>
              <td>{String(row.sale_no ?? '—')}</td><td>{String(row.store_code ?? '—')}</td><td>{String(row.warehouse_code ?? '—')}</td>
              <td>{String(row.qty ?? '—')} {String(row.unit ?? '')}</td><td>{String(row.returned_qty ?? '—')}</td>
              <td>{String(row.outstanding_qty ?? '—')}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </Card>
  </>;
}

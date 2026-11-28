/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

import TraceabilityLabelResult from '@/components/traceability/TraceabilityLabelResult';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it('shows box identity, output group and exact batch and ledger mapping', async () => {
  await act(async () => root.render(<TraceabilityLabelResult data={{
    key: 'PBX-BOX-A',
    identity: { normalizedCode: 'PBX-BOX-A', kind: 'CANONICAL', boxOrdinal: 2 },
    packaging: { packingCode: 'TEST-PACKING', outputOrdinal: 0, receiptState: 'RECORDED' },
    outputGroup: { skuCode: 'SKU-A', productCode: 'EGG-A', specCode: 'SPEC-A', qty: 60, batchNo: 'BATCH-A', ledgerId: '71' },
    inventory: {
      mappingPrecision: 'OUTPUT_GROUP',
      batch: { batch_no: 'BATCH-A', qty: 60, qty_available: 60, warehouse_code: 'WH-A', location_code: 'LOC-A' },
      ledger: { id: '71', change_type: 'PACKAGING_INBOUND', qty_change: 60, ref_no: 'TEST-PACKING' },
    },
    downstream: { precision: 'BATCH_ALLOCATION', trace: { sales: {
      salesOrders: [{ event_id: 'OUT-1', order_no: 'SO-1', delivery_no: 'DEL-1', warehouse_code: 'WH-A', allocated_qty: '12', unit: '箱' }],
      storeSales: [{ id: 'POS-1', sale_no: 'POS-1', store_code: 'STORE-A', warehouse_code: 'WH-A', qty: '4', returned_qty: '1', outstanding_qty: '3', unit: '箱' }],
    } } },
  }} />));
  expect(host.textContent).toContain('PBX-BOX-A');
  expect(host.textContent).toContain('TEST-PACKING');
  expect(host.textContent).toContain('产出序号');
  expect(host.textContent).toContain('BATCH-A');
  expect(host.textContent).toContain('PACKAGING_INBOUND');
  expect(host.textContent).toContain('按批次出库分配追溯');
  expect(host.textContent).toContain('SO-1');
  expect(host.textContent).toContain('DEL-1');
  expect(host.textContent).toContain('12 箱');
  expect(host.textContent).toContain('POS-1');
  expect(host.textContent).toContain('4 箱');
  expect(host.textContent).toContain('1');
  expect(host.textContent).toContain('3');
  expect(host.textContent).toContain('下游记录按批次分配展示，不能归属到单箱或客户。');
});

it('shows original packing precision when receipt evidence is incomplete', async () => {
  await act(async () => root.render(<TraceabilityLabelResult data={{
    key: 'PBX-BOX-B',
    identity: { normalizedCode: 'PBX-BOX-B', kind: 'ALIAS', boxOrdinal: 1 },
    packaging: { packingCode: 'TEST-PACKING', outputOrdinal: 1, receiptState: 'MAPPING_UNAVAILABLE' },
    inventory: { mappingPrecision: 'PACKING_RECORD_ONLY', receiptState: 'MAPPING_UNAVAILABLE', batches: [] },
    downstream: { precision: 'NOT_ATTRIBUTABLE_TO_BOX', reason: '原始回执缺少批次映射' },
  }} />));
  expect(host.textContent).toContain('仅到包装原单');
  expect(host.textContent).toContain('MAPPING_UNAVAILABLE');
  expect(host.textContent).toContain('不能归属到单箱');
  expect(host.textContent).toContain('原始回执缺少批次映射');
});

it('preserves the legacy label and batch-only fallback fields', async () => {
  await act(async () => root.render(<TraceabilityLabelResult data={{
    key: 'OLD-LABEL',
    label: { label_no: 'OLD-LABEL', batch_no: 'OLD-BATCH', qty: 30, status: 'PRINTED', printed_at: '2026-01-01' },
    packaging: { precision: 'LEGACY_BATCH_ONLY' },
  }} />));
  expect(host.textContent).toContain('OLD-LABEL');
  expect(host.textContent).toContain('OLD-BATCH');
  expect(host.textContent).toContain('旧标签批次级');
});

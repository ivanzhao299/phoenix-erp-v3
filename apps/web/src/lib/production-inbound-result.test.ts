import { describe, expect, it } from 'vitest';
import { readProductionInboundResult, validateProductionInboundPayload } from './production-inbound-result';
const items = [{ grade: 'GRADE_1', qty: 11 }, { grade: 'BROKEN', qty: 22 }];
const success = { mode: 'TEMP_PRODUCTION_INBOUND', batches: items.map((item, i) => ({ ...item, batchNo: `B${i}` })), totalInbound: 33 };
const response = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status });
describe('production inbound acknowledgement', () => {
  it('accepts the real raw HTTP payload, including an idempotent replay', async () => {
    for (const body of [success, { ...success, idempotent: true }]) expect(await readProductionInboundResult(response(body), items)).toEqual({ status: 'success' });
  });
  it('reports explicit business rejection separately', async () => {
    for (const status of [400, 401, 403, 409, 422]) expect(await readProductionInboundResult(response({ message: 'SKU unavailable' }, status), items)).toEqual({ status: 'rejected', message: 'SKU unavailable' });
  });
  it.each([null, {}, { ...success, totalInbound: '33' }, { ...success, batches: [] },
    { ...success, batches: [{ ...success.batches[0] }, { ...success.batches[1], batchNo: 'B0' }] },
    { ...success, batches: [{ ...success.batches[0], grade: 'BROKEN' }, success.batches[1]] },
  ])('does not call an invalid acknowledgement a failed write: %j', async body => {
    expect(await readProductionInboundResult(response(body), items)).toEqual({ status: 'unknown' });
  });
  it.each([
    { ...success, code: 400, message: 'rejected despite HTTP 201' },
    { ...success, code: '200' },
    { ...success, success: false },
    { ...success, mode: 'PACKAGING_INBOUND' },
    { ...success, totalInbound: 34 },
    { ...success, batches: success.batches.map(batch => ({ ...batch, qty: batch.qty + 1 })) },
    { ...success, batches: [{ ...success.batches[0], batchNo: '   ' }, success.batches[1]] },
  ])('rejects misleading success shapes in pure and HTTP readers: %j', async body => {
    expect(validateProductionInboundPayload(body, items)).toEqual({ status: 'unknown' });
    expect(await readProductionInboundResult(response(body), items)).toEqual({ status: 'unknown' });
  });
  it('binds successful and replay acknowledgements to the selected scope and business date', async () => {
    const context = { companyCode: 'COMPANY-A', siteCode: 'SITE-A', warehouseCode: 'WH-A', locationCode: 'LOC-A', eggDate: '2026-10-16' };
    for (const idempotent of [false, true]) {
      const body = { ...success, ...context, idempotent };
      expect(validateProductionInboundPayload(body, items, context)).toEqual({ status: 'success' });
      expect(await readProductionInboundResult(response(body), items, context)).toEqual({ status: 'success' });
      for (const key of Object.keys(context)) {
        expect(validateProductionInboundPayload({ ...body, [key]: 'OTHER' }, items, context)).toEqual({ status: 'unknown' });
        const missing: Record<string, unknown> = { ...body };
        delete missing[key];
        expect(validateProductionInboundPayload(missing, items, context)).toEqual({ status: 'unknown' });
      }
    }
  });
  it('does not use an acknowledgement company as evidence of the selected company', () => {
    const body = { ...success, companyCode: 'COMPANY-B' };
    expect(validateProductionInboundPayload(body, items, { companyCode: 'COMPANY-A' })).toEqual({ status: 'unknown' });
  });
  it.each([
    { submitted: [] },
    { submitted: [{ grade: 'GRADE_1', qty: 1.5 }] },
    { submitted: [{ grade: 'GRADE_1', qty: -1 }] },
    { submitted: [{ grade: 'GRADE_1', qty: 0 }] },
  ])('cannot acknowledge invalid submitted items: %j', ({ submitted }) => {
    const body = { mode: 'TEMP_PRODUCTION_INBOUND', batches: submitted.map((item, i) => ({ ...item, batchNo: `B${i}` })), totalInbound: submitted.reduce((total, item) => total + item.qty, 0) };
    expect(validateProductionInboundPayload(body, submitted)).toEqual({ status: 'unknown' });
  });
  it('accepts reordered batches only when grade and quantity pairs still match', () => {
    expect(validateProductionInboundPayload({ ...success, batches: [...success.batches].reverse() }, items)).toEqual({ status: 'success' });
  });
  it('treats malformed JSON, lost response body, HTTP timeout and server errors as unknown', async () => {
    for (const res of [new Response('<html>proxy</html>', { status: 200 }), response({ message: 'timeout' }, 408), response({ message: 'failure' }, 500), response({ message: 'bad gateway' }, 502), Object.assign(new Response(), { json: async () => { throw new TypeError('network lost'); } })]) {
      expect(await readProductionInboundResult(res, items)).toEqual({ status: 'unknown' });
    }
  });
});

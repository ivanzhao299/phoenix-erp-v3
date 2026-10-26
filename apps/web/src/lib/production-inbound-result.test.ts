import { describe, expect, it } from 'vitest';
import { readProductionInboundResult } from './production-inbound-result';
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
  it('treats malformed JSON, lost response body, HTTP timeout and server errors as unknown', async () => {
    for (const res of [new Response('<html>proxy</html>', { status: 200 }), response({ message: 'timeout' }, 408), response({ message: 'failure' }, 500), response({ message: 'bad gateway' }, 502), Object.assign(new Response(), { json: async () => { throw new TypeError('network lost'); } })]) {
      expect(await readProductionInboundResult(res, items)).toEqual({ status: 'unknown' });
    }
  });
});

export type InboundItem = { grade: string; qty: number };
export type InboundResult = { status: 'success' } | { status: 'rejected'; message: string } | { status: 'unknown' };

/** A lost or malformed acknowledgement cannot establish that a stock write failed. */
export async function readProductionInboundResult(response: Response, items: InboundItem[]): Promise<InboundResult> {
  let payload: unknown;
  try { payload = await response.json(); } catch { return { status: 'unknown' }; }
  if (!payload || typeof payload !== 'object') return { status: 'unknown' };
  const body = payload as Record<string, unknown>;
  if (!response.ok) {
    // Timeouts and server/proxy failures may occur after the transaction committed.
    if ([400, 401, 403, 404, 409, 422].includes(response.status) && typeof body.message === 'string' && body.message) {
      return { status: 'rejected', message: body.message };
    }
    return { status: 'unknown' };
  }
  if (body.mode !== 'TEMP_PRODUCTION_INBOUND' || !Array.isArray(body.batches)
    || body.batches.length !== items.length || !items.length
    || typeof body.totalInbound !== 'number' || !Number.isFinite(body.totalInbound)
    || body.totalInbound !== items.reduce((sum, item) => sum + item.qty, 0)) return { status: 'unknown' };
  const remaining = items.map(item => JSON.stringify([item.grade, item.qty]));
  const batchNos = new Set<string>();
  for (const batch of body.batches) {
    if (!batch || typeof batch !== 'object' || typeof batch.batchNo !== 'string' || !batch.batchNo
      || batchNos.has(batch.batchNo) || typeof batch.qty !== 'number' || !Number.isFinite(batch.qty)) return { status: 'unknown' };
    const index = remaining.indexOf(JSON.stringify([batch.grade, batch.qty]));
    if (index < 0) return { status: 'unknown' };
    remaining.splice(index, 1);
    batchNos.add(batch.batchNo);
  }
  return { status: 'success' };
}

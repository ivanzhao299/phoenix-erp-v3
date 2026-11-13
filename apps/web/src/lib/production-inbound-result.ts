export type InboundItem = { grade: string; qty: number };
export type InboundStockStatus = 'AVAILABLE' | 'RESERVED' | 'QUARANTINE' | 'DAMAGED' | 'FROZEN';
export type InboundResult = { status: 'success' } | { status: 'rejected'; message: string } | { status: 'unknown' };
export type InboundContext = {
  companyCode?: string;
  siteCode?: string;
  warehouseCode?: string;
  locationCode?: string;
  eggDate?: string;
};
export type InboundReceipt = {
  mode: string;
  batches: Array<InboundItem & { batchNo: string; status?: InboundStockStatus }>;
  totalInbound: number;
} & InboundContext;

/** Validate the acknowledgement against what was submitted, not its own echoed scope. */
export function validateProductionInboundPayload(payload: unknown, items: InboundItem[], expectedContext: InboundContext = {}): InboundResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { status: 'unknown' };
  const body = payload as Record<string, unknown>;
  if ((body.code !== undefined && body.code !== 200 && body.code !== 201)
    || body.success === false || body.mode !== 'TEMP_PRODUCTION_INBOUND' || !Array.isArray(body.batches)
    || body.batches.length !== items.length || !items.length
    || items.some(item => !item.grade || !Number.isSafeInteger(item.qty) || item.qty <= 0)
    || typeof body.totalInbound !== 'number' || !Number.isSafeInteger(body.totalInbound)
    || body.totalInbound !== items.reduce((sum, item) => sum + item.qty, 0)) return { status: 'unknown' };
  for (const [key, expected] of Object.entries(expectedContext)) {
    if (expected && body[key] !== expected) return { status: 'unknown' };
  }
  const remaining = items.map(item => JSON.stringify([item.grade, item.qty]));
  const batchNos = new Set<string>();
  for (const batch of body.batches) {
    if (!batch || typeof batch !== 'object' || typeof batch.batchNo !== 'string' || !batch.batchNo.trim()
      || batchNos.has(batch.batchNo) || !Number.isSafeInteger(batch.qty) || batch.qty <= 0) return { status: 'unknown' };
    const index = remaining.indexOf(JSON.stringify([batch.grade, batch.qty]));
    if (index < 0) return { status: 'unknown' };
    remaining.splice(index, 1);
    batchNos.add(batch.batchNo);
  }
  return { status: 'success' };
}

/** A lost or malformed acknowledgement cannot establish that a stock write failed. */
export async function readProductionInboundResult(response: Response, items: InboundItem[], expectedContext: InboundContext = {}): Promise<InboundResult> {
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
  return validateProductionInboundPayload(payload, items, expectedContext);
}

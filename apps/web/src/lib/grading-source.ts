export type GradingSourceBatch = {
  id: number;
  house_code: string;
  house_name: string;
  received_qty: number;
  dirty_qty: number;
  cracked_qty: number;
  available: number;
};

type SourceBatchPayload = Record<string, unknown>;

const quantity = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

/**
 * The source-batches API uses total_qty for gross collection and received_qty
 * for the net quantity accepted for grading. Keep the legacy fallbacks for
 * older payloads, but never subtract defects from received_qty a second time.
 */
export function normalizeGradingSourceBatch(batch: SourceBatchPayload, index: number): GradingSourceBatch {
  const dirty = quantity(batch.dirty_qty ?? batch.dirty_count ?? batch.dirtyQty);
  const cracked = quantity(batch.cracked_qty ?? batch.cracked_count ?? batch.crackedQty);
  const hasNetReceived = batch.received_qty != null || batch.receivedQty != null;
  const netReceived = quantity(batch.received_qty ?? batch.receivedQty);
  const grossReceived = quantity(
    batch.total_qty ?? batch.totalQty ?? batch.expected_qty ?? batch.expectedQty
      ?? (hasNetReceived ? netReceived + dirty + cracked : 0),
  );

  return {
    id: quantity(batch.id ?? batch.batch_id) || index + 1,
    house_code: String(batch.house_code ?? batch.houseCode ?? ''),
    house_name: String(batch.house_name ?? batch.houseName ?? batch.house_code ?? `#${index + 1}`),
    received_qty: grossReceived,
    dirty_qty: dirty,
    cracked_qty: cracked,
    available: hasNetReceived ? netReceived : Math.max(0, grossReceived - dirty - cracked),
  };
}

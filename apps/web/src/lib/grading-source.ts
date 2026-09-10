export type GradingSourceBatch = {
  id: number;
  batch_code: string;
  shift_id: number;
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
 * Source batches persist received_qty as the gross collection count. Defects
 * remain part of that count, so the grading ceiling is total - dirty - cracked.
 * Prefer the server-computed gradable quantity when available.
 */
export function normalizeGradingSourceBatch(batch: SourceBatchPayload, index: number): GradingSourceBatch {
  const dirty = quantity(batch.dirty_qty ?? batch.dirty_count ?? batch.dirtyQty);
  const cracked = quantity(batch.cracked_qty ?? batch.cracked_count ?? batch.crackedQty);
  const grossReceived = quantity(
    batch.total_qty ?? batch.totalQty ?? batch.received_qty ?? batch.receivedQty
      ?? batch.expected_qty ?? batch.expectedQty,
  );
  const serverGradable = batch.gradable_qty ?? batch.gradableQty ?? batch.available_qty ?? batch.availableQty;
  const available = serverGradable == null
    ? Math.max(0, grossReceived - dirty - cracked)
    : Math.min(grossReceived, quantity(serverGradable));

  return {
    id: quantity(batch.id ?? batch.batch_id) || index + 1,
    batch_code: String(batch.batch_code ?? batch.batchCode ?? ''),
    shift_id: quantity(batch.shift_id ?? batch.shiftId),
    house_code: String(batch.house_code ?? batch.houseCode ?? ''),
    house_name: String(batch.house_name ?? batch.houseName ?? batch.house_code ?? `#${index + 1}`),
    received_qty: grossReceived,
    dirty_qty: dirty,
    cracked_qty: cracked,
    available,
  };
}

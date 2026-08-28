export type ReplenishmentLine = { skuCode: string; skuName: string; qty: number; remark?: string };
export type ReceiveInput = { batchNo: string; expected: number; received: string; damaged: string; note: string };

export const REPLENISHMENT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'DISPATCHED', 'RECEIVED', 'CLOSED', 'REJECTED', 'CANCELLED'] as const;

export function positiveQuantity(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const quantity = typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

export function validateReceive(input: ReceiveInput): string | null {
  const expected = Number(input.expected), received = Number(input.received), damaged = Number(input.damaged);
  if (![expected, received, damaged].every(Number.isFinite)) return 'invalidNumber';
  if (expected < 0 || received < 0 || damaged < 0) return 'negative';
  if (received + damaged > expected) return 'overExpected';
  return null;
}

export function receiveSummary(inputs: ReceiveInput[]) {
  return inputs.reduce((sum, item) => {
    const expected = Number(item.expected) || 0, received = Number(item.received) || 0, damaged = Number(item.damaged) || 0;
    return { expected: sum.expected + expected, received: sum.received + received, damaged: sum.damaged + damaged, shortage: sum.shortage + Math.max(0, expected - received - damaged) };
  }, { expected: 0, received: 0, damaged: 0, shortage: 0 });
}

export function allowedAction(status: string, perm: { canCreate: boolean; canApprove: boolean; canEdit: boolean }) {
  if (status === 'DRAFT' && perm.canCreate) return 'submit';
  if (status === 'SUBMITTED' && perm.canApprove) return 'approve';
  if (status === 'APPROVED' && perm.canEdit) return 'dispatch';
  if (status === 'DISPATCHED' && perm.canEdit) return 'receive';
  if (status === 'RECEIVED' && perm.canEdit) return 'close';
  return null;
}

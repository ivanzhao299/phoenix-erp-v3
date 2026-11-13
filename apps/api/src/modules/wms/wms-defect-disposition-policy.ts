export const DEFECT_GRADES = ['DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'] as const;
export type DefectGrade = typeof DEFECT_GRADES[number];

export const DEFECT_DISPOSITION_ACTIONS = [
  'PROCESSING',
  'CLEANING_RECHECK',
  'TRANSFER',
  'WASTE',
  'RETURN_TO_SOURCE',
] as const;
export type DefectDispositionAction = typeof DEFECT_DISPOSITION_ACTIONS[number];

export function normalizeDefectGrade(value: unknown): DefectGrade | null {
  const grade = String(value ?? '').trim().toUpperCase();
  return (DEFECT_GRADES as readonly string[]).includes(grade) ? grade as DefectGrade : null;
}

export function normalizeDefectDispositionAction(value: unknown): DefectDispositionAction | null {
  const action = String(value ?? '').trim().toUpperCase();
  return (DEFECT_DISPOSITION_ACTIONS as readonly string[]).includes(action)
    ? action as DefectDispositionAction : null;
}

export interface DefectDispositionInput {
  disposition_no?: unknown;
  idempotency_key?: unknown;
  batch_no?: unknown;
  qty?: unknown;
  action?: unknown;
  reason?: unknown;
  target_warehouse_code?: unknown;
  target_location_code?: unknown;
  source_reference?: unknown;
}

export function validateDefectDisposition(input: DefectDispositionInput): string[] {
  const errors: string[] = [];
  const ref = String(input.disposition_no ?? input.idempotency_key ?? '').trim();
  const batch = String(input.batch_no ?? '').trim();
  const action = normalizeDefectDispositionAction(input.action);
  const qty = Number(input.qty);
  const reason = String(input.reason ?? '').trim();
  if (!ref) errors.push('disposition_no 或 idempotency_key 必填');
  if (!batch) errors.push('batch_no 必填');
  if (!action) errors.push(`action 必须是 ${DEFECT_DISPOSITION_ACTIONS.join('/')}`);
  if (!Number.isFinite(qty) || qty <= 0 || Math.round(qty * 1000) !== qty * 1000) {
    errors.push('qty 必须大于 0 且最多保留 3 位小数');
  }
  if (reason.length < 3) errors.push('reason 必填且至少 3 个字符');
  if (action === 'TRANSFER' && !String(input.target_warehouse_code ?? '').trim()) {
    errors.push('TRANSFER 必须填写 target_warehouse_code');
  }
  if (action !== 'TRANSFER' && String(input.target_warehouse_code ?? '').trim()) {
    errors.push(`${action} 不允许填写 target_warehouse_code`);
  }
  return errors;
}

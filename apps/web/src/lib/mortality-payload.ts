import type { FarmLog } from './mobile-api';

/** A house total can only edit one report. Never copy eggs into a second shift. */
export function buildMortalityRequest(logs: FarmLog[], house: string, date: string,
  values: { mortality_qty: number; elimination_qty: number; reason: string | null }) {
  const rows = logs.filter(row => (row.house_code || row.flock_no) === house);
  if (rows.length > 1) throw new Error(`${house} 存在多班次日报，请在养殖日报中逐班修改死淘数量`);
  const losses = { mortality_qty: values.mortality_qty, elimination_qty: values.elimination_qty,
    mortality_reason: values.reason, culling_reason: values.reason, operator: 'mobile' };
  return rows.length === 1
    ? { path: `/api/v3/farm/daily-logs/${rows[0].id}`, method: 'PUT', body: losses }
    : { path: '/api/v3/farm/daily-logs', method: 'POST',
      body: { ...losses, house_code: house, log_date: date, shift: 'DAILY' } };
}

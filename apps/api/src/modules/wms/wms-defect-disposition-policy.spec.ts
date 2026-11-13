import {
  DEFECT_DISPOSITION_ACTIONS,
  DEFECT_GRADES,
  normalizeDefectDispositionAction,
  normalizeDefectGrade,
  validateDefectDisposition,
} from './wms-defect-disposition-policy';

describe('WMS defect disposition policy', () => {
  it('keeps the four defect grades and five internal actions explicit', () => {
    expect(DEFECT_GRADES).toEqual(['DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED']);
    expect(DEFECT_DISPOSITION_ACTIONS).toEqual([
      'PROCESSING', 'CLEANING_RECHECK', 'TRANSFER', 'WASTE', 'RETURN_TO_SOURCE',
    ]);
    expect(normalizeDefectGrade(' dirty ')).toBe('DIRTY');
    expect(normalizeDefectDispositionAction('transfer')).toBe('TRANSFER');
  });

  it('requires an audit reason, idempotency reference, positive quantity and transfer target', () => {
    expect(validateDefectDisposition({ action: 'TRANSFER', qty: 1, reason: 'x' })).toEqual(expect.arrayContaining([
      'disposition_no 或 idempotency_key 必填',
      'batch_no 必填',
      'reason 必填且至少 3 个字符',
      'TRANSFER 必须填写 target_warehouse_code',
    ]));
    expect(validateDefectDisposition({
      disposition_no: 'DD-1', batch_no: 'B-1', action: 'TRANSFER', qty: 2.125,
      reason: '转入清洁复检', target_warehouse_code: 'WH-QA',
    })).toEqual([]);
    expect(validateDefectDisposition({
      disposition_no: 'DD-2', batch_no: 'B-1', action: 'WASTE', qty: 1,
      reason: '销毁', target_warehouse_code: 'WH-QA',
    })).toContain('WASTE 不允许填写 target_warehouse_code');
  });
});

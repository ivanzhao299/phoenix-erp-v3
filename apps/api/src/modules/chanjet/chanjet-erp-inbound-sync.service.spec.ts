import { reconcile4001Parent } from './chanjet-erp-inbound-sync.service';

describe('reconcile4001Parent', () => {
  it('accepts a verified leaf-only snapshot without inventing a parent amount', () => {
    expect(reconcile4001Parent([], 51323953.74)).toMatchObject({
      parent4001Amount: null,
      childParentDifference: null,
      parentReconciliation: 'LEAF_ONLY',
      blocker: '',
    });
  });

  it('accepts a single parent row when it matches the leaf total', () => {
    expect(reconcile4001Parent([51323953.74], 51323953.74)).toMatchObject({
      parent4001Amount: 51323953.74,
      childParentDifference: 0,
      parentReconciliation: 'MATCHED',
      blocker: '',
    });
  });

  it('holds when a single parent row disagrees with the leaf total', () => {
    expect(reconcile4001Parent([51000000], 51323953.74).blocker)
      .toContain('4001父子科目合计差异');
  });

  it('holds when the snapshot contains duplicate parent rows', () => {
    expect(reconcile4001Parent([1, 1], 2).blocker)
      .toBe('4001父科目行数量异常: 2');
  });
});

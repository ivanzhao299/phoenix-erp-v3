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

  it('treats a zero-valued parent with non-zero children as a structural placeholder', () => {
    expect(reconcile4001Parent([0], 51323953.74)).toEqual({
      parent4001Amount: 0,
      childParentDifference: null,
      parentReconciliation: 'LEAF_ONLY_PLACEHOLDER',
      blocker: '',
      condition: '好业财4001父科目为零值结构占位；以4001叶子科目明细合计作为本批次会计事实',
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

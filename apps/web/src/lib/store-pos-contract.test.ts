import { describe, expect, it } from 'vitest';
import { createStoreSaleSuccessMessage, type CreateStoreSaleResult } from './store-pos-api';

describe('store POS create response contract', () => {
  const response: CreateStoreSaleResult = { id: 7, saleNo: 'POS-20260829-00007', totalAmount: 18.5 };

  it.each([
    ['Admin', { prefix: '销售单', suffix: '开立成功' }],
    ['Terminal', { prefix: '成交成功', suffix: '' }],
  ])('%s toast contains the real sale number and never undefined', (_entry, labels) => {
    const message = createStoreSaleSuccessMessage(response, labels);
    expect(message).toContain('POS-20260829-00007');
    expect(message).not.toContain('undefined');
  });
});

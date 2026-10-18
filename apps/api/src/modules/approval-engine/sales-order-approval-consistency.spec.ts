import { ConflictException } from '@nestjs/common';
import { ApprovalEngineService } from './approval-engine.service';

function makeService(overrides: Record<string, unknown> = {}) {
  const registry = {
    getTableName: jest.fn(() => 'sal_sales_orders'),
    getCancelledStatus: jest.fn(() => 'CANCELLED'),
    get: jest.fn(() => ({ onCancelled: jest.fn() })),
    ...overrides,
  };
  return new ApprovalEngineService(
    {} as any, {} as any, {} as any, {} as any,
    { transaction: jest.fn() } as any,
    { get: jest.fn() } as any,
    registry as any,
    {} as any, {} as any, { spawn: jest.fn() } as any,
  );
}

describe('SALES_ORDER approval consistency', () => {
  it('evaluates only the closed trigger-code condition grammar', () => {
    const service = makeService() as any;
    expect(service.matchesCondition(
      { triggerCodesAny: ['BELOW_FLOOR_PRICE'] },
      { triggerCodes: ['BELOW_FLOOR_PRICE', 'CREDIT_OVER_LIMIT'] },
    )).toBe(true);
    expect(service.matchesCondition(
      { triggerCodesAll: ['BELOW_FLOOR_PRICE', 'CREDIT_OVER_LIMIT'] },
      { triggerCodes: ['BELOW_FLOOR_PRICE'] },
    )).toBe(false);
    expect(service.matchesCondition({ arbitraryExpression: true }, {})).toBe(false);
  });

  it('rejects a late approval when the order is no longer PENDING_APPROVAL', async () => {
    const service = makeService();
    const manager = { query: jest.fn().mockResolvedValue([]) };
    await expect(service.updateBizStatus('SALES_ORDER', '9', 'APPROVED', manager as any, 'PENDING_APPROVAL'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(manager.query.mock.calls[0][0]).toContain('AND status = $3');
  });

  it('cancels pending steps and invokes the registry callback in one manager', async () => {
    const callback = jest.fn();
    const service = makeService({ get: jest.fn(() => ({ onCancelled: callback })) });
    const instance = { id: '11', bizType: 'SALES_ORDER', bizId: '9', status: 'PENDING', finishedAt: null };
    const manager = {
      findOne: jest.fn().mockResolvedValue(instance),
      query: jest.fn()
        .mockResolvedValueOnce([{ id: '9' }])
        .mockResolvedValueOnce([]),
      save: jest.fn().mockResolvedValue(instance),
    };
    await service.cancelInstance('11', manager as any);
    expect(instance.status).toBe('CANCELLED');
    expect(manager.query.mock.calls[1][0]).toContain("status='CANCELLED'");
    expect(callback).toHaveBeenCalledWith('9', manager);
  });
});

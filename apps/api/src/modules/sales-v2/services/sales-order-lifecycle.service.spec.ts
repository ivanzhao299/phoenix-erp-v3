import 'reflect-metadata';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { REQUIRE_MENU_KEY } from '../../../common/guards/menu.guard';
import { SalesOrdersController } from '../controllers/sales-orders.controller';
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { SalesOrdersService } from './sales-orders.service';
import { AddSalesOrderLifecycleEvents1788253200000 } from '../../../database/migrations/1788253200000-AddSalesOrderLifecycleEvents';

describe('sales order lifecycle red lines', () => {
  it('installs a database trigger that rejects UPDATE and DELETE on events', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new AddSalesOrderLifecycleEvents1788253200000().up({ query } as any);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON sal_order_lifecycle_events');
    expect(sql).toContain("RAISE EXCEPTION 'sal_order_lifecycle_events is append-only'");
    expect(sql).toContain('REVOKE UPDATE, DELETE');
  });

  it('uses an optimistic status predicate and rejects a concurrent overwrite', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc = new SalesOrderLifecycleService({} as any);
    await expect(svc.transitionStatus({ query } as any, '7', 'DELIVERED', 'RECEIVED'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls[0][0]).toContain('WHERE id=$2 AND status=$3');
    expect(query.mock.calls[0][1]).toEqual(['RECEIVED', '7', 'DELIVERED']);
  });

  it('persists one immutable event payload through the supplied transaction manager', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc = new SalesOrderLifecycleService({} as any);
    const id = await svc.appendEvent({ query } as any, {
      eventId: 'b65585fd-af72-4bcb-ae49-b9de9ff983ef', salesOrderId: '7', orderNo: 'SO-7',
      eventType: 'MANUAL_OVERRIDE', fromStatus: 'APPROVED', toStatus: 'CANCELLED',
      actorType: 'USER', reasonCode: 'MANUAL_OVERRIDE', comment: '主管纠偏', sourceModule: 'SALES_ORDER',
    });
    expect(id).toBe('b65585fd-af72-4bcb-ae49-b9de9ff983ef');
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (event_id) DO NOTHING');
    expect(query.mock.calls[0][1]).toContain('主管纠偏');
  });

  it('registers real Workflow callbacks at application bootstrap', () => {
    const register = jest.fn();
    const service = new SalesOrdersService(
      {} as any, { get: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any,
      { get: jest.fn(() => ({ moduleCode: 'MENU_SALES2_ORDER', tableName: 'sal_sales_orders', approvedStatus: 'APPROVED', rejectedStatus: 'REJECTED' })), register } as any,
    );
    service.onApplicationBootstrap();
    expect(register).toHaveBeenCalledWith('SALES_ORDER', expect.objectContaining({
      onApproved: expect.any(Function), onRejected: expect.any(Function),
    }));
  });

  it('rolls back mark-received when AR creation fails', async () => {
    const order = { id: '7', order_no: 'SO-7', company_code: 'C1', status: 'DELIVERED', ar_invoice_id: null, total_amount: 10 };
    const manager = { query: jest.fn(async (sql: string) => sql.includes('sal_customers') ? [] : []) };
    let rolledBack = false;
    const ds = {
      query: jest.fn().mockResolvedValue([order]),
      transaction: jest.fn(async (fn: any) => { try { return await fn(manager); } catch (e) { rolledBack = true; throw e; } }),
    };
    const lifecycle = {
      transitionStatus: jest.fn().mockResolvedValue({ ...order, status: 'RECEIVED' }),
      appendEvent: jest.fn().mockResolvedValue('event'),
    };
    const service = new SalesOrdersService(
      ds as any,
      { get: jest.fn((key: string) => key === 'dataScope' ? { isGlobal: true, allowedCompanyCodes: [] } : { userId: 'u1', username: '主管' }) } as any,
      {} as any, {} as any, {} as any, {} as any,
      { createArForOrder: jest.fn().mockRejectedValue(new Error('AR unavailable')) } as any,
      {} as any, lifecycle as any, { get: jest.fn(), register: jest.fn() } as any,
    );
    await expect(service.markReceived('7')).rejects.toThrow('AR unavailable');
    expect(rolledBack).toBe(true);
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('SET ar_invoice_id'), expect.anything());
  });

  it('rejects process-log access outside the order company DataScope', async () => {
    const service = new SalesOrdersService(
      { query: jest.fn().mockResolvedValue([{ id: '7', company_code: 'C2' }]) } as any,
      { get: jest.fn((key: string) => key === 'dataScope' ? { isGlobal: false, allowedCompanyCodes: ['C1'] } : { userId: 'u1' }) } as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      { getProcessLog: jest.fn() } as any, { get: jest.fn(), register: jest.fn() } as any,
    );
    await expect(service.getProcessLog('7')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('gates MANUAL_OVERRIDE behind the independent A permission', () => {
    const metadata = Reflect.getMetadata(REQUIRE_MENU_KEY, SalesOrdersController.prototype.manualOverride);
    expect(metadata).toEqual({ menu: 'MENU_SALES2_ORDER_OVERRIDE', perm: 'A', altMenus: undefined, denialMessage: undefined });
  });
});

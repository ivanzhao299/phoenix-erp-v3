import { ReturnOrdersService } from './return-orders.service';

describe('ReturnOrdersService company scope', () => {
  const make = (scope: Record<string, unknown>) => {
    const query = jest.fn();
    const service = new ReturnOrdersService(
      { query, transaction: jest.fn() } as any,
      { get: jest.fn((key: string) => key === 'dataScope' ? scope : { username: 'tester' }) } as any,
      {} as any, {} as any, {} as any, {} as any,
    );
    return { service, query };
  };

  const scoped = { isGlobal: false, allowedCompanyCodes: ['COMP-A'] };
  const global = { isGlobal: true, allowedCompanyCodes: [] };

  it('filters list queries to the caller company scope', async () => {
    const { service, query } = make(scoped);
    query.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([]);

    await service.list({ page: 1, limit: 20 });

    expect(query.mock.calls[0][0]).toContain('r.company_code = ANY($1)');
    expect(query.mock.calls[0][1]).toEqual([['COMP-A']]);
    expect(query.mock.calls[1][0]).toContain('r.company_code = ANY($1)');
  });

  it('fails closed for detail access outside the caller company scope', async () => {
    const { service, query } = make(scoped);
    query.mockResolvedValueOnce([]);

    await expect(service.findById('return-1')).rejects.toThrow('退货单 return-1 不存在');
    expect(query.mock.calls[0][0]).toContain('r.company_code = ANY($2)');
    expect(query.mock.calls[0][1]).toEqual(['return-1', ['COMP-A']]);
  });

  it('parameterizes requested company filters and retains global access', async () => {
    const { service, query } = make(global);
    query.mockResolvedValueOnce([{ today_total: '0', pending_inspection: '0', pending_restock: '0', today_credit_note_amount: '0', pending_approval: '0' }]);

    await service.getDashboardStats("COMP-A' OR 1=1 --");

    expect(query.mock.calls[0][0]).toContain('r.company_code = $1');
    expect(query.mock.calls[0][0]).not.toContain("COMP-A' OR 1=1 --");
    expect(query.mock.calls[0][1]).toEqual(["COMP-A' OR 1=1 --"]);
  });

  it('applies scope parameters to every return analysis query', async () => {
    const { service, query } = make(scoped);
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{
      total_returns: '0', total_amount: '0', delivery_reject_count: '0', damage_count: '0',
      total_damaged_qty: '0', total_returned_qty: '0',
    }]);

    await service.getReturnAnalysis();

    expect(query).toHaveBeenCalledTimes(3);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('r.company_code = ANY($1)');
      expect(params).toEqual([['COMP-A']]);
    }
  });

  it('rejects a return item that belongs to another sales order before creating the return', async () => {
    const { service, query } = make(scoped);
    query.mockResolvedValueOnce([{
      company_code: 'COMP-A', customer_code: 'C-1', customer_name: '客户',
      company_name: '公司', currency_code: 'CNY', fulfillment_warehouse_code: 'WH-1',
    }]);
    query.mockResolvedValueOnce([]);

    await expect(service.create({
      salesOrderId: 'SO-1', companyCode: 'COMP-A', returnType: 'CUSTOMER_RETURN',
      items: [{
        salesOrderItemId: 'ITEM-FOREIGN', productCode: 'SKU-X', returnedQty: 1, unitPrice: 10,
      }],
    } as never)).rejects.toThrow('退货明细不属于当前销售订单');
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO sal_return_orders'))).toBe(false);
  });
});
